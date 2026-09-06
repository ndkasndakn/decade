#!/usr/bin/env node

/**
 * Daily policy checker — fetches each vendor's policy pages (refund, cancel, return, trial),
 * hashes the text content, and compares against stored hashes.
 * If any page has changed, outputs a list of changed vendors.
 *
 * Usage:
 *   node scripts/check-policies.js           # check all vendors
 *   node scripts/check-policies.js --update   # update stored hashes without diffing
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { buildAlertSignature } from "./lib/policy-feed-reliability.js";
import { getPolicySupabaseConfig, supabaseRestRequest, supabaseUpsertRows } from "../lib/policy-supabase.js";
import { buildPolicyEvidenceSnapshot, POLICY_EVIDENCE_ARTIFACT_PATH } from "../lib/policy-evidence-snapshot.js";
import { validatePolicyStateArtifacts } from "../lib/policy-state-integrity.js";
import {
  buildPolicyCoverageScorecard,
  formatPolicyCoverageScorecardMarkdown,
} from "../lib/policy-coverage-scorecard.js";
import { mapWithConcurrency } from "../lib/async-work-pool.js";
import { createBlockedFetchReuseCache } from "../lib/blocked-fetch-reuse-cache.js";
import { monitorPolicyVendorCandidates } from "../lib/policy-vendor-candidate-monitor.js";
import { createSuccessfulFetchCache } from "../lib/successful-fetch-cache.js";
import {
  buildPolicyVendorLifecycleReport,
  formatPolicyVendorLifecycleMarkdown,
} from "../lib/policy-vendor-lifecycle.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHECKER_CONFIG = {
  batchSize: Number.parseInt(process.env.POLICY_CHECK_BATCH_SIZE || "3", 10),
  directAttempts: Number.parseInt(process.env.POLICY_CHECK_DIRECT_ATTEMPTS || "3", 10),
  fallbackAttempts: Number.parseInt(process.env.POLICY_CHECK_FALLBACK_ATTEMPTS || "2", 10),
  browserHookAttempts: Number.parseInt(process.env.POLICY_CHECK_BROWSER_HOOK_ATTEMPTS || "1", 10),
  browserHookMinIntervalMs: Number.parseInt(
    process.env.POLICY_CHECK_BROWSER_HOOK_MIN_INTERVAL_MS || "10500",
    10
  ),
  timeoutMs: Number.parseInt(process.env.POLICY_CHECK_TIMEOUT_MS || "18000", 10),
  errorDetailLimit: Number.parseInt(process.env.POLICY_CHECK_ERROR_DETAIL_LIMIT || "12", 10),
  candidateTtlDays: Number.parseInt(process.env.POLICY_CHECK_CANDIDATE_TTL_DAYS || "7", 10),
  pendingDetailLimit: Number.parseInt(process.env.POLICY_CHECK_PENDING_DETAIL_LIMIT || "20", 10),
  sameRunRecheckPasses: Number.parseInt(process.env.POLICY_CHECK_SAME_RUN_RECHECK_PASSES || "2", 10),
  sameRunRecheckDelayMs: Number.parseInt(process.env.POLICY_CHECK_SAME_RUN_RECHECK_DELAY_MS || "1600", 10),
  sameRunRecheckBatchSize: Number.parseInt(process.env.POLICY_CHECK_SAME_RUN_RECHECK_BATCH_SIZE || "3", 10),
  sameRunMajorityMinVotes: Number.parseInt(process.env.POLICY_CHECK_SAME_RUN_MAJORITY_MIN_VOTES || "2", 10),
  crossRunWindowSize: Number.parseInt(process.env.POLICY_CHECK_CROSS_RUN_WINDOW_SIZE || "6", 10),
  crossRunWindowRequired: Number.parseInt(process.env.POLICY_CHECK_CROSS_RUN_WINDOW_REQUIRED || "3", 10),
  adaptiveWindowEnabled: String(process.env.POLICY_CHECK_ADAPTIVE_WINDOW_ENABLED || "1").trim().toLowerCase(),
  highSignalWindowRequired: Number.parseInt(process.env.POLICY_CHECK_HIGH_SIGNAL_WINDOW_REQUIRED || "2", 10),
  highSignalMinPolicyHits: Number.parseInt(process.env.POLICY_CHECK_HIGH_SIGNAL_MIN_POLICY_HITS || "2", 10),
  highSignalMinLines: Number.parseInt(process.env.POLICY_CHECK_HIGH_SIGNAL_MIN_LINES || "6", 10),
  stalePendingDays: Number.parseInt(process.env.POLICY_CHECK_STALE_PENDING_DAYS || "3", 10),
  volatileFlipThreshold: Number.parseInt(process.env.POLICY_CHECK_VOLATILE_FLIP_THRESHOLD || "2", 10),
  volatileRequireRecentFlip: String(process.env.POLICY_CHECK_VOLATILE_REQUIRE_RECENT_FLIP || "1").trim().toLowerCase(),
  escalationPendingDays: Number.parseInt(process.env.POLICY_CHECK_ESCALATION_PENDING_DAYS || "5", 10),
  escalationFlipThreshold: Number.parseInt(process.env.POLICY_CHECK_ESCALATION_FLIP_THRESHOLD || "4", 10),
  escalationRequireRecentFlip: String(process.env.POLICY_CHECK_ESCALATION_REQUIRE_RECENT_FLIP || "1").trim().toLowerCase(),
  fetchFailureQuarantineStreak: Number.parseInt(process.env.POLICY_CHECK_FETCH_FAILURE_QUARANTINE_STREAK || "2", 10),
  fallbackSignalConsecutiveRuns: Number.parseInt(
    process.env.POLICY_CHECK_FALLBACK_SIGNAL_CONSECUTIVE_RUNS || "2",
    10
  ),
  noConfirmEscalationDays: Number.parseInt(process.env.POLICY_CHECK_NO_CONFIRM_ESCALATION_DAYS || "7", 10),
  materialCooldownDays: Number.parseInt(process.env.POLICY_CHECK_MATERIAL_COOLDOWN_DAYS || "14", 10),
  materialOscillationWindowDays: Number.parseInt(process.env.POLICY_CHECK_MATERIAL_OSCILLATION_WINDOW_DAYS || "21", 10),
  actualConfirmRuns: Number.parseInt(process.env.POLICY_CHECK_ACTUAL_CONFIRM_RUNS || "2", 10),
  actualMinGapHours: Number.parseInt(process.env.POLICY_CHECK_ACTUAL_MIN_GAP_HOURS || "4", 10),
  fetchQualityMinChars: Number.parseInt(process.env.POLICY_CHECK_FETCH_QUALITY_MIN_CHARS || "140", 10),
  fetchQualityMinLines: Number.parseInt(process.env.POLICY_CHECK_FETCH_QUALITY_MIN_LINES || "5", 10),
  fetchQualityMinPolicyHits: Number.parseInt(process.env.POLICY_CHECK_FETCH_QUALITY_MIN_POLICY_HITS || "1", 10),
  qualityGateRejectFailures: Number.parseInt(process.env.POLICY_CHECK_QUALITY_GATE_REJECT_FAILURES || "3", 10),
  alertLowSignalThreshold: Number.parseInt(process.env.POLICY_ALERT_LOW_SIGNAL_THRESHOLD || "1", 10),
  alertLowSignalLookback: Number.parseInt(process.env.POLICY_ALERT_LOW_SIGNAL_LOOKBACK || "6", 10),
  alertContinuityLookbackDays: Number.parseInt(process.env.POLICY_ALERT_CONTINUITY_LOOKBACK_DAYS || "120", 10),
  browserHookUrl: String(process.env.POLICY_CHECK_BROWSER_HOOK_URL || "").trim(),
  browserHookToken: String(process.env.POLICY_CHECK_BROWSER_HOOK_TOKEN || "").trim(),
  fetchLaneDefault: String(process.env.POLICY_CHECK_FETCH_LANES_DEFAULT || "").trim(),
};
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1",
];

const POLICY_SETS = [
  {
    name: "refund",
    sourcesPath: join(__dirname, "..", "rules", "policy-sources.json"),
    hashesPath: join(__dirname, "..", "rules", "policy-hashes.json"),
    candidatesPath: join(__dirname, "..", "rules", "policy-change-candidates.json"),
    coveragePath: join(__dirname, "..", "rules", "policy-coverage-state.json"),
    semanticPath: join(__dirname, "..", "rules", "policy-semantic-state.json"),
    baselinePath: join(__dirname, "..", "rules", "policy-confirmed-baseline.json"),
    dailyFingerprintPath: join(__dirname, "..", "rules", "policy-daily-fingerprints.json"),
    blockedRetryPath: join(__dirname, "..", "rules", "policy-blocked-retry-queue.json"),
    rulesFile: "v1_us_individual.json",
  },
  {
    name: "cancel",
    sourcesPath: join(__dirname, "..", "rules", "cancel-policy-sources.json"),
    hashesPath: join(__dirname, "..", "rules", "cancel-policy-hashes.json"),
    candidatesPath: join(__dirname, "..", "rules", "cancel-policy-change-candidates.json"),
    coveragePath: join(__dirname, "..", "rules", "cancel-policy-coverage-state.json"),
    semanticPath: join(__dirname, "..", "rules", "cancel-policy-semantic-state.json"),
    baselinePath: join(__dirname, "..", "rules", "cancel-policy-confirmed-baseline.json"),
    dailyFingerprintPath: join(__dirname, "..", "rules", "cancel-policy-daily-fingerprints.json"),
    blockedRetryPath: join(__dirname, "..", "rules", "cancel-policy-blocked-retry-queue.json"),
    rulesFile: "v1_us_individual_cancel.json",
  },
  {
    name: "return",
    sourcesPath: join(__dirname, "..", "rules", "return-policy-sources.json"),
    hashesPath: join(__dirname, "..", "rules", "return-policy-hashes.json"),
    candidatesPath: join(__dirname, "..", "rules", "return-policy-change-candidates.json"),
    coveragePath: join(__dirname, "..", "rules", "return-policy-coverage-state.json"),
    semanticPath: join(__dirname, "..", "rules", "return-policy-semantic-state.json"),
    baselinePath: join(__dirname, "..", "rules", "return-policy-confirmed-baseline.json"),
    dailyFingerprintPath: join(__dirname, "..", "rules", "return-policy-daily-fingerprints.json"),
    blockedRetryPath: join(__dirname, "..", "rules", "return-policy-blocked-retry-queue.json"),
    rulesFile: "v1_us_individual_return.json",
  },
  {
    name: "trial",
    sourcesPath: join(__dirname, "..", "rules", "trial-policy-sources.json"),
    hashesPath: join(__dirname, "..", "rules", "trial-policy-hashes.json"),
    candidatesPath: join(__dirname, "..", "rules", "trial-policy-change-candidates.json"),
    coveragePath: join(__dirname, "..", "rules", "trial-policy-coverage-state.json"),
    semanticPath: join(__dirname, "..", "rules", "trial-policy-semantic-state.json"),
    baselinePath: join(__dirname, "..", "rules", "trial-policy-confirmed-baseline.json"),
    dailyFingerprintPath: join(__dirname, "..", "rules", "trial-policy-daily-fingerprints.json"),
    blockedRetryPath: join(__dirname, "..", "rules", "trial-policy-blocked-retry-queue.json"),
    rulesFile: "v1_us_individual_trial.json",
  },
];

const POLICY_FOCUS_KEYWORDS = {
  default: [
    "policy",
    "terms",
    "subscription",
    "billing",
    "payment",
    "membership",
    "renew",
    "renewal",
    "auto-renew",
    "cancel",
    "refund",
    "return",
    "trial",
  ],
  refund: [
    "refund",
    "reimbursement",
    "money back",
    "chargeback",
    "credited",
    "credited back",
  ],
  cancel: [
    "cancel",
    "cancellation",
    "terminate",
    "termination",
    "opt out",
    "end subscription",
  ],
  return: [
    "return",
    "returned",
    "eligibility",
    "window",
    "days",
    "exchange",
  ],
  trial: [
    "trial",
    "free trial",
    "introductory",
    "intro offer",
    "after trial",
    "billed after",
    "promo",
    "premium",
    "pricing",
    "monthly",
    "annual",
    "yearly",
    "free tier",
    "upgrade",
  ],
};
const BASELINE_SIGNAL = "__baseline__";
const VENDOR_STABILITY_KEYWORDS = {
  disney_plus: ["disney+", "disney plus", "subscription", "billing", "cancel", "refund"],
  duolingo: ["duolingo", "super duolingo", "subscription", "refund", "cancel"],
  canva: ["canva pro", "canva teams", "manage billing", "cancel canva", "subscription"],
  espn_plus: ["espn+", "subscription", "bundle", "billing", "cancel"],
  myfitnesspal_premium: ["myfitnesspal premium", "premium subscription", "renewal", "cancel premium"],
  substack: ["substack", "subscription", "paid subscription", "cancel", "refund"],
  twitch: ["twitch turbo", "subscription renews", "cancel recurring", "subscription payment"],
  fitbit_premium: ["fitbit premium", "subscription", "google payments", "renews"],
  hulu: ["hulu", "subscription", "billing", "cancel", "refund"],
  icloud_plus: ["icloud+", "icloud plus", "subscription", "cancel", "storage"],
  linkedin_premium: ["linkedin premium", "subscription", "billing", "refund", "cancel"],
  paramount_plus: ["paramount+", "subscription", "cancel", "billing"],
  audible: ["audible membership", "audible premium plus", "cancel", "billing"],
  grammarly: ["grammarly premium", "subscription", "billing", "renewal", "cancel"],
  evernote: ["evernote personal", "evernote professional", "subscription", "billing", "cancel"],
  nfl_plus: ["nfl+", "subscription", "billing", "cancel", "trial"],
  lastpass: ["lastpass", "subscription", "billing", "refund", "cancel"],
  dashlane: ["dashlane premium", "subscription", "billing", "auto-renew", "cancel"],
  headspace: ["headspace", "subscription", "billing", "cancel", "renewal"],
  soundcloud_go: ["soundcloud go", "soundcloud go+", "subscription", "billing", "cancel"],
  roblox_premium: ["roblox premium", "subscription", "billing", "cancel", "renewal"],
  telegram_premium: ["telegram premium", "subscription", "cancel", "billing", "trial"],
  x_premium: ["x premium", "premium+", "subscription", "billing", "cancel"],
  calm: ["calm premium", "subscription", "billing", "cancel", "renewal"],
  hinge: ["hinge+", "hinge x", "subscription", "refund", "cancel"],
  midjourney: ["midjourney", "subscription", "billing", "cancel"],
  crunchyroll: ["crunchyroll premium", "subscription", "cancel", "billing"],
};
// Targeted noise-reduction overrides for persistently volatile vendors.
// Keep this list intentionally small and explicit.
const ESCALATION_FLIP_THRESHOLD_OVERRIDES = {
  refund: {
    myfitnesspal_premium: 30,
  },
  cancel: {
    audible: 30,
    canva: 30,
    fitbit_premium: 30,
    paramount_plus: 30,
    twitch: 30,
  },
  return: {
    myfitnesspal_premium: 30,
  },
};
const VOLATILE_FLIP_THRESHOLD_OVERRIDES = {
  refund: {
    myfitnesspal_premium: 8,
  },
  cancel: {
    audible: 8,
    canva: 8,
    fitbit_premium: 8,
    paramount_plus: 8,
    twitch: 8,
  },
  return: {
    myfitnesspal_premium: 8,
  },
  trial: {
    twitch: 8,
  },
};
const ACTUAL_CONFIRM_RUN_OVERRIDES = {
  myfitnesspal_premium: 3,
  canva: 3,
  fitbit_premium: 3,
  paramount_plus: 3,
  twitch: 3,
};
const FETCH_QUALITY_OVERRIDES = {
  cancel: {
    canva: { minPolicyHits: 2, minLines: 6 },
    icloud_plus: { minPolicyHits: 0 },
    linkedin_premium: { minPolicyHits: 0 },
  },
  trial: {
    icloud_plus: { minPolicyHits: 0 },
    linkedin_premium: { minPolicyHits: 0 },
    slack: { minPolicyHits: 0 },
    telegram_premium: { minPolicyHits: 0 },
    x_premium: { minPolicyHits: 0 },
  },
};
const SOURCE_VOLATILITY_RULES = {
  normal: {
    actualConfirmRunsDelta: 0,
    volatileFlipThresholdDelta: 0,
    escalationFlipThresholdDelta: 0,
  },
  flaky: {
    actualConfirmRunsDelta: 1,
    volatileFlipThresholdDelta: 2,
    escalationFlipThresholdDelta: 2,
  },
};
const HASH_PROFILE_ID = process.env.POLICY_CHECK_HASH_PROFILE || "focus-v3";
export const LEGACY_PENDING_MODEL_ID = "legacy-v1";
export const PENDING_MODEL_ID = process.env.POLICY_CHECK_PENDING_MODEL || "signal-v2";
const POLICY_ALERT_FEED_PATH = join(__dirname, "..", "rules", "policy-alert-feed.json");
const POLICY_ALERT_REVIEW_FEED_PATH = join(__dirname, "..", "rules", "policy-alert-review-feed.json");
const POLICY_EVENT_LOG_PATH = join(__dirname, "..", "rules", "policy-events.ndjson");
const POLICY_TIER1_VENDORS_PATH = join(__dirname, "..", "rules", "policy-tier1-vendors.json");
const POLICY_STATUS_REPORT_JSON_PATH = join(__dirname, "..", "rules", "policy-status-report.json");
const POLICY_STATUS_REPORT_MD_PATH = join(__dirname, "..", "rules", "policy-status-report.md");
const POLICY_WEEKLY_TRIAGE_JSON_PATH = join(__dirname, "..", "rules", "policy-weekly-triage.json");
const POLICY_WEEKLY_TRIAGE_MD_PATH = join(__dirname, "..", "rules", "policy-weekly-triage.md");
const POLICY_VENDOR_CANDIDATES_PATH = join(__dirname, "..", "rules", "policy-vendor-candidates.json");
const POLICY_VENDOR_CANDIDATE_STATE_PATH = join(__dirname, "..", "rules", "policy-vendor-candidate-state.json");
const POLICY_VENDOR_LIFECYCLE_JSON_PATH = join(__dirname, "..", "rules", "policy-vendor-lifecycle.json");
const POLICY_VENDOR_LIFECYCLE_MD_PATH = join(__dirname, "..", "rules", "policy-vendor-lifecycle.md");
const POLICY_COVERAGE_SCORECARD_JSON_PATH = join(__dirname, "..", "rules", "policy-coverage-scorecard.json");
const POLICY_COVERAGE_SCORECARD_MD_PATH = join(__dirname, "..", "rules", "policy-coverage-scorecard.md");
const POLICY_COUNT_KEYS = ["refund", "cancel", "return", "trial"];
const POLICY_SUPABASE_STATE_ARTIFACTS = [
  POLICY_EVIDENCE_ARTIFACT_PATH,
  "rules/policy-hashes.json",
  "rules/cancel-policy-hashes.json",
  "rules/return-policy-hashes.json",
  "rules/trial-policy-hashes.json",
  "rules/policy-change-candidates.json",
  "rules/cancel-policy-change-candidates.json",
  "rules/return-policy-change-candidates.json",
  "rules/trial-policy-change-candidates.json",
  "rules/policy-coverage-state.json",
  "rules/cancel-policy-coverage-state.json",
  "rules/return-policy-coverage-state.json",
  "rules/trial-policy-coverage-state.json",
  "rules/policy-semantic-state.json",
  "rules/cancel-policy-semantic-state.json",
  "rules/return-policy-semantic-state.json",
  "rules/trial-policy-semantic-state.json",
  "rules/policy-confirmed-baseline.json",
  "rules/cancel-policy-confirmed-baseline.json",
  "rules/return-policy-confirmed-baseline.json",
  "rules/trial-policy-confirmed-baseline.json",
  "rules/policy-daily-fingerprints.json",
  "rules/cancel-policy-daily-fingerprints.json",
  "rules/return-policy-daily-fingerprints.json",
  "rules/trial-policy-daily-fingerprints.json",
  "rules/policy-blocked-retry-queue.json",
  "rules/cancel-policy-blocked-retry-queue.json",
  "rules/return-policy-blocked-retry-queue.json",
  "rules/trial-policy-blocked-retry-queue.json",
  "rules/policy-events.ndjson",
  "rules/policy-alert-feed.json",
  "rules/policy-alert-review-feed.json",
  "rules/policy-vendor-candidate-state.json",
];

const isUpdate = process.argv.includes("--update");

function hash(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function sha256Hex(text = "") {
  return createHash("sha256").update(String(text || ""), "utf8").digest("hex");
}

function readJson(filePath, fallback = {}) {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createMinIntervalScheduler({ minIntervalMs = 0, sleepFn = sleep, nowFn = Date.now } = {}) {
  const intervalMs = Number.isFinite(minIntervalMs) ? Math.max(0, Math.floor(minIntervalMs)) : 0;
  let tail = Promise.resolve();
  let lastStartedAt = null;

  return function schedule(task) {
    const run = tail.then(async () => {
      if (lastStartedAt !== null && intervalMs > 0) {
        const waitMs = Math.max(0, intervalMs - (nowFn() - lastStartedAt));
        if (waitMs > 0) await sleepFn(waitMs);
      }
      lastStartedAt = nowFn();
      return task();
    });
    tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };
}

const scheduleBrowserHookRequest = createMinIntervalScheduler({
  minIntervalMs: CHECKER_CONFIG.browserHookMinIntervalMs,
});

function jitter(ms) {
  return Math.floor(Math.random() * ms);
}

const SUPPORTED_FETCH_LANES = new Set(["direct", "zendesk_api", "mirror", "browser_hook"]);

function normalizeFetchLane(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeFetchLaneList(values) {
  if (!Array.isArray(values)) return [];
  const unique = [];
  const seen = new Set();
  for (const value of values) {
    const lane = normalizeFetchLane(value);
    if (!lane || !SUPPORTED_FETCH_LANES.has(lane) || seen.has(lane)) continue;
    seen.add(lane);
    unique.push(lane);
  }
  return unique;
}

function parseFetchLaneCsv(value) {
  return normalizeFetchLaneList(String(value || "").split(","));
}

function getDefaultFetchLanes() {
  const configured = parseFetchLaneCsv(CHECKER_CONFIG.fetchLaneDefault);
  if (configured.length > 0) return configured;
  if (CHECKER_CONFIG.browserHookUrl) {
    return ["direct", "zendesk_api", "mirror", "browser_hook"];
  }
  return ["direct", "zendesk_api", "mirror"];
}

function getVendorFetchLanes(vendorConfig) {
  const configured = normalizeFetchLaneList(vendorConfig?.fetch_lanes);
  if (configured.length > 0) return configured;
  return getDefaultFetchLanes();
}

function normalizeTier1VendorList(value) {
  if (!Array.isArray(value)) return [];
  const unique = [];
  const seen = new Set();
  for (const vendorRaw of value) {
    const vendor = String(vendorRaw || "").trim();
    if (!vendor || seen.has(vendor)) continue;
    seen.add(vendor);
    unique.push(vendor);
  }
  return unique;
}

function loadTier1VendorsConfig() {
  const raw = readJson(POLICY_TIER1_VENDORS_PATH, {});
  const defaults = normalizeTier1VendorList(raw?.default);
  const byPolicy = {};
  for (const policyType of POLICY_COUNT_KEYS) {
    byPolicy[policyType] = normalizeTier1VendorList(raw?.[policyType]);
  }
  return { default: defaults, byPolicy };
}

function getTier1TargetForPolicy(policyType, availableVendors, tier1Config) {
  const defaultVendors = tier1Config?.default || [];
  const policyVendors = tier1Config?.byPolicy?.[policyType] || [];
  const configured = normalizeTier1VendorList([...defaultVendors, ...policyVendors]);
  const available = new Set(Array.isArray(availableVendors) ? availableVendors : []);
  const target = configured.filter((vendor) => available.has(vendor));
  const missingConfigured = configured.filter((vendor) => !available.has(vendor));
  return { configured, target, missingConfigured };
}

function utcIsoTimestamp(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function applyMonitorSourceCheckMetadata(
  sources = {},
  { successfulChecks = 0, checkedAtUtc = utcIsoTimestamp(), hashProfile = HASH_PROFILE_ID } = {}
) {
  const nextSources = { ...(sources && typeof sources === "object" ? sources : {}) };
  if (!Number.isFinite(successfulChecks) || successfulChecks <= 0) {
    return { updated: false, sources: nextSources };
  }
  const checkedAt = new Date(String(checkedAtUtc || ""));
  if (Number.isNaN(checkedAt.getTime())) {
    return { updated: false, sources: nextSources };
  }
  nextSources.last_checked = checkedAt.toISOString().slice(0, 10);
  nextSources.hash_profile = String(hashProfile || HASH_PROFILE_ID);
  return { updated: true, sources: nextSources };
}

function parseDateOnlyToUtc(value = "") {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function toDateOnlyUtc(date = new Date()) {
  return utcIsoTimestamp(date).slice(0, 10);
}

function addUtcDays(value = "", days = 0) {
  const parsed = parseDateOnlyToUtc(value);
  if (!parsed) return "";
  parsed.setUTCDate(parsed.getUTCDate() + Number(days || 0));
  return toDateOnlyUtc(parsed);
}

function toZeroPolicyCounts() {
  return Object.fromEntries(POLICY_COUNT_KEYS.map((policy) => [policy, 0]));
}

function buildZeroChangeContinuityAlert(dateUtc = "") {
  const normalizedDateUtc = String(dateUtc || "").trim();
  if (!normalizedDateUtc) return null;
  const zeroByPolicy = toZeroPolicyCounts();
  return {
    date_utc: normalizedDateUtc,
    changed_date: normalizedDateUtc,
    generated_at_utc: `${normalizedDateUtc}T23:59:59Z`,
    created_at: `${normalizedDateUtc}T23:59:59Z`,
    updated_at: `${normalizedDateUtc}T23:59:59Z`,
    changed_count: 0,
    actual_changed_count: 0,
    material_changed_count: 0,
    dedupe_changed_count: 0,
    reported_changed_count: 0,
    repeated_count: 0,
    by_policy: zeroByPolicy,
    dedupe_by_policy: zeroByPolicy,
    changed_sample: [],
    sample_details: [],
    dedupe_changed_sample: [],
    pending_count: 0,
    pending_by_policy: zeroByPolicy,
    fetch_failure_count: 0,
    fetch_health_status: "healthy",
    fetch_blocked_pending_count: 0,
    stale_pending_count: 0,
    volatile_pending_count: 0,
    escalation_count: 0,
    coverage_gap_count: 0,
    quality_gate_held_count: 0,
    metadata_stability_held_count: 0,
    material_oscillation_suppressed_count: 0,
    signal_confidence: "high-confidence",
    signal_confidence_reason: "No confirmed policy changes for the UTC date; published as a zero-change continuity row.",
    status: "confirmed",
    state: "verified",
    strict_eligible: true,
    run_id: "",
    run_attempt: "",
    commit_sha: "",
    run_url: "",
    source: "check-policies.js:continuity_backfill",
  };
}

function summarizePolicyCounts(changedItems) {
  const counts = {};
  for (const item of changedItems) {
    const policyType = item?.policyType || "unknown";
    counts[policyType] = (counts[policyType] || 0) + 1;
  }
  return counts;
}

function toPolicyCountObject(changedItems) {
  const counts = summarizePolicyCounts(changedItems);
  const result = {};
  for (const key of POLICY_COUNT_KEYS) {
    const value = Number.parseInt(String(counts[key] ?? 0), 10);
    result[key] = Number.isFinite(value) && value >= 0 ? value : 0;
  }
  return result;
}

function getPolicyAlertFeedMaxEntries() {
  const parsed = Number.parseInt(process.env.POLICY_ALERT_FEED_MAX_ENTRIES || "120", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 120;
  return Math.min(366, parsed);
}

function getPolicyAlertIncludeZeroChange() {
  const value = String(process.env.POLICY_ALERT_INCLUDE_ZERO_CHANGE || "1").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function buildRunUrl() {
  const repository = String(process.env.GITHUB_REPOSITORY || "").trim();
  const runId = String(process.env.GITHUB_RUN_ID || "").trim();
  if (!repository || !runId) return "";
  return `https://github.com/${repository}/actions/runs/${runId}`;
}

function sortAlertsByGeneratedUtcDesc(alerts = []) {
  return [...alerts].sort((left, right) => {
    const leftValue = String(left?.generated_at_utc || left?.updated_at || left?.date_utc || "");
    const rightValue = String(right?.generated_at_utc || right?.updated_at || right?.date_utc || "");
    return rightValue.localeCompare(leftValue);
  });
}

function removeAlertsForDate(alerts = [], dateUtc = "") {
  const target = String(dateUtc || "").trim();
  if (!target) return [...alerts];
  return alerts.filter((entry) => String(entry?.date_utc || "").trim() !== target);
}

function upsertDailyAlert(alerts = [], dailyEntry = {}, maxEntries = 120) {
  const targetDate = String(dailyEntry?.date_utc || "").trim();
  if (!targetDate) return sortAlertsByGeneratedUtcDesc(alerts).slice(0, Math.max(1, maxEntries));
  const withoutDate = removeAlertsForDate(alerts, targetDate);
  return sortAlertsByGeneratedUtcDesc([dailyEntry, ...withoutDate]).slice(0, Math.max(1, maxEntries));
}

function collapseAlertsByDate(alerts = []) {
  const sorted = sortAlertsByGeneratedUtcDesc(alerts);
  const byDate = new Map();
  for (const entry of sorted) {
    const dateUtc = String(entry?.date_utc || "").trim();
    if (!parseDateOnlyToUtc(dateUtc)) continue;
    if (!byDate.has(dateUtc)) {
      byDate.set(dateUtc, entry);
    }
  }
  return sortAlertsByGeneratedUtcDesc([...byDate.values()]);
}

function ensureAlertDateContinuity(alerts = [], maxEntries = 120) {
  const collapsed = collapseAlertsByDate(alerts);
  if (collapsed.length === 0) return collapsed;

  const datesAsc = [...new Set(collapsed.map((entry) => String(entry?.date_utc || "").trim()))]
    .filter((dateUtc) => parseDateOnlyToUtc(dateUtc))
    .sort((left, right) => left.localeCompare(right));
  if (datesAsc.length === 0) return collapsed;

  const earliestDateUtc = datesAsc[0];
  const latestDateUtc = datesAsc[datesAsc.length - 1];
  const byDate = new Map(collapsed.map((entry) => [String(entry?.date_utc || "").trim(), entry]));
  let cursorDateUtc = earliestDateUtc;
  while (cursorDateUtc && cursorDateUtc <= latestDateUtc) {
    if (!byDate.has(cursorDateUtc)) {
      const continuityAlert = buildZeroChangeContinuityAlert(cursorDateUtc);
      if (continuityAlert) byDate.set(cursorDateUtc, continuityAlert);
    }
    const nextDateUtc = addUtcDays(cursorDateUtc, 1);
    if (!nextDateUtc || nextDateUtc === cursorDateUtc) break;
    cursorDateUtc = nextDateUtc;
  }

  return sortAlertsByGeneratedUtcDesc([...byDate.values()]).slice(0, Math.max(1, maxEntries));
}

function toDateUtcPrefix(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.slice(0, 10);
}

function normalizeSourceHostname(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return String(new URL(raw).hostname || "").trim().toLowerCase();
  } catch {
    return "";
  }
}

function normalizeVolatilityTier(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "flaky") return "flaky";
  return "normal";
}

function inferSourceVolatilityTier(sourceUrl = "") {
  const raw = String(sourceUrl || "").trim();
  if (!raw) return "normal";
  try {
    const parsed = new URL(raw);
    const hostname = String(parsed.hostname || "").toLowerCase();
    const pathname = String(parsed.pathname || "").toLowerCase();
    if (
      hostname.startsWith("help.") ||
      hostname.startsWith("support.") ||
      hostname.includes("zendesk.") ||
      pathname.includes("/hc/") ||
      pathname.includes("/help/") ||
      pathname.includes("/support/")
    ) {
      return "flaky";
    }
  } catch {
    return "normal";
  }
  return "normal";
}

function getSourceVolatilityRule(tier = "normal") {
  const normalizedTier = normalizeVolatilityTier(tier);
  return SOURCE_VOLATILITY_RULES[normalizedTier] || SOURCE_VOLATILITY_RULES.normal;
}

export function resolveSourceVolatilityTier(vendorConfig, sourceUrl = "") {
  if (vendorConfig && typeof vendorConfig === "object") {
    const configuredTier = normalizeVolatilityTier(vendorConfig.volatility_tier);
    if (configuredTier === "flaky") return configuredTier;
  }
  return inferSourceVolatilityTier(sourceUrl);
}

function normalizeDailyFingerprintEntry(input) {
  if (!input || typeof input !== "object") {
    return {
      date_utc: "",
      hash: "",
      semantic_signature: "",
      metadata_signature: "",
      source_url: "",
      source_hostname: "",
      volatility_tier: "normal",
      confirmed_change_utc: "",
      updated_utc: "",
    };
  }
  const sourceUrl = String(input.source_url || "").trim();
  return {
    date_utc: toDateUtcPrefix(input.date_utc || input.updated_utc || ""),
    hash: String(input.hash || "").trim(),
    semantic_signature: String(input.semantic_signature || "").trim(),
    metadata_signature: String(input.metadata_signature || "").trim(),
    source_url: sourceUrl,
    source_hostname: String(input.source_hostname || normalizeSourceHostname(sourceUrl)).trim().toLowerCase(),
    volatility_tier: normalizeVolatilityTier(input.volatility_tier),
    confirmed_change_utc: String(input.confirmed_change_utc || "").trim(),
    updated_utc: String(input.updated_utc || "").trim(),
  };
}

function normalizeBlockedRetryEntry(input) {
  if (!input || typeof input !== "object") {
    return {
      source_url: "",
      source_hostname: "",
      volatility_tier: "normal",
      blocked_reason: "",
      first_blocked_utc: "",
      last_blocked_utc: "",
      retry_count: 0,
      fetch_failure_streak: 0,
      fallback_probe_signature: "",
      fallback_probe_strong_signature: "",
      fallback_signal_consecutive_runs: 0,
      fallback_signal_actionable: false,
      fallback_probe_sample: "",
    };
  }
  const sourceUrl = String(input.source_url || "").trim();
  const retryCount = Number.parseInt(String(input.retry_count || 0), 10);
  const failureStreak = Number.parseInt(String(input.fetch_failure_streak || 0), 10);
  const fallbackRuns = Number.parseInt(String(input.fallback_signal_consecutive_runs || 0), 10);
  return {
    source_url: sourceUrl,
    source_hostname: String(input.source_hostname || normalizeSourceHostname(sourceUrl)).trim().toLowerCase(),
    volatility_tier: normalizeVolatilityTier(input.volatility_tier),
    blocked_reason: String(input.blocked_reason || "").trim(),
    first_blocked_utc: String(input.first_blocked_utc || "").trim(),
    last_blocked_utc: String(input.last_blocked_utc || "").trim(),
    retry_count: Number.isFinite(retryCount) && retryCount > 0 ? retryCount : 0,
    fetch_failure_streak: Number.isFinite(failureStreak) && failureStreak > 0 ? failureStreak : 0,
    fallback_probe_signature: String(input.fallback_probe_signature || "").trim(),
    fallback_probe_strong_signature: String(input.fallback_probe_strong_signature || "").trim(),
    fallback_signal_consecutive_runs: Number.isFinite(fallbackRuns) && fallbackRuns > 0 ? fallbackRuns : 0,
    fallback_signal_actionable:
      String(input.fallback_signal_actionable || "").trim() === "1" || Boolean(input.fallback_signal_actionable),
    fallback_probe_sample: String(input.fallback_probe_sample || "").trim(),
  };
}

function buildComparisonBaselineEntry({ baselineEntry, dailyFingerprintEntry }) {
  const normalizedBaseline = normalizeConfirmedBaselineEntry(baselineEntry);
  const normalizedDaily = normalizeDailyFingerprintEntry(dailyFingerprintEntry);
  if (!normalizedDaily.hash) {
    return normalizedBaseline;
  }
  return normalizeConfirmedBaselineEntry({
    hash: normalizedDaily.hash || normalizedBaseline.hash,
    semantic_signature: normalizedDaily.semantic_signature || normalizedBaseline.semantic_signature,
    metadata_signature: normalizedDaily.metadata_signature || normalizedBaseline.metadata_signature,
    source_url: normalizedDaily.source_url || normalizedBaseline.source_url,
    last_confirmed_change_utc:
      normalizedDaily.confirmed_change_utc ||
      normalizedDaily.updated_utc ||
      normalizedBaseline.last_confirmed_change_utc,
  });
}

function buildDailyPolicyCountsFromEvents(dayEvents = []) {
  const counts = Object.fromEntries(POLICY_COUNT_KEYS.map((policy) => [policy, 0]));
  for (const event of dayEvents) {
    const policy = String(event?.policy || "").trim();
    if (!policy || !(policy in counts)) continue;
    counts[policy] = Number(counts[policy] || 0) + 1;
  }
  return counts;
}

export function buildDailyAlertFromEvents(entry = {}, eventLogEntries = []) {
  const dateUtc = String(entry.date_utc || "").trim() || toDateUtcPrefix(entry.generated_at_utc || "");
  const sortedDayEvents = [...(eventLogEntries || [])]
    .filter((event) => toDateUtcPrefix(event?.emitted_at_utc || "") === dateUtc)
    .sort((left, right) => String(right?.emitted_at_utc || "").localeCompare(String(left?.emitted_at_utc || "")));

  const dedupedByKey = new Map();
  for (const event of sortedDayEvents) {
    const policy = String(event?.policy || "").trim();
    const vendor = String(event?.vendor || "").trim();
    if (!policy || !vendor) continue;
    const key = `${policy}:${vendor}`;
    if (!dedupedByKey.has(key)) {
      dedupedByKey.set(key, event);
    }
  }

  const dedupedEntries = [...dedupedByKey.entries()];
  const dedupeChangedSample = dedupedEntries.slice(0, 20).map(([key]) => key);
  const sampleDetails = dedupedEntries.slice(0, 20).map(([key, event]) => ({
    event_id: String(event?.event_id || "").trim(),
    key,
    policy: String(event?.policy || "").trim(),
    vendor: String(event?.vendor || "").trim(),
    source_url: String(event?.source_url || "").trim(),
    semantic_diff_summary: String(event?.semantic_diff_summary || "").trim(),
    emitted_at_utc: String(event?.emitted_at_utc || "").trim(),
    run_url: String(event?.run_url || "").trim(),
    review_status: "unreviewed",
    rulebook_updated: false,
  }));
  const dedupeByPolicy = buildDailyPolicyCountsFromEvents(dedupedEntries.map(([, event]) => event));
  const dedupeChangedCount = dedupedEntries.length;
  const repeatedCount = Math.max(0, sortedDayEvents.length - dedupeChangedCount);

  return {
    ...entry,
    date_utc: dateUtc,
    changed_date: dateUtc,
    created_at: String(entry.generated_at_utc || "").trim(),
    updated_at: String(entry.generated_at_utc || "").trim(),
    changed_count: dedupeChangedCount,
    actual_changed_count: dedupeChangedCount,
    material_changed_count: dedupeChangedCount,
    dedupe_changed_count: dedupeChangedCount,
    reported_changed_count: Number(entry.changed_count || 0),
    repeated_count: repeatedCount,
    by_policy: dedupeByPolicy,
    dedupe_by_policy: dedupeByPolicy,
    changed_sample: dedupeChangedSample,
    sample_details: sampleDetails,
    dedupe_changed_sample: dedupeChangedSample,
    rulebook_status: "unchanged_pending_human_review",
    decision_rule_impact: "not_auto_applied",
    source: "check-policies.js",
  };
}

export function isStrictDailyAlertEntry(entry = {}, { includeZeroChange = true } = {}) {
  const changedCount = Number(entry.changed_count || 0);
  if (changedCount > 0) {
    const details = Array.isArray(entry?.sample_details) ? entry.sample_details : [];
    const reviewedStatuses = new Set(["reviewed_no_rule_change", "rulebook_updated"]);
    return details.length >= changedCount && details.every((detail) =>
      reviewedStatuses.has(String(detail?.review_status || "").trim().toLowerCase())
    );
  }
  return Boolean(includeZeroChange);
}

export function classifyDailyAlertForPublication(dailyEntry = {}, { includeZeroChange = true } = {}) {
  const strictEligible = isStrictDailyAlertEntry(dailyEntry, { includeZeroChange });
  const hasDetectedChanges = Number(dailyEntry.changed_count || 0) > 0;
  const signalConfidence = strictEligible ? "high-confidence" : "manual-review";
  const signalConfidenceReason = hasDetectedChanges
    ? strictEligible
      ? "Every detected semantic change has an adjudicated event review."
      : "Detected semantic changes require human event review before entering the confirmed feed."
    : strictEligible
      ? "No confirmed policy changes for the UTC date; published as a zero-change continuity row."
      : "No confirmed policy changes for the date; nothing published to strict feed.";
  const normalizedEntry = {
    ...dailyEntry,
    strict_eligible: strictEligible,
    signal_confidence: signalConfidence,
    signal_confidence_reason: signalConfidenceReason,
    status: strictEligible ? "confirmed" : "review",
    state: strictEligible ? "verified" : "needs_review",
    change_review_state: hasDetectedChanges
      ? strictEligible ? "reviewed" : "review_required"
      : "not_applicable",
  };
  const reason = strictEligible
    ? hasDetectedChanges ? "" : "zero_change_continuity"
    : hasDetectedChanges ? "awaiting_event_review" : "strict_quality_filter";

  return { strictEligible, hasDetectedChanges, normalizedEntry, reason };
}

function updatePolicyAlertFeed(entry, eventLogEntries = [], { includeZeroChange = true } = {}) {
  const maxEntries = getPolicyAlertFeedMaxEntries();
  const strictExisting = readJson(POLICY_ALERT_FEED_PATH, { alerts: [] });
  const reviewExisting = readJson(POLICY_ALERT_REVIEW_FEED_PATH, { alerts: [] });
  const existingStrictAlerts = collapseAlertsByDate(Array.isArray(strictExisting.alerts) ? strictExisting.alerts : []);
  const existingReviewAlerts = collapseAlertsByDate(Array.isArray(reviewExisting.alerts) ? reviewExisting.alerts : []);

  const dailyEntry = buildDailyAlertFromEvents(entry, eventLogEntries);
  const { strictEligible, normalizedEntry, reason } = classifyDailyAlertForPublication(
    dailyEntry,
    { includeZeroChange }
  );

  const nextReviewAlerts = collapseAlertsByDate(upsertDailyAlert(existingReviewAlerts, normalizedEntry, maxEntries)).slice(
    0,
    Math.max(1, maxEntries)
  );
  let nextStrictAlerts = strictEligible
    ? upsertDailyAlert(existingStrictAlerts, normalizedEntry, maxEntries)
    : removeAlertsForDate(existingStrictAlerts, normalizedEntry.date_utc).slice(0, Math.max(1, maxEntries));
  if (strictEligible && includeZeroChange) {
    nextStrictAlerts = ensureAlertDateContinuity(nextStrictAlerts, maxEntries);
  } else {
    nextStrictAlerts = collapseAlertsByDate(nextStrictAlerts).slice(0, Math.max(1, maxEntries));
  }

  const strictChanged = JSON.stringify(existingStrictAlerts) !== JSON.stringify(nextStrictAlerts);
  const reviewChanged = JSON.stringify(existingReviewAlerts) !== JSON.stringify(nextReviewAlerts);

  if (strictChanged) {
    writeFileSync(
      POLICY_ALERT_FEED_PATH,
      JSON.stringify(
        {
          schema_version: 2,
          mode: "strict_daily_confirmed",
          updated_utc: utcIsoTimestamp(),
          source: "check-policies.js",
          alerts: nextStrictAlerts,
        },
        null,
        2
      ) + "\n"
    );
  }

  if (reviewChanged) {
    writeFileSync(
      POLICY_ALERT_REVIEW_FEED_PATH,
      JSON.stringify(
        {
          schema_version: 2,
          mode: "daily_review_queue",
          updated_utc: utcIsoTimestamp(),
          source: "check-policies.js",
          alerts: nextReviewAlerts,
        },
        null,
        2
      ) + "\n"
    );
  }

  return {
    published: strictEligible,
    review_published: true,
    reason,
    signature: String(normalizedEntry.alert_signature || buildAlertSignature(normalizedEntry)),
    feedChanged: strictChanged,
    reviewFeedChanged: reviewChanged,
    strictEligible,
    daily_entry: normalizedEntry,
  };
}

function summarizeStatusCounts(rows) {
  const counts = {};
  for (const row of rows || []) {
    const status = String(row?.status || "unknown").trim() || "unknown";
    counts[status] = Number(counts[status] || 0) + 1;
  }
  return counts;
}

function summarizePolicyStatusCounts(rows, statuses = []) {
  const statusSet = new Set((statuses || []).map((status) => String(status || "").trim()).filter(Boolean));
  const counts = {};
  for (const row of rows || []) {
    const policy = String(row?.policy || "").trim();
    const status = String(row?.status || "").trim();
    if (!policy) continue;
    if (statusSet.size > 0 && !statusSet.has(status)) continue;
    counts[policy] = Number(counts[policy] || 0) + 1;
  }
  return counts;
}

function writePolicyStatusReports(rows, generatedAtUtc) {
  const sortedRows = [...(rows || [])].sort((a, b) => {
    const policyOrder = POLICY_COUNT_KEYS.indexOf(String(a.policy || ""));
    const nextPolicyOrder = POLICY_COUNT_KEYS.indexOf(String(b.policy || ""));
    if (policyOrder !== nextPolicyOrder) {
      return (policyOrder === -1 ? 999 : policyOrder) - (nextPolicyOrder === -1 ? 999 : nextPolicyOrder);
    }
    return String(a.vendor || "").localeCompare(String(b.vendor || ""));
  });

  const statusCounts = summarizeStatusCounts(sortedRows);
  const byPolicyRows = {};
  for (const row of sortedRows) {
    const policy = String(row.policy || "").trim() || "unknown";
    if (!byPolicyRows[policy]) byPolicyRows[policy] = [];
    byPolicyRows[policy].push(row);
  }

  const payload = {
    schema_version: 1,
    generated_at_utc: generatedAtUtc,
    run_id: String(process.env.GITHUB_RUN_ID || "").trim(),
    run_attempt: String(process.env.GITHUB_RUN_ATTEMPT || "").trim(),
    commit_sha: String(process.env.GITHUB_SHA || "").trim(),
    run_url: buildRunUrl(),
    totals: {
      row_count: sortedRows.length,
      status_counts: statusCounts,
    },
    rows: sortedRows,
  };
  writeFileSync(POLICY_STATUS_REPORT_JSON_PATH, JSON.stringify(payload, null, 2) + "\n");

  const lines = [];
  lines.push("# Policy Status Report");
  lines.push("");
  lines.push(`Generated UTC: ${generatedAtUtc}`);
  lines.push(`Rows: ${sortedRows.length}`);
  lines.push(
    `Status totals: ${Object.entries(statusCounts)
      .map(([status, count]) => `${status}=${count}`)
      .join(", ")}`
  );
  lines.push("");

  const orderedPolicies = [...POLICY_COUNT_KEYS, ...Object.keys(byPolicyRows).filter((p) => !POLICY_COUNT_KEYS.includes(p))];
  for (const policy of orderedPolicies) {
    const policyRows = byPolicyRows[policy] || [];
    if (policyRows.length === 0) continue;
    lines.push(`## ${policy} (${policyRows.length} vendors)`);
    for (const row of policyRows) {
      const reason = String(row.reason || "").trim() || "no additional details";
      const source = String(row.source_url || "").trim();
      const sourceSuffix = source ? ` Source: ${source}` : "";
      lines.push(`- ${row.vendor}: ${row.status}. ${reason}.${sourceSuffix}`);
    }
    lines.push("");
  }

  writeFileSync(POLICY_STATUS_REPORT_MD_PATH, lines.join("\n").trimEnd() + "\n");
  return payload;
}

function writePolicyVendorLifecycleReports(report) {
  writeFileSync(POLICY_VENDOR_LIFECYCLE_JSON_PATH, JSON.stringify(report, null, 2) + "\n");
  writeFileSync(POLICY_VENDOR_LIFECYCLE_MD_PATH, formatPolicyVendorLifecycleMarkdown(report));
}

function writePolicyCoverageScorecard(scorecard) {
  writeFileSync(POLICY_COVERAGE_SCORECARD_JSON_PATH, JSON.stringify(scorecard, null, 2) + "\n");
  writeFileSync(POLICY_COVERAGE_SCORECARD_MD_PATH, formatPolicyCoverageScorecardMarkdown(scorecard));
}

function toIsoWeekKey(utcIso) {
  const date = new Date(utcIso);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCHours(0, 0, 0, 0);
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const weekNo = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function buildWeeklyTriageSnapshot(rows, generatedAtUtc) {
  const statuses = new Set(["pending_confirmation", "legacy_pending", "quality_gate_held", "fetch_blocked", "fetch_failed"]);
  const pendingRows = (rows || []).filter((row) => statuses.has(String(row?.status || "")));
  const fetchBlockedRows = (rows || []).filter((row) => String(row?.status || "") === "fetch_blocked");
  const fetchFailedRows = (rows || []).filter((row) => String(row?.status || "") === "fetch_failed");
  const confirmedRows = (rows || []).filter((row) => String(row?.status || "") === "confirmed_changed");
  const volatileRows = (rows || []).filter((row) => Array.isArray(row?.flags) && row.flags.includes("volatile_pending"));
  const escalationRows = (rows || []).filter((row) => Array.isArray(row?.flags) && row.flags.includes("escalation_candidate"));
  const fallbackActionableRows = (rows || []).filter(
    (row) => Array.isArray(row?.flags) && row.flags.includes("fallback_signal_actionable")
  );

  return {
    week_key: toIsoWeekKey(generatedAtUtc),
    generated_at_utc: generatedAtUtc,
    pending_total: pendingRows.length,
    fetch_blocked_total: fetchBlockedRows.length,
    fetch_failed_total: fetchFailedRows.length,
    confirmed_changed_total: confirmedRows.length,
    volatile_pending_total: volatileRows.length,
    escalation_candidate_total: escalationRows.length,
    fallback_signal_actionable_total: fallbackActionableRows.length,
    pending_by_policy: summarizePolicyStatusCounts(pendingRows),
    fetch_blocked_by_policy: summarizePolicyStatusCounts(fetchBlockedRows),
    confirmed_changed_by_policy: summarizePolicyStatusCounts(confirmedRows),
  };
}

function writeWeeklyTriageReports(rows, generatedAtUtc) {
  const snapshot = buildWeeklyTriageSnapshot(rows, generatedAtUtc);
  if (!snapshot.week_key) return;

  const existing = readJson(POLICY_WEEKLY_TRIAGE_JSON_PATH, { schema_version: 1, weeks: [] });
  const weeks = Array.isArray(existing.weeks) ? [...existing.weeks] : [];
  const existingIndex = weeks.findIndex((entry) => String(entry?.week_key || "") === snapshot.week_key);
  if (existingIndex >= 0) {
    weeks[existingIndex] = snapshot;
  } else {
    weeks.push(snapshot);
  }
  weeks.sort((a, b) => String(a.week_key || "").localeCompare(String(b.week_key || "")));
  const retainedWeeks = weeks.slice(Math.max(0, weeks.length - 26));
  const currentIndex = retainedWeeks.findIndex((entry) => String(entry?.week_key || "") === snapshot.week_key);
  const previous = currentIndex > 0 ? retainedWeeks[currentIndex - 1] : null;

  const payload = {
    schema_version: 1,
    updated_utc: generatedAtUtc,
    current_week: snapshot.week_key,
    weeks: retainedWeeks,
  };
  writeFileSync(POLICY_WEEKLY_TRIAGE_JSON_PATH, JSON.stringify(payload, null, 2) + "\n");

  const delta = (key) => {
    if (!previous) return 0;
    return Number(snapshot[key] || 0) - Number(previous[key] || 0);
  };

  const lines = [];
  lines.push("# Policy Weekly Triage");
  lines.push("");
  lines.push(`Current week: ${snapshot.week_key}`);
  lines.push(`Generated UTC: ${generatedAtUtc}`);
  lines.push("");
  lines.push("## Current Snapshot");
  lines.push(`- Pending total: ${snapshot.pending_total}`);
  lines.push(`- Fetch blocked total: ${snapshot.fetch_blocked_total}`);
  lines.push(`- Fetch failed total: ${snapshot.fetch_failed_total}`);
  lines.push(`- Confirmed changed total: ${snapshot.confirmed_changed_total}`);
  lines.push(`- Volatile pending total: ${snapshot.volatile_pending_total}`);
  lines.push(`- Escalation candidate total: ${snapshot.escalation_candidate_total}`);
  lines.push(`- Fallback signal actionable total: ${snapshot.fallback_signal_actionable_total}`);
  if (previous) {
    lines.push("");
    lines.push(`## Week-over-Week Delta vs ${previous.week_key}`);
    lines.push(`- Pending delta: ${delta("pending_total")}`);
    lines.push(`- Fetch blocked delta: ${delta("fetch_blocked_total")}`);
    lines.push(`- Confirmed changed delta: ${delta("confirmed_changed_total")}`);
    lines.push(`- Volatile pending delta: ${delta("volatile_pending_total")}`);
  }
  lines.push("");
  lines.push("## Weekly History (most recent first)");
  for (const entry of [...retainedWeeks].reverse().slice(0, 12)) {
    lines.push(
      `- ${entry.week_key}: pending=${entry.pending_total}, blocked=${entry.fetch_blocked_total}, confirmed=${entry.confirmed_changed_total}, volatile=${entry.volatile_pending_total}, fallback_actionable=${entry.fallback_signal_actionable_total}`
    );
  }
  lines.push("");
  lines.push("Tracking source files:");
  lines.push("- rules/policy-coverage-state.json");
  lines.push("- rules/cancel-policy-coverage-state.json");
  lines.push("- rules/return-policy-coverage-state.json");
  lines.push("- rules/trial-policy-coverage-state.json");

  writeFileSync(POLICY_WEEKLY_TRIAGE_MD_PATH, lines.join("\n").trimEnd() + "\n");
}

function readNdjson(filePath) {
  if (!existsSync(filePath)) return [];
  const raw = String(readFileSync(filePath, "utf8") || "");
  if (!raw.trim()) return [];
  const parsed = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const value = JSON.parse(trimmed);
      if (value && typeof value === "object") {
        parsed.push(value);
      }
    } catch {
      // Ignore malformed historic lines and continue.
    }
  }
  return parsed;
}

function toArtifactAbsolutePath(artifactPath = "") {
  return join(__dirname, "..", String(artifactPath || "").trim());
}

async function hydratePolicyStateArtifactsFromSupabase(supabaseConfig) {
  if (!supabaseConfig?.stateSyncEnabled) {
    return {
      enabled: false,
      ok: true,
      hydrated_count: 0,
      missing_count: POLICY_SUPABASE_STATE_ARTIFACTS.length,
      error: "",
    };
  }

  const result = await supabaseRestRequest(supabaseConfig, {
    method: "GET",
    path: "/rest/v1/policy_state_artifacts",
    params: {
      select: "artifact_path,content_text,content_sha256,source,run_id,run_attempt,commit_sha,updated_at_utc",
    },
  });
  if (!result.ok) {
    return {
      enabled: true,
      ok: false,
      hydrated_count: 0,
      missing_count: POLICY_SUPABASE_STATE_ARTIFACTS.length,
      error: String(result.error || "supabase_state_hydrate_failed"),
    };
  }

  const byPath = validatePolicyStateArtifacts(result.data,
    POLICY_SUPABASE_STATE_ARTIFACTS.filter(path => path !== POLICY_EVIDENCE_ARTIFACT_PATH));

  let hydratedCount = 0;
  let missingCount = 0;
  for (const artifactPath of POLICY_SUPABASE_STATE_ARTIFACTS) {
    if (artifactPath === POLICY_EVIDENCE_ARTIFACT_PATH) continue; // Output only, never a monitoring baseline.
    if (!byPath.has(artifactPath)) {
      missingCount += 1;
      continue;
    }
    const absolutePath = toArtifactAbsolutePath(artifactPath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, byPath.get(artifactPath), "utf8");
    hydratedCount += 1;
  }

  return {
    enabled: true,
    ok: true,
    hydrated_count: hydratedCount,
    missing_count: missingCount,
    error: "",
  };
}

async function syncPolicyStateArtifactsToSupabase(supabaseConfig) {
  if (!supabaseConfig?.stateSyncEnabled) {
    return {
      enabled: false,
      ok: true,
      synced_count: 0,
      skipped_count: POLICY_SUPABASE_STATE_ARTIFACTS.length,
      error: "",
    };
  }

  const rows = [];
  let skippedCount = 0;
  const updatedAtUtc = utcIsoTimestamp();
  const runId = String(process.env.GITHUB_RUN_ID || "").trim();
  const runAttempt = String(process.env.GITHUB_RUN_ATTEMPT || "").trim();
  const commitSha = String(process.env.GITHUB_SHA || "").trim();
  for (const artifactPath of POLICY_SUPABASE_STATE_ARTIFACTS) {
    const absolutePath = toArtifactAbsolutePath(artifactPath);
    if (!existsSync(absolutePath)) {
      skippedCount += 1;
      continue;
    }
    const contentText = String(readFileSync(absolutePath, "utf8") || "");
    rows.push({
      artifact_path: artifactPath,
      content_text: contentText,
      content_sha256: sha256Hex(contentText),
      run_id: runId,
      run_attempt: runAttempt,
      commit_sha: commitSha,
      source: "check-policies.js",
      updated_at_utc: updatedAtUtc,
    });
  }

  const upsert = await supabaseUpsertRows(supabaseConfig, "policy_state_artifacts", rows, ["artifact_path"]);
  return {
    enabled: true,
    ok: upsert.ok,
    synced_count: upsert.ok ? rows.length : 0,
    skipped_count: skippedCount,
    error: String(upsert.error || ""),
  };
}

function buildSupabasePolicyEventRows(eventLogEntries = [], dateUtc = "") {
  const targetDate = String(dateUtc || "").trim();
  return [...(eventLogEntries || [])]
    .filter((event) => {
      if (!targetDate) return true;
      return toDateUtcPrefix(event?.emitted_at_utc || "") === targetDate;
    })
    .map((event) => {
      const emittedAtUtc = String(event?.emitted_at_utc || "").trim();
      return {
        event_id: String(event?.event_id || "").trim() || buildPolicyEventId(event),
        emitted_at_utc: emittedAtUtc,
        date_utc: toDateUtcPrefix(emittedAtUtc),
        policy: String(event?.policy || "").trim(),
        vendor: String(event?.vendor || "").trim(),
        confirmed_hash: String(event?.confirmed_hash || "").trim(),
        previous_hash: String(event?.previous_hash || "").trim(),
        semantic_diff_summary: String(event?.semantic_diff_summary || "").trim(),
        source_url: String(event?.source_url || "").trim(),
        rules_file: String(event?.rules_file || "").trim(),
        run_id: String(event?.run_id || "").trim(),
        run_attempt: String(event?.run_attempt || "").trim(),
        commit_sha: String(event?.commit_sha || "").trim(),
        run_url: String(event?.run_url || "").trim(),
        raw: event && typeof event === "object" ? event : {},
        updated_at_utc: utcIsoTimestamp(),
      };
    })
    .filter((row) => row.event_id && row.policy && row.vendor && row.date_utc);
}

function buildSupabaseDailyAlertRow(entry = {}, strictEligible = false) {
  const dateUtc = String(entry?.date_utc || "").trim();
  if (!dateUtc) return null;
  return {
    date_utc: dateUtc,
    generated_at_utc: String(entry?.generated_at_utc || entry?.updated_at || utcIsoTimestamp()).trim(),
    strict_eligible: Boolean(strictEligible),
    changed_count: Number(entry?.changed_count || 0),
    dedupe_changed_count: Number(entry?.dedupe_changed_count || entry?.changed_count || 0),
    reported_changed_count: Number(entry?.reported_changed_count || 0),
    repeated_count: Number(entry?.repeated_count || 0),
    by_policy: entry?.by_policy && typeof entry.by_policy === "object" ? entry.by_policy : {},
    changed_sample: Array.isArray(entry?.changed_sample) ? entry.changed_sample.slice(0, 50) : [],
    sample_details: Array.isArray(entry?.sample_details) ? entry.sample_details.slice(0, 50) : [],
    pending_count: Number(entry?.pending_count || 0),
    volatile_pending_count: Number(entry?.volatile_pending_count || 0),
    escalation_count: Number(entry?.escalation_count || 0),
    coverage_gap_count: Number(entry?.coverage_gap_count || 0),
    fetch_failure_count: Number(entry?.fetch_failure_count || 0),
    fetch_health_status: String(entry?.fetch_health_status || "unknown"),
    fetch_blocked_pending_count: Number(entry?.fetch_blocked_pending_count || 0),
    quality_gate_held_count: Number(entry?.quality_gate_held_count || 0),
    metadata_stability_held_count: Number(entry?.metadata_stability_held_count || 0),
    material_oscillation_suppressed_count: Number(entry?.material_oscillation_suppressed_count || 0),
    source_migration_reset_count: Number(entry?.source_migration_reset_count || 0),
    signal_confidence: String(entry?.signal_confidence || (strictEligible ? "high-confidence" : "manual-review")),
    signal_confidence_reason: String(entry?.signal_confidence_reason || ""),
    status: String(entry?.status || (strictEligible ? "confirmed" : "review")),
    state: String(entry?.state || (strictEligible ? "verified" : "needs_review")),
    run_id: String(entry?.run_id || "").trim(),
    run_attempt: String(entry?.run_attempt || "").trim(),
    commit_sha: String(entry?.commit_sha || "").trim(),
    run_url: String(entry?.run_url || "").trim(),
    source: String(entry?.source || "check-policies.js").trim() || "check-policies.js",
    raw: entry && typeof entry === "object" ? entry : {},
    updated_at_utc: utcIsoTimestamp(),
  };
}

function getAlertContinuityLookbackDays() {
  const parsed = Number.parseInt(String(CHECKER_CONFIG.alertContinuityLookbackDays || "120"), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 120;
  return Math.min(366, parsed);
}

function listDateRangeUtc(startDateUtc = "", endDateUtc = "") {
  const startDate = parseDateOnlyToUtc(startDateUtc);
  const endDate = parseDateOnlyToUtc(endDateUtc);
  if (!startDate || !endDate || startDate > endDate) return [];

  const dates = [];
  let cursor = new Date(startDate.getTime());
  while (cursor <= endDate) {
    dates.push(toDateOnlyUtc(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

async function fetchSupabaseDailyAlertDateSet(supabaseConfig, startDateUtc = "", endDateUtc = "") {
  const start = String(startDateUtc || "").trim();
  const end = String(endDateUtc || "").trim();
  if (!start || !end) return new Set();
  const result = await supabaseRestRequest(supabaseConfig, {
    method: "GET",
    path: "/rest/v1/policy_daily_alerts",
    params: {
      select: "date_utc",
      order: "date_utc.asc",
      and: `(date_utc.gte.${start},date_utc.lte.${end})`,
      limit: "400",
    },
  });
  if (!result.ok || !Array.isArray(result.data)) {
    return new Set();
  }
  return new Set(
    result.data
      .map((row) => String(row?.date_utc || "").trim())
      .filter((dateUtc) => parseDateOnlyToUtc(dateUtc))
  );
}

function buildSupabaseZeroChangeContinuityRow(dateUtc = "", templateEntry = {}) {
  const normalizedDateUtc = String(dateUtc || "").trim();
  if (!normalizedDateUtc) return null;
  const zeroByPolicy = toZeroPolicyCounts();
  return buildSupabaseDailyAlertRow(
    {
      date_utc: normalizedDateUtc,
      generated_at_utc: `${normalizedDateUtc}T23:59:59Z`,
      changed_count: 0,
      dedupe_changed_count: 0,
      reported_changed_count: 0,
      repeated_count: 0,
      by_policy: zeroByPolicy,
      changed_sample: [],
      pending_count: 0,
      volatile_pending_count: 0,
      escalation_count: 0,
      coverage_gap_count: 0,
      fetch_failure_count: 0,
      fetch_health_status: "healthy",
      fetch_blocked_pending_count: 0,
      quality_gate_held_count: 0,
      metadata_stability_held_count: 0,
      material_oscillation_suppressed_count: 0,
      source_migration_reset_count: 0,
      signal_confidence: "high-confidence",
      signal_confidence_reason: "No confirmed policy changes for the UTC date; published as a zero-change continuity row.",
      status: "confirmed",
      state: "verified",
      run_id: String(templateEntry?.run_id || "").trim(),
      run_attempt: String(templateEntry?.run_attempt || "").trim(),
      commit_sha: String(templateEntry?.commit_sha || "").trim(),
      run_url: String(templateEntry?.run_url || "").trim(),
      source: "check-policies.js:continuity_backfill",
      raw: {
        continuity_backfill: true,
      },
    },
    true
  );
}

async function buildSupabaseContinuityBackfillRows({
  supabaseConfig,
  targetDateUtc = "",
  dailyAlertEntry = {},
} = {}) {
  const normalizedTargetDateUtc = String(targetDateUtc || "").trim();
  if (!parseDateOnlyToUtc(normalizedTargetDateUtc)) return [];

  const lookbackDays = getAlertContinuityLookbackDays();
  const startDateUtc = addUtcDays(normalizedTargetDateUtc, -Math.max(0, lookbackDays - 1));
  const rangeDates = listDateRangeUtc(startDateUtc, normalizedTargetDateUtc);
  if (rangeDates.length === 0) return [];

  const existingDateSet = await fetchSupabaseDailyAlertDateSet(supabaseConfig, startDateUtc, normalizedTargetDateUtc);
  const rows = [];
  for (const dateUtc of rangeDates) {
    if (dateUtc === normalizedTargetDateUtc) continue;
    if (existingDateSet.has(dateUtc)) continue;
    const row = buildSupabaseZeroChangeContinuityRow(dateUtc, dailyAlertEntry);
    if (row) rows.push(row);
  }
  return rows;
}

async function syncPolicyAlertsToSupabase({
  supabaseConfig,
  dateUtc = "",
  eventLogEntries = [],
  dailyAlertEntry = null,
  strictEligible = false,
} = {}) {
  if (!supabaseConfig?.syncEnabled) {
    return {
      enabled: false,
      ok: true,
      event_upserted_count: 0,
      daily_alert_upserted_count: 0,
      daily_alert_backfilled_count: 0,
      error: "",
    };
  }

  const eventRows = buildSupabasePolicyEventRows(eventLogEntries, dateUtc);
  const eventUpsert = await supabaseUpsertRows(supabaseConfig, "policy_events", eventRows, ["event_id"]);
  const dailyRow = buildSupabaseDailyAlertRow(dailyAlertEntry || {}, strictEligible);
  const continuityRows = dailyRow
    ? await buildSupabaseContinuityBackfillRows({
      supabaseConfig,
      targetDateUtc: String(dailyRow.date_utc || "").trim(),
      dailyAlertEntry: dailyAlertEntry || {},
    })
    : [];
  const dailyRowsByDate = new Map();
  for (const row of continuityRows) {
    const key = String(row?.date_utc || "").trim();
    if (!key) continue;
    dailyRowsByDate.set(key, row);
  }
  if (dailyRow) {
    dailyRowsByDate.set(String(dailyRow.date_utc || "").trim(), dailyRow);
  }
  const dailyRows = [...dailyRowsByDate.values()];
  const dailyUpsert = await supabaseUpsertRows(supabaseConfig, "policy_daily_alerts", dailyRows, ["date_utc"]);

  return {
    enabled: true,
    ok: eventUpsert.ok && dailyUpsert.ok,
    event_upserted_count: eventUpsert.ok ? eventRows.length : 0,
    daily_alert_upserted_count: dailyUpsert.ok ? dailyRows.length : 0,
    daily_alert_backfilled_count: continuityRows.length,
    error: [eventUpsert.error, dailyUpsert.error].filter(Boolean).join("; "),
  };
}

function buildPolicyEventId(item) {
  const policyType = String(item?.policyType || item?.policy || "").trim();
  const vendor = String(item?.vendor || "").trim();
  const confirmedHash = String(item?.confirmed_hash || item?.hash || "").trim();
  if (!policyType || !vendor || !confirmedHash) return "";
  return `${policyType}:${vendor}:${confirmedHash}`;
}

function appendPolicyEventLog(changedItems, generatedAtUtc = utcIsoTimestamp()) {
  const existingEvents = readNdjson(POLICY_EVENT_LOG_PATH);
  const existingIds = new Set();
  for (const event of existingEvents) {
    const eventId = String(event?.event_id || "").trim() || buildPolicyEventId(event);
    if (eventId) existingIds.add(eventId);
  }

  const runId = String(process.env.GITHUB_RUN_ID || "").trim();
  const runAttempt = String(process.env.GITHUB_RUN_ATTEMPT || "").trim();
  const commitSha = String(process.env.GITHUB_SHA || "").trim();
  const runUrl = buildRunUrl();
  const newEvents = [];
  let skippedExisting = 0;
  let skippedInvalid = 0;

  for (const item of changedItems || []) {
    const eventId = buildPolicyEventId(item);
    if (!eventId) {
      skippedInvalid += 1;
      continue;
    }
    if (existingIds.has(eventId)) {
      skippedExisting += 1;
      continue;
    }

    const event = {
      event_id: eventId,
      emitted_at_utc: generatedAtUtc,
      policy: String(item.policyType || "").trim(),
      vendor: String(item.vendor || "").trim(),
      confirmed_hash: String(item.confirmed_hash || "").trim(),
      previous_hash: String(item.previous_hash || "").trim(),
      semantic_diff_summary: String(item.semantic_diff_summary || "").trim(),
      source_url: String(item.url || "").trim(),
      rules_file: String(item.rulesFile || "").trim(),
      run_id: runId,
      run_attempt: runAttempt,
      commit_sha: commitSha,
      run_url: runUrl,
    };
    if (item.semantic_diff && typeof item.semantic_diff === "object") {
      event.semantic_diff = item.semantic_diff;
    }
    newEvents.push(event);
    existingIds.add(eventId);
  }

  if (newEvents.length > 0) {
    const existingRaw = existsSync(POLICY_EVENT_LOG_PATH)
      ? String(readFileSync(POLICY_EVENT_LOG_PATH, "utf8") || "").trimEnd()
      : "";
    const appendedRaw = newEvents.map((event) => JSON.stringify(event)).join("\n");
    const nextRaw = existingRaw ? `${existingRaw}\n${appendedRaw}\n` : `${appendedRaw}\n`;
    writeFileSync(POLICY_EVENT_LOG_PATH, nextRaw, "utf8");
  }

  return {
    appended_count: newEvents.length,
    skipped_existing_count: skippedExisting,
    skipped_invalid_count: skippedInvalid,
    total_count: existingIds.size,
  };
}

function updateJsonStringField(filePath, fieldName, nextValue) {
  const raw = readFileSync(filePath, "utf8");
  const pattern = new RegExp(`"${fieldName}"\\s*:\\s*"[^"]*"`);
  if (pattern.test(raw)) {
    const updated = raw.replace(pattern, `"${fieldName}": "${nextValue}"`);
    if (updated !== raw) {
      writeFileSync(filePath, updated, "utf8");
      return true;
    }
    return false;
  }

  return false;
}

export function normalizeSourceUrlForComparison(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    if ((parsed.protocol === "https:" && parsed.port === "443") || (parsed.protocol === "http:" && parsed.port === "80")) {
      parsed.port = "";
    }
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    if (parsed.search) {
      const sortedParams = [...parsed.searchParams.entries()].sort(([aKey, aValue], [bKey, bValue]) =>
        aKey === bKey ? aValue.localeCompare(bValue) : aKey.localeCompare(bKey)
      );
      const nextSearchParams = new URLSearchParams();
      for (const [key, val] of sortedParams) {
        nextSearchParams.append(key, val);
      }
      const sortedSearch = nextSearchParams.toString();
      parsed.search = sortedSearch ? `?${sortedSearch}` : "";
    }
    return parsed.toString().replace(/\/$/, parsed.pathname === "/" ? "/" : "");
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

function firstNonEmptyString(values = []) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function evaluateVendorSourceMigration({
  configuredSourceUrl = "",
  baselineSourceUrl = "",
  candidateSourceUrl = "",
  coverageSourceUrl = "",
  semanticSourceUrl = "",
} = {}) {
  const configuredRaw = String(configuredSourceUrl || "").trim();
  if (!configuredRaw) {
    return {
      migrated: false,
      previousSourceUrl: "",
      configuredSourceUrl: "",
      reason: "missing_configured_source",
    };
  }
  const previousRaw = firstNonEmptyString([
    candidateSourceUrl,
    coverageSourceUrl,
    baselineSourceUrl,
    semanticSourceUrl,
  ]);
  if (!previousRaw) {
    return {
      migrated: false,
      previousSourceUrl: "",
      configuredSourceUrl: configuredRaw,
      reason: "no_prior_source",
    };
  }
  const configuredNormalized = normalizeSourceUrlForComparison(configuredRaw);
  const previousNormalized = normalizeSourceUrlForComparison(previousRaw);
  const migrated = Boolean(configuredNormalized && previousNormalized && configuredNormalized !== previousNormalized);
  return {
    migrated,
    previousSourceUrl: previousRaw,
    configuredSourceUrl: configuredRaw,
    reason: migrated ? "primary_source_url_changed" : "stable_source",
  };
}

function detectFetchInterstitial(text) {
  const raw = String(text || "");
  if (!raw.trim()) return "empty";

  const normalized = raw.toLowerCase();
  const checks = [
    ["cloudflare_challenge", normalized.includes("cf_chl_opt") || normalized.includes("/cdn-cgi/challenge-platform/")],
    ["js_cookie_challenge", normalized.includes("enable javascript and cookies to continue")],
    ["just_a_moment", normalized.includes("<title>just a moment") || normalized.includes("title: just a moment")],
    ["captcha_interstitial", normalized.includes("captcha") && normalized.includes("attention required")],
    ["akamai_access_denied", normalized.includes("access denied") && normalized.includes("reference #")],
  ];

  for (const [reason, matched] of checks) {
    if (matched) return reason;
  }

  return "";
}

function normalizeFetchFailureReasonToken(errorMessage) {
  const normalized = String(errorMessage || "").trim().toLowerCase();
  if (!normalized) return "";
  if (/^http\s+\d{3}$/.test(normalized)) {
    return normalized.replace(/\s+/g, "_");
  }
  return normalized.replace(/\s+/g, "_");
}

function parseFetchFailureSegments(failureReason) {
  return String(failureReason || "")
    .split(";")
    .map((segment) => String(segment || "").trim())
    .filter(Boolean)
    .map((segment) => {
      const match = /^(.*?)\s+\[([^\]]+)\]\s+\((.*)\)$/.exec(segment);
      if (!match) {
        return {
          lane: "",
          error: segment,
        };
      }
      return {
        lane: String(match[2] || "").trim().toLowerCase(),
        error: String(match[3] || "").trim(),
      };
    });
}

function isImmediateFetchBlockErrorMessage(errorMessage) {
  const normalized = String(errorMessage || "").trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.startsWith("interstitial:")) return true;
  return ["http 401", "http 403", "http 429", "http 451", "http 1020"].includes(normalized);
}

function isAuxiliaryFetchFailureSegment(segment) {
  if (!segment || typeof segment !== "object") return false;
  const lane = String(segment.lane || "").trim().toLowerCase();
  const error = String(segment.error || "").trim().toLowerCase();
  return lane === "zendesk_api" && error === "http 404";
}

export function classifyFetchFailureBlock(failureReason) {
  const segments = parseFetchFailureSegments(failureReason);
  if (segments.length === 0) {
    return { immediateBlock: false, reason: "" };
  }

  let strongBlockSeen = false;
  const reasonTokens = [];
  for (const segment of segments) {
    if (isImmediateFetchBlockErrorMessage(segment.error)) {
      strongBlockSeen = true;
      const token = normalizeFetchFailureReasonToken(segment.error);
      if (token) {
        reasonTokens.push(token);
      }
      continue;
    }
    if (isAuxiliaryFetchFailureSegment(segment)) {
      continue;
    }
    return { immediateBlock: false, reason: "" };
  }

  if (!strongBlockSeen) {
    return { immediateBlock: false, reason: "" };
  }

  const uniqueTokens = [...new Set(reasonTokens)];
  return {
    immediateBlock: true,
    reason: uniqueTokens.length > 0 ? `known_fetch_blocker:${uniqueTokens.join("|")}` : "known_fetch_blocker",
  };
}

export function getCandidatePendingModelId(candidate) {
  const configured =
    typeof candidate?.pending_model_id === "string" && candidate.pending_model_id.trim()
      ? candidate.pending_model_id.trim()
      : "";
  return configured || LEGACY_PENDING_MODEL_ID;
}

export function isLegacyPendingCandidate(candidate) {
  return getCandidatePendingModelId(candidate) !== PENDING_MODEL_ID;
}

function getPendingModelFirstObservedUtc(candidate, fallback = "") {
  if (typeof candidate?.pending_model_first_observed_utc === "string" && candidate.pending_model_first_observed_utc.trim()) {
    return candidate.pending_model_first_observed_utc.trim();
  }
  return String(fallback || "").trim();
}

function markCandidatePendingModel(candidate, firstObservedUtc) {
  return {
    ...(candidate && typeof candidate === "object" ? candidate : {}),
    pending_model_id: PENDING_MODEL_ID,
    pending_model_first_observed_utc: getPendingModelFirstObservedUtc(candidate, firstObservedUtc),
  };
}

function decodeHtmlEntities(input) {
  if (!input) return "";
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number.parseInt(code, 10)));
}

function escapeRegexLiteral(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getPolicyKeywordRegex(policyType) {
  const typedKeywords = POLICY_FOCUS_KEYWORDS[policyType] || [];
  const keywords = [...new Set([...POLICY_FOCUS_KEYWORDS.default, ...typedKeywords])];
  if (keywords.length === 0) return null;
  const pattern = keywords
    .filter((keyword) => typeof keyword === "string" && keyword.trim())
    .map((keyword) => escapeRegexLiteral(keyword.trim()))
    .join("|");
  if (!pattern) return null;
  return new RegExp(`\\b(?:${pattern})\\b`, "i");
}

function getPolicyKeywords(policyType) {
  const typedKeywords = POLICY_FOCUS_KEYWORDS[policyType] || [];
  return [...new Set([...POLICY_FOCUS_KEYWORDS.default, ...typedKeywords])]
    .map((keyword) => String(keyword || "").trim().toLowerCase())
    .filter(Boolean);
}

function getVendorKeywordRegex(vendorKey) {
  const keywords = VENDOR_STABILITY_KEYWORDS[vendorKey];
  if (!Array.isArray(keywords) || keywords.length === 0) return null;
  const pattern = keywords
    .filter((keyword) => typeof keyword === "string" && keyword.trim())
    .map((keyword) => escapeRegexLiteral(keyword.trim()))
    .join("|");
  if (!pattern) return null;
  return new RegExp(`\\b(?:${pattern})\\b`, "i");
}

function extractVendorStableText(lines, vendorKey) {
  if (!Array.isArray(lines) || lines.length === 0) return "";
  const vendorRegex = getVendorKeywordRegex(vendorKey);
  if (!vendorRegex) return "";

  const selectedIndexes = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    if (!vendorRegex.test(lines[i])) continue;
    for (let j = Math.max(0, i - 2); j <= Math.min(lines.length - 1, i + 2); j += 1) {
      selectedIndexes.add(j);
    }
  }

  if (selectedIndexes.size < 6) return "";
  return [...selectedIndexes]
    .sort((a, b) => a - b)
    .map((index) => lines[index])
    .join("\n");
}

function extractPolicyFocusedText(lines, policyType) {
  if (!Array.isArray(lines) || lines.length === 0) return "";
  const keywordRegex = getPolicyKeywordRegex(policyType);
  if (!keywordRegex) return "";

  const selectedIndexes = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    if (!keywordRegex.test(lines[i])) continue;
    for (let j = Math.max(0, i - 1); j <= Math.min(lines.length - 1, i + 1); j += 1) {
      selectedIndexes.add(j);
    }
  }

  if (selectedIndexes.size < 6) {
    return "";
  }

  return [...selectedIndexes]
    .sort((a, b) => a - b)
    .map((index) => lines[index])
    .join("\n");
}

function normalizeFetchedText(rawText, policyType = "default", vendorKey = "") {
  let text = String(rawText || "");
  if (!text.trim()) return "";

  text = text
    .replace(/\r/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|iframe|canvas|header|footer|nav)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|section|article|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  text = decodeHtmlEntities(text)
    .replace(/https?:\/\/[^\s)]+/gi, " ")
    .replace(/\b\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g, " ")
    .replace(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/gi, " ")
    .replace(/\b[a-f0-9]{24,}\b/gi, " ")
    .replace(/\b(v|version)\s*\d+(?:\.\d+){1,3}\b/gi, " ")
    .replace(/[ \t]+/g, " ");

  const lines = text
    .split("\n")
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line.length >= 8);

  const deduped = [];
  for (const line of lines) {
    if (line !== deduped[deduped.length - 1]) deduped.push(line);
  }

  const vendorStable = extractVendorStableText(deduped, vendorKey);
  if (vendorStable) return vendorStable;

  const focused = extractPolicyFocusedText(deduped, policyType);
  if (focused) return focused;
  return deduped.join("\n");
}

function getFetchQualityMinChars() {
  if (!Number.isFinite(CHECKER_CONFIG.fetchQualityMinChars)) return 140;
  return Math.max(40, CHECKER_CONFIG.fetchQualityMinChars);
}

function getFetchQualityMinLines() {
  if (!Number.isFinite(CHECKER_CONFIG.fetchQualityMinLines)) return 5;
  return Math.max(2, CHECKER_CONFIG.fetchQualityMinLines);
}

function getFetchQualityMinPolicyHits() {
  if (!Number.isFinite(CHECKER_CONFIG.fetchQualityMinPolicyHits)) return 1;
  return Math.max(1, CHECKER_CONFIG.fetchQualityMinPolicyHits);
}

function getQualityGateRejectFailures() {
  if (!Number.isFinite(CHECKER_CONFIG.qualityGateRejectFailures)) return 3;
  return Math.max(1, Math.floor(CHECKER_CONFIG.qualityGateRejectFailures));
}

function getFetchQualityThresholds(policyType, vendorKey) {
  const baseThresholds = {
    minChars: getFetchQualityMinChars(),
    minLines: getFetchQualityMinLines(),
    minPolicyHits: getFetchQualityMinPolicyHits(),
  };
  const policy = String(policyType || "").trim();
  const vendor = String(vendorKey || "").trim();
  if (!policy || !vendor) return baseThresholds;
  const override = FETCH_QUALITY_OVERRIDES[policy]?.[vendor];
  if (!override || typeof override !== "object") return baseThresholds;
  const minCharsOverride = Number(override.minChars);
  const minLinesOverride = Number(override.minLines);
  const minPolicyHitsOverride = Number(override.minPolicyHits);
  return {
    minChars: Number.isFinite(minCharsOverride) ? Math.max(0, Math.floor(minCharsOverride)) : baseThresholds.minChars,
    minLines: Number.isFinite(minLinesOverride) ? Math.max(0, Math.floor(minLinesOverride)) : baseThresholds.minLines,
    minPolicyHits: Number.isFinite(minPolicyHitsOverride)
      ? Math.max(0, Math.floor(minPolicyHitsOverride))
      : baseThresholds.minPolicyHits,
  };
}

function countPolicyKeywordHits(text, policyType) {
  const normalizedText = String(text || "").toLowerCase();
  if (!normalizedText.trim()) return 0;
  const keywords = getPolicyKeywords(policyType);
  let hits = 0;
  for (const keyword of keywords) {
    if (keyword && normalizedText.includes(keyword)) {
      hits += 1;
    }
  }
  return hits;
}

function assessFetchQuality({ rawText, normalizedText, policyType, vendorKey = "" }) {
  const reasons = [];
  const interstitialReason = detectFetchInterstitial(rawText);
  if (interstitialReason) {
    reasons.push(`interstitial:${interstitialReason}`);
  }

  const normalized = String(normalizedText || "").trim();
  const normalizedLength = normalized.length;
  const lineCount = normalized ? normalized.split("\n").filter(Boolean).length : 0;
  const policyKeywordHits = countPolicyKeywordHits(normalized, policyType);

  const thresholds = getFetchQualityThresholds(policyType, vendorKey);
  const minChars = thresholds.minChars;
  const minLines = thresholds.minLines;
  const minPolicyHits = thresholds.minPolicyHits;

  if (normalizedLength < minChars) {
    reasons.push(`short_text:${normalizedLength}<${minChars}`);
  }
  if (lineCount < minLines) {
    reasons.push(`short_lines:${lineCount}<${minLines}`);
  }
  if (policyKeywordHits < minPolicyHits) {
    reasons.push(`weak_policy_terms:${policyKeywordHits}<${minPolicyHits}`);
  }

  return {
    passed: reasons.length === 0,
    reason: reasons.join("&"),
    normalizedLength,
    lineCount,
    policyKeywordHits,
  };
}

function scoreFetchQuality(quality) {
  const normalizedLength = Number(quality?.normalizedLength || 0);
  const lineCount = Number(quality?.lineCount || 0);
  const policyKeywordHits = Number(quality?.policyKeywordHits || 0);
  const reason = String(quality?.reason || "");
  let score = policyKeywordHits * 100000 + lineCount * 1000 + normalizedLength;
  if (reason.includes("interstitial:")) score -= 10000000;
  if (reason.includes("weak_policy_terms:")) score -= 10000;
  if (reason.includes("short_lines:")) score -= 5000;
  if (reason.includes("short_text:")) score -= 5000;
  return score;
}

function normalizePageMetadata(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  return {
    source_kind: typeof source.source_kind === "string" ? source.source_kind.trim().toLowerCase() : "",
    source_title: typeof source.source_title === "string" ? source.source_title.trim() : "",
    display_last_updated_label:
      typeof source.display_last_updated_label === "string" ? source.display_last_updated_label.trim() : "",
    display_last_updated_date_utc:
      typeof source.display_last_updated_date_utc === "string" ? source.display_last_updated_date_utc.trim() : "",
    display_effective_date_label:
      typeof source.display_effective_date_label === "string" ? source.display_effective_date_label.trim() : "",
    display_effective_date_utc:
      typeof source.display_effective_date_utc === "string" ? source.display_effective_date_utc.trim() : "",
    source_updated_at_utc:
      typeof source.source_updated_at_utc === "string" ? source.source_updated_at_utc.trim() : "",
    source_edited_at_utc:
      typeof source.source_edited_at_utc === "string" ? source.source_edited_at_utc.trim() : "",
  };
}

function toIsoDateOnly(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return "";
  return new Date(parsed).toISOString().slice(0, 10);
}

function buildPageMetadataSignature(input) {
  const metadata = normalizePageMetadata(input);
  const canonical = {
    source_kind: metadata.source_kind,
    source_title: metadata.source_title,
    display_last_updated_label: metadata.display_last_updated_label,
    display_last_updated_date_utc: metadata.display_last_updated_date_utc,
    display_effective_date_label: metadata.display_effective_date_label,
    display_effective_date_utc: metadata.display_effective_date_utc,
    source_updated_at_utc: metadata.source_updated_at_utc,
    source_edited_at_utc: metadata.source_edited_at_utc,
  };
  if (!Object.values(canonical).some((value) => String(value || "").trim().length > 0)) {
    return "";
  }
  return createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex")
    .slice(0, 16);
}

function extractMetadataText(rawText) {
  return decodeHtmlEntities(
    String(rawText || "")
      .replace(/\r/g, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|section|article|h[1-6]|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n");
}

function extractDateLabelFromText(text, labelPattern) {
  const raw = String(text || "");
  if (!raw.trim()) return "";
  const pattern = new RegExp(`${labelPattern}\\s*:?\\s*([a-z]{3,9}\\s+\\d{1,2},\\s+\\d{4})`, "i");
  const match = pattern.exec(raw);
  return match ? String(match[1] || "").trim() : "";
}

function extractTitleFromText(rawText) {
  const raw = String(rawText || "");
  const titleMatch = /<title[^>]*>([^<]{2,220})<\/title>/i.exec(raw);
  if (titleMatch) {
    return decodeHtmlEntities(String(titleMatch[1] || "")).replace(/\s+/g, " ").trim();
  }
  const headingMatch = /<h1[^>]*>([\s\S]{2,220}?)<\/h1>/i.exec(raw);
  if (headingMatch) {
    return decodeHtmlEntities(String(headingMatch[1] || ""))
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return "";
}

function extractPageMetadata({ rawText, sourceMetadata } = {}) {
  const normalizedSourceMetadata = normalizePageMetadata(sourceMetadata);
  const text = extractMetadataText(rawText);
  const lastUpdatedLabel =
    normalizedSourceMetadata.display_last_updated_label || extractDateLabelFromText(text, "last\\s+updated");
  const effectiveDateLabel =
    normalizedSourceMetadata.display_effective_date_label || extractDateLabelFromText(text, "effective\\s+date");

  const metadata = normalizePageMetadata({
    ...normalizedSourceMetadata,
    source_kind: normalizedSourceMetadata.source_kind || "html",
    source_title: normalizedSourceMetadata.source_title || extractTitleFromText(rawText),
    display_last_updated_label: lastUpdatedLabel,
    display_last_updated_date_utc:
      normalizedSourceMetadata.display_last_updated_date_utc || toIsoDateOnly(lastUpdatedLabel),
    display_effective_date_label: effectiveDateLabel,
    display_effective_date_utc:
      normalizedSourceMetadata.display_effective_date_utc || toIsoDateOnly(effectiveDateLabel),
  });
  return {
    ...metadata,
    metadata_signature: buildPageMetadataSignature(metadata),
  };
}

function normalizeSemanticTokens(tokens) {
  if (!Array.isArray(tokens)) return [];
  const normalized = tokens
    .map((token) => String(token || "").trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(normalized)].sort((a, b) => a.localeCompare(b));
}

function semanticTokenSignature(profile) {
  const tokens = normalizeSemanticTokens(profile?.tokens);
  return tokens.join("|");
}

export function semanticSignaturesStable(previousSignature, nextSignature) {
  const previous = typeof previousSignature === "string" ? previousSignature : "";
  const next = typeof nextSignature === "string" ? nextSignature : "";
  if (!previous && !next) return true;
  return Boolean(previous && next && previous === next);
}

export function buildChangeKey(hashValue, semanticSignature) {
  const semantic = typeof semanticSignature === "string" ? semanticSignature.trim() : "";
  if (semantic) return semantic;
  const hashText = typeof hashValue === "string" ? hashValue.trim() : "";
  return hashText;
}

export function summarizeDistinctVendorFailures(failures = []) {
  const vendors = [...new Set(
    failures
      .map((item) => String(item?.vendor || "").trim())
      .filter(Boolean)
  )].sort();
  return {
    count: vendors.length,
    sample: vendors.slice(0, 20).join(","),
  };
}

function getCandidateChangeKey(candidate, fallback = {}) {
  const explicit =
    typeof candidate?.change_key === "string" && candidate.change_key.trim()
      ? candidate.change_key.trim()
      : "";
  if (explicit) return explicit;
  const fallbackHash =
    typeof fallback.hash === "string" && fallback.hash.trim()
      ? fallback.hash.trim()
      : "";
  const fallbackSemanticSignature =
    typeof fallback.semanticSignature === "string" && fallback.semanticSignature.trim()
      ? fallback.semanticSignature.trim()
      : "";
  return buildChangeKey(
    typeof candidate?.hash === "string" ? candidate.hash : fallbackHash,
    typeof candidate?.semantic_signature === "string"
      ? candidate.semantic_signature
      : fallbackSemanticSignature
  );
}

function getCandidateSignalWindowDecision(candidate) {
  if (typeof candidate?.signal_window_change_decision === "string" && candidate.signal_window_change_decision.trim()) {
    return candidate.signal_window_change_decision.trim();
  }
  if (typeof candidate?.signal_window_hash_decision === "string" && candidate.signal_window_hash_decision.trim()) {
    return candidate.signal_window_hash_decision.trim();
  }
  return "";
}

function extractDurationTokens(text, anchors = [], tokenPrefix = "window_days") {
  const output = new Set();
  if (!text) return output;
  const anchorPattern = anchors
    .filter((anchor) => typeof anchor === "string" && anchor.trim())
    .map((anchor) => {
      const normalizedAnchor = anchor.trim();
      const flexibleAnchor = normalizedAnchor
        .split(/\s+/)
        .map((part) => escapeRegexLiteral(part))
        .join("[-\\s]+");
      return normalizedAnchor.includes(" ") ? flexibleAnchor : `${flexibleAnchor}(?:s|ed|ing|able)?`;
    })
    .join("|");
  if (!anchorPattern) return output;

  const normalizedText = String(text).replace(
    /\blast updated\s*:?\s*\d{1,3}\s*(?:days?|weeks?|months?|years?)\s+ago\b/gi,
    ""
  );
  const durationPattern = "(\\d{1,3})\\s*[- ]?\\s*(day|days|week|weeks|month|months|year|years)\\b";
  const patterns = [
    new RegExp(`${durationPattern}[^.!?;\\n]{0,24}\\b(?:${anchorPattern})\\b`, "gi"),
    new RegExp(`\\b(?:${anchorPattern})\\b[^.!?;\\n]{0,40}\\b(?:within|for|lasts?|lasting|period\\s+(?:is|of)|window\\s+(?:is|of))\\s+${durationPattern}`, "gi"),
    new RegExp(`\\b(?:within|for)\\s+${durationPattern}[^.!?;\\n]{0,40}\\b(?:${anchorPattern})\\b`, "gi"),
  ];

  const addDuration = (rawValue, rawUnit) => {
    const value = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(value) || value <= 0) return;
    const unit = String(rawUnit || "").toLowerCase();
    let days = value;
    if (unit.startsWith("week")) days = value * 7;
    if (unit.startsWith("month")) days = value * 30;
    if (unit.startsWith("year")) days = value * 365;
    if (days <= 0 || days > 366) return;
    output.add(`${tokenPrefix}:${days}`);
  };

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(normalizedText)) !== null) {
      const durationOffset = match.length - 2;
      addDuration(match[durationOffset], match[durationOffset + 1]);
    }
  }
  return output;
}

export function extractSemanticTokens(text, policyType = "default") {
  const normalizedText = String(text || "").toLowerCase();
  const tokens = new Set();
  if (!normalizedText.trim()) return [];

  const addIfMatch = (token, regex) => {
    if (regex.test(normalizedText)) tokens.add(token);
  };

  if (policyType === "refund") {
    addIfMatch("restriction:no_refund_or_final_sale", /\b(no refunds?|non[-\s]?refundable|final sale|all sales final)\b/i);
    addIfMatch("risk:chargeback_or_dispute", /\b(chargeback|dispute)\b/i);
    addIfMatch("billing:prorated", /\b(pro[-\s]?rated|prorated|pro rata)\b/i);
    addIfMatch("refund:allowed_language", /\b(refunds?\s+(are|is)\s+(available|eligible)|eligible for refunds?|money[-\s]?back)\b/i);
    addIfMatch("refund:partial_allowed", /\b(partial refunds?|pro[-\s]?rated refunds?)\b/i);
    addIfMatch("refund:store_credit_only", /\b(store credit|account credit|credits? only)\b/i);
    for (const token of extractDurationTokens(
      normalizedText,
      ["refund", "money back"],
      "refund_window_days"
    )) {
      tokens.add(token);
    }
  } else if (policyType === "cancel") {
    addIfMatch("billing:auto_renew", /\b(auto[-\s]?renew|renews?\s+automatically|automatic renewal)\b/i);
    addIfMatch("cancel:anytime", /\b(cancel any ?time|cancel at any time|can cancel anytime)\b/i);
    addIfMatch("cancel:non_cancellable", /\b(cannot cancel|can't cancel|non[-\s]?cancellable|no cancellation)\b/i);
    addIfMatch("cancel:fee_or_penalty", /\b(cancellation fee|cancel(?:lation)? penalty|early termination fee|termination fee|penalty fee)\b/i);
    addIfMatch("cancel:effective_end_of_term", /\b(end of (the )?(current )?(billing|subscription) period)\b/i);
    for (const token of extractDurationTokens(
      normalizedText,
      ["cancel", "cancellation", "terminate", "termination"],
      "cancel_window_days"
    )) {
      tokens.add(token);
    }
  } else if (policyType === "return") {
    addIfMatch("billing:prorated", /\b(pro[-\s]?rated|prorated|pro rata)\b/i);
    addIfMatch("return:restocking_fee", /\b(restocking fee)\b/i);
    addIfMatch("return:shipping_costs", /\b(return shipping|shipping costs?|shipping fee)\b/i);
    addIfMatch("return:condition_unopened_or_unused", /\b(unopened|unused|original packaging|in original condition)\b/i);
    for (const token of extractDurationTokens(
      normalizedText,
      ["return", "returned", "exchange"],
      "return_window_days"
    )) {
      tokens.add(token);
    }
  } else if (policyType === "trial") {
    addIfMatch("trial:auto_converts_to_paid", /\b(trial.*(auto[-\s]?renew|billed|charged)|after (the )?trial.*(billed|charged|renews?))\b/i);
    addIfMatch("trial:payment_method_required", /\b(card required|credit card required|payment method required)\b/i);
    addIfMatch("trial:cancel_before_end", /\b(cancel before .*trial (ends?|end)|before trial ends?\s*,?\s*cancel)\b/i);
    for (const token of extractDurationTokens(
      normalizedText,
      ["trial", "free trial"],
      "trial_window_days"
    )) {
      tokens.add(token);
    }
  }

  return [...tokens].sort((a, b) => a.localeCompare(b));
}

function buildSemanticProfile(text, policyType, metadata = {}) {
  const sourceHash = typeof metadata.hash === "string" ? metadata.hash : "";
  const sourceUrl = typeof metadata.sourceUrl === "string" ? metadata.sourceUrl : "";
  const extractedAtUtc =
    typeof metadata.extractedAtUtc === "string" && metadata.extractedAtUtc
      ? metadata.extractedAtUtc
      : utcIsoTimestamp();
  const pageMetadata = normalizePageMetadata(metadata.pageMetadata || metadata.page_metadata);
  const metadataSignature = buildPageMetadataSignature(pageMetadata);
  return {
    hash: sourceHash,
    source_url: sourceUrl,
    extracted_at_utc: extractedAtUtc,
    tokens: normalizeSemanticTokens(extractSemanticTokens(text, policyType)),
    page_metadata: pageMetadata,
    metadata_signature: metadataSignature,
  };
}

function normalizeSemanticProfile(input, metadata = {}) {
  if (!input || typeof input !== "object") {
    return buildSemanticProfile("", "default", metadata);
  }
  return {
    hash: typeof input.hash === "string" && input.hash ? input.hash : (metadata.hash || ""),
    source_url:
      typeof input.source_url === "string"
        ? input.source_url
        : (typeof metadata.sourceUrl === "string" ? metadata.sourceUrl : ""),
    extracted_at_utc:
      typeof input.extracted_at_utc === "string" && input.extracted_at_utc
        ? input.extracted_at_utc
        : (typeof metadata.extractedAtUtc === "string" ? metadata.extractedAtUtc : utcIsoTimestamp()),
    tokens: normalizeSemanticTokens(input.tokens),
    page_metadata: normalizePageMetadata(input.page_metadata || metadata.pageMetadata || metadata.page_metadata),
    metadata_signature:
      typeof input.metadata_signature === "string" && input.metadata_signature
        ? input.metadata_signature
        : buildPageMetadataSignature(input.page_metadata || metadata.pageMetadata || metadata.page_metadata),
  };
}

function normalizeConfirmedBaselineEntry(input) {
  if (!input || typeof input !== "object") {
    return {
      hash: "",
      semantic_signature: "",
      metadata_signature: "",
      source_url: "",
      last_confirmed_change_utc: "",
    };
  }
  return {
    hash: typeof input.hash === "string" ? input.hash.trim() : "",
    semantic_signature: typeof input.semantic_signature === "string" ? input.semantic_signature.trim() : "",
    metadata_signature: typeof input.metadata_signature === "string" ? input.metadata_signature.trim() : "",
    source_url: typeof input.source_url === "string" ? input.source_url.trim() : "",
    last_confirmed_change_utc:
      typeof input.last_confirmed_change_utc === "string" ? input.last_confirmed_change_utc.trim() : "",
  };
}

function semanticTokensFromSignature(signature) {
  return String(signature || "")
    .split("|")
    .map((token) => token.trim())
    .filter(Boolean);
}

function buildComparisonSemanticProfile({ baselineEntry, fallbackProfile }) {
  const baseline = normalizeConfirmedBaselineEntry(baselineEntry);
  const fallback = normalizeSemanticProfile(fallbackProfile || {}, {
    hash: baseline.hash,
    sourceUrl: baseline.source_url,
    extractedAtUtc: baseline.last_confirmed_change_utc,
  });
  const hasFallback = Boolean(fallbackProfile && typeof fallbackProfile === "object");
  const hasBaselineSignal = Boolean(
    baseline.hash ||
    baseline.semantic_signature ||
    baseline.metadata_signature ||
    baseline.source_url ||
    baseline.last_confirmed_change_utc
  );
  if (!hasFallback && !hasBaselineSignal) return null;
  const nextTokens = baseline.semantic_signature
    ? semanticTokensFromSignature(baseline.semantic_signature)
    : fallback.tokens;
  return normalizeSemanticProfile({
    ...fallback,
    hash: baseline.hash || fallback.hash || "",
    source_url: baseline.source_url || fallback.source_url || "",
    extracted_at_utc: baseline.last_confirmed_change_utc || fallback.extracted_at_utc || utcIsoTimestamp(),
    tokens: nextTokens,
    metadata_signature: baseline.metadata_signature || fallback.metadata_signature || "",
  });
}

function diffSemanticProfiles(previousProfile, nextProfile) {
  const hasPrevious = Boolean(previousProfile && Array.isArray(previousProfile.tokens));
  const previousTokens = hasPrevious ? normalizeSemanticTokens(previousProfile.tokens) : [];
  const nextTokens = normalizeSemanticTokens(nextProfile?.tokens);
  if (!hasPrevious) {
    return {
      material: false,
      baselineMissing: true,
      added: [],
      removed: [],
    };
  }
  const previousSet = new Set(previousTokens);
  const nextSet = new Set(nextTokens);
  const added = nextTokens.filter((token) => !previousSet.has(token));
  const removed = previousTokens.filter((token) => !nextSet.has(token));
  return {
    material: added.length > 0 || removed.length > 0,
    baselineMissing: false,
    added,
    removed,
  };
}

function formatSemanticDiffSummary(semanticDiff) {
  if (!semanticDiff || semanticDiff.baselineMissing) return "semantic-baseline-missing";
  const added = Array.isArray(semanticDiff.added) ? semanticDiff.added : [];
  const removed = Array.isArray(semanticDiff.removed) ? semanticDiff.removed : [];
  const parts = [];
  if (added.length > 0) parts.push(`+${added.join(",+")}`);
  if (removed.length > 0) parts.push(`-${removed.join(",-")}`);
  return parts.length > 0 ? parts.join(" | ") : "no-material-diff";
}

function buildSemanticDiffSignature(semanticDiff) {
  if (!semanticDiff || semanticDiff.baselineMissing || !semanticDiff.material) return "";
  const added = Array.isArray(semanticDiff.added) ? [...semanticDiff.added].sort((a, b) => a.localeCompare(b)) : [];
  const removed = Array.isArray(semanticDiff.removed) ? [...semanticDiff.removed].sort((a, b) => a.localeCompare(b)) : [];
  return `added:${added.join("|")}::removed:${removed.join("|")}`;
}

function getActualConfirmRuns() {
  if (!Number.isFinite(CHECKER_CONFIG.actualConfirmRuns)) return 2;
  return Math.max(2, CHECKER_CONFIG.actualConfirmRuns);
}

function getActualConfirmRunsForVendor(vendorConfig, vendor, sourceVolatilityTier = "normal") {
  let required = getActualConfirmRuns();
  if (vendorConfig && typeof vendorConfig === "object") {
    const configured = Number.parseInt(vendorConfig.confirm_runs, 10);
    if (Number.isFinite(configured)) {
      required = Math.max(required, configured);
    }
  }
  if (typeof vendor === "string" && vendor) {
    const override = Number(ACTUAL_CONFIRM_RUN_OVERRIDES[vendor]);
    if (Number.isFinite(override)) {
      required = Math.max(required, Math.floor(override));
    }
  }
  const volatilityRule = getSourceVolatilityRule(sourceVolatilityTier);
  const delta = Number(volatilityRule?.actualConfirmRunsDelta || 0);
  if (Number.isFinite(delta) && delta > 0) {
    required += Math.floor(delta);
  }
  return Math.max(2, required);
}

function getActualMinGapMs() {
  if (!Number.isFinite(CHECKER_CONFIG.actualMinGapHours)) return 4 * 60 * 60 * 1000;
  const hours = Math.max(0, CHECKER_CONFIG.actualMinGapHours);
  return Math.floor(hours * 60 * 60 * 1000);
}

function getActualMinGapHours() {
  const gapMs = getActualMinGapMs();
  return Math.floor(gapMs / (60 * 60 * 1000));
}

function getCandidateTtlDays() {
  if (!Number.isFinite(CHECKER_CONFIG.candidateTtlDays)) return 7;
  return Math.max(0, CHECKER_CONFIG.candidateTtlDays);
}

function getPendingDetailLimit() {
  if (!Number.isFinite(CHECKER_CONFIG.pendingDetailLimit)) return 20;
  return Math.max(1, CHECKER_CONFIG.pendingDetailLimit);
}

function getSameRunRecheckPasses() {
  if (!Number.isFinite(CHECKER_CONFIG.sameRunRecheckPasses)) return 2;
  return Math.max(0, CHECKER_CONFIG.sameRunRecheckPasses);
}

function getSameRunRecheckDelayMs() {
  if (!Number.isFinite(CHECKER_CONFIG.sameRunRecheckDelayMs)) return 1600;
  return Math.max(0, CHECKER_CONFIG.sameRunRecheckDelayMs);
}

function getSameRunRecheckBatchSize(defaultSize = 3) {
  if (!Number.isFinite(CHECKER_CONFIG.sameRunRecheckBatchSize)) return defaultSize;
  return Math.max(1, CHECKER_CONFIG.sameRunRecheckBatchSize);
}

function getSameRunMajorityMinVotes() {
  if (!Number.isFinite(CHECKER_CONFIG.sameRunMajorityMinVotes)) return 2;
  return Math.max(2, CHECKER_CONFIG.sameRunMajorityMinVotes);
}

function getCrossRunWindowSize() {
  if (!Number.isFinite(CHECKER_CONFIG.crossRunWindowSize)) return 6;
  return Math.max(2, CHECKER_CONFIG.crossRunWindowSize);
}

function getCrossRunWindowRequired() {
  const windowSize = getCrossRunWindowSize();
  if (!Number.isFinite(CHECKER_CONFIG.crossRunWindowRequired)) {
    return Math.min(3, windowSize);
  }
  return Math.max(2, Math.min(windowSize, CHECKER_CONFIG.crossRunWindowRequired));
}

function getAdaptiveWindowEnabled() {
  const raw = String(CHECKER_CONFIG.adaptiveWindowEnabled || "").trim().toLowerCase();
  if (!raw) return true;
  return !["0", "false", "off", "no"].includes(raw);
}

function getHighSignalWindowRequired() {
  const windowSize = getCrossRunWindowSize();
  if (!Number.isFinite(CHECKER_CONFIG.highSignalWindowRequired)) {
    return Math.min(2, windowSize);
  }
  return Math.max(2, Math.min(windowSize, CHECKER_CONFIG.highSignalWindowRequired));
}

function getHighSignalMinPolicyHits() {
  if (!Number.isFinite(CHECKER_CONFIG.highSignalMinPolicyHits)) return 2;
  return Math.max(1, CHECKER_CONFIG.highSignalMinPolicyHits);
}

function getHighSignalMinLines() {
  if (!Number.isFinite(CHECKER_CONFIG.highSignalMinLines)) return 6;
  return Math.max(2, CHECKER_CONFIG.highSignalMinLines);
}

export function isHighSignalWindowCandidate({ semanticSignature, quality }) {
  const hasSemanticSignature =
    typeof semanticSignature === "string" && semanticSignature.trim().length > 0;
  if (!hasSemanticSignature) return false;
  if (!quality || !quality.passed) return false;
  if (Number(quality.policyKeywordHits || 0) < getHighSignalMinPolicyHits()) return false;
  if (Number(quality.lineCount || 0) < getHighSignalMinLines()) return false;
  return true;
}

export function getCrossRunWindowRequiredForCandidate({ semanticSignature, quality }) {
  const defaultRequired = getCrossRunWindowRequired();
  if (!getAdaptiveWindowEnabled()) return defaultRequired;
  if (!isHighSignalWindowCandidate({ semanticSignature, quality })) return defaultRequired;
  return Math.min(defaultRequired, getHighSignalWindowRequired());
}

function getCrossRunWindowRequirementLabel() {
  const defaultRequired = getCrossRunWindowRequired();
  if (!getAdaptiveWindowEnabled()) return `${defaultRequired}`;
  const highSignalRequired = Math.min(defaultRequired, getHighSignalWindowRequired());
  if (highSignalRequired >= defaultRequired) return `${defaultRequired}`;
  return `${highSignalRequired} (high-signal) / ${defaultRequired} (default)`;
}

function getStalePendingDays() {
  if (!Number.isFinite(CHECKER_CONFIG.stalePendingDays)) return 3;
  return Math.max(1, CHECKER_CONFIG.stalePendingDays);
}

function getVolatileFlipThreshold() {
  if (!Number.isFinite(CHECKER_CONFIG.volatileFlipThreshold)) return 2;
  return Math.max(1, CHECKER_CONFIG.volatileFlipThreshold);
}

function getVolatileRequireRecentFlip() {
  const raw = String(CHECKER_CONFIG.volatileRequireRecentFlip || "").trim().toLowerCase();
  if (!raw) return true;
  return !["0", "false", "off", "no"].includes(raw);
}

function getEscalationPendingDays() {
  if (!Number.isFinite(CHECKER_CONFIG.escalationPendingDays)) return 5;
  return Math.max(1, CHECKER_CONFIG.escalationPendingDays);
}

function getEscalationFlipThreshold() {
  if (!Number.isFinite(CHECKER_CONFIG.escalationFlipThreshold)) return 4;
  return Math.max(1, CHECKER_CONFIG.escalationFlipThreshold);
}

function getEscalationRequireRecentFlip() {
  const raw = String(CHECKER_CONFIG.escalationRequireRecentFlip || "").trim().toLowerCase();
  if (!raw) return true;
  return !["0", "false", "off", "no"].includes(raw);
}

function getFetchFailureQuarantineStreak() {
  if (!Number.isFinite(CHECKER_CONFIG.fetchFailureQuarantineStreak)) return 2;
  return Math.max(1, CHECKER_CONFIG.fetchFailureQuarantineStreak);
}

function getFallbackSignalConsecutiveRuns() {
  if (!Number.isFinite(CHECKER_CONFIG.fallbackSignalConsecutiveRuns)) return 2;
  return Math.max(2, CHECKER_CONFIG.fallbackSignalConsecutiveRuns);
}

function getEscalationFlipThresholdForVendor(policyName, vendor, sourceVolatilityTier = "normal") {
  const defaultThreshold = getEscalationFlipThreshold();
  const volatilityRule = getSourceVolatilityRule(sourceVolatilityTier);
  const delta = Number(volatilityRule?.escalationFlipThresholdDelta || 0);
  const adjustedDefault = Math.max(1, Math.floor(defaultThreshold + (Number.isFinite(delta) ? delta : 0)));
  if (typeof policyName !== "string" || typeof vendor !== "string") {
    return { threshold: adjustedDefault, overridden: false };
  }
  const policyOverrides = ESCALATION_FLIP_THRESHOLD_OVERRIDES[policyName];
  if (!policyOverrides || typeof policyOverrides !== "object") {
    return { threshold: adjustedDefault, overridden: false };
  }
  const overrideValue = Number(policyOverrides[vendor]);
  if (!Number.isFinite(overrideValue)) {
    return { threshold: adjustedDefault, overridden: false };
  }
  const adjustedThreshold = Math.max(1, Math.floor(overrideValue + (Number.isFinite(delta) ? delta : 0)));
  return {
    threshold: adjustedThreshold,
    overridden: true,
  };
}

export function getVolatileFlipThresholdForVendor(policyName, vendor, sourceVolatilityTier = "normal") {
  const defaultThreshold = getVolatileFlipThreshold();
  const volatilityRule = getSourceVolatilityRule(sourceVolatilityTier);
  const delta = Number(volatilityRule?.volatileFlipThresholdDelta || 0);
  const adjustedDefault = Math.max(1, Math.floor(defaultThreshold + (Number.isFinite(delta) ? delta : 0)));
  if (typeof policyName !== "string" || typeof vendor !== "string") {
    return { threshold: adjustedDefault, overridden: false };
  }
  const policyOverrides = VOLATILE_FLIP_THRESHOLD_OVERRIDES[policyName];
  if (!policyOverrides || typeof policyOverrides !== "object") {
    return { threshold: adjustedDefault, overridden: false };
  }
  const overrideValue = Number(policyOverrides[vendor]);
  if (!Number.isFinite(overrideValue)) {
    return { threshold: adjustedDefault, overridden: false };
  }
  const adjustedThreshold = Math.max(1, Math.floor(overrideValue + (Number.isFinite(delta) ? delta : 0)));
  return {
    threshold: adjustedThreshold,
    overridden: true,
  };
}

function getNoConfirmEscalationDays() {
  if (!Number.isFinite(CHECKER_CONFIG.noConfirmEscalationDays)) return 7;
  return Math.max(1, CHECKER_CONFIG.noConfirmEscalationDays);
}

function getMaterialCooldownDays() {
  if (!Number.isFinite(CHECKER_CONFIG.materialCooldownDays)) return 14;
  return Math.max(0, CHECKER_CONFIG.materialCooldownDays);
}

function getMaterialOscillationWindowDays() {
  if (!Number.isFinite(CHECKER_CONFIG.materialOscillationWindowDays)) return 21;
  return Math.max(0, CHECKER_CONFIG.materialOscillationWindowDays);
}

function getCandidatePendingSinceUtc(candidate) {
  if (!candidate || typeof candidate !== "object") return "";
  if (typeof candidate.pending_since_utc === "string" && candidate.pending_since_utc) {
    return candidate.pending_since_utc;
  }
  if (typeof candidate.first_seen_utc === "string" && candidate.first_seen_utc) {
    return candidate.first_seen_utc;
  }
  return "";
}

function getCandidateAgeDays(candidate, nowMs = Date.now()) {
  const pendingSinceUtc = getCandidatePendingSinceUtc(candidate);
  if (!pendingSinceUtc) return 0;
  const pendingSinceMs = Date.parse(pendingSinceUtc);
  if (!Number.isFinite(pendingSinceMs)) return 0;
  return Math.max(0, Math.floor((nowMs - pendingSinceMs) / (24 * 60 * 60 * 1000)));
}

function toMsOrNaN(isoValue) {
  if (typeof isoValue !== "string" || !isoValue) return Number.NaN;
  return Date.parse(isoValue);
}

function appendSignalWindow(coverageEntry, signal) {
  const existing = Array.isArray(coverageEntry?.signal_window)
    ? coverageEntry.signal_window.filter((value) => typeof value === "string" && value)
    : [];
  const next = [...existing, signal];
  const windowSize = getCrossRunWindowSize();
  const trimmed = next.slice(Math.max(0, next.length - windowSize));
  if (coverageEntry && typeof coverageEntry === "object") {
    coverageEntry.signal_window = trimmed;
  }
  return trimmed;
}

export function countSignalWindowChangeFlips(signalWindow) {
  const list = Array.isArray(signalWindow) ? signalWindow : [];
  const changesOnly = list.filter((signal) => signal && signal !== BASELINE_SIGNAL);
  let previous = "";
  let flips = 0;
  for (const signal of changesOnly) {
    const normalized = String(signal || "").trim();
    if (!normalized) continue;
    if (previous && previous !== normalized) {
      flips += 1;
    }
    previous = normalized;
  }
  return flips;
}

export function evaluateSignalWindow(signalWindow, requiredVotes = getCrossRunWindowRequired()) {
  const list = Array.isArray(signalWindow) ? signalWindow : [];
  const windowSize = getCrossRunWindowSize();
  const parsedRequiredVotes = Number.parseInt(requiredVotes, 10);
  const required = Number.isFinite(parsedRequiredVotes)
    ? Math.max(2, Math.min(windowSize, parsedRequiredVotes))
    : getCrossRunWindowRequired();
  let baselineVotes = 0;
  const hashVotes = {};
  for (const signal of list) {
    if (signal === BASELINE_SIGNAL) {
      baselineVotes += 1;
      continue;
    }
    hashVotes[signal] = Number(hashVotes[signal] || 0) + 1;
  }

  const sortedHashes = Object.entries(hashVotes).sort((a, b) => b[1] - a[1]);
  const [topHash, topVotesRaw] = sortedHashes[0] || ["", 0];
  const topVotes = Number(topVotesRaw || 0);
  const secondVotes = Number(sortedHashes[1]?.[1] || 0);
  const hashDecision = topHash && topVotes >= required && topVotes > secondVotes
    ? topHash
    : "";
  const baselineDecision = baselineVotes >= required && baselineVotes > topVotes;

  return {
    required,
    baselineVotes,
    hashDecision,
    topVotes,
  };
}

function getRunMajorityDecision(observations) {
  if (!observations || typeof observations !== "object") return null;
  const baselineVotes = Number(observations.baselineVotes || 0);
  const hashVotes = observations.hashVotes || {};
  const nonBaselineEntries = Object.entries(hashVotes);
  const nonBaselineVotes = nonBaselineEntries.reduce((sum, [, count]) => sum + Number(count || 0), 0);
  const totalVotes = baselineVotes + nonBaselineVotes;
  if (totalVotes < 2) return null;

  let winnerHash = "";
  let winnerVotes = 0;
  let runnerUpVotes = 0;
  for (const [hashValue, countRaw] of nonBaselineEntries) {
    const count = Number(countRaw || 0);
    if (count > winnerVotes) {
      runnerUpVotes = winnerVotes;
      winnerVotes = count;
      winnerHash = hashValue;
    } else if (count > runnerUpVotes) {
      runnerUpVotes = count;
    }
  }

  const majorityThreshold = Math.floor(totalVotes / 2) + 1;
  const requiredVotes = Math.max(getSameRunMajorityMinVotes(), majorityThreshold);

  if (baselineVotes >= requiredVotes && baselineVotes > winnerVotes) {
    return { type: "baseline", requiredVotes, baselineVotes, totalVotes };
  }

  if (winnerHash && winnerVotes >= requiredVotes && winnerVotes > Math.max(baselineVotes, runnerUpVotes)) {
    return { type: "hash", hash: winnerHash, requiredVotes, winnerVotes, baselineVotes, totalVotes };
  }

  return null;
}

function sortedLimitedVendors(vendors, limit = getPendingDetailLimit()) {
  const sorted = [...vendors].sort((a, b) => a.localeCompare(b));
  return sorted.slice(0, Math.max(1, limit));
}

function isStaleCandidate(candidate, nowMs = Date.now()) {
  const ttlDays = getCandidateTtlDays();
  if (ttlDays <= 0) return false;

  const lastSeen = candidate?.last_seen_utc || candidate?.first_seen_utc;
  if (!lastSeen) return false;

  const seenMs = Date.parse(lastSeen);
  if (!Number.isFinite(seenMs)) return false;

  return nowMs - seenMs > ttlDays * 24 * 60 * 60 * 1000;
}

export async function fetchText(url, attempts = 3) {
  let lastErrorMessage = "unknown";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CHECKER_CONFIG.timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENTS[(attempt - 1) % USER_AGENTS.length],
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });
      if (!res.ok) {
        lastErrorMessage = `HTTP ${res.status}`;
        throw new Error(lastErrorMessage);
      }
      const text = await res.text();
      if (!text || !text.trim()) {
        lastErrorMessage = "empty body";
        throw new Error(lastErrorMessage);
      }
      return text;
    } catch (error) {
      const message = error?.name === "AbortError" ? "timeout" : error?.message || "request failed";
      lastErrorMessage = message;
      if (attempt < attempts) {
        await sleep(450 * attempt + jitter(250));
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  return { text: null, error: lastErrorMessage };
}

function normalizeFallbackProbeHeaderValue(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getFallbackProbeHeader(headers, key) {
  if (!headers || typeof headers.get !== "function") return "";
  return normalizeFallbackProbeHeaderValue(headers.get(key));
}

function buildFallbackProbeEntrySignatures(entry) {
  const common = {
    source_url: String(entry?.source_url || "").trim(),
    final_url: String(entry?.final_url || "").trim(),
    status: Number.isFinite(Number(entry?.status)) ? Number(entry.status) : 0,
  };
  const strong = {
    etag: String(entry?.etag || "").trim(),
    last_modified: String(entry?.last_modified || "").trim(),
    version_id: String(entry?.version_id || "").trim(),
  };
  const weak = {
    content_length: String(entry?.content_length || "").trim(),
    content_type: String(entry?.content_type || "").trim(),
    cache_control: String(entry?.cache_control || "").trim(),
  };
  const hasStrongSignal = Boolean(strong.etag || strong.last_modified || strong.version_id);
  const hasWeakSignal = Boolean(weak.content_length || weak.content_type || weak.cache_control);
  const strongSignature = hasStrongSignal
    ? createHash("sha256").update(JSON.stringify({ ...common, ...strong })).digest("hex").slice(0, 16)
    : "";
  const weakSignature = hasWeakSignal
    ? createHash("sha256").update(JSON.stringify({ ...common, ...weak })).digest("hex").slice(0, 16)
    : "";
  return {
    strongSignature,
    weakSignature,
    combinedSignature: strongSignature || weakSignature,
  };
}

export function evaluateFallbackSignalTransition({
  previousStrongSignature,
  nextStrongSignature,
  previousConsecutiveRuns = 0,
  thresholdRuns = getFallbackSignalConsecutiveRuns(),
} = {}) {
  const previous = String(previousStrongSignature || "").trim();
  const next = String(nextStrongSignature || "").trim();
  const consecutiveBase = Number.isFinite(Number(previousConsecutiveRuns))
    ? Math.max(0, Math.floor(Number(previousConsecutiveRuns)))
    : 0;
  const threshold = Number.isFinite(Number(thresholdRuns))
    ? Math.max(2, Math.floor(Number(thresholdRuns)))
    : 2;

  if (!next) {
    return {
      changed: false,
      consecutiveRuns: 0,
      actionable: false,
      reason: "no_strong_signal",
    };
  }
  if (!previous) {
    return {
      changed: false,
      consecutiveRuns: 0,
      actionable: false,
      reason: "first_strong_signal",
    };
  }
  if (previous === next) {
    return {
      changed: false,
      consecutiveRuns: 0,
      actionable: false,
      reason: "stable_strong_signal",
    };
  }

  const consecutiveRuns = consecutiveBase + 1;
  return {
    changed: true,
    consecutiveRuns,
    actionable: consecutiveRuns >= threshold,
    reason: "strong_signal_changed",
  };
}

async function probeHeadMetadata(url, attempts = 2) {
  let lastErrorMessage = "unknown";
  const target = String(url || "").trim();
  if (!target) {
    return { ok: false, error: "missing source URL" };
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CHECKER_CONFIG.timeoutMs);
    try {
      const response = await fetch(target, {
        method: "HEAD",
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENTS[(attempt - 1) % USER_AGENTS.length],
          Accept: "*/*",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });
      if (!response.ok) {
        lastErrorMessage = `HTTP ${response.status}`;
        throw new Error(lastErrorMessage);
      }

      const metadataEntry = {
        source_url: target,
        final_url: String(response.url || target).trim(),
        status: Number(response.status || 0),
        etag: getFallbackProbeHeader(response.headers, "etag"),
        last_modified: getFallbackProbeHeader(response.headers, "last-modified"),
        content_length: getFallbackProbeHeader(response.headers, "content-length"),
        content_type: getFallbackProbeHeader(response.headers, "content-type"),
        cache_control: getFallbackProbeHeader(response.headers, "cache-control"),
        version_id: getFallbackProbeHeader(response.headers, "x-amz-version-id"),
      };
      const signatures = buildFallbackProbeEntrySignatures(metadataEntry);
      if (!signatures.combinedSignature) {
        lastErrorMessage = "missing_probe_headers";
        throw new Error(lastErrorMessage);
      }
      return {
        ok: true,
        signature: signatures.combinedSignature,
        strong_signature: signatures.strongSignature,
        weak_signature: signatures.weakSignature,
        entry: metadataEntry,
      };
    } catch (error) {
      const message = error?.name === "AbortError" ? "timeout" : error?.message || "request failed";
      lastErrorMessage = message;
      if (attempt < attempts) {
        await sleep(450 * attempt + jitter(250));
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  return { ok: false, error: lastErrorMessage };
}

async function probeFallbackMetadata(vendorConfig) {
  const candidates = buildCandidateUrls(vendorConfig);
  if (candidates.length === 0) {
    return { available: false, error: "missing source URL", entries: [] };
  }

  const entries = [];
  const failures = [];
  for (const candidateUrl of candidates) {
    const result = await probeHeadMetadata(candidateUrl, CHECKER_CONFIG.fallbackAttempts);
    if (!result.ok || !result.entry || !result.signature) {
      failures.push(`${candidateUrl} (${result.error || "probe failed"})`);
      continue;
    }
    entries.push({
      ...result.entry,
      signature: result.signature,
      strong_signature: String(result.strong_signature || "").trim(),
      weak_signature: String(result.weak_signature || "").trim(),
    });
  }

  if (entries.length === 0) {
    return {
      available: false,
      error: failures.length > 0 ? failures.join("; ") : "no probe metadata available",
      entries: [],
    };
  }

  const sortedEntries = [...entries].sort((a, b) => {
    const left = String(a.source_url || "");
    const right = String(b.source_url || "");
    return left.localeCompare(right);
  });
  const aggregateInput = sortedEntries
    .map((entry) => `${entry.source_url}|${entry.final_url}|${entry.status}|${entry.signature}`)
    .join("||");
  const aggregateSignature = createHash("sha256").update(aggregateInput).digest("hex").slice(0, 16);
  const strongEntries = sortedEntries.filter((entry) => String(entry.strong_signature || "").trim());
  const strongAggregateInput = strongEntries
    .map(
      (entry) =>
        `${entry.source_url}|${entry.final_url}|${entry.status}|${String(entry.strong_signature || "").trim()}`
    )
    .join("||");
  const strongAggregateSignature = strongAggregateInput
    ? createHash("sha256").update(strongAggregateInput).digest("hex").slice(0, 16)
    : "";
  const sample = sortedEntries
    .slice(0, 3)
    .map((entry) => {
      const parts = [
        `etag=${String(entry.etag || "-")}`,
        `last-modified=${String(entry.last_modified || "-")}`,
        `content-length=${String(entry.content_length || "-")}`,
        `content-type=${String(entry.content_type || "-")}`,
        `cache-control=${String(entry.cache_control || "-")}`,
        `x-amz-version-id=${String(entry.version_id || "-")}`,
      ];
      return `${entry.source_url} [${entry.status}] ${parts.join(",")}`;
    })
    .join(" | ");

  return {
    available: true,
    signature: aggregateSignature,
    strongSignature: strongAggregateSignature,
    sample,
    entries: sortedEntries,
  };
}

function sanitizeBrowserHookDiagnostic(value, fallback) {
  const sanitized = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_.:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96);
  return sanitized || fallback;
}

export function summarizeBrowserHookFailure(statusCode, payload) {
  const status = Number.parseInt(statusCode, 10) || 0;
  const attempts = Array.isArray(payload?.attempts) ? payload.attempts : [];
  const details = attempts.slice(0, 5).map((attempt) => {
    const provider = sanitizeBrowserHookDiagnostic(attempt?.provider, "provider");
    const error = sanitizeBrowserHookDiagnostic(attempt?.error, "fetch_failed");
    return `${provider}=${error}`;
  });
  if (details.length > 0) {
    return `HTTP ${status} [${details.join(",")}]`;
  }
  const error = sanitizeBrowserHookDiagnostic(payload?.error, "");
  return error ? `HTTP ${status} [${error}]` : `HTTP ${status}`;
}

async function fetchBrowserHookText({ url, vendor, policyType }, attempts = 1) {
  if (!CHECKER_CONFIG.browserHookUrl) {
    return { text: null, error: "browser_hook_disabled", skipped: true };
  }
  const target = String(url || "").trim();
  if (!target) {
    return { text: null, error: "missing source URL" };
  }

  let lastErrorMessage = "unknown";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const headers = {
        "Content-Type": "application/json",
        Accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
        "User-Agent": USER_AGENTS[(attempt - 1) % USER_AGENTS.length],
      };
      if (CHECKER_CONFIG.browserHookToken) {
        headers.Authorization = `Bearer ${CHECKER_CONFIG.browserHookToken}`;
        headers["x-hook-token"] = CHECKER_CONFIG.browserHookToken;
      }

      const response = await scheduleBrowserHookRequest(async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CHECKER_CONFIG.timeoutMs);
        try {
          return await fetch(CHECKER_CONFIG.browserHookUrl, {
            method: "POST",
            signal: controller.signal,
            headers,
            body: JSON.stringify({
              url: target,
              vendor: String(vendor || "").trim(),
              policy_type: String(policyType || "").trim(),
              timeout_ms: CHECKER_CONFIG.timeoutMs,
            }),
          });
        } finally {
          clearTimeout(timeout);
        }
      });
      if (!response.ok) {
        const contentType = String(response.headers.get("content-type") || "").toLowerCase();
        const rawBody = await response.text().catch(() => "");
        const payload = contentType.includes("application/json")
          ? (() => {
              try {
                return JSON.parse(rawBody);
              } catch {
                return null;
              }
            })()
          : null;
        lastErrorMessage = summarizeBrowserHookFailure(response.status, payload);
        throw new Error(lastErrorMessage);
      }

      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      if (contentType.includes("application/json")) {
        const payload = await response.json().catch(() => null);
        const textCandidate = typeof payload?.text === "string" ? payload.text : "";
        if (!textCandidate.trim()) {
          lastErrorMessage = "missing text in browser hook response";
          throw new Error(lastErrorMessage);
        }
        return {
          text: textCandidate,
          sourceUrl: String(payload?.source_url || payload?.final_url || target).trim() || target,
          sourceMetadata: {
            source_kind: "browser_hook",
            source_provider: String(payload?.provider || "browser_hook").trim(),
            source_status: String(payload?.status || "").trim(),
          },
        };
      }

      const text = await response.text();
      if (!text || !text.trim()) {
        lastErrorMessage = "empty body";
        throw new Error(lastErrorMessage);
      }
      return {
        text,
        sourceUrl: target,
        sourceMetadata: { source_kind: "browser_hook" },
      };
    } catch (error) {
      const message = error?.name === "AbortError" ? "timeout" : error?.message || "request failed";
      lastErrorMessage = message;
      if (attempt < attempts) {
        await sleep(450 * attempt + jitter(250));
      }
    }
  }

  return { text: null, error: lastErrorMessage };
}

function toJinaMirrorUrl(url) {
  try {
    const parsed = new URL(url);
    return `https://r.jina.ai/${parsed.protocol}//${parsed.host}${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

export function toZendeskHelpCenterApiTarget(url) {
  try {
    const parsed = new URL(url);
    const articleMatch = /^\/hc\/([^/]+)\/articles\/(\d+)(?:-[^/?#]+)?\/?$/i.exec(parsed.pathname);
    if (articleMatch) {
      const locale = String(articleMatch[1] || "").trim().toLowerCase();
      const articleId = String(articleMatch[2] || "").trim();
      if (!locale || !articleId) return null;
      return {
        kind: "article",
        apiUrl: `${parsed.origin}/api/v2/help_center/${locale}/articles/${articleId}.json`,
      };
    }

    const sectionMatch = /^\/hc\/([^/]+)\/sections\/(\d+)(?:-[^/?#]+)?\/?$/i.exec(parsed.pathname);
    if (sectionMatch) {
      const locale = String(sectionMatch[1] || "").trim().toLowerCase();
      const sectionId = String(sectionMatch[2] || "").trim();
      if (!locale || !sectionId) return null;
      return {
        kind: "section",
        apiUrl: `${parsed.origin}/api/v2/help_center/${locale}/sections/${sectionId}/articles.json?per_page=100`,
      };
    }

    return null;
  } catch {
    return null;
  }
}

async function fetchZendeskHelpCenterJson(apiTarget, attempts = 2) {
  if (!apiTarget?.apiUrl || !apiTarget?.kind) {
    return { text: null, error: "invalid zendesk target" };
  }

  let lastErrorMessage = "unknown";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CHECKER_CONFIG.timeoutMs);
    try {
      const response = await fetch(apiTarget.apiUrl, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENTS[(attempt - 1) % USER_AGENTS.length],
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });
      if (!response.ok) {
        lastErrorMessage = `HTTP ${response.status}`;
        throw new Error(lastErrorMessage);
      }
      const payload = await response.json().catch(() => null);
      if (apiTarget.kind === "article") {
        const article = payload && typeof payload === "object" ? payload.article : null;
        const body = typeof article?.body === "string" ? article.body : "";
        if (!body.trim()) {
          lastErrorMessage = "missing article body";
          throw new Error(lastErrorMessage);
        }
        const title = typeof article?.title === "string" ? article.title.trim() : "";
        const htmlUrl =
          typeof article?.html_url === "string" && article.html_url.trim()
            ? article.html_url.trim()
            : "";
        const composedText = title ? `<h1>${title}</h1>\n${body}` : body;
        return {
          text: composedText,
          sourceUrl: htmlUrl,
          sourceMetadata: {
            source_kind: "zendesk_article_json",
            source_title: title,
            source_updated_at_utc: typeof article?.updated_at === "string" ? article.updated_at.trim() : "",
            source_edited_at_utc: typeof article?.edited_at === "string" ? article.edited_at.trim() : "",
          },
        };
      }

      if (apiTarget.kind === "section") {
        const section = payload && typeof payload === "object" ? payload.section : null;
        const articles = Array.isArray(payload?.articles) ? payload.articles : [];
        const articleSegments = [];
        for (const article of articles) {
          const body = typeof article?.body === "string" ? article.body.trim() : "";
          if (!body) continue;
          const title = typeof article?.title === "string" ? article.title.trim() : "";
          articleSegments.push(title ? `<h2>${title}</h2>\n${body}` : body);
        }
        if (articleSegments.length === 0) {
          lastErrorMessage = "missing section article bodies";
          throw new Error(lastErrorMessage);
        }

        const sectionName = typeof section?.name === "string" ? section.name.trim() : "";
        const sectionHeader = sectionName ? `<h1>${sectionName}</h1>\n\n` : "";
        const sectionUrl =
          typeof section?.html_url === "string" && section.html_url.trim() ? section.html_url.trim() : "";
        return {
          text: `${sectionHeader}${articleSegments.join("\n\n")}`,
          sourceUrl: sectionUrl,
          sourceMetadata: {
            source_kind: "zendesk_section_json",
            source_title: sectionName,
            source_article_count: String(articles.length),
            source_article_with_body_count: String(articleSegments.length),
            source_updated_at_utc: typeof section?.updated_at === "string" ? section.updated_at.trim() : "",
          },
        };
      }

      lastErrorMessage = "unsupported zendesk target";
      throw new Error(lastErrorMessage);
    } catch (error) {
      const message = error?.name === "AbortError" ? "timeout" : error?.message || "request failed";
      lastErrorMessage = message;
      if (attempt < attempts) {
        await sleep(450 * attempt + jitter(250));
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  return { text: null, error: lastErrorMessage };
}

function buildCandidateUrls(vendorConfig) {
  const candidateSet = new Set();
  const config = typeof vendorConfig === "string" ? { url: vendorConfig } : vendorConfig || {};

  if (typeof config.url === "string" && config.url.trim()) {
    candidateSet.add(config.url.trim());
  }

  const backupUrls = Array.isArray(config.backup_urls) ? config.backup_urls : [];
  for (const backupUrl of backupUrls) {
    if (typeof backupUrl === "string" && backupUrl.trim()) {
      candidateSet.add(backupUrl.trim());
    }
  }

  return [...candidateSet];
}

async function performFetchLane({ lane, candidateUrl, context }) {
  if (lane === "direct") {
    const directResult = await fetchText(candidateUrl, CHECKER_CONFIG.directAttempts);
    if (typeof directResult === "string") {
      const interstitialReason = detectFetchInterstitial(directResult);
      if (!interstitialReason) {
        return { ok: true, text: directResult, sourceUrl: candidateUrl };
      }
      return { ok: false, error: `interstitial:${interstitialReason}` };
    }
    return { ok: false, error: directResult.error || "request failed" };
  }

  if (lane === "zendesk_api") {
    const zendeskApiTarget = toZendeskHelpCenterApiTarget(candidateUrl);
    if (!zendeskApiTarget) {
      return { ok: false, skip: true };
    }
    const zendeskResult = await fetchZendeskHelpCenterJson(zendeskApiTarget, CHECKER_CONFIG.fallbackAttempts);
    if (zendeskResult?.text) {
      return {
        ok: true,
        text: zendeskResult.text,
        sourceUrl: zendeskResult.sourceUrl || candidateUrl,
        sourceMetadata: zendeskResult.sourceMetadata || {},
      };
    }
    return { ok: false, error: zendeskResult.error || "request failed" };
  }

  if (lane === "mirror") {
    const mirrorUrl = toJinaMirrorUrl(candidateUrl);
    if (!mirrorUrl) {
      return { ok: false, skip: true };
    }
    const mirrorResult = await fetchText(mirrorUrl, CHECKER_CONFIG.fallbackAttempts);
    if (typeof mirrorResult === "string") {
      const interstitialReason = detectFetchInterstitial(mirrorResult);
      if (!interstitialReason) {
        return { ok: true, text: mirrorResult, sourceUrl: candidateUrl };
      }
      return { ok: false, error: `interstitial:${interstitialReason}` };
    }
    return { ok: false, error: mirrorResult.error || "request failed" };
  }

  if (lane === "browser_hook") {
    const browserResult = await fetchBrowserHookText(
      {
        url: candidateUrl,
        vendor: context?.vendor || "",
        policyType: context?.policyType || "",
      },
      CHECKER_CONFIG.browserHookAttempts
    );
    if (browserResult?.skipped) {
      return { ok: false, skip: true };
    }
    if (browserResult?.text) {
      const interstitialReason = detectFetchInterstitial(browserResult.text);
      if (!interstitialReason) {
        return {
          ok: true,
          text: browserResult.text,
          sourceUrl: browserResult.sourceUrl || candidateUrl,
          sourceMetadata: browserResult.sourceMetadata || {},
        };
      }
      return { ok: false, error: `interstitial:${interstitialReason}` };
    }
    return { ok: false, error: browserResult?.error || "request failed" };
  }

  return { ok: false, skip: true };
}

function normalizeFetchCacheUrl(candidateUrl) {
  let sourceUrl = String(candidateUrl || "").trim();
  try {
    const parsed = new URL(sourceUrl);
    parsed.hash = "";
    sourceUrl = parsed.toString();
  } catch {
    // Keep the exact configured value when a source is not a standard URL.
  }
  return sourceUrl;
}

function buildRawFetchCacheKey(lane, candidateUrl) {
  return `${lane}:${normalizeFetchCacheUrl(candidateUrl)}`;
}

export function buildBlockedFetchPlanKey(vendor, vendorConfig) {
  const candidates = buildCandidateUrls(vendorConfig).map(normalizeFetchCacheUrl);
  const lanes = getVendorFetchLanes(vendorConfig);
  if (candidates.length === 0 || lanes.length === 0) return "";
  return JSON.stringify({
    vendor: String(vendor || "").trim(),
    candidates,
    lanes,
  });
}

export function buildPolicyFetchSchedule(
  vendors,
  {
    blockedRetryVendors = {},
    coverageVendors = {},
    blockedFetchCache = null,
    quarantineStreak = getFetchFailureQuarantineStreak(),
  } = {}
) {
  const primaryVendors = [];
  const blockedVendors = [];
  const normalizedThreshold = Number.isFinite(quarantineStreak)
    ? Math.max(1, quarantineStreak)
    : 2;

  for (const vendorEntry of vendors || []) {
    const [vendor, vendorConfig] = vendorEntry;
    const coverage = coverageVendors?.[vendor] || {};
    const fetchPlanKey = buildBlockedFetchPlanKey(vendor, vendorConfig);
    const blockedInRun = Boolean(
      fetchPlanKey &&
      blockedFetchCache &&
      typeof blockedFetchCache.has === "function" &&
      blockedFetchCache.has(fetchPlanKey)
    );
    const isBlocked = Boolean(
      blockedRetryVendors?.[vendor] ||
      coverage.pending_fetch_blocked ||
      Number(coverage.consecutive_fetch_failures || 0) >= normalizedThreshold ||
      blockedInRun
    );
    (isBlocked ? blockedVendors : primaryVendors).push(vendorEntry);
  }

  return {
    primaryVendors,
    blockedVendors,
    scheduledVendors: [...primaryVendors, ...blockedVendors],
  };
}

async function attemptFetchLane({
  lane,
  candidateUrl,
  context,
  rawFetchCache = null,
  bypassRawFetchCache = false,
}) {
  const loader = () => performFetchLane({ lane, candidateUrl, context });
  if (!rawFetchCache || typeof rawFetchCache.load !== "function") {
    return loader();
  }
  return rawFetchCache.load(buildRawFetchCacheKey(lane, candidateUrl), loader, {
    bypass: bypassRawFetchCache,
    retainSuccess: false,
  });
}

async function fetchWithFallback(
  vendorConfig,
  context = {},
  { rawFetchCache = null, bypassRawFetchCache = false } = {}
) {
  const candidates = buildCandidateUrls(vendorConfig);
  if (candidates.length === 0) {
    return { text: null, error: "missing source URL" };
  }
  const lanes = getVendorFetchLanes(vendorConfig);
  if (lanes.length === 0) {
    return { text: null, error: "no fetch lanes configured", attemptedLanes: [] };
  }

  const failures = [];
  const attemptedLanes = [];
  const attemptedLaneSet = new Set();
  let bestLowQualityResult = null;
  for (const candidateUrl of candidates) {
    for (const lane of lanes) {
      if (!attemptedLaneSet.has(lane)) {
        attemptedLaneSet.add(lane);
        attemptedLanes.push(lane);
      }
      const laneResult = await attemptFetchLane({
        lane,
        candidateUrl,
        context,
        rawFetchCache,
        bypassRawFetchCache,
      });
      if (laneResult?.skip) {
        continue;
      }
      if (laneResult?.ok && typeof laneResult.text === "string" && laneResult.text.trim()) {
        const normalized = normalizeFetchedText(
          laneResult.text,
          context?.policyType || "default",
          context?.vendor || ""
        );
        const quality = assessFetchQuality({
          rawText: laneResult.text,
          normalizedText: normalized,
          policyType: context?.policyType || "default",
          vendorKey: context?.vendor || "",
        });
        if (quality.passed) {
          if (
            !bypassRawFetchCache &&
            rawFetchCache &&
            typeof rawFetchCache.retain === "function"
          ) {
            rawFetchCache.retain(buildRawFetchCacheKey(lane, candidateUrl), laneResult);
          }
          return {
            text: laneResult.text,
            sourceUrl: laneResult.sourceUrl || candidateUrl,
            sourceMetadata: laneResult.sourceMetadata || {},
            fetchLane: lane,
            attemptedLanes,
          };
        }

        const candidateLowQuality = {
          text: laneResult.text,
          sourceUrl: laneResult.sourceUrl || candidateUrl,
          sourceMetadata: laneResult.sourceMetadata || {},
          fetchLane: lane,
          quality,
        };
        if (
          !bestLowQualityResult ||
          scoreFetchQuality(candidateLowQuality.quality) > scoreFetchQuality(bestLowQualityResult.quality)
        ) {
          bestLowQualityResult = candidateLowQuality;
        }
        failures.push(`${candidateUrl} [${lane}] (low_quality:${quality.reason || "unknown"})`);
        continue;
      }
      failures.push(`${candidateUrl} [${lane}] (${laneResult?.error || "request failed"})`);
    }
  }

  if (bestLowQualityResult) {
    return {
      text: bestLowQualityResult.text,
      sourceUrl: bestLowQualityResult.sourceUrl,
      sourceMetadata: bestLowQualityResult.sourceMetadata,
      fetchLane: bestLowQualityResult.fetchLane,
      attemptedLanes,
    };
  }

  return {
    text: null,
    error: failures.length > 0 ? failures.join("; ") : "no applicable fetch lanes",
    attemptedLanes,
  };
}

export async function checkPolicySet({
  name,
  sourcesPath,
  hashesPath,
  candidatesPath,
  coveragePath,
  semanticPath,
  baselinePath,
  dailyFingerprintPath,
  blockedRetryPath,
  rulesFile,
  rawFetchCache = null,
  blockedFetchCache = null,
}) {
  if (!existsSync(sourcesPath)) {
    console.log(`::warning::Sources file not found for ${name}: ${sourcesPath}`);
    return {
      name,
      observedChanged: [],
      materialChanged: [],
      materialRepeatSuppressed: [],
      materialVersionRepeatSuppressed: [],
      materialOscillationSuppressed: [],
      pending: [],
      errors: [],
      errorReasons: {},
      rulesFile,
      successfulChecks: 0,
      totalChecks: 0,
      staleDropped: [],
      rebaselineForProfile: false,
      stalePending: [],
      volatilePending: [],
      volatileFlipOverrides: {},
      recheckConfirmed: [],
      recheckResolved: [],
      recheckFetchFailures: [],
      crossRunWindowConfirmed: [],
      crossRunWindowHeld: [],
      adaptiveWindowRelaxed: [],
      metadataStabilityHeld: [],
      noiseSuppressed: [],
      escalatedPending: [],
      escalatedReasons: {},
      escalationFlipOverrides: {},
      coverageGaps: [],
      qualityGateHeld: [],
      fetchBlockedPending: [],
      legacyPending: [],
      fallbackProbeAvailable: [],
      fallbackSignalChanged: [],
      fallbackSignalActionable: [],
      sourceMigrationResets: [],
      provisionalVendors: [],
      blockedRetryLaneVendors: [],
      blockedRetryQueueVendors: [],
      blockedRetryQueueEntries: {},
    };
  }

  const sources = readJson(sourcesPath, { vendors: {} });
  const storedHashProfile =
    typeof sources.hash_profile === "string" && sources.hash_profile.trim()
      ? sources.hash_profile.trim()
      : "";
  const rebaselineForProfile = storedHashProfile !== HASH_PROFILE_ID;
  const storedHashes = readJson(hashesPath, {});
  const storedCandidates = readJson(candidatesPath, {});
  const storedCoverage = readJson(coveragePath, { vendors: {} });
  const storedSemanticState = readJson(semanticPath, { vendors: {} });
  const storedBaselineState = readJson(baselinePath, { vendors: {} });
  const storedDailyFingerprintState = readJson(dailyFingerprintPath, { vendors: {} });
  const storedBlockedRetryState = readJson(blockedRetryPath, { vendors: {} });
  const storedBaselineVendorsRaw =
    storedBaselineState && typeof storedBaselineState.vendors === "object" && storedBaselineState.vendors
      ? storedBaselineState.vendors
      : {};
  const storedBaselineVendors = {};
  for (const [vendorKey, baselineValue] of Object.entries(storedBaselineVendorsRaw)) {
    storedBaselineVendors[vendorKey] = normalizeConfirmedBaselineEntry(baselineValue);
  }
  const storedSemanticProfilesRaw =
    storedSemanticState && typeof storedSemanticState.vendors === "object" && storedSemanticState.vendors
      ? storedSemanticState.vendors
      : (storedSemanticState && typeof storedSemanticState === "object" ? storedSemanticState : {});
  const storedSemanticProfiles = {};
  for (const [vendorKey, profileValue] of Object.entries(storedSemanticProfilesRaw)) {
    storedSemanticProfiles[vendorKey] = normalizeSemanticProfile(profileValue);
  }
  const storedDailyFingerprintVendorsRaw =
    storedDailyFingerprintState && typeof storedDailyFingerprintState.vendors === "object" && storedDailyFingerprintState.vendors
      ? storedDailyFingerprintState.vendors
      : {};
  const storedDailyFingerprintVendors = {};
  for (const [vendorKey, fingerprintValue] of Object.entries(storedDailyFingerprintVendorsRaw)) {
    storedDailyFingerprintVendors[vendorKey] = normalizeDailyFingerprintEntry(fingerprintValue);
  }
  const storedBlockedRetryVendorsRaw =
    storedBlockedRetryState && typeof storedBlockedRetryState.vendors === "object" && storedBlockedRetryState.vendors
      ? storedBlockedRetryState.vendors
      : {};
  const storedBlockedRetryVendors = {};
  for (const [vendorKey, blockedValue] of Object.entries(storedBlockedRetryVendorsRaw)) {
    storedBlockedRetryVendors[vendorKey] = normalizeBlockedRetryEntry(blockedValue);
  }
  const coverageVendors = storedCoverage && typeof storedCoverage.vendors === "object" && storedCoverage.vendors
    ? { ...storedCoverage.vendors }
    : {};
  const comparisonHashes = {};
  const comparisonSemanticProfiles = {};
  const comparisonVendorKeys = new Set([
    ...Object.keys(storedDailyFingerprintVendors || {}),
    ...Object.keys(storedSemanticProfiles || {}),
    ...Object.keys(storedBaselineVendors || {}),
  ]);
  for (const vendor of comparisonVendorKeys) {
    const baselineEntry = buildComparisonBaselineEntry({
      baselineEntry: storedBaselineVendors[vendor],
      dailyFingerprintEntry: storedDailyFingerprintVendors[vendor],
    });
    const comparisonProfile = buildComparisonSemanticProfile({
      baselineEntry,
      fallbackProfile: storedSemanticProfiles[vendor],
    });
    if (comparisonProfile) {
      comparisonSemanticProfiles[vendor] = comparisonProfile;
      if (comparisonProfile.hash) {
        comparisonHashes[vendor] = comparisonProfile.hash;
      }
    }
  }
  const activeStoredCandidates = {};
  const staleDropped = [];

  if (rebaselineForProfile) {
    const fromProfile = storedHashProfile || "legacy";
    console.log(
      `::notice::${name}: hash_profile migration ${fromProfile} -> ${HASH_PROFILE_ID}; rebaselining hashes for this run.`
    );
  }

  const nowMs = Date.now();
  for (const [vendor, candidate] of Object.entries(storedCandidates)) {
    if (isStaleCandidate(candidate, nowMs)) {
      staleDropped.push(vendor);
      continue;
    }
    activeStoredCandidates[vendor] = {
      ...candidate,
      pending_model_id: getCandidatePendingModelId(candidate),
      pending_model_first_observed_utc: getPendingModelFirstObservedUtc(candidate, candidate?.pending_since_utc || ""),
      change_key: getCandidateChangeKey(candidate),
      signal_window_change_decision: getCandidateSignalWindowDecision(candidate),
    };
  }

  const vendors = Object.entries(sources.vendors);
  const observedChanged = [];
  const materialChanged = [];
  const materialRepeatSuppressed = [];
  const materialVersionRepeatSuppressed = [];
  const materialOscillationSuppressed = [];
  const pendingSet = new Set();
  const pendingMetadata = {};
  const errors = [];
  const errorReasons = {};
  const newHashes = { ...storedHashes };
  const newCandidates = {};
  const newSemanticProfiles = { ...storedSemanticProfilesRaw };
  const newConfirmedBaseline = { ...storedBaselineVendors };
  const newDailyFingerprints = { ...storedDailyFingerprintVendors };
  const newBlockedRetryQueue = { ...storedBlockedRetryVendors };
  const runObservations = {};
  const recheckConfirmedSet = new Set();
  const recheckResolvedSet = new Set();
  const recheckFetchFailureSet = new Set();
  const crossRunWindowConfirmedSet = new Set();
  const crossRunWindowHeldSet = new Set();
  const adaptiveWindowRelaxedSet = new Set();
  const metadataStabilityHeldSet = new Set();
  const qualityGateHeldSet = new Set();
  const noiseSuppressedSet = new Set();
  const fallbackProbeAvailableSet = new Set();
  const fallbackSignalChangedSet = new Set();
  const fallbackSignalActionableSet = new Set();
  const sourceMigrationResetSet = new Set();
  const flakySourceVendorSet = new Set();
  let successfulChecks = 0;
  const runDateUtc = toDateUtcPrefix(utcIsoTimestamp());

  const ensureCoverageEntry = (vendor) => {
    if (!coverageVendors[vendor] || typeof coverageVendors[vendor] !== "object") {
      coverageVendors[vendor] = {};
    }
    return coverageVendors[vendor];
  };

  const markSuccessfulFetch = (vendor, whenUtc, fetchLane = "") => {
    const coverage = ensureCoverageEntry(vendor);
    coverage.last_successful_fetch_utc = whenUtc;
    if (fetchLane) {
      coverage.last_successful_fetch_lane = fetchLane;
    }
  };

  const markConfirmedChange = (vendor, whenUtc) => {
    const coverage = ensureCoverageEntry(vendor);
    coverage.last_confirmed_change_utc = whenUtc;
  };

  const getConfiguredSourceUrl = (vendorConfig) => {
    if (vendorConfig && typeof vendorConfig === "object" && typeof vendorConfig.url === "string") {
      return vendorConfig.url.trim();
    }
    if (typeof vendorConfig === "string") {
      return vendorConfig.trim();
    }
    return "";
  };

  const getVendorVolatilityTier = (vendorConfig, sourceUrl = "") => {
    const configuredSourceUrl = getConfiguredSourceUrl(vendorConfig);
    return resolveSourceVolatilityTier(vendorConfig, configuredSourceUrl || sourceUrl || "");
  };

  const upsertDailyFingerprint = ({
    vendor,
    vendorConfig,
    sourceUrl,
    confirmedHash,
    confirmedProfile,
    confirmedAtUtc,
  }) => {
    const normalizedProfile = normalizeSemanticProfile(confirmedProfile, {
      hash: confirmedHash,
      sourceUrl,
      extractedAtUtc: confirmedAtUtc,
    });
    const resolvedSourceUrl = String(sourceUrl || normalizedProfile.source_url || "").trim();
    const volatilityTier = getVendorVolatilityTier(vendorConfig, resolvedSourceUrl);
    if (volatilityTier === "flaky") {
      flakySourceVendorSet.add(vendor);
    }
    newDailyFingerprints[vendor] = normalizeDailyFingerprintEntry({
      date_utc: runDateUtc,
      hash: String(confirmedHash || "").trim(),
      semantic_signature: semanticTokenSignature(normalizedProfile),
      metadata_signature: String(normalizedProfile.metadata_signature || "").trim(),
      source_url: resolvedSourceUrl,
      source_hostname: normalizeSourceHostname(resolvedSourceUrl),
      volatility_tier: volatilityTier,
      confirmed_change_utc: String(confirmedAtUtc || "").trim(),
      updated_utc: String(confirmedAtUtc || "").trim(),
    });
  };

  const clearBlockedRetryQueueEntry = (vendor) => {
    delete newBlockedRetryQueue[vendor];
  };

  const upsertBlockedRetryQueueEntry = ({
    vendor,
    vendorConfig,
    sourceUrl,
    blockedReason,
    failureAtUtc,
    fetchFailureStreak = 0,
    fallbackProbeResult = null,
    fallbackSignalConsecutiveRuns = 0,
    fallbackSignalActionable = false,
  }) => {
    const previous = normalizeBlockedRetryEntry(newBlockedRetryQueue[vendor]);
    const resolvedSourceUrl = String(sourceUrl || previous.source_url || getConfiguredSourceUrl(vendorConfig) || "").trim();
    const volatilityTier = getVendorVolatilityTier(vendorConfig, resolvedSourceUrl);
    if (volatilityTier === "flaky") {
      flakySourceVendorSet.add(vendor);
    }
    const retryCount = Number(previous.retry_count || 0) + 1;
    newBlockedRetryQueue[vendor] = normalizeBlockedRetryEntry({
      source_url: resolvedSourceUrl,
      source_hostname: normalizeSourceHostname(resolvedSourceUrl),
      volatility_tier: volatilityTier,
      blocked_reason: String(blockedReason || previous.blocked_reason || "fetch_blocked").trim(),
      first_blocked_utc: String(previous.first_blocked_utc || failureAtUtc || "").trim(),
      last_blocked_utc: String(failureAtUtc || previous.last_blocked_utc || "").trim(),
      retry_count: retryCount,
      fetch_failure_streak: Number(fetchFailureStreak || 0),
      fallback_probe_signature: String(
        fallbackProbeResult?.signature || previous.fallback_probe_signature || ""
      ).trim(),
      fallback_probe_strong_signature: String(
        fallbackProbeResult?.strongSignature || previous.fallback_probe_strong_signature || ""
      ).trim(),
      fallback_signal_consecutive_runs: Number(fallbackSignalConsecutiveRuns || 0),
      fallback_signal_actionable: Boolean(fallbackSignalActionable),
      fallback_probe_sample: String(
        fallbackProbeResult?.sample || previous.fallback_probe_sample || ""
      ).trim(),
    });
  };

  for (const [vendor, vendorConfig] of vendors) {
    const configuredSourceUrl = getConfiguredSourceUrl(vendorConfig);
    if (!configuredSourceUrl) continue;
    const coverage = ensureCoverageEntry(vendor);
    const sourceVolatilityTier = getVendorVolatilityTier(vendorConfig, configuredSourceUrl);
    coverage.source_volatility_tier = sourceVolatilityTier;
    if (sourceVolatilityTier === "flaky") {
      flakySourceVendorSet.add(vendor);
    }
    const sourceMigration = evaluateVendorSourceMigration({
      configuredSourceUrl,
      baselineSourceUrl: storedBaselineVendors[vendor]?.source_url || "",
      candidateSourceUrl: activeStoredCandidates[vendor]?.source_url || "",
      coverageSourceUrl: coverage.last_pending_source_url || "",
      semanticSourceUrl: storedSemanticProfiles[vendor]?.source_url || "",
    });
    if (!sourceMigration.migrated) continue;

    const resetAtUtc = utcIsoTimestamp();
    sourceMigrationResetSet.add(vendor);
    delete activeStoredCandidates[vendor];
    delete newCandidates[vendor];
    delete comparisonHashes[vendor];
    delete comparisonSemanticProfiles[vendor];
    delete newHashes[vendor];
    delete newDailyFingerprints[vendor];
    delete newBlockedRetryQueue[vendor];
    coverage.signal_window = [];
    coverage.last_pending_age_days = 0;
    coverage.last_pending_flip_count = 0;
    coverage.last_pending_recent_flip_count = 0;
    coverage.pending_fetch_failure_streak = 0;
    coverage.pending_fetch_blocked = false;
    coverage.fallback_signal_consecutive_runs = 0;
    delete coverage.pending_fetch_blocked_reason;
    delete coverage.last_quality_gate_rejected_hash;
    delete coverage.last_quality_gate_rejected_utc;
    delete coverage.last_quality_gate_rejected_reason;
    delete coverage.last_quality_gate_rejected_failures;
    delete coverage.pending_legacy;
    delete coverage.last_pending_source_url;
    delete coverage.last_pending_change_key;
    delete coverage.last_pending_bucket;
    delete coverage.pending_model_id;
    delete coverage.pending_model_first_observed_utc;
    coverage.last_source_migration_reset_utc = resetAtUtc;
    coverage.last_source_migration_from_url = sourceMigration.previousSourceUrl;
    coverage.last_source_migration_to_url = sourceMigration.configuredSourceUrl;
    coverage.last_source_migration_reason = sourceMigration.reason;
  }

  const upsertConfirmedBaseline = ({
    vendor,
    vendorConfig,
    sourceUrl,
    confirmedHash,
    confirmedProfile,
    confirmedAtUtc,
  }) => {
    const normalizedProfile = normalizeSemanticProfile(confirmedProfile, {
      hash: confirmedHash,
      sourceUrl,
      extractedAtUtc: confirmedAtUtc,
    });
    newConfirmedBaseline[vendor] = {
      hash: String(confirmedHash || "").trim(),
      semantic_signature: semanticTokenSignature(normalizedProfile),
      metadata_signature: String(normalizedProfile.metadata_signature || "").trim(),
      source_url: String(sourceUrl || "").trim(),
      last_confirmed_change_utc: String(confirmedAtUtc || "").trim(),
    };
    upsertDailyFingerprint({
      vendor,
      vendorConfig,
      sourceUrl,
      confirmedHash,
      confirmedProfile: normalizedProfile,
      confirmedAtUtc,
    });
  };

  const registerConfirmedChange = ({
    vendor,
    vendorConfig,
    sourceUrl,
    confirmedHash,
    confirmedProfile,
    confirmedAtUtc,
  }) => {
    const normalizedProfile = normalizeSemanticProfile(confirmedProfile, {
      hash: confirmedHash,
      sourceUrl,
      extractedAtUtc: confirmedAtUtc,
    });
    const previousProfile = comparisonSemanticProfiles[vendor];
    const previousHash = typeof previousProfile?.hash === "string" ? previousProfile.hash : "";
    const semanticDiff = diffSemanticProfiles(previousProfile, normalizedProfile);
    const entry = {
      vendor,
      url: sourceUrl,
      confirmed_hash: confirmedHash || "",
      previous_hash: previousHash,
      confirmed_at_utc: confirmedAtUtc,
      semantic_diff: semanticDiff,
      semantic_diff_summary: formatSemanticDiffSummary(semanticDiff),
    };
    const coverage = ensureCoverageEntry(vendor);

    if (semanticDiff.material) {
      const previousEmittedHash =
        typeof coverage.last_material_emitted_hash === "string" ? coverage.last_material_emitted_hash : "";
      const suppressRepeatedHashVersion = Boolean(confirmedHash && previousEmittedHash && confirmedHash === previousEmittedHash);
      if (suppressRepeatedHashVersion) {
        materialVersionRepeatSuppressed.push({
          ...entry,
          suppressed_hash: confirmedHash,
          last_material_emitted_hash: previousEmittedHash,
          last_material_emitted_utc:
            typeof coverage.last_material_emitted_utc === "string" ? coverage.last_material_emitted_utc : "",
        });
        coverage.last_material_hash_repeat_suppressed_utc = confirmedAtUtc;
        coverage.last_material_hash_repeat_suppressed_hash = confirmedHash;
        newSemanticProfiles[vendor] = normalizedProfile;
        markConfirmedChange(vendor, confirmedAtUtc);
        return;
      }
    }

    observedChanged.push(entry);
    if (semanticDiff.material) {
      const diffSignature = buildSemanticDiffSignature(semanticDiff);
      const previousSignature =
        typeof coverage.last_material_signature === "string" ? coverage.last_material_signature : "";
      const previousEmittedUtc =
        typeof coverage.last_material_emitted_utc === "string" ? coverage.last_material_emitted_utc : "";
      const previousEmittedHash =
        typeof coverage.last_material_emitted_hash === "string" ? coverage.last_material_emitted_hash : "";
      const previousSignaturePrev =
        typeof coverage.last_material_signature_prev === "string" ? coverage.last_material_signature_prev : "";
      const previousEmittedPrevUtc =
        typeof coverage.last_material_emitted_prev_utc === "string" ? coverage.last_material_emitted_prev_utc : "";
      const previousEmittedHashPrev =
        typeof coverage.last_material_emitted_hash_prev === "string" ? coverage.last_material_emitted_hash_prev : "";
      const cooldownDays = getMaterialCooldownDays();
      const oscillationWindowDays = getMaterialOscillationWindowDays();
      const nowMs = toMsOrNaN(confirmedAtUtc);
      const previousMs = toMsOrNaN(previousEmittedUtc);
      const previousPrevMs = toMsOrNaN(previousEmittedPrevUtc);
      const suppressRepeatedSignature =
        cooldownDays > 0 &&
        diffSignature &&
        previousSignature &&
        diffSignature === previousSignature &&
        Number.isFinite(nowMs) &&
        Number.isFinite(previousMs) &&
        (nowMs - previousMs) < cooldownDays * 24 * 60 * 60 * 1000;
      const oscillationWindowMs = oscillationWindowDays * 24 * 60 * 60 * 1000;
      const hasOscillationWindowContext =
        oscillationWindowDays > 0 &&
        Number.isFinite(nowMs) &&
        Number.isFinite(previousMs) &&
        Number.isFinite(previousPrevMs) &&
        (nowMs - previousMs) < oscillationWindowMs &&
        (nowMs - previousPrevMs) < oscillationWindowMs;
      const suppressOscillationBySignature =
        hasOscillationWindowContext &&
        diffSignature &&
        previousSignature &&
        previousSignaturePrev &&
        diffSignature === previousSignaturePrev &&
        diffSignature !== previousSignature;
      const suppressOscillationByHash =
        hasOscillationWindowContext &&
        confirmedHash &&
        previousEmittedHash &&
        previousEmittedHashPrev &&
        confirmedHash === previousEmittedHashPrev &&
        confirmedHash !== previousEmittedHash;

      if (suppressRepeatedSignature) {
        materialRepeatSuppressed.push({
          ...entry,
          semantic_diff_signature: diffSignature,
          last_material_emitted_utc: previousEmittedUtc,
        });
        coverage.last_material_repeat_suppressed_utc = confirmedAtUtc;
        coverage.last_material_repeat_suppressed_signature = diffSignature;
      } else if (suppressOscillationBySignature || suppressOscillationByHash) {
        materialOscillationSuppressed.push({
          ...entry,
          semantic_diff_signature: diffSignature,
          oscillation_window_days: oscillationWindowDays,
          last_material_signature: previousSignature,
          previous_material_signature: previousSignaturePrev,
          last_material_emitted_utc: previousEmittedUtc,
          previous_material_emitted_utc: previousEmittedPrevUtc,
        });
        coverage.last_material_oscillation_suppressed_utc = confirmedAtUtc;
        coverage.last_material_oscillation_suppressed_signature = diffSignature;
      } else {
        materialChanged.push(entry);
        if (diffSignature) {
          if (previousSignature) {
            coverage.last_material_signature_prev = previousSignature;
            coverage.last_material_emitted_prev_utc = previousEmittedUtc || "";
            coverage.last_material_emitted_hash_prev = previousEmittedHash || "";
          } else {
            delete coverage.last_material_signature_prev;
            delete coverage.last_material_emitted_prev_utc;
            delete coverage.last_material_emitted_hash_prev;
          }
          coverage.last_material_signature = diffSignature;
          coverage.last_material_emitted_utc = confirmedAtUtc;
          coverage.last_material_emitted_hash = confirmedHash || previousEmittedHash || "";
        }
        delete coverage.last_material_repeat_suppressed_utc;
        delete coverage.last_material_repeat_suppressed_signature;
        delete coverage.last_material_oscillation_suppressed_utc;
        delete coverage.last_material_oscillation_suppressed_signature;
        delete coverage.last_material_hash_repeat_suppressed_utc;
        delete coverage.last_material_hash_repeat_suppressed_hash;
      }
    }
    newSemanticProfiles[vendor] = normalizedProfile;
    comparisonSemanticProfiles[vendor] = normalizedProfile;
    comparisonHashes[vendor] = String(confirmedHash || "").trim();
    upsertConfirmedBaseline({
      vendor,
      vendorConfig,
      sourceUrl,
      confirmedHash,
      confirmedProfile: normalizedProfile,
      confirmedAtUtc,
    });
    markConfirmedChange(vendor, confirmedAtUtc);
  };

  const fetchSchedule = buildPolicyFetchSchedule(vendors, {
    blockedRetryVendors: newBlockedRetryQueue,
    coverageVendors,
    blockedFetchCache,
  });
  const blockedRetryLaneVendors = fetchSchedule.blockedVendors
    .map(([vendor]) => vendor)
    .sort((a, b) => a.localeCompare(b));

  // Keep paced workers busy while healthy sources stay ahead of persistent blockers.
  const batchSize = Number.isFinite(CHECKER_CONFIG.batchSize) && CHECKER_CONFIG.batchSize > 0
    ? CHECKER_CONFIG.batchSize
    : 3;
  await mapWithConcurrency(
    fetchSchedule.scheduledVendors,
    batchSize,
    async ([vendor, vendorConfig]) => {
        const configuredSourceUrl = getConfiguredSourceUrl(vendorConfig);
        let sourceVolatilityTier = getVendorVolatilityTier(vendorConfig, configuredSourceUrl);
        const coverage = ensureCoverageEntry(vendor);
        coverage.source_volatility_tier = sourceVolatilityTier;
        if (sourceVolatilityTier === "flaky") {
          flakySourceVendorSet.add(vendor);
        }
        const blockedFetchPlanKey = buildBlockedFetchPlanKey(vendor, vendorConfig);
        const reusedBlockedFetch =
          blockedFetchPlanKey &&
          blockedFetchCache &&
          typeof blockedFetchCache.get === "function"
            ? blockedFetchCache.get(blockedFetchPlanKey)
            : undefined;
        const fetchResult = reusedBlockedFetch ?? await fetchWithFallback(
          vendorConfig,
          { vendor, policyType: name },
          { rawFetchCache }
        );
        if (!fetchResult.text) {
          errors.push(vendor);
          const failureReason = fetchResult.error || "request failed";
          errorReasons[vendor] = failureReason;
          const failureAtUtc = utcIsoTimestamp();
          const priorFailureStreak = Number(
            activeStoredCandidates[vendor]?.fetch_failure_streak || coverage.consecutive_fetch_failures || 0
          );
          const nextFailureStreak = priorFailureStreak + 1;
          const fetchBlockClassification = classifyFetchFailureBlock(failureReason);
          const isFetchBlocked = fetchBlockClassification.immediateBlock || nextFailureStreak >= getFetchFailureQuarantineStreak();
          if (
            isFetchBlocked &&
            blockedFetchPlanKey &&
            blockedFetchCache &&
            typeof blockedFetchCache.retain === "function"
          ) {
            blockedFetchCache.retain(blockedFetchPlanKey, fetchResult);
          }
          coverage.last_fetch_failure_utc = failureAtUtc;
          coverage.last_fetch_failure_reason = failureReason;
          if (Array.isArray(fetchResult.attemptedLanes) && fetchResult.attemptedLanes.length > 0) {
            coverage.last_fetch_failure_lanes = fetchResult.attemptedLanes.join(",");
          } else {
            delete coverage.last_fetch_failure_lanes;
          }
          coverage.consecutive_fetch_failures = nextFailureStreak;
          coverage.pending_fetch_blocked = isFetchBlocked;
          if (isFetchBlocked) {
            coverage.pending_fetch_blocked_reason =
              fetchBlockClassification.reason || `consecutive_fetch_failures>=${getFetchFailureQuarantineStreak()}`;
          } else {
            delete coverage.pending_fetch_blocked_reason;
          }
          const priorFallbackStrongSignature =
            typeof coverage.last_fallback_probe_strong_signature === "string"
              ? coverage.last_fallback_probe_strong_signature
              : "";
          const priorFallbackConsecutiveRuns = Number(
            coverage.fallback_signal_consecutive_runs || activeStoredCandidates[vendor]?.fallback_signal_consecutive_runs || 0
          );
          const fallbackProbeResult = await probeFallbackMetadata(vendorConfig);
          let fallbackSignalConsecutiveRuns = 0;
          let fallbackSignalActionable = false;
          if (fallbackProbeResult.available && fallbackProbeResult.signature) {
            fallbackProbeAvailableSet.add(vendor);
            coverage.last_fallback_probe_observed_utc = failureAtUtc;
            coverage.last_fallback_probe_signature = fallbackProbeResult.signature;
            coverage.last_fallback_probe_strong_signature = String(fallbackProbeResult.strongSignature || "");
            coverage.last_fallback_probe_weak_only = fallbackProbeResult.strongSignature ? "0" : "1";
            coverage.last_fallback_probe_sample = fallbackProbeResult.sample || "";
            coverage.last_fallback_probe_source_count = Array.isArray(fallbackProbeResult.entries)
              ? fallbackProbeResult.entries.length
              : 0;
            delete coverage.last_fallback_probe_error;
            const fallbackTransition = evaluateFallbackSignalTransition({
              previousStrongSignature: priorFallbackStrongSignature,
              nextStrongSignature: fallbackProbeResult.strongSignature,
              previousConsecutiveRuns: priorFallbackConsecutiveRuns,
              thresholdRuns: getFallbackSignalConsecutiveRuns(),
            });
            coverage.fallback_signal_consecutive_runs = fallbackTransition.consecutiveRuns;
            coverage.last_fallback_signal_reason = fallbackTransition.reason;
            fallbackSignalConsecutiveRuns = fallbackTransition.consecutiveRuns;
            fallbackSignalActionable = fallbackTransition.actionable;
            if (fallbackTransition.changed) {
              fallbackSignalChangedSet.add(vendor);
              coverage.last_fallback_signal_changed_utc = failureAtUtc;
              coverage.last_fallback_signal_previous_signature = priorFallbackStrongSignature;
              coverage.last_fallback_signal_signature = String(fallbackProbeResult.strongSignature || "");
            }
            if (fallbackTransition.actionable) {
              fallbackSignalActionableSet.add(vendor);
              coverage.last_fallback_signal_actionable_utc = failureAtUtc;
            }
          } else if (fallbackProbeResult.error) {
            coverage.fallback_signal_consecutive_runs = 0;
            coverage.last_fallback_probe_error = fallbackProbeResult.error;
            fallbackSignalConsecutiveRuns = 0;
            fallbackSignalActionable = false;
          }
          if (isFetchBlocked) {
            upsertBlockedRetryQueueEntry({
              vendor,
              vendorConfig,
              sourceUrl: configuredSourceUrl || "",
              blockedReason: coverage.pending_fetch_blocked_reason || failureReason,
              failureAtUtc,
              fetchFailureStreak: nextFailureStreak,
              fallbackProbeResult,
              fallbackSignalConsecutiveRuns,
              fallbackSignalActionable,
            });
          }
          if (activeStoredCandidates[vendor]) {
            newCandidates[vendor] = {
              ...activeStoredCandidates[vendor],
              run_confirmations: 0,
              last_fetch_failure_utc: failureAtUtc,
              fetch_failure_streak: nextFailureStreak,
              fetch_blocked: isFetchBlocked,
              fetch_blocked_reason: isFetchBlocked
                ? (fetchBlockClassification.reason || `consecutive_fetch_failures>=${getFetchFailureQuarantineStreak()}`)
                : "",
              fallback_probe_signature:
                fallbackProbeResult.available && fallbackProbeResult.signature
                  ? fallbackProbeResult.signature
                  : String(activeStoredCandidates[vendor]?.fallback_probe_signature || ""),
              fallback_probe_strong_signature:
                fallbackProbeResult.available && fallbackProbeResult.strongSignature
                  ? String(fallbackProbeResult.strongSignature)
                  : String(activeStoredCandidates[vendor]?.fallback_probe_strong_signature || ""),
              fallback_probe_observed_utc:
                fallbackProbeResult.available && fallbackProbeResult.signature
                  ? failureAtUtc
                  : String(activeStoredCandidates[vendor]?.fallback_probe_observed_utc || ""),
              fallback_signal_consecutive_runs:
                fallbackProbeResult.available
                  ? Number(coverage.fallback_signal_consecutive_runs || 0)
                  : 0,
              fallback_signal_changed_utc:
                fallbackProbeResult.available &&
                Boolean(coverage.last_fallback_signal_changed_utc) &&
                String(coverage.last_fallback_signal_changed_utc) === failureAtUtc
                  ? failureAtUtc
                  : String(activeStoredCandidates[vendor]?.fallback_signal_changed_utc || ""),
              fallback_signal_actionable_utc:
                fallbackProbeResult.available &&
                Boolean(coverage.last_fallback_signal_actionable_utc) &&
                String(coverage.last_fallback_signal_actionable_utc) === failureAtUtc
                  ? failureAtUtc
                  : String(activeStoredCandidates[vendor]?.fallback_signal_actionable_utc || ""),
              volatility_tier: sourceVolatilityTier,
            };
          }
          return;
        }
        const normalized = normalizeFetchedText(fetchResult.text, name, vendor);
        const h = hash(normalized || fetchResult.text);
        successfulChecks += 1;
        const fetchedAtUtc = utcIsoTimestamp();
        markSuccessfulFetch(vendor, fetchedAtUtc, fetchResult.fetchLane || "");
        delete coverage.last_fetch_failure_utc;
        delete coverage.last_fetch_failure_reason;
        delete coverage.last_fetch_failure_lanes;
        coverage.consecutive_fetch_failures = 0;
        coverage.pending_fetch_blocked = false;
        delete coverage.pending_fetch_blocked_reason;
        delete coverage.last_fallback_probe_error;
        coverage.fallback_signal_consecutive_runs = 0;
        clearBlockedRetryQueueEntry(vendor);

        const sourceUrl =
          typeof vendorConfig?.url === "string" && vendorConfig.url
            ? vendorConfig.url
            : fetchResult.sourceUrl;
        sourceVolatilityTier = getVendorVolatilityTier(vendorConfig, sourceUrl || "");
        coverage.source_volatility_tier = sourceVolatilityTier;
        if (sourceVolatilityTier === "flaky") {
          flakySourceVendorSet.add(vendor);
        }
        const actualConfirmRuns = getActualConfirmRunsForVendor(vendorConfig, vendor, sourceVolatilityTier);
        const pageMetadata = extractPageMetadata({
          rawText: fetchResult.text,
          sourceMetadata: fetchResult.sourceMetadata,
        });
        if (pageMetadata.display_last_updated_label) {
          coverage.last_observed_last_updated_label = pageMetadata.display_last_updated_label;
        }
        if (pageMetadata.display_last_updated_date_utc) {
          coverage.last_observed_last_updated_date_utc = pageMetadata.display_last_updated_date_utc;
        }
        if (pageMetadata.source_updated_at_utc) {
          coverage.last_observed_source_updated_at_utc = pageMetadata.source_updated_at_utc;
        }
        const semanticProfile = buildSemanticProfile(normalized || fetchResult.text, name, {
          hash: h,
          sourceUrl: sourceUrl || "",
          extractedAtUtc: fetchedAtUtc,
          pageMetadata,
        });
        const semanticSignature = semanticTokenSignature(semanticProfile);
        const previousSemanticProfile = comparisonSemanticProfiles[vendor] || null;
        const semanticDiffAgainstPrevious = diffSemanticProfiles(previousSemanticProfile, semanticProfile);
        const metadataSignature = String(semanticProfile.metadata_signature || "");
        const previousMetadataSignature = String(previousSemanticProfile?.metadata_signature || "");
        const metadataSignalStable =
          semanticDiffAgainstPrevious.material &&
          metadataSignature &&
          previousMetadataSignature &&
          metadataSignature === previousMetadataSignature;
        const priorCandidate = activeStoredCandidates[vendor];
        const previousHash = comparisonHashes[vendor];
        const quality = assessFetchQuality({
          rawText: fetchResult.text,
          normalizedText: normalized,
          policyType: name,
          vendorKey: vendor,
        });
        const priorHashForQuality = typeof priorCandidate?.hash === "string" ? priorCandidate.hash : "";
        const priorQualityFailuresForQuality = Number(priorCandidate?.quality_gate_failures || 0);
        const priorQualityPassesForQuality = Number(priorCandidate?.quality_gate_passes || 0);
        const nextQualityFailuresForQuality =
          (priorHashForQuality && priorHashForQuality === h ? priorQualityFailuresForQuality : 0) + (quality.passed ? 0 : 1);
        if (!quality.passed) {
          qualityGateHeldSet.add(vendor);
          coverage.last_quality_gate_failure_utc = fetchedAtUtc;
          coverage.last_quality_gate_failure_reason = quality.reason;
        } else {
          delete coverage.last_quality_gate_failure_utc;
          delete coverage.last_quality_gate_failure_reason;
          delete coverage.last_quality_gate_rejected_hash;
          delete coverage.last_quality_gate_rejected_utc;
          delete coverage.last_quality_gate_rejected_reason;
          delete coverage.last_quality_gate_rejected_failures;
        }
        const priorSemanticSignature =
          typeof priorCandidate?.semantic_signature === "string" ? priorCandidate.semantic_signature : "";
        const currentChangeKey = buildChangeKey(h, semanticSignature);
        const signal = previousHash && previousHash === h ? BASELINE_SIGNAL : currentChangeKey;
        const signalWindow = appendSignalWindow(coverage, signal);
        const signalWindowRequiredVotes = getCrossRunWindowRequiredForCandidate({
          semanticSignature,
          quality,
        });
        const signalWindowDecision = evaluateSignalWindow(signalWindow, signalWindowRequiredVotes);
        if (previousHash && previousHash !== h && signalWindowRequiredVotes < getCrossRunWindowRequired()) {
          adaptiveWindowRelaxedSet.add(vendor);
        }
        const signalWindowChangeDecision =
          typeof signalWindowDecision.hashDecision === "string"
            ? signalWindowDecision.hashDecision
            : "";

        // Repeated low-quality deltas (often interstitial/JS-shell captures) should not live forever in pending.
        // Keep baseline stable and suppress re-queuing of the same rejected hash until quality improves.
        if (!quality.passed && previousHash && previousHash !== h) {
          const rejectedHash = String(coverage.last_quality_gate_rejected_hash || "").trim();
          const rejectThreshold = getQualityGateRejectFailures();
          const shouldRejectLowQualityDiff =
            (rejectedHash && rejectedHash === h) ||
            (nextQualityFailuresForQuality >= rejectThreshold && priorQualityPassesForQuality === 0);
          if (shouldRejectLowQualityDiff) {
            coverage.last_quality_gate_rejected_hash = h;
            coverage.last_quality_gate_rejected_utc = fetchedAtUtc;
            coverage.last_quality_gate_rejected_reason = quality.reason;
            coverage.last_quality_gate_rejected_failures = nextQualityFailuresForQuality;
            delete newCandidates[vendor];
            pendingSet.delete(vendor);
            return;
          }
        }

        if (isUpdate || rebaselineForProfile || !previousHash) {
          // A new crawler baseline is not a human policy approval. Persist this hold.
          coverage.last_runtime_evidence_reset_utc = fetchedAtUtc;
          newHashes[vendor] = h;
          newSemanticProfiles[vendor] = semanticProfile;
          comparisonHashes[vendor] = h;
          comparisonSemanticProfiles[vendor] = semanticProfile;
          if (quality.passed) {
            upsertConfirmedBaseline({
              vendor,
              vendorConfig,
              sourceUrl: sourceUrl || "",
              confirmedHash: h,
              confirmedProfile: semanticProfile,
              confirmedAtUtc: fetchedAtUtc,
            });
          }
          delete newCandidates[vendor];
          return;
        }

        if (previousHash === h) {
          newHashes[vendor] = h;
          newSemanticProfiles[vendor] = comparisonSemanticProfiles[vendor] || semanticProfile;
          comparisonHashes[vendor] = h;
          if (quality.passed && !newConfirmedBaseline[vendor]?.hash) {
            upsertConfirmedBaseline({
              vendor,
              vendorConfig,
              sourceUrl: sourceUrl || "",
              confirmedHash: h,
              confirmedProfile: semanticProfile,
              confirmedAtUtc: fetchedAtUtc,
            });
          }
          if (quality.passed) {
            upsertDailyFingerprint({
              vendor,
              vendorConfig,
              sourceUrl: sourceUrl || "",
              confirmedHash: h,
              confirmedProfile: comparisonSemanticProfiles[vendor] || semanticProfile,
              confirmedAtUtc: fetchedAtUtc,
            });
          }
          delete newCandidates[vendor];
          return;
        }

        if (
          quality.passed &&
          !semanticDiffAgainstPrevious.baselineMissing &&
          !semanticDiffAgainstPrevious.material
        ) {
          newHashes[vendor] = h;
          newSemanticProfiles[vendor] = semanticProfile;
          comparisonHashes[vendor] = h;
          comparisonSemanticProfiles[vendor] = semanticProfile;
          upsertConfirmedBaseline({
            vendor,
            vendorConfig,
            sourceUrl: sourceUrl || "",
            confirmedHash: h,
            confirmedProfile: semanticProfile,
            confirmedAtUtc: fetchedAtUtc,
          });
          delete newCandidates[vendor];
          noiseSuppressedSet.add(vendor);
          coverage.last_noise_suppressed_utc = fetchedAtUtc;
          coverage.last_noise_suppressed_reason = "non_material_repeat";
          coverage.last_noise_suppressed_hash = h;
          coverage.last_noise_suppressed_change_key = currentChangeKey;
          coverage.last_noise_suppressed_source_url = sourceUrl || "";
          return;
        }

        const priorCount = Number(priorCandidate?.count || 0);
        const priorFlipCount = Number(priorCandidate?.flip_count || 0);
        const priorHash = typeof priorCandidate?.hash === "string" ? priorCandidate.hash : "";
        const priorChangeKey = getCandidateChangeKey(priorCandidate, {
          hash: priorHash,
          semanticSignature: priorSemanticSignature,
        });
        const nextCount = priorHash === h ? Math.max(1, priorCount) + 1 : 1;
        const nextFlipCount =
          priorChangeKey && priorChangeKey !== currentChangeKey
            ? priorFlipCount + 1
            : priorFlipCount;
        const priorRunConfirmations = Number(priorCandidate?.run_confirmations || 0);
        const priorSemanticRunConfirmations = Number(priorCandidate?.semantic_run_confirmations || 0);
        const priorQualityPasses = Number(priorCandidate?.quality_gate_passes || 0);
        const priorQualityFailures = Number(priorCandidate?.quality_gate_failures || 0);
        const nextQualityPasses = (priorHash === h ? priorQualityPasses : 0) + (quality.passed ? 1 : 0);
        const nextQualityFailures = (priorHash === h ? priorQualityFailures : 0) + (quality.passed ? 0 : 1);
        const priorObservedMs = toMsOrNaN(priorCandidate?.last_run_observed_utc || "");
        const currentObservedMs = toMsOrNaN(fetchedAtUtc);
        const minGapMs = getActualMinGapMs();
        const gapSatisfied =
          minGapMs <= 0 ||
          (Number.isFinite(priorObservedMs) &&
            Number.isFinite(currentObservedMs) &&
            currentObservedMs - priorObservedMs >= minGapMs);
        let nextRunConfirmations = 1;
        if (priorHash === h && priorRunConfirmations > 0) {
          nextRunConfirmations = gapSatisfied ? priorRunConfirmations + 1 : priorRunConfirmations;
        }
        const semanticStableAcrossRuns =
          priorHash === h &&
          priorSemanticRunConfirmations > 0 &&
          semanticSignaturesStable(priorSemanticSignature, semanticSignature);
        let nextSemanticRunConfirmations = 1;
        if (semanticStableAcrossRuns) {
          nextSemanticRunConfirmations = gapSatisfied ? priorSemanticRunConfirmations + 1 : priorSemanticRunConfirmations;
        }
        if (!quality.passed) {
          nextRunConfirmations = priorHash === h ? priorRunConfirmations : 0;
          nextSemanticRunConfirmations = priorHash === h ? priorSemanticRunConfirmations : 0;
        }
        const hasSemanticEvidence = Boolean(priorSemanticSignature || semanticSignature);
        const semanticConfirmReady =
          !hasSemanticEvidence || nextSemanticRunConfirmations >= actualConfirmRuns;
        const metadataConfirmRunsRequired = metadataSignalStable
          ? actualConfirmRuns + 1
          : actualConfirmRuns;
        if (
          metadataSignalStable &&
          quality.passed &&
          nextRunConfirmations >= actualConfirmRuns &&
          nextRunConfirmations < metadataConfirmRunsRequired
        ) {
          metadataStabilityHeldSet.add(vendor);
          coverage.last_metadata_stability_hold_utc = fetchedAtUtc;
          coverage.last_metadata_stability_hold_reason =
            "semantic_changed_without_metadata_signature_change";
        } else {
          delete coverage.last_metadata_stability_hold_utc;
          delete coverage.last_metadata_stability_hold_reason;
        }
        const signalWindowConfirmed =
          Boolean(signalWindowChangeDecision) &&
          signalWindowChangeDecision === currentChangeKey;

        if (
          quality.passed &&
          nextRunConfirmations >= metadataConfirmRunsRequired &&
          semanticConfirmReady &&
          signalWindowConfirmed
        ) {
          registerConfirmedChange({
            vendor,
            vendorConfig,
            sourceUrl: sourceUrl || "",
            confirmedHash: h,
            confirmedProfile: semanticProfile,
            confirmedAtUtc: fetchedAtUtc,
          });
          newHashes[vendor] = h;
          crossRunWindowConfirmedSet.add(vendor);
          return;
        }

        if (
          !quality.passed ||
          (!gapSatisfied && priorHash === h && priorRunConfirmations > 0) ||
          (metadataSignalStable && nextRunConfirmations < metadataConfirmRunsRequired) ||
          (nextRunConfirmations >= actualConfirmRuns && !signalWindowConfirmed) ||
          (nextRunConfirmations >= actualConfirmRuns && !semanticConfirmReady)
        ) {
          crossRunWindowHeldSet.add(vendor);
        }

        newHashes[vendor] = previousHash;
        pendingSet.add(vendor);
        newCandidates[vendor] = markCandidatePendingModel({
          hash: h,
          count: nextCount,
          flip_count: nextFlipCount,
          fetch_failure_streak: 0,
          fetch_blocked: false,
          run_confirmations: nextRunConfirmations,
          semantic_run_confirmations: nextSemanticRunConfirmations,
          semantic_signature: semanticSignature,
          change_key: currentChangeKey,
          signal_window_hash_decision: signalWindowChangeDecision || "",
          signal_window_change_decision: signalWindowChangeDecision || "",
          signal_window_required_votes: Number(signalWindowDecision.required || 0),
          signal_window_top_hash_votes: Number(signalWindowDecision.topVotes || 0),
          signal_window_baseline_votes: Number(signalWindowDecision.baselineVotes || 0),
          actual_confirm_runs_required: actualConfirmRuns,
          metadata_confirm_runs_required: metadataConfirmRunsRequired,
          metadata_signature: metadataSignature,
          previous_metadata_signature: previousMetadataSignature,
          metadata_signal_stable: Boolean(metadataSignalStable),
          last_run_observed_utc: fetchedAtUtc,
          source_url: sourceUrl || "",
          pending_since_utc: getCandidatePendingSinceUtc(priorCandidate) || fetchedAtUtc,
          first_seen_utc: priorHash === h && priorCandidate.first_seen_utc
            ? priorCandidate.first_seen_utc
            : fetchedAtUtc,
          last_seen_utc: fetchedAtUtc,
          baseline_observations: 0,
          profile: semanticProfile,
          quality_gate_passes: nextQualityPasses,
          quality_gate_failures: nextQualityFailures,
          quality_gate_last_reason: quality.passed ? "" : quality.reason,
          quality_gate_last_observed_utc: fetchedAtUtc,
          quality_gate_policy_hits: quality.policyKeywordHits,
          quality_gate_lines: quality.lineCount,
          quality_gate_chars: quality.normalizedLength,
          volatility_tier: sourceVolatilityTier,
        }, fetchedAtUtc);
        pendingMetadata[vendor] = {
          vendorConfig,
          previousHash,
          sourceUrl: sourceUrl || priorCandidate?.source_url || "",
        };
        runObservations[vendor] = {
          baselineVotes: 0,
          hashVotes: { [h]: 1 },
          hashProfiles: { [h]: semanticProfile },
        };
    },
    {
      afterTask: async () => {
        await sleep(250 + jitter(350));
      },
    }
  );

  const sameRunRecheckPasses = getSameRunRecheckPasses();
  const sameRunRecheckDelayMs = getSameRunRecheckDelayMs();
  const sameRunRecheckBatchSize = getSameRunRecheckBatchSize(batchSize);
  for (let pass = 0; pass < sameRunRecheckPasses && pendingSet.size > 0; pass += 1) {
    if (sameRunRecheckDelayMs > 0) {
      await sleep(sameRunRecheckDelayMs + jitter(Math.min(400, sameRunRecheckDelayMs)));
    }

    const vendorsToRecheck = [...pendingSet];
    for (let i = 0; i < vendorsToRecheck.length; i += sameRunRecheckBatchSize) {
      const batch = vendorsToRecheck.slice(i, i + sameRunRecheckBatchSize);
      await Promise.all(
        batch.map(async (vendor) => {
          const metadata = pendingMetadata[vendor];
          const candidate = newCandidates[vendor];
          if (!metadata || !candidate) return;
          if (!runObservations[vendor]) {
            runObservations[vendor] = {
              baselineVotes: 0,
              hashVotes: { [candidate.hash]: 1 },
              hashProfiles: candidate.hash && candidate.profile
                ? { [candidate.hash]: candidate.profile }
                : {},
            };
          }

          const recheckResult = await fetchWithFallback(
            metadata.vendorConfig,
            { vendor, policyType: name },
            { rawFetchCache, bypassRawFetchCache: true }
          );
          if (!recheckResult.text) {
            recheckFetchFailureSet.add(vendor);
            const coverage = ensureCoverageEntry(vendor);
            const failureReason = recheckResult.error || "request failed";
            const priorFailureStreak = Number(candidate.fetch_failure_streak || coverage.consecutive_fetch_failures || 0);
            const nextFailureStreak = priorFailureStreak + 1;
            const fetchBlockClassification = classifyFetchFailureBlock(failureReason);
            const isFetchBlocked = fetchBlockClassification.immediateBlock || nextFailureStreak >= getFetchFailureQuarantineStreak();
            coverage.last_fetch_failure_utc = utcIsoTimestamp();
            coverage.last_fetch_failure_reason = failureReason;
            if (Array.isArray(recheckResult.attemptedLanes) && recheckResult.attemptedLanes.length > 0) {
              coverage.last_fetch_failure_lanes = recheckResult.attemptedLanes.join(",");
            } else {
              delete coverage.last_fetch_failure_lanes;
            }
            coverage.consecutive_fetch_failures = nextFailureStreak;
            coverage.pending_fetch_blocked = isFetchBlocked;
            if (isFetchBlocked) {
              coverage.pending_fetch_blocked_reason =
                fetchBlockClassification.reason || `consecutive_fetch_failures>=${getFetchFailureQuarantineStreak()}`;
            } else {
              delete coverage.pending_fetch_blocked_reason;
            }
            candidate.fetch_failure_streak = nextFailureStreak;
            candidate.fetch_blocked = isFetchBlocked;
            candidate.fetch_blocked_reason = isFetchBlocked
              ? (fetchBlockClassification.reason || `consecutive_fetch_failures>=${getFetchFailureQuarantineStreak()}`)
              : "";
            candidate.volatility_tier = normalizeVolatilityTier(
              candidate.volatility_tier || coverage.source_volatility_tier || resolveSourceVolatilityTier(metadata.vendorConfig)
            );
            if (isFetchBlocked) {
              upsertBlockedRetryQueueEntry({
                vendor,
                vendorConfig: metadata.vendorConfig,
                sourceUrl: metadata.sourceUrl || candidate.source_url || "",
                blockedReason: coverage.pending_fetch_blocked_reason || failureReason,
                failureAtUtc: String(coverage.last_fetch_failure_utc || utcIsoTimestamp()),
                fetchFailureStreak: nextFailureStreak,
                fallbackProbeResult: {
                  signature: candidate.fallback_probe_signature || "",
                  strongSignature: candidate.fallback_probe_strong_signature || "",
                  sample: coverage.last_fallback_probe_sample || "",
                },
                fallbackSignalConsecutiveRuns: Number(candidate.fallback_signal_consecutive_runs || 0),
                fallbackSignalActionable: Boolean(candidate.fallback_signal_actionable_utc),
              });
            }
            return;
          }

          const fetchedAtUtc = utcIsoTimestamp();
          markSuccessfulFetch(vendor, fetchedAtUtc, recheckResult.fetchLane || "");
          const coverage = ensureCoverageEntry(vendor);
          delete coverage.last_fetch_failure_utc;
          delete coverage.last_fetch_failure_reason;
          delete coverage.last_fetch_failure_lanes;
          coverage.consecutive_fetch_failures = 0;
          coverage.pending_fetch_blocked = false;
          delete coverage.pending_fetch_blocked_reason;
          candidate.fetch_failure_streak = 0;
          candidate.fetch_blocked = false;
          delete candidate.fetch_blocked_reason;
          clearBlockedRetryQueueEntry(vendor);

          const normalized = normalizeFetchedText(recheckResult.text, name, vendor);
          const h = hash(normalized || recheckResult.text);
          const sourceUrl = recheckResult.sourceUrl || metadata.sourceUrl || "";
          const sourceVolatilityTier = getVendorVolatilityTier(metadata.vendorConfig, sourceUrl || "");
          coverage.source_volatility_tier = sourceVolatilityTier;
          candidate.volatility_tier = sourceVolatilityTier;
          if (sourceVolatilityTier === "flaky") {
            flakySourceVendorSet.add(vendor);
          }
          const pageMetadata = extractPageMetadata({
            rawText: recheckResult.text,
            sourceMetadata: recheckResult.sourceMetadata,
          });
          if (pageMetadata.display_last_updated_label) {
            coverage.last_observed_last_updated_label = pageMetadata.display_last_updated_label;
          }
          if (pageMetadata.display_last_updated_date_utc) {
            coverage.last_observed_last_updated_date_utc = pageMetadata.display_last_updated_date_utc;
          }
          if (pageMetadata.source_updated_at_utc) {
            coverage.last_observed_source_updated_at_utc = pageMetadata.source_updated_at_utc;
          }
          const semanticProfile = buildSemanticProfile(normalized || recheckResult.text, name, {
            hash: h,
            sourceUrl,
            extractedAtUtc: fetchedAtUtc,
            pageMetadata,
          });
          const semanticSignature = semanticTokenSignature(semanticProfile);
          const currentChangeKey = buildChangeKey(h, semanticSignature);
          const metadataSignature = String(semanticProfile.metadata_signature || "");
          const quality = assessFetchQuality({
            rawText: recheckResult.text,
            normalizedText: normalized,
            policyType: name,
            vendorKey: vendor,
          });
          if (!quality.passed) {
            qualityGateHeldSet.add(vendor);
            coverage.last_quality_gate_failure_utc = fetchedAtUtc;
            coverage.last_quality_gate_failure_reason = quality.reason;
            candidate.quality_gate_failures = Number(candidate.quality_gate_failures || 0) + 1;
            candidate.quality_gate_last_reason = quality.reason;
            candidate.quality_gate_last_observed_utc = fetchedAtUtc;
            candidate.quality_gate_policy_hits = quality.policyKeywordHits;
            candidate.quality_gate_lines = quality.lineCount;
            candidate.quality_gate_chars = quality.normalizedLength;
            candidate.metadata_signature = metadataSignature;
            newCandidates[vendor] = candidate;
            return;
          }
          delete coverage.last_quality_gate_failure_utc;
          delete coverage.last_quality_gate_failure_reason;
          candidate.quality_gate_passes = Number(candidate.quality_gate_passes || 0) + 1;
          candidate.quality_gate_last_reason = "";
          candidate.quality_gate_last_observed_utc = fetchedAtUtc;
          candidate.quality_gate_policy_hits = quality.policyKeywordHits;
          candidate.quality_gate_lines = quality.lineCount;
          candidate.quality_gate_chars = quality.normalizedLength;
          candidate.metadata_signature = metadataSignature;
          const observations = runObservations[vendor];
          if (h === metadata.previousHash) {
            observations.baselineVotes = Number(observations.baselineVotes || 0) + 1;
          } else {
            observations.hashVotes[h] = Number(observations.hashVotes[h] || 0) + 1;
            if (!observations.hashProfiles || typeof observations.hashProfiles !== "object") {
              observations.hashProfiles = {};
            }
            observations.hashProfiles[h] = semanticProfile;
          }

          const majorityDecision = getRunMajorityDecision(observations);
          if (majorityDecision?.type === "baseline") {
            delete newCandidates[vendor];
            pendingSet.delete(vendor);
            recheckResolvedSet.add(vendor);
            return;
          }
          if (majorityDecision?.type === "hash" && majorityDecision.hash) {
            const previousCandidateHash = candidate.hash;
            const previousCandidateChangeKey = getCandidateChangeKey(candidate, {
              hash: previousCandidateHash,
              semanticSignature: typeof candidate.semantic_signature === "string" ? candidate.semantic_signature : "",
            });
            candidate.hash = majorityDecision.hash;
            candidate.profile =
              observations.hashProfiles?.[majorityDecision.hash] || candidate.profile || semanticProfile;
            const majoritySemanticSignature = semanticTokenSignature(candidate.profile);
            const majorityChangeKey = buildChangeKey(candidate.hash, majoritySemanticSignature);
            candidate.count = Math.max(Number(candidate.count || 1), Number(majorityDecision.winnerVotes || 1));
            candidate.last_seen_utc = fetchedAtUtc;
            if (sourceUrl) candidate.source_url = sourceUrl;
            candidate.run_confirmations = previousCandidateHash === majorityDecision.hash
              ? Math.max(
                Number(candidate.run_confirmations || 1),
                Number(majorityDecision.winnerVotes || 1)
              )
              : 1;
            candidate.semantic_signature = majoritySemanticSignature;
            candidate.semantic_run_confirmations = previousCandidateHash === majorityDecision.hash
              ? Math.max(
                Number(candidate.semantic_run_confirmations || 1),
                Number(majorityDecision.winnerVotes || 1)
              )
              : 1;
            if (
              previousCandidateHash !== majorityDecision.hash &&
              previousCandidateChangeKey &&
              previousCandidateChangeKey !== majorityChangeKey
            ) {
              candidate.flip_count = Number(candidate.flip_count || 0) + 1;
            }
            candidate.change_key = majorityChangeKey;
            candidate.metadata_signature = String(candidate.profile?.metadata_signature || candidate.metadata_signature || "");
            candidate.signal_window_hash_decision = majorityChangeKey;
            candidate.signal_window_change_decision = majorityChangeKey;
            candidate.signal_window_top_hash_votes = Number(majorityDecision.winnerVotes || candidate.signal_window_top_hash_votes || 0);
            candidate.signal_window_required_votes = Number(
              majorityDecision.requiredVotes || candidate.signal_window_required_votes || getCrossRunWindowRequired()
            );
            const parsedConfirmRuns = Number(
              candidate.metadata_confirm_runs_required ||
              candidate.actual_confirm_runs_required ||
              getActualConfirmRunsForVendor(
                metadata.vendorConfig,
                vendor,
                candidate.volatility_tier || coverage.source_volatility_tier || "normal"
              )
            );
            const metadataConfirmRunsRequired = Number.isFinite(parsedConfirmRuns)
              ? Math.max(1, Math.floor(parsedConfirmRuns))
              : getActualConfirmRunsForVendor(
                metadata.vendorConfig,
                vendor,
                candidate.volatility_tier || coverage.source_volatility_tier || "normal"
              );
            const hasSemanticEvidence = Boolean(candidate.semantic_signature);
            const semanticConfirmReady =
              !hasSemanticEvidence || Number(candidate.semantic_run_confirmations || 0) >= metadataConfirmRunsRequired;
            const signalWindowDecision = getCandidateSignalWindowDecision(candidate);
            const signalWindowConfirmed =
              Boolean(signalWindowDecision) &&
              Boolean(candidate.change_key) &&
              signalWindowDecision === candidate.change_key;
            if (
              Number(candidate.run_confirmations || 0) >= metadataConfirmRunsRequired &&
              semanticConfirmReady &&
              signalWindowConfirmed
            ) {
              registerConfirmedChange({
                vendor,
                vendorConfig: metadata.vendorConfig,
                sourceUrl: sourceUrl || candidate.source_url || metadata.sourceUrl || "",
                confirmedHash: candidate.hash,
                confirmedProfile: candidate.profile || semanticProfile,
                confirmedAtUtc: fetchedAtUtc,
              });
              newHashes[vendor] = candidate.hash;
              delete newCandidates[vendor];
              pendingSet.delete(vendor);
              recheckConfirmedSet.add(vendor);
              crossRunWindowConfirmedSet.add(vendor);
              return;
            }
            newCandidates[vendor] = candidate;
            return;
          }

          if (h === metadata.previousHash) {
            delete newCandidates[vendor];
            pendingSet.delete(vendor);
            recheckResolvedSet.add(vendor);
            return;
          }

          const previousCandidateChangeKey = getCandidateChangeKey(candidate, {
            hash: typeof candidate.hash === "string" ? candidate.hash : "",
            semanticSignature: typeof candidate.semantic_signature === "string" ? candidate.semantic_signature : "",
          });
          if (candidate.hash === h) {
            candidate.count = Number(candidate.count || 1) + 1;
            candidate.semantic_signature = semanticSignature;
            candidate.change_key = currentChangeKey;
            candidate.metadata_signature = metadataSignature;
          } else {
            candidate.hash = h;
            candidate.count = 1;
            if (previousCandidateChangeKey && previousCandidateChangeKey !== currentChangeKey) {
              candidate.flip_count = Number(candidate.flip_count || 0) + 1;
            }
            candidate.pending_since_utc = getCandidatePendingSinceUtc(candidate) || fetchedAtUtc;
            candidate.first_seen_utc = utcIsoTimestamp();
            candidate.profile = semanticProfile;
            candidate.semantic_signature = semanticSignature;
            candidate.change_key = currentChangeKey;
            candidate.semantic_run_confirmations = 1;
            candidate.metadata_signature = metadataSignature;
          }
          candidate.pending_since_utc = getCandidatePendingSinceUtc(candidate) || fetchedAtUtc;
          candidate.profile = candidate.hash === h ? semanticProfile : candidate.profile;
          candidate.semantic_signature = candidate.hash === h ? semanticSignature : candidate.semantic_signature;
          candidate.change_key = buildChangeKey(candidate.hash, candidate.semantic_signature);
          candidate.metadata_signature = candidate.hash === h ? metadataSignature : candidate.metadata_signature;
          if (sourceUrl) candidate.source_url = sourceUrl;
          candidate.last_seen_utc = fetchedAtUtc;
          candidate.run_confirmations = Number(candidate.run_confirmations || 1);
          candidate.semantic_run_confirmations = Number(candidate.semantic_run_confirmations || 1);
          candidate.fetch_failure_streak = 0;
          candidate.fetch_blocked = false;

          newCandidates[vendor] = candidate;
        })
      );
      if (i + sameRunRecheckBatchSize < vendorsToRecheck.length) {
        await sleep(180 + jitter(220));
      }
    }
  }

  const pending = [...pendingSet].sort((a, b) => a.localeCompare(b));
  const stalePending = [];
  const volatilePending = [];
  const volatileFlipOverrides = {};
  const escalatedPending = [];
  const escalatedReasons = {};
  const escalationFlipOverrides = {};
  const coverageGaps = [];
  const fetchBlockedPending = [];
  const legacyPending = [];
  const fetchBlockedSet = new Set();
  const summaryNowMs = Date.now();
  for (const [vendor, candidate] of Object.entries(newCandidates)) {
    const coverage = ensureCoverageEntry(vendor);
    const pendingModelId = getCandidatePendingModelId(candidate);
    const legacyPendingCandidate = isLegacyPendingCandidate(candidate);
    const configuredVendorConfig = sources?.vendors?.[vendor];
    const sourceVolatilityTier = normalizeVolatilityTier(
      candidate?.volatility_tier ||
        coverage.source_volatility_tier ||
        resolveSourceVolatilityTier(
          configuredVendorConfig,
          candidate?.source_url || coverage.last_pending_source_url || ""
        )
    );
    coverage.source_volatility_tier = sourceVolatilityTier;
    if (sourceVolatilityTier === "flaky") {
      flakySourceVendorSet.add(vendor);
    }
    const ageDays = getCandidateAgeDays(candidate, summaryNowMs);
    const flipCount = Number(candidate?.flip_count || 0);
    const recentFlipCount = countSignalWindowChangeFlips(coverage.signal_window);
    const hasRecentSignalFlip = recentFlipCount > 0;
    const candidateChangeKey = getCandidateChangeKey(candidate);
    const fetchFailureStreak = Number(
      candidate?.fetch_failure_streak || coverage.consecutive_fetch_failures || 0
    );
    const fetchBlockClassification = classifyFetchFailureBlock(coverage.last_fetch_failure_reason);
    const isFetchBlocked = Boolean(candidate?.fetch_blocked) ||
      fetchBlockClassification.immediateBlock ||
      fetchFailureStreak >= getFetchFailureQuarantineStreak();
    coverage.pending_model_id = pendingModelId;
    coverage.pending_model_first_observed_utc = getPendingModelFirstObservedUtc(candidate, coverage.pending_model_first_observed_utc || "");
    const escalationFlipConfig = getEscalationFlipThresholdForVendor(name, vendor, sourceVolatilityTier);
    const volatileFlipConfig = getVolatileFlipThresholdForVendor(name, vendor, sourceVolatilityTier);
    if (escalationFlipConfig.overridden) {
      escalationFlipOverrides[vendor] = {
        threshold: escalationFlipConfig.threshold,
        flipCount,
      };
    }
    if (volatileFlipConfig.overridden) {
      volatileFlipOverrides[vendor] = {
        threshold: volatileFlipConfig.threshold,
        flipCount,
      };
    }
    coverage.last_pending_seen_utc = utcIsoTimestamp();
    coverage.last_pending_age_days = ageDays;
    coverage.last_pending_flip_count = flipCount;
    coverage.last_pending_recent_flip_count = recentFlipCount;
    coverage.last_pending_source_url = candidate?.source_url || coverage.last_pending_source_url || "";
    coverage.last_pending_change_key = candidateChangeKey || coverage.last_pending_change_key || "";
    coverage.pending_fetch_failure_streak = fetchFailureStreak;
    if (legacyPendingCandidate) {
      coverage.pending_legacy = true;
      coverage.pending_fetch_blocked = false;
      delete coverage.pending_fetch_blocked_reason;
      coverage.last_pending_bucket = "legacy_pending";
      legacyPending.push(vendor);
      continue;
    }
    coverage.pending_legacy = false;
    if (isFetchBlocked) {
      fetchBlockedPending.push(vendor);
      fetchBlockedSet.add(vendor);
      coverage.pending_fetch_blocked = true;
      coverage.last_pending_bucket = "fetch_blocked_pending";
      coverage.pending_fetch_blocked_reason =
        candidate?.fetch_blocked_reason ||
        fetchBlockClassification.reason ||
        `consecutive_fetch_failures>=${getFetchFailureQuarantineStreak()}`;
      continue;
    }
    coverage.pending_fetch_blocked = false;
    delete coverage.pending_fetch_blocked_reason;
    coverage.last_pending_bucket = "active_pending";

    if (ageDays >= getStalePendingDays()) {
      stalePending.push(vendor);
    }
    const volatileRequiresRecentFlip = getVolatileRequireRecentFlip();
    const hasVolatileFlipSignal =
      flipCount >= volatileFlipConfig.threshold &&
      (!volatileRequiresRecentFlip || hasRecentSignalFlip);
    if (hasVolatileFlipSignal) {
      volatilePending.push(vendor);
    }

    const ageEscalationThreshold = getEscalationPendingDays();
    const hasEscalationAge = ageDays >= ageEscalationThreshold;
    const escalationRequiresRecentFlip = getEscalationRequireRecentFlip();
    const hasEscalationFlip =
      flipCount >= escalationFlipConfig.threshold &&
      (!escalationRequiresRecentFlip || hasRecentSignalFlip);
    const signalWindowDecision = getCandidateSignalWindowDecision(candidate);
    const hasEscalationSignalSupport =
      Boolean(signalWindowDecision) &&
      Boolean(candidateChangeKey) &&
      signalWindowDecision === candidateChangeKey;
    const escalationReasons = [];
    if (hasEscalationAge) {
      escalationReasons.push(`pending_age_days>=${ageEscalationThreshold}`);
    }
    if (hasEscalationFlip) {
      escalationReasons.push(
        escalationFlipConfig.overridden
          ? `flip_count>=${escalationFlipConfig.threshold}(override)`
          : `flip_count>=${escalationFlipConfig.threshold}`
      );
    }
    if (flipCount >= escalationFlipConfig.threshold && escalationRequiresRecentFlip && !hasRecentSignalFlip) {
      escalationReasons.push("recent_flip_required");
    }
    if (hasEscalationSignalSupport) {
      escalationReasons.push("cross_run_signal_confirmed");
    }
    if (hasEscalationAge && hasEscalationFlip && hasEscalationSignalSupport) {
      escalatedPending.push(vendor);
      escalatedReasons[vendor] = escalationReasons.join("&");
      coverage.last_escalated_utc = utcIsoTimestamp();
    }

    const pendingSinceMs = toMsOrNaN(getCandidatePendingSinceUtc(candidate));
    const lastConfirmedMs = toMsOrNaN(coverage?.last_confirmed_change_utc);
    const lastEscalatedMs = toMsOrNaN(coverage?.last_escalated_utc);
    const resolutionMs = [lastConfirmedMs, lastEscalatedMs].filter((value) => Number.isFinite(value));
    const latestResolutionMs = resolutionMs.length > 0 ? Math.max(...resolutionMs) : Number.NaN;
    if (
      ageDays >= getNoConfirmEscalationDays() &&
      Number.isFinite(pendingSinceMs) &&
      (!Number.isFinite(latestResolutionMs) || latestResolutionMs < pendingSinceMs)
    ) {
      coverageGaps.push(vendor);
    }
  }
  fetchBlockedPending.sort((a, b) => a.localeCompare(b));
  legacyPending.sort((a, b) => a.localeCompare(b));
  const actionablePending = pending.filter((vendor) => !fetchBlockedSet.has(vendor));
  stalePending.sort((a, b) => a.localeCompare(b));
  volatilePending.sort((a, b) => a.localeCompare(b));
  escalatedPending.sort((a, b) => a.localeCompare(b));
  coverageGaps.sort((a, b) => a.localeCompare(b));
  const qualityGateHeldPending = [...qualityGateHeldSet]
    .filter((vendor) => Boolean(newCandidates[vendor]))
    .sort((a, b) => a.localeCompare(b));
  const provisionalVendorSet = new Set([
    ...actionablePending,
    ...fetchBlockedPending,
    ...legacyPending,
    ...errors,
    ...qualityGateHeldPending,
  ]);
  const provisionalVendors = [...provisionalVendorSet].sort((a, b) => a.localeCompare(b));
  const trackedVendorSet = new Set(vendors.map(([vendor]) => vendor));
  for (const queueVendor of Object.keys(newBlockedRetryQueue)) {
    if (!trackedVendorSet.has(queueVendor)) {
      delete newBlockedRetryQueue[queueVendor];
    }
  }
  const blockedRetryQueueVendors = Object.keys(newBlockedRetryQueue).sort((a, b) => a.localeCompare(b));

  const checkedAtUtc = utcIsoTimestamp();
  if (vendors.length > 0 && successfulChecks === 0) {
    console.log(`::warning::No successful checks for ${name}; preserving existing source-check metadata.`);
  } else if (successfulChecks > 0) {
    const monitorMetadata = applyMonitorSourceCheckMetadata(sources, {
      successfulChecks,
      checkedAtUtc,
      hashProfile: HASH_PROFILE_ID,
    });
    Object.assign(sources, monitorMetadata.sources);
    const updatedLastChecked = updateJsonStringField(sourcesPath, "last_checked", sources.last_checked);
    const updatedHashProfile = updateJsonStringField(sourcesPath, "hash_profile", sources.hash_profile);
    if (!updatedLastChecked || !updatedHashProfile) {
      writeFileSync(sourcesPath, JSON.stringify(sources, null, 2) + "\n");
    }
  }

  const retainedPendingVendors = new Set(Object.keys(newCandidates));
  for (const [vendor] of vendors) {
    if (retainedPendingVendors.has(vendor)) continue;
    const coverage = ensureCoverageEntry(vendor);
    coverage.last_pending_age_days = 0;
    coverage.last_pending_flip_count = 0;
    coverage.pending_fetch_blocked = false;
    coverage.pending_fetch_failure_streak = 0;
    delete coverage.pending_legacy;
    delete coverage.pending_fetch_blocked_reason;
    delete coverage.last_pending_source_url;
    delete coverage.last_pending_change_key;
    delete coverage.last_pending_bucket;
    delete coverage.pending_model_id;
    delete coverage.pending_model_first_observed_utc;
  }

  // Write updated hashes and state artifacts.
  writeFileSync(hashesPath, JSON.stringify(newHashes, null, 2) + "\n");
  writeFileSync(candidatesPath, JSON.stringify(newCandidates, null, 2) + "\n");
  writeFileSync(
    semanticPath,
    JSON.stringify(
      {
        updated_utc: checkedAtUtc,
        policy: name,
        hash_profile: HASH_PROFILE_ID,
        vendors: newSemanticProfiles,
      },
      null,
      2
    ) + "\n"
  );
  writeFileSync(
    coveragePath,
    JSON.stringify(
      {
        updated_utc: checkedAtUtc,
        policy: name,
        vendors: coverageVendors,
      },
      null,
      2
    ) + "\n"
  );
  const sortedConfirmedBaselineVendors = Object.fromEntries(
    Object.entries(newConfirmedBaseline)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([vendor, entry]) => [vendor, normalizeConfirmedBaselineEntry(entry)])
  );
  writeFileSync(
    baselinePath,
    JSON.stringify(
      {
        updated_utc: checkedAtUtc,
        policy: name,
        hash_profile: HASH_PROFILE_ID,
        vendors: sortedConfirmedBaselineVendors,
      },
      null,
      2
    ) + "\n"
  );
  const sortedDailyFingerprintVendors = Object.fromEntries(
    Object.entries(newDailyFingerprints)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([vendor, entry]) => [vendor, normalizeDailyFingerprintEntry(entry)])
  );
  writeFileSync(
    dailyFingerprintPath,
    JSON.stringify(
      {
        schema_version: 1,
        updated_utc: checkedAtUtc,
        date_utc: runDateUtc,
        policy: name,
        hash_profile: HASH_PROFILE_ID,
        vendors: sortedDailyFingerprintVendors,
      },
      null,
      2
    ) + "\n"
  );
  const sortedBlockedRetryVendors = Object.fromEntries(
    Object.entries(newBlockedRetryQueue)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([vendor, entry]) => [vendor, normalizeBlockedRetryEntry(entry)])
  );
  writeFileSync(
    blockedRetryPath,
    JSON.stringify(
      {
        schema_version: 1,
        updated_utc: checkedAtUtc,
        date_utc: runDateUtc,
        policy: name,
        vendors: sortedBlockedRetryVendors,
      },
      null,
      2
    ) + "\n"
  );

  const materialByVendor = new Map(materialChanged.map((entry) => [entry.vendor, entry]));
  const observedByVendor = new Map(observedChanged.map((entry) => [entry.vendor, entry]));
  const errorSet = new Set(errors);
  const pendingSetForReport = new Set(actionablePending);
  const fetchBlockedSetForReport = new Set(fetchBlockedPending);
  const legacyPendingSetForReport = new Set(legacyPending);
  const qualityHeldSetForReport = new Set(qualityGateHeldPending);
  const staleSetForReport = new Set(stalePending);
  const volatileSetForReport = new Set(volatilePending);
  const escalatedSetForReport = new Set(escalatedPending);
  const fallbackProbeSetForReport = new Set(fallbackProbeAvailableSet);
  const fallbackSignalSetForReport = new Set(fallbackSignalChangedSet);
  const fallbackSignalActionableSetForReport = new Set(fallbackSignalActionableSet);

  const vendorStatusRows = vendors
    .map(([vendor, vendorConfig]) => {
      const coverage = ensureCoverageEntry(vendor);
      const candidate = newCandidates[vendor];
      const materialEntry = materialByVendor.get(vendor);
      const observedEntry = observedByVendor.get(vendor);
      const sourceVolatilityTier = normalizeVolatilityTier(
        candidate?.volatility_tier ||
          coverage.source_volatility_tier ||
          resolveSourceVolatilityTier(vendorConfig, candidate?.source_url || coverage.last_pending_source_url || "")
      );
      let status = "unchanged";
      const reasonParts = [];
      const flags = [];

      if (fetchBlockedSetForReport.has(vendor)) {
        status = "fetch_blocked";
        reasonParts.push(
          String(
            coverage.pending_fetch_blocked_reason ||
            coverage.last_fetch_failure_reason ||
            errorReasons[vendor] ||
            "fetch blocked"
          )
        );
      } else if (errorSet.has(vendor)) {
        status = "fetch_failed";
        reasonParts.push(String(errorReasons[vendor] || coverage.last_fetch_failure_reason || "fetch failed"));
      } else if (materialEntry) {
        status = "confirmed_changed";
        reasonParts.push(String(materialEntry.semantic_diff_summary || "material semantic change confirmed"));
      } else if (pendingSetForReport.has(vendor)) {
        status = "pending_confirmation";
        if (candidate && typeof candidate === "object") {
          const runConfirmations = Number(candidate.run_confirmations || 0);
          const runsRequired = Number(
            candidate.metadata_confirm_runs_required || candidate.actual_confirm_runs_required || getActualConfirmRuns()
          );
          const signalWindowVotes = Number(candidate.signal_window_top_hash_votes || 0);
          const signalWindowRequired = Number(candidate.signal_window_required_votes || getCrossRunWindowRequired());
          reasonParts.push(
            `awaiting confirmation (${runConfirmations}/${runsRequired} runs, signal_window ${signalWindowVotes}/${signalWindowRequired})`
          );
        } else {
          reasonParts.push("awaiting cross-run confirmation");
        }
      } else if (legacyPendingSetForReport.has(vendor)) {
        status = "legacy_pending";
        reasonParts.push(`legacy pending candidate (${LEGACY_PENDING_MODEL_ID})`);
      } else if (qualityHeldSetForReport.has(vendor)) {
        status = "quality_gate_held";
        reasonParts.push(String(coverage.last_quality_gate_failure_reason || "quality gate held"));
      } else if (observedEntry) {
        status = "observed_non_material";
        reasonParts.push("observed page-content update without material semantic change");
      } else {
        reasonParts.push("no material policy update observed");
      }

      if (staleSetForReport.has(vendor)) reasonParts.push("stale_pending");
      if (staleSetForReport.has(vendor)) flags.push("stale_pending");
      if (volatileSetForReport.has(vendor)) {
        reasonParts.push("volatile_pending");
        flags.push("volatile_pending");
      }
      if (escalatedSetForReport.has(vendor)) {
        reasonParts.push("escalation_candidate");
        flags.push("escalation_candidate");
      }
      if (fallbackProbeSetForReport.has(vendor)) {
        reasonParts.push("fallback_probe_available");
        flags.push("fallback_probe_available");
      }
      if (fallbackSignalSetForReport.has(vendor)) {
        reasonParts.push("fallback_metadata_changed");
        flags.push("fallback_metadata_changed");
      }
      if (fallbackSignalActionableSetForReport.has(vendor)) {
        reasonParts.push(`fallback_signal_actionable(${getFallbackSignalConsecutiveRuns()}+ blocked runs)`);
        flags.push("fallback_signal_actionable");
      }
      if (sourceVolatilityTier === "flaky") {
        reasonParts.push("source_volatility_tier:flaky");
        flags.push("flaky_source");
      }

      const statusOrder = {
        confirmed_changed: 1,
        pending_confirmation: 2,
        legacy_pending: 3,
        quality_gate_held: 4,
        fetch_blocked: 5,
        fetch_failed: 6,
        observed_non_material: 7,
        unchanged: 8,
      };

      return {
        policy: name,
        vendor,
        status,
        status_order: Number(statusOrder[status] || 99),
        reason: reasonParts.filter(Boolean).join("; "),
        flags,
        source_url:
          typeof vendorConfig?.url === "string"
            ? vendorConfig.url
            : (typeof vendorConfig === "string" ? vendorConfig : ""),
        source_volatility_tier: sourceVolatilityTier,
        last_successful_fetch_utc: String(coverage.last_successful_fetch_utc || ""),
        last_confirmed_change_utc: String(coverage.last_confirmed_change_utc || ""),
        last_runtime_evidence_reset_utc: String(coverage.last_runtime_evidence_reset_utc || ""),
        pending_candidate: Boolean(candidate),
        quality_gate_failed: Boolean(coverage.last_quality_gate_failure_utc),
        last_fetch_failure_utc: String(coverage.last_fetch_failure_utc || ""),
        last_fetch_failure_reason: String(coverage.last_fetch_failure_reason || ""),
      };
    })
    .sort((a, b) => a.vendor.localeCompare(b.vendor));

  return {
    name,
    vendorKeys: vendors.map(([vendor]) => vendor).sort((a, b) => a.localeCompare(b)),
    observedChanged,
    materialChanged,
    materialRepeatSuppressed,
    materialVersionRepeatSuppressed,
    materialOscillationSuppressed,
    pending: actionablePending,
    fetchBlockedPending,
    errors,
    errorReasons,
    rulesFile,
    successfulChecks,
    totalChecks: vendors.length,
    staleDropped,
    rebaselineForProfile,
    stalePending,
    volatilePending,
    volatileFlipOverrides,
    recheckConfirmed: [...recheckConfirmedSet].sort((a, b) => a.localeCompare(b)),
    recheckResolved: [...recheckResolvedSet].sort((a, b) => a.localeCompare(b)),
    recheckFetchFailures: [...recheckFetchFailureSet].sort((a, b) => a.localeCompare(b)),
    crossRunWindowConfirmed: [...crossRunWindowConfirmedSet].sort((a, b) => a.localeCompare(b)),
    crossRunWindowHeld: [...crossRunWindowHeldSet].sort((a, b) => a.localeCompare(b)),
    adaptiveWindowRelaxed: [...adaptiveWindowRelaxedSet].sort((a, b) => a.localeCompare(b)),
    metadataStabilityHeld: [...metadataStabilityHeldSet].sort((a, b) => a.localeCompare(b)),
    noiseSuppressed: [...noiseSuppressedSet].sort((a, b) => a.localeCompare(b)),
    escalatedPending,
    escalatedReasons,
    escalationFlipOverrides,
    coverageGaps,
    qualityGateHeld: qualityGateHeldPending,
    legacyPending,
    provisionalVendors,
    blockedRetryLaneVendors,
    blockedRetryQueueVendors,
    blockedRetryQueueEntries: sortedBlockedRetryVendors,
    flakySourceVendors: [...flakySourceVendorSet].sort((a, b) => a.localeCompare(b)),
    fallbackProbeAvailable: [...fallbackProbeAvailableSet].sort((a, b) => a.localeCompare(b)),
    fallbackSignalChanged: [...fallbackSignalChangedSet].sort((a, b) => a.localeCompare(b)),
    fallbackSignalActionable: [...fallbackSignalActionableSet].sort((a, b) => a.localeCompare(b)),
    sourceMigrationResets: [...sourceMigrationResetSet].sort((a, b) => a.localeCompare(b)),
    vendorStatusRows,
  };
}

async function main() {
  const supabaseConfig = getPolicySupabaseConfig();
  const supabaseStateHydrateResult = await hydratePolicyStateArtifactsFromSupabase(supabaseConfig);
  if (supabaseStateHydrateResult.enabled && !supabaseStateHydrateResult.ok) {
    throw new Error(`Policy state hydration failed: ${supabaseStateHydrateResult.error}`);
  }
  if (supabaseStateHydrateResult.enabled && supabaseStateHydrateResult.hydrated_count > 0) {
    console.log(
      `::notice::Supabase state hydrate restored ${supabaseStateHydrateResult.hydrated_count} artifact(s) (missing=${supabaseStateHydrateResult.missing_count}).`
    );
  }

  const tier1Config = loadTier1VendorsConfig();
  const allObservedChanged = [];
  const allMaterialChanged = [];
  const allMaterialRepeatSuppressed = [];
  const allMaterialVersionRepeatSuppressed = [];
  const allMaterialOscillationSuppressed = [];
  const allQualityGateHeld = [];
  const allMetadataStabilityHeld = [];
  const allAdaptiveWindowRelaxed = [];
  const allNoiseSuppressed = [];
  const allErrors = [];
  const allFallbackProbeAvailable = [];
  const allFallbackSignalChanged = [];
  const allFallbackSignalActionable = [];
  const allSourceMigrationResets = [];
  const allPending = [];
  const allFetchBlockedPending = [];
  const allLegacyPending = [];
  const allStalePending = [];
  const allVolatilePending = [];
  const allEscalatedPending = [];
  const allCoverageGaps = [];
  const allProvisional = [];
  const allBlockedRetryLane = [];
  const allBlockedRetryQueue = [];
  const allFlakySources = [];
  const allTier1Failed = [];
  const allTier1MissingConfigured = [];
  const allVendorStatusRows = [];
  const pendingDetailByPolicy = {};
  const escalationDetailByPolicy = {};
  const tier1ByPolicy = {};
  const uniqueVendorCoverage = new Map();
  const rawFetchCache = createSuccessfulFetchCache();
  const blockedFetchCache = createBlockedFetchReuseCache();

  for (const policySet of POLICY_SETS) {
    const result = await checkPolicySet({ ...policySet, rawFetchCache, blockedFetchCache });
    const tier1Target = getTier1TargetForPolicy(result.name, result.vendorKeys || [], tier1Config);
    const errorSet = new Set(result.errors || []);
    for (const vendor of result.vendorKeys || []) {
      const existing = uniqueVendorCoverage.get(vendor) || { totalPolicies: new Set(), fetchedPolicies: new Set() };
      existing.totalPolicies.add(result.name);
      if (!errorSet.has(vendor)) {
        existing.fetchedPolicies.add(result.name);
      }
      uniqueVendorCoverage.set(vendor, existing);
    }
    const tier1FailedVendors = tier1Target.target.filter((vendor) => errorSet.has(vendor));
    const tier1FetchedVendors = tier1Target.target.filter((vendor) => !errorSet.has(vendor));
    tier1ByPolicy[result.name] = {
      total: tier1Target.target.length,
      fetched: tier1FetchedVendors.length,
      failed: tier1FailedVendors.length,
    };
    for (const vendor of tier1FailedVendors) {
      allTier1Failed.push({ policyType: result.name, vendor });
    }
    for (const vendor of tier1Target.missingConfigured) {
      allTier1MissingConfigured.push({ policyType: result.name, vendor });
    }
    if (tier1FailedVendors.length > 0) {
      console.log(
        `::notice::${result.name}: tier1_failed=${tier1FailedVendors.length}; vendors: ${tier1FailedVendors.join(", ")}`
      );
    }

    if (result.errors.length > 0) {
      console.log(`::warning::Could not fetch ${result.errors.length} ${result.name} vendor(s): ${result.errors.join(", ")}`);
      const detailLimit = Number.isFinite(CHECKER_CONFIG.errorDetailLimit) && CHECKER_CONFIG.errorDetailLimit > 0
        ? CHECKER_CONFIG.errorDetailLimit
        : 12;
      for (const vendor of result.errors.slice(0, detailLimit)) {
        if (result.errorReasons[vendor]) {
          console.log(`::notice::${result.name}:${vendor} -> ${result.errorReasons[vendor]}`);
        }
      }
      if (result.errors.length > detailLimit) {
        console.log(
          `::notice::${result.name}: ${result.errors.length - detailLimit} additional vendor fetch failures omitted from detailed output.`
        );
      }
      allErrors.push(...result.errors.map((vendor) => ({ policyType: result.name, vendor })));
    }
    if (result.fallbackProbeAvailable.length > 0) {
      const names = sortedLimitedVendors(result.fallbackProbeAvailable, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: fallback_probe_available=${result.fallbackProbeAvailable.length} (HEAD metadata captured while full-content fetch failed); first ${names.length}: ${names.join(", ")}`
      );
    }
    if (result.fallbackSignalChanged.length > 0) {
      const names = sortedLimitedVendors(result.fallbackSignalChanged, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: fallback_signal_changed=${result.fallbackSignalChanged.length} (metadata changed while full content was unavailable; signal-only, not auto-confirmed); first ${names.length}: ${names.join(", ")}`
      );
    }
    if (result.fallbackSignalActionable.length > 0) {
      const names = sortedLimitedVendors(result.fallbackSignalActionable, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: fallback_signal_actionable=${result.fallbackSignalActionable.length} (strong metadata changed in ${getFallbackSignalConsecutiveRuns()}+ consecutive blocked runs); first ${names.length}: ${names.join(", ")}`
      );
    }
    if (result.pending.length > 0) {
      console.log(
        `::notice::${result.name}: ${result.pending.length} candidate change(s) observed; waiting for confirmation in next run.`
      );
      const pendingNames = sortedLimitedVendors(result.pending, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: pending vendors (first ${pendingNames.length}): ${pendingNames.join(", ")}`
      );
    }
    if (result.legacyPending.length > 0) {
      const legacyNames = sortedLimitedVendors(result.legacyPending, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: legacy_pending=${result.legacyPending.length} (predates ${PENDING_MODEL_ID}; excluded from primary pending metrics until reobserved); first ${legacyNames.length}: ${legacyNames.join(", ")}`
      );
    }
    if (result.fetchBlockedPending.length > 0) {
      const blockedNames = sortedLimitedVendors(result.fetchBlockedPending, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: fetch_blocked_pending=${result.fetchBlockedPending.length} (consecutive_fetch_failures>=${getFetchFailureQuarantineStreak()}); first ${blockedNames.length}: ${blockedNames.join(", ")}`
      );
    }
    if (result.blockedRetryLaneVendors.length > 0) {
      const laneNames = sortedLimitedVendors(result.blockedRetryLaneVendors, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: blocked_retry_lane=${result.blockedRetryLaneVendors.length} (scheduled after healthy vendors); first ${laneNames.length}: ${laneNames.join(", ")}`
      );
    }
    if (result.blockedRetryQueueVendors.length > 0) {
      const queueNames = sortedLimitedVendors(result.blockedRetryQueueVendors, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: blocked_retry_queue=${result.blockedRetryQueueVendors.length}; first ${queueNames.length}: ${queueNames.join(", ")}`
      );
    }
    if (result.recheckConfirmed.length > 0 || result.recheckResolved.length > 0 || result.recheckFetchFailures.length > 0) {
      console.log(
        `::notice::${result.name}: same_run_recheck confirmed=${result.recheckConfirmed.length}, resolved=${result.recheckResolved.length}, fetch_failures=${result.recheckFetchFailures.length}.`
      );
    }
    if (result.recheckConfirmed.length > 0) {
      const confirmedNames = sortedLimitedVendors(result.recheckConfirmed, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: recheck_confirmed vendors (first ${confirmedNames.length}): ${confirmedNames.join(", ")}`
      );
    }
    if (result.recheckResolved.length > 0) {
      const resolvedNames = sortedLimitedVendors(result.recheckResolved, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: recheck_resolved_to_baseline vendors (first ${resolvedNames.length}): ${resolvedNames.join(", ")}`
      );
    }
    if (result.recheckFetchFailures.length > 0) {
      const failureNames = sortedLimitedVendors(result.recheckFetchFailures, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: recheck_fetch_failures vendors (first ${failureNames.length}): ${failureNames.join(", ")}`
      );
    }
    if (result.crossRunWindowConfirmed.length > 0) {
      const names = sortedLimitedVendors(result.crossRunWindowConfirmed, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: stable_change_confirmed=${result.crossRunWindowConfirmed.length} (required_runs>=${getActualConfirmRuns()}, min_gap_hours>=${getActualMinGapHours()}, window_required>=${getCrossRunWindowRequirementLabel()}); first ${names.length}: ${names.join(", ")}`
      );
    }
    if (result.crossRunWindowHeld.length > 0) {
      const names = sortedLimitedVendors(result.crossRunWindowHeld, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: stability_held_pending=${result.crossRunWindowHeld.length} (gap/window/semantic stability checks not yet met); first ${names.length}: ${names.join(", ")}`
      );
    }
    if (result.metadataStabilityHeld.length > 0) {
      const names = sortedLimitedVendors(result.metadataStabilityHeld, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: metadata_stability_held=${result.metadataStabilityHeld.length} (semantic changed while metadata signature stayed stable; extra confirm run required); first ${names.length}: ${names.join(", ")}`
      );
    }
    if (result.noiseSuppressed.length > 0) {
      const names = sortedLimitedVendors(result.noiseSuppressed, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: noise_suppressed=${result.noiseSuppressed.length} (hash changed but semantic meaning stayed stable); first ${names.length}: ${names.join(", ")}`
      );
    }
    if (result.adaptiveWindowRelaxed.length > 0) {
      const relaxedWindowRequired = Math.min(getCrossRunWindowRequired(), getHighSignalWindowRequired());
      const names = sortedLimitedVendors(result.adaptiveWindowRelaxed, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: adaptive_window_relaxed=${result.adaptiveWindowRelaxed.length} (high-signal candidate window uses ${relaxedWindowRequired} of default ${getCrossRunWindowRequired()}); first ${names.length}: ${names.join(", ")}`
      );
    }
    if (result.staleDropped.length > 0) {
      console.log(
        `::notice::${result.name}: stale_pending_dropped=${result.staleDropped.length} (older than ${getCandidateTtlDays()} day(s)).`
      );
    }
    if (result.sourceMigrationResets.length > 0) {
      const names = sortedLimitedVendors(result.sourceMigrationResets, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: source_migration_resets=${result.sourceMigrationResets.length} (primary source URL changed; cleared pending/flip history); first ${names.length}: ${names.join(", ")}`
      );
    }
    if (result.stalePending.length > 0) {
      const staleNames = sortedLimitedVendors(result.stalePending, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: stale_pending=${result.stalePending.length} (>=${getStalePendingDays()} day(s)); first ${staleNames.length}: ${staleNames.join(", ")}`
      );
    }
    if (result.volatilePending.length > 0) {
      const volatileNames = sortedLimitedVendors(result.volatilePending, getPendingDetailLimit());
      const volatileRule = getVolatileRequireRecentFlip()
        ? `change_key_flip_count>=${getVolatileFlipThreshold()} with recent_signal_flip>0`
        : `change_key_flip_count>=${getVolatileFlipThreshold()}`;
      console.log(
        `::notice::${result.name}: volatile_pending=${result.volatilePending.length} (${volatileRule}); first ${volatileNames.length}: ${volatileNames.join(", ")}`
      );
    }
    const volatileOverrideEntries = Object.entries(result.volatileFlipOverrides || {});
    if (volatileOverrideEntries.length > 0) {
      const sampledOverrideEntries = volatileOverrideEntries
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(0, getPendingDetailLimit())
        .map(([vendor, details]) => `${vendor}(flip=${details.flipCount},threshold=${details.threshold})`);
      console.log(
        `::notice::${result.name}: volatile_flip_threshold_override_applied=${volatileOverrideEntries.length}; first ${sampledOverrideEntries.length}: ${sampledOverrideEntries.join(", ")}`
      );
    }
    const escalationOverrideEntries = Object.entries(result.escalationFlipOverrides || {});
    if (escalationOverrideEntries.length > 0) {
      const sampledOverrideEntries = escalationOverrideEntries
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(0, getPendingDetailLimit())
        .map(([vendor, details]) => `${vendor}(flip=${details.flipCount},threshold=${details.threshold})`);
      console.log(
        `::notice::${result.name}: escalation_flip_threshold_override_applied=${escalationOverrideEntries.length}; first ${sampledOverrideEntries.length}: ${sampledOverrideEntries.join(", ")}`
      );
    }
    if (result.escalatedPending.length > 0) {
      const escalatedNames = sortedLimitedVendors(result.escalatedPending, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: hard_escalation=${result.escalatedPending.length}; first ${escalatedNames.length}: ${escalatedNames.join(", ")}`
      );
    }
    if (result.coverageGaps.length > 0) {
      const gapNames = sortedLimitedVendors(result.coverageGaps, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: pending_without_confirm_or_escalation=${result.coverageGaps.length} (>=${getNoConfirmEscalationDays()} day(s)); first ${gapNames.length}: ${gapNames.join(", ")}`
      );
    }
    if (result.rebaselineForProfile) {
      console.log(
        `::notice::${result.name}: hash_profile_rebaselined=${HASH_PROFILE_ID}; pending candidates reset for this policy set.`
      );
    }
    if (result.flakySourceVendors.length > 0) {
      const flakyNames = sortedLimitedVendors(result.flakySourceVendors, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: source_volatility_flaky=${result.flakySourceVendors.length}; first ${flakyNames.length}: ${flakyNames.join(", ")}`
      );
    }

    console.log(
      `Checked ${result.name}: ${result.successfulChecks}/${result.totalChecks} vendors fetched successfully.`
    );

    for (const c of result.observedChanged) {
      allObservedChanged.push({ ...c, policyType: result.name, rulesFile: result.rulesFile });
    }
    for (const c of result.materialChanged) {
      allMaterialChanged.push({ ...c, policyType: result.name, rulesFile: result.rulesFile });
    }
    for (const c of result.materialRepeatSuppressed) {
      allMaterialRepeatSuppressed.push({ ...c, policyType: result.name, rulesFile: result.rulesFile });
    }
    for (const c of result.materialVersionRepeatSuppressed) {
      allMaterialVersionRepeatSuppressed.push({ ...c, policyType: result.name, rulesFile: result.rulesFile });
    }
    for (const c of result.materialOscillationSuppressed) {
      allMaterialOscillationSuppressed.push({ ...c, policyType: result.name, rulesFile: result.rulesFile });
    }
    for (const vendor of result.qualityGateHeld) {
      allQualityGateHeld.push({ policyType: result.name, vendor });
    }
    for (const vendor of result.metadataStabilityHeld) {
      allMetadataStabilityHeld.push({ policyType: result.name, vendor });
    }
    for (const vendor of result.adaptiveWindowRelaxed) {
      allAdaptiveWindowRelaxed.push({ policyType: result.name, vendor });
    }
    for (const vendor of result.noiseSuppressed) {
      allNoiseSuppressed.push({ policyType: result.name, vendor });
    }
    for (const vendor of result.fallbackProbeAvailable) {
      allFallbackProbeAvailable.push({ policyType: result.name, vendor });
    }
    for (const vendor of result.fallbackSignalChanged) {
      allFallbackSignalChanged.push({ policyType: result.name, vendor });
    }
    for (const vendor of result.fallbackSignalActionable) {
      allFallbackSignalActionable.push({ policyType: result.name, vendor });
    }
    for (const vendor of result.sourceMigrationResets) {
      allSourceMigrationResets.push({ policyType: result.name, vendor });
    }
    for (const vendor of result.pending) {
      allPending.push({ policyType: result.name, vendor });
    }
    for (const vendor of result.fetchBlockedPending) {
      allFetchBlockedPending.push({ policyType: result.name, vendor });
    }
    for (const vendor of result.legacyPending) {
      allLegacyPending.push({ policyType: result.name, vendor });
    }
    for (const vendor of result.provisionalVendors) {
      allProvisional.push({ policyType: result.name, vendor });
    }
    for (const vendor of result.blockedRetryLaneVendors) {
      allBlockedRetryLane.push({ policyType: result.name, vendor });
    }
    for (const vendor of result.blockedRetryQueueVendors) {
      allBlockedRetryQueue.push({ policyType: result.name, vendor });
    }
    for (const vendor of result.flakySourceVendors) {
      allFlakySources.push({ policyType: result.name, vendor });
    }
    if (result.pending.length > 0) {
      pendingDetailByPolicy[result.name] = [...result.pending];
    }
    if (result.qualityGateHeld.length > 0) {
      const qualityHeldNames = sortedLimitedVendors(result.qualityGateHeld, getPendingDetailLimit());
      console.log(
        `::notice::${result.name}: quality_gate_held=${result.qualityGateHeld.length}; first ${qualityHeldNames.length}: ${qualityHeldNames.join(", ")}`
      );
    }
    for (const vendor of result.stalePending) {
      allStalePending.push({ policyType: result.name, vendor });
    }
    for (const vendor of result.volatilePending) {
      allVolatilePending.push({ policyType: result.name, vendor });
    }
    for (const vendor of result.escalatedPending) {
      const reason = result.escalatedReasons?.[vendor] || "unknown";
      allEscalatedPending.push({ policyType: result.name, vendor, reason });
    }
    if (result.escalatedPending.length > 0) {
      escalationDetailByPolicy[result.name] = result.escalatedPending
        .map((vendor) => `${vendor}(${result.escalatedReasons?.[vendor] || "unknown"})`);
    }
    for (const vendor of result.coverageGaps) {
      allCoverageGaps.push({ policyType: result.name, vendor });
    }
    for (const row of result.vendorStatusRows || []) {
      allVendorStatusRows.push(row);
    }
  }

  const toPolicyCountString = (items) => Object.entries(summarizePolicyCounts(items))
    .map(([policy, count]) => `${policy}:${count}`)
    .join(",");

  const pendingByPolicy = toPolicyCountString(allPending);
  const pendingSample = allPending
    .slice(0, 25)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const provisionalByPolicy = toPolicyCountString(allProvisional);
  const provisionalSample = allProvisional
    .slice(0, 25)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const blockedRetryQueueByPolicy = toPolicyCountString(allBlockedRetryQueue);
  const blockedRetryQueueSample = allBlockedRetryQueue
    .slice(0, 25)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const flakySourceByPolicy = toPolicyCountString(allFlakySources);
  const flakySourceSample = allFlakySources
    .slice(0, 25)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const legacyPendingByPolicy = toPolicyCountString(allLegacyPending);
  const legacyPendingSample = allLegacyPending
    .slice(0, 25)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const fetchBlockedPendingByPolicy = toPolicyCountString(allFetchBlockedPending);
  const fetchBlockedPendingSample = allFetchBlockedPending
    .slice(0, 25)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const pendingDetail = Object.entries(pendingDetailByPolicy)
    .map(([policy, vendors]) => `${policy}:${sortedLimitedVendors(vendors, getPendingDetailLimit()).join("|")}`)
    .join(";");

  const stalePendingByPolicy = toPolicyCountString(allStalePending);
  const stalePendingSample = allStalePending
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");

  const volatilePendingByPolicy = toPolicyCountString(allVolatilePending);
  const volatilePendingSample = allVolatilePending
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");

  const escalationByPolicy = toPolicyCountString(allEscalatedPending);
  const escalationSample = allEscalatedPending
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const escalationDetail = Object.entries(escalationDetailByPolicy)
    .map(([policy, vendors]) => `${policy}:${sortedLimitedVendors(vendors, getPendingDetailLimit()).join("|")}`)
    .join(";");

  const coverageGapByPolicy = toPolicyCountString(allCoverageGaps);
  const coverageGapSample = allCoverageGaps
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const observedByPolicy = toPolicyCountString(allObservedChanged);
  const observedSample = allObservedChanged
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const actualByPolicyObject = toPolicyCountObject(allMaterialChanged);
  const actualByPolicy = toPolicyCountString(allMaterialChanged);
  const actualSampleList = allMaterialChanged
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`);
  const actualSample = allMaterialChanged
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const actualDiffSample = allMaterialChanged
    .slice(0, 10)
    .map((item) => `${item.policyType}:${item.vendor}:${item.semantic_diff_summary}`)
    .join(",");
  const materialRepeatSuppressedByPolicy = toPolicyCountString(allMaterialRepeatSuppressed);
  const materialRepeatSuppressedSample = allMaterialRepeatSuppressed
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const materialVersionRepeatSuppressedByPolicy = toPolicyCountString(allMaterialVersionRepeatSuppressed);
  const materialVersionRepeatSuppressedSample = allMaterialVersionRepeatSuppressed
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const materialOscillationSuppressedByPolicy = toPolicyCountString(allMaterialOscillationSuppressed);
  const materialOscillationSuppressedSample = allMaterialOscillationSuppressed
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const qualityGateHeldByPolicy = toPolicyCountString(allQualityGateHeld);
  const qualityGateHeldSample = allQualityGateHeld
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const metadataStabilityHeldByPolicy = toPolicyCountString(allMetadataStabilityHeld);
  const metadataStabilityHeldSample = allMetadataStabilityHeld
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const adaptiveWindowRelaxedByPolicy = toPolicyCountString(allAdaptiveWindowRelaxed);
  const adaptiveWindowRelaxedSample = allAdaptiveWindowRelaxed
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const noiseSuppressedByPolicy = toPolicyCountString(allNoiseSuppressed);
  const noiseSuppressedSample = allNoiseSuppressed
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const provisionalByPolicyObject = toPolicyCountObject(allProvisional);
  const blockedRetryQueueByPolicyObject = toPolicyCountObject(allBlockedRetryQueue);
  const pendingByPolicyObject = toPolicyCountObject(allPending);
  const fetchFailureByPolicy = toPolicyCountString(allErrors);
  const fetchFailureSample = allErrors
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const fallbackProbeByPolicy = toPolicyCountString(allFallbackProbeAvailable);
  const fallbackProbeSample = allFallbackProbeAvailable
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const fallbackSignalByPolicy = toPolicyCountString(allFallbackSignalChanged);
  const fallbackSignalSample = allFallbackSignalChanged
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const fallbackSignalActionableByPolicy = toPolicyCountString(allFallbackSignalActionable);
  const fallbackSignalActionableSample = allFallbackSignalActionable
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const sourceMigrationResetByPolicy = toPolicyCountString(allSourceMigrationResets);
  const sourceMigrationResetSample = allSourceMigrationResets
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const fetchHealthStatus = allErrors.length > 0 ? "degraded" : "healthy";
  const tier1Total = Object.values(tier1ByPolicy).reduce((sum, value) => sum + Number(value.total || 0), 0);
  const tier1Fetched = Object.values(tier1ByPolicy).reduce((sum, value) => sum + Number(value.fetched || 0), 0);
  const tier1Failed = Object.values(tier1ByPolicy).reduce((sum, value) => sum + Number(value.failed || 0), 0);
  const tier1CoveragePct = tier1Total > 0 ? ((tier1Fetched / tier1Total) * 100).toFixed(2) : "0.00";
  const tier1ByPolicyValue = POLICY_COUNT_KEYS
    .map((policyType) => {
      const stats = tier1ByPolicy[policyType] || { fetched: 0, total: 0, failed: 0 };
      return `${policyType}:${stats.fetched}/${stats.total}`;
    })
    .join(",");
  const tier1FailedSample = allTier1Failed
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const tier1UniqueFailures = summarizeDistinctVendorFailures(allTier1Failed);
  const tier1MissingConfiguredSample = allTier1MissingConfigured
    .slice(0, 20)
    .map((item) => `${item.policyType}:${item.vendor}`)
    .join(",");
  const uniqueVendorTotal = uniqueVendorCoverage.size;
  let uniqueVendorFetched = 0;
  for (const coverage of uniqueVendorCoverage.values()) {
    const totalPolicies = coverage?.totalPolicies instanceof Set ? coverage.totalPolicies.size : 0;
    const fetchedPolicies = coverage?.fetchedPolicies instanceof Set ? coverage.fetchedPolicies.size : 0;
    if (totalPolicies > 0 && fetchedPolicies >= totalPolicies) {
      uniqueVendorFetched += 1;
    }
  }
  const uniqueVendorFailed = Math.max(0, uniqueVendorTotal - uniqueVendorFetched);
  const uniqueVendorCoveragePct = uniqueVendorTotal > 0
    ? ((uniqueVendorFetched / uniqueVendorTotal) * 100).toFixed(2)
    : "0.00";
  const generatedAtUtc = utcIsoTimestamp();
  const rawFetchCacheStats = rawFetchCache.snapshot();
  const blockedFetchCacheStats = blockedFetchCache.snapshot();
  const candidateRegistry = readJson(POLICY_VENDOR_CANDIDATES_PATH, { candidates: {} });
  const previousCandidateState = readJson(POLICY_VENDOR_CANDIDATE_STATE_PATH, {
    schema_version: "policy_vendor_candidate_state_v1",
    updated_utc: "",
    candidates: {},
  });
  let candidateMonitorResult = {
    state: previousCandidateState,
    results: [],
    observation_slot: "",
  };
  try {
    candidateMonitorResult = await monitorPolicyVendorCandidates({
      registry: candidateRegistry,
      state: previousCandidateState,
      now: new Date(generatedAtUtc),
    });
    writeFileSync(
      POLICY_VENDOR_CANDIDATE_STATE_PATH,
      JSON.stringify(candidateMonitorResult.state, null, 2) + "\n"
    );
  } catch (error) {
    console.log(`::warning::Candidate vendor monitor failed without affecting current notaries: ${String(error?.message || error)}`);
  }

  const vendorLifecycleReport = buildPolicyVendorLifecycleReport({
    rows: allVendorStatusRows,
    candidateRegistry,
    candidateState: candidateMonitorResult.state,
    now: new Date(generatedAtUtc),
  });
  writePolicyVendorLifecycleReports(vendorLifecycleReport);
  const policyCoverageScorecard = buildPolicyCoverageScorecard({
    rulebooks: Object.fromEntries(
      POLICY_SETS.map((policySet) => [
        policySet.name,
        readJson(join(__dirname, "..", "rules", policySet.rulesFile), { vendors: {} }),
      ])
    ),
    sourceMaps: Object.fromEntries(
      POLICY_SETS.map((policySet) => [
        policySet.name,
        readJson(policySet.sourcesPath, { vendors: {} }),
      ])
    ),
    candidateRegistry,
    lifecycleReport: vendorLifecycleReport,
    now: new Date(generatedAtUtc),
  });
  writePolicyCoverageScorecard(policyCoverageScorecard);
  const statusReport = writePolicyStatusReports(allVendorStatusRows, generatedAtUtc);
  writeFileSync(join(__dirname, "..", POLICY_EVIDENCE_ARTIFACT_PATH),
    JSON.stringify(buildPolicyEvidenceSnapshot(statusReport), null, 2) + "\n");
  writeWeeklyTriageReports(allVendorStatusRows, generatedAtUtc);
  const changedDateUtc = generatedAtUtc.slice(0, 10);
  let alertFeedPublishState = {
    published: false,
    review_published: false,
    reason: "skipped_update_mode",
    signature: "",
    feedChanged: false,
    reviewFeedChanged: false,
    strictEligible: false,
    daily_entry: null,
  };
  const policyEventLogResult = !isUpdate
    ? appendPolicyEventLog(allMaterialChanged, generatedAtUtc)
    : {
      appended_count: 0,
      skipped_existing_count: 0,
      skipped_invalid_count: 0,
      total_count: readNdjson(POLICY_EVENT_LOG_PATH).length,
    };
  const policyEventLogEntries = !isUpdate ? readNdjson(POLICY_EVENT_LOG_PATH) : [];
  const includeZeroChangeAlerts = getPolicyAlertIncludeZeroChange();
  const hasDailyEventChanges = policyEventLogEntries.some(
    (event) => toDateUtcPrefix(event?.emitted_at_utc || "") === changedDateUtc
  );
  const shouldPublishAlertFeed = hasDailyEventChanges || includeZeroChangeAlerts;

  if (!isUpdate && shouldPublishAlertFeed) {
    alertFeedPublishState = updatePolicyAlertFeed(
      {
        date_utc: changedDateUtc,
        generated_at_utc: generatedAtUtc,
        changed_count: allMaterialChanged.length,
        by_policy: actualByPolicyObject,
        changed_sample: actualSampleList,
        provisional_count: allProvisional.length,
        provisional_by_policy: provisionalByPolicyObject,
        pending_count: allPending.length,
        pending_by_policy: pendingByPolicyObject,
        fetch_failure_count: allErrors.length,
        fetch_health_status: fetchHealthStatus,
        fetch_blocked_pending_count: allFetchBlockedPending.length,
        stale_pending_count: allStalePending.length,
        volatile_pending_count: allVolatilePending.length,
        escalation_count: allEscalatedPending.length,
        coverage_gap_count: allCoverageGaps.length,
        quality_gate_held_count: allQualityGateHeld.length,
        metadata_stability_held_count: allMetadataStabilityHeld.length,
        material_oscillation_suppressed_count: allMaterialOscillationSuppressed.length,
        source_migration_reset_count: allSourceMigrationResets.length,
        blocked_retry_queue_count: allBlockedRetryQueue.length,
        blocked_retry_queue_by_policy: blockedRetryQueueByPolicyObject,
        flaky_source_count: allFlakySources.length,
        flaky_source_by_policy: toPolicyCountObject(allFlakySources),
        unique_vendor_total: uniqueVendorTotal,
        unique_vendor_fetched: uniqueVendorFetched,
        unique_vendor_failed: uniqueVendorFailed,
        unique_vendor_coverage_pct: uniqueVendorCoveragePct,
        run_url: buildRunUrl(),
        run_id: String(process.env.GITHUB_RUN_ID || "").trim(),
        run_attempt: String(process.env.GITHUB_RUN_ATTEMPT || "").trim(),
        commit_sha: String(process.env.GITHUB_SHA || "").trim(),
        source: "check-policies.js",
      },
      policyEventLogEntries,
      { includeZeroChange: includeZeroChangeAlerts }
    );
  } else if (!isUpdate && !shouldPublishAlertFeed) {
    alertFeedPublishState = {
      published: false,
      review_published: false,
      reason: "no_confirmed_changes",
      signature: "",
      feedChanged: false,
      reviewFeedChanged: false,
      strictEligible: false,
      daily_entry: null,
    };
  }
  const supabaseAlertSyncResult = await syncPolicyAlertsToSupabase({
    supabaseConfig,
    dateUtc: changedDateUtc,
    eventLogEntries: policyEventLogEntries,
    dailyAlertEntry: alertFeedPublishState.daily_entry,
    strictEligible: alertFeedPublishState.strictEligible,
  });
  const supabaseStateSyncResult = await syncPolicyStateArtifactsToSupabase(supabaseConfig);
  const supabaseAnySyncEnabled = supabaseAlertSyncResult.enabled || supabaseStateSyncResult.enabled;
  const supabaseSyncOk = supabaseAnySyncEnabled && supabaseAlertSyncResult.ok && supabaseStateSyncResult.ok;

  if (supabaseAlertSyncResult.enabled && !supabaseAlertSyncResult.ok) {
    console.log(`::warning::Supabase policy alert sync failed: ${supabaseAlertSyncResult.error}`);
  }
  if (supabaseStateSyncResult.enabled && !supabaseStateSyncResult.ok) {
    console.log(`::warning::Supabase policy state sync failed: ${supabaseStateSyncResult.error}`);
  }

  console.log(`ALERT_FEED_PUBLISHED=${alertFeedPublishState.published ? "1" : "0"}`);
  console.log(`ALERT_REVIEW_FEED_PUBLISHED=${alertFeedPublishState.review_published ? "1" : "0"}`);
  console.log(`ALERT_FEED_REASON=${alertFeedPublishState.reason}`);
  console.log(`ALERT_FEED_SIGNATURE=${alertFeedPublishState.signature}`);
  console.log(`ALERT_FEED_CHANGED=${alertFeedPublishState.feedChanged ? "1" : "0"}`);
  console.log(`ALERT_REVIEW_FEED_CHANGED=${alertFeedPublishState.reviewFeedChanged ? "1" : "0"}`);
  console.log(`SUPABASE_CONFIGURED=${supabaseConfig.configured ? "1" : "0"}`);
  console.log(`SUPABASE_SYNC_ENABLED=${supabaseAlertSyncResult.enabled ? "1" : "0"}`);
  console.log(`SUPABASE_STATE_SYNC_ENABLED=${supabaseStateSyncResult.enabled ? "1" : "0"}`);
  console.log(`POLICY_SUPABASE_SUPPRESS_GIT_STATE=${supabaseConfig.suppressGitState ? "1" : "0"}`);
  console.log(`SUPABASE_STATE_HYDRATED_COUNT=${supabaseStateHydrateResult.hydrated_count || 0}`);
  console.log(`SUPABASE_EVENTS_UPSERTED_COUNT=${supabaseAlertSyncResult.event_upserted_count || 0}`);
  console.log(`SUPABASE_DAILY_ALERT_UPSERTED_COUNT=${supabaseAlertSyncResult.daily_alert_upserted_count || 0}`);
  console.log(`SUPABASE_DAILY_ALERT_BACKFILLED_COUNT=${supabaseAlertSyncResult.daily_alert_backfilled_count || 0}`);
  console.log(`SUPABASE_STATE_SYNCED_COUNT=${supabaseStateSyncResult.synced_count || 0}`);
  console.log(`SUPABASE_SYNC_OK=${supabaseSyncOk ? "1" : "0"}`);
  const candidateResults = candidateMonitorResult.results || [];
  const candidateFetchFailures = candidateResults.filter((result) => result.status === "failure");
  if (candidateFetchFailures.length > 0) {
    const candidateFailureSample = candidateFetchFailures
      .slice(0, 5)
      .map((result) => `${result.vendor}:${result.policy}`)
      .join(", ");
    console.log(
      `::warning::Candidate source failures are isolated from production notaries: ${candidateFailureSample}`
    );
  }
  console.log(`CANDIDATE_OBSERVATION_SLOT=${candidateMonitorResult.observation_slot || ""}`);
  console.log(`CANDIDATE_FETCH_COUNT=${candidateResults.filter((result) => result.fetched).length}`);
  console.log(`CANDIDATE_FETCH_FAILURE_COUNT=${candidateFetchFailures.length}`);
  console.log(
    `CANDIDATE_FETCH_FAILURE_SAMPLE=${candidateFetchFailures
      .slice(0, 20)
      .map((result) => `${result.vendor}:${result.policy}:${result.error || "unknown"}`)
      .join(",")}`
  );
  console.log(`CANDIDATES_READY_FOR_REVIEW=${vendorLifecycleReport.totals?.candidates_ready_for_review || 0}`);
  console.log(`POLICY_TRACKED_VENDOR_COUNT=${policyCoverageScorecard.network?.tracked_vendor_count || 0}`);
  console.log(`POLICY_ADMITTED_VENDOR_COUNT=${policyCoverageScorecard.production?.admitted_vendor_count || 0}`);
  console.log(`POLICY_DECISION_READY_SURFACE_COUNT=${policyCoverageScorecard.production?.decision_ready_surface_count || 0}`);
  console.log(`RAW_FETCH_CACHE_HIT_COUNT=${rawFetchCacheStats.hitCount}`);
  console.log(`RAW_FETCH_CACHE_MISS_COUNT=${rawFetchCacheStats.missCount}`);
  console.log(`RAW_FETCH_CACHE_BYPASS_COUNT=${rawFetchCacheStats.bypassCount}`);
  console.log(`RAW_FETCH_LANE_EXECUTION_COUNT=${rawFetchCacheStats.networkLoadCount}`);
  console.log(`RAW_FETCH_CACHE_ENTRY_COUNT=${rawFetchCacheStats.entryCount}`);
  console.log(`BLOCKED_RETRY_LANE_COUNT=${allBlockedRetryLane.length}`);
  console.log(`BLOCKED_FETCH_REUSE_HIT_COUNT=${blockedFetchCacheStats.hitCount}`);
  console.log(`BLOCKED_FETCH_REUSE_MISS_COUNT=${blockedFetchCacheStats.missCount}`);
  console.log(`BLOCKED_FETCH_REUSE_RETAINED_COUNT=${blockedFetchCacheStats.retainedFailureCount}`);
  console.log(`BLOCKED_FETCH_REUSE_ENTRY_COUNT=${blockedFetchCacheStats.entryCount}`);
  console.log("BASELINE_COMPARISON_MODE=confirmed_daily_fingerprint");
  console.log(`FETCH_FAILURE_COUNT=${allErrors.length}`);
  console.log(`FETCH_FAILURE_BY_POLICY=${fetchFailureByPolicy}`);
  console.log(`FETCH_FAILURE_SAMPLE=${fetchFailureSample}`);
  console.log(`FALLBACK_PROBE_COUNT=${allFallbackProbeAvailable.length}`);
  console.log(`FALLBACK_PROBE_BY_POLICY=${fallbackProbeByPolicy}`);
  console.log(`FALLBACK_PROBE_SAMPLE=${fallbackProbeSample}`);
  console.log(`FALLBACK_SIGNAL_COUNT=${allFallbackSignalChanged.length}`);
  console.log(`FALLBACK_SIGNAL_BY_POLICY=${fallbackSignalByPolicy}`);
  console.log(`FALLBACK_SIGNAL_SAMPLE=${fallbackSignalSample}`);
  console.log(`FALLBACK_SIGNAL_ACTIONABLE_COUNT=${allFallbackSignalActionable.length}`);
  console.log(`FALLBACK_SIGNAL_ACTIONABLE_BY_POLICY=${fallbackSignalActionableByPolicy}`);
  console.log(`FALLBACK_SIGNAL_ACTIONABLE_SAMPLE=${fallbackSignalActionableSample}`);
  console.log(`SOURCE_MIGRATION_RESET_COUNT=${allSourceMigrationResets.length}`);
  console.log(`SOURCE_MIGRATION_RESET_BY_POLICY=${sourceMigrationResetByPolicy}`);
  console.log(`SOURCE_MIGRATION_RESET_SAMPLE=${sourceMigrationResetSample}`);
  console.log(`FETCH_HEALTH_STATUS=${fetchHealthStatus}`);
  console.log(`TIER1_TOTAL=${tier1Total}`);
  console.log(`TIER1_FETCHED=${tier1Fetched}`);
  console.log(`TIER1_FAILED=${tier1Failed}`);
  console.log(`TIER1_UNIQUE_FAILED=${tier1UniqueFailures.count}`);
  console.log(`TIER1_COVERAGE_PCT=${tier1CoveragePct}`);
  console.log(`TIER1_BY_POLICY=${tier1ByPolicyValue}`);
  console.log(`TIER1_FAILED_SAMPLE=${tier1FailedSample}`);
  console.log(`TIER1_UNIQUE_FAILED_SAMPLE=${tier1UniqueFailures.sample}`);
  console.log(`TIER1_MISSING_CONFIGURED_COUNT=${allTier1MissingConfigured.length}`);
  console.log(`TIER1_MISSING_CONFIGURED_SAMPLE=${tier1MissingConfiguredSample}`);
  console.log(`UNIQUE_VENDOR_TOTAL=${uniqueVendorTotal}`);
  console.log(`UNIQUE_VENDOR_FETCHED=${uniqueVendorFetched}`);
  console.log(`UNIQUE_VENDOR_FAILED=${uniqueVendorFailed}`);
  console.log(`UNIQUE_VENDOR_COVERAGE_PCT=${uniqueVendorCoveragePct}`);

  console.log(`PROVISIONAL_COUNT=${allProvisional.length}`);
  console.log(`PROVISIONAL_BY_POLICY=${provisionalByPolicy}`);
  console.log(`PROVISIONAL_SAMPLE=${provisionalSample}`);
  console.log(`PENDING_COUNT=${allPending.length}`);
  console.log(`PENDING_BY_POLICY=${pendingByPolicy}`);
  console.log(`PENDING_SAMPLE=${pendingSample}`);
  console.log(`PENDING_DETAIL=${pendingDetail}`);
  console.log(`LEGACY_PENDING_COUNT=${allLegacyPending.length}`);
  console.log(`LEGACY_PENDING_BY_POLICY=${legacyPendingByPolicy}`);
  console.log(`LEGACY_PENDING_SAMPLE=${legacyPendingSample}`);
  console.log(`FETCH_BLOCKED_PENDING_COUNT=${allFetchBlockedPending.length}`);
  console.log(`FETCH_BLOCKED_PENDING_BY_POLICY=${fetchBlockedPendingByPolicy}`);
  console.log(`FETCH_BLOCKED_PENDING_SAMPLE=${fetchBlockedPendingSample}`);
  console.log(`BLOCKED_RETRY_QUEUE_COUNT=${allBlockedRetryQueue.length}`);
  console.log(`BLOCKED_RETRY_QUEUE_BY_POLICY=${blockedRetryQueueByPolicy}`);
  console.log(`BLOCKED_RETRY_QUEUE_SAMPLE=${blockedRetryQueueSample}`);
  console.log(`STALE_PENDING_COUNT=${allStalePending.length}`);
  console.log(`STALE_PENDING_BY_POLICY=${stalePendingByPolicy}`);
  console.log(`STALE_PENDING_SAMPLE=${stalePendingSample}`);
  console.log(`VOLATILE_PENDING_COUNT=${allVolatilePending.length}`);
  console.log(`VOLATILE_PENDING_BY_POLICY=${volatilePendingByPolicy}`);
  console.log(`VOLATILE_PENDING_SAMPLE=${volatilePendingSample}`);
  console.log(`VOLATILE_RECENT_FLIP_REQUIRED=${getVolatileRequireRecentFlip() ? "1" : "0"}`);
  console.log(`FLAKY_SOURCE_COUNT=${allFlakySources.length}`);
  console.log(`FLAKY_SOURCE_BY_POLICY=${flakySourceByPolicy}`);
  console.log(`FLAKY_SOURCE_SAMPLE=${flakySourceSample}`);
  console.log(`ESCALATION_COUNT=${allEscalatedPending.length}`);
  console.log(`ESCALATION_BY_POLICY=${escalationByPolicy}`);
  console.log(`ESCALATION_SAMPLE=${escalationSample}`);
  console.log(`ESCALATION_DETAIL=${escalationDetail}`);
  console.log(`ESCALATION_RECENT_FLIP_REQUIRED=${getEscalationRequireRecentFlip() ? "1" : "0"}`);
  console.log(`COVERAGE_GAP_COUNT=${allCoverageGaps.length}`);
  console.log(`COVERAGE_GAP_BY_POLICY=${coverageGapByPolicy}`);
  console.log(`COVERAGE_GAP_SAMPLE=${coverageGapSample}`);
  console.log(`OBSERVED_CHANGED_COUNT=${allObservedChanged.length}`);
  console.log(`OBSERVED_CHANGED_BY_POLICY=${observedByPolicy}`);
  console.log(`OBSERVED_CHANGED_SAMPLE=${observedSample}`);
  console.log(`ACTUAL_CHANGED_COUNT=${allMaterialChanged.length}`);
  console.log(`ACTUAL_CHANGED_BY_POLICY=${actualByPolicy}`);
  console.log(`ACTUAL_CHANGED_SAMPLE=${actualSample}`);
  console.log(`ACTUAL_DIFF_SAMPLE=${actualDiffSample}`);
  // Backward-compatible aliases consumed by existing tooling.
  console.log(`MATERIAL_CHANGED_COUNT=${allMaterialChanged.length}`);
  console.log(`MATERIAL_CHANGED_BY_POLICY=${actualByPolicy}`);
  console.log(`MATERIAL_CHANGED_SAMPLE=${actualSample}`);
  console.log(`MATERIAL_DIFF_SAMPLE=${actualDiffSample}`);
  console.log(`MATERIAL_REPEAT_SUPPRESSED_COUNT=${allMaterialRepeatSuppressed.length}`);
  console.log(`MATERIAL_REPEAT_SUPPRESSED_BY_POLICY=${materialRepeatSuppressedByPolicy}`);
  console.log(`MATERIAL_REPEAT_SUPPRESSED_SAMPLE=${materialRepeatSuppressedSample}`);
  console.log(`MATERIAL_VERSION_REPEAT_SUPPRESSED_COUNT=${allMaterialVersionRepeatSuppressed.length}`);
  console.log(`MATERIAL_VERSION_REPEAT_SUPPRESSED_BY_POLICY=${materialVersionRepeatSuppressedByPolicy}`);
  console.log(`MATERIAL_VERSION_REPEAT_SUPPRESSED_SAMPLE=${materialVersionRepeatSuppressedSample}`);
  console.log(`MATERIAL_OSCILLATION_SUPPRESSED_COUNT=${allMaterialOscillationSuppressed.length}`);
  console.log(`MATERIAL_OSCILLATION_SUPPRESSED_BY_POLICY=${materialOscillationSuppressedByPolicy}`);
  console.log(`MATERIAL_OSCILLATION_SUPPRESSED_SAMPLE=${materialOscillationSuppressedSample}`);
  console.log(`QUALITY_GATE_HELD_COUNT=${allQualityGateHeld.length}`);
  console.log(`QUALITY_GATE_HELD_BY_POLICY=${qualityGateHeldByPolicy}`);
  console.log(`QUALITY_GATE_HELD_SAMPLE=${qualityGateHeldSample}`);
  console.log(`METADATA_STABILITY_HELD_COUNT=${allMetadataStabilityHeld.length}`);
  console.log(`METADATA_STABILITY_HELD_BY_POLICY=${metadataStabilityHeldByPolicy}`);
  console.log(`METADATA_STABILITY_HELD_SAMPLE=${metadataStabilityHeldSample}`);
  console.log(`ADAPTIVE_WINDOW_RELAXED_COUNT=${allAdaptiveWindowRelaxed.length}`);
  console.log(`ADAPTIVE_WINDOW_RELAXED_BY_POLICY=${adaptiveWindowRelaxedByPolicy}`);
  console.log(`ADAPTIVE_WINDOW_RELAXED_SAMPLE=${adaptiveWindowRelaxedSample}`);
  console.log(`NOISE_SUPPRESSED_COUNT=${allNoiseSuppressed.length}`);
  console.log(`NOISE_SUPPRESSED_BY_POLICY=${noiseSuppressedByPolicy}`);
  console.log(`NOISE_SUPPRESSED_SAMPLE=${noiseSuppressedSample}`);
  console.log(`POLICY_EVENT_APPENDED_COUNT=${policyEventLogResult.appended_count}`);
  console.log(`POLICY_EVENT_SKIPPED_EXISTING_COUNT=${policyEventLogResult.skipped_existing_count}`);
  console.log(`POLICY_EVENT_SKIPPED_INVALID_COUNT=${policyEventLogResult.skipped_invalid_count}`);
  console.log(`POLICY_EVENT_TOTAL_COUNT=${policyEventLogResult.total_count}`);
  // Canonical public aliases: "changed" means actual policy changes.
  console.log(`CHANGED_COUNT=${allMaterialChanged.length}`);
  console.log(`CHANGED_BY_POLICY=${actualByPolicy}`);
  console.log(`CHANGED_SAMPLE=${actualSample}`);

  if (isUpdate) {
    console.log(`Hashes updated for all policy sets.`);
    return;
  }

  if (allObservedChanged.length === 0) {
    console.log("No policy page-content updates observed.");
  } else {
    const preview = allObservedChanged
      .slice(0, 20)
      .map((c) => `- [${c.policyType}] ${c.vendor} -> rules/${c.rulesFile}`)
      .join("\n");
    console.log(
      `::notice::Observed page-content updates (first ${Math.min(allObservedChanged.length, 20)}):\n${preview}`
    );
  }

  if (allMaterialChanged.length === 0) {
    console.log("No policy changes confirmed.");
  } else {
    const policyPreview = allMaterialChanged
      .slice(0, 20)
      .map((c) => `- [${c.policyType}] ${c.vendor} -> ${c.semantic_diff_summary}`)
      .join("\n");
    console.log(
      `::notice::Policy change preview (first ${Math.min(allMaterialChanged.length, 20)}):\n${policyPreview}`
    );
  }
  if (allMaterialRepeatSuppressed.length > 0) {
    const suppressedPreview = allMaterialRepeatSuppressed
      .slice(0, 20)
      .map((c) => `- [${c.policyType}] ${c.vendor} -> repeated semantic diff (suppressed by cooldown)`)
      .join("\n");
    console.log(
      `::notice::Suppressed repeated semantic diffs (first ${Math.min(allMaterialRepeatSuppressed.length, 20)}):\n${suppressedPreview}`
    );
  }
  if (allMaterialVersionRepeatSuppressed.length > 0) {
    const suppressedPreview = allMaterialVersionRepeatSuppressed
      .slice(0, 20)
      .map((c) => `- [${c.policyType}] ${c.vendor} -> repeated hash version (suppressed)`)
      .join("\n");
    console.log(
      `::notice::Suppressed repeated material hash versions (first ${Math.min(allMaterialVersionRepeatSuppressed.length, 20)}):\n${suppressedPreview}`
    );
  }
  if (allMaterialOscillationSuppressed.length > 0) {
    const suppressedPreview = allMaterialOscillationSuppressed
      .slice(0, 20)
      .map((c) => `- [${c.policyType}] ${c.vendor} -> oscillation pattern A/B/A (suppressed)`)
      .join("\n");
    console.log(
      `::notice::Suppressed oscillating semantic diffs (first ${Math.min(allMaterialOscillationSuppressed.length, 20)}):\n${suppressedPreview}`
    );
  }
  if (policyEventLogResult.appended_count > 0) {
    console.log(
      `::notice::Policy event log appended ${policyEventLogResult.appended_count} event(s) (total=${policyEventLogResult.total_count}).`
    );
  }
  process.exitCode = 0;
}

const isMainModule = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isMainModule) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}
