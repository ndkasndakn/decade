#!/usr/bin/env node

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { mapWithConcurrency } from "../lib/async-work-pool.js";
import { createBlockedFetchReuseCache } from "../lib/blocked-fetch-reuse-cache.js";
import { createSuccessfulFetchCache } from "../lib/successful-fetch-cache.js";

import {
  applyMonitorSourceCheckMetadata,
  buildBlockedFetchPlanKey,
  buildChangeKey,
  buildDailyAlertFromEvents,
  buildPolicyFetchSchedule,
  checkPolicySet,
  classifyDailyAlertForPublication,
  classifyFetchFailureBlock,
  countSignalWindowChangeFlips,
  createMinIntervalScheduler,
  evaluateFallbackSignalTransition,
  evaluateVendorSourceMigration,
  evaluateSignalWindow,
  extractSemanticTokens,
  fetchText,
  getCandidatePendingModelId,
  getCrossRunWindowRequiredForCandidate,
  getVolatileFlipThresholdForVendor,
  isHighSignalWindowCandidate,
  isLegacyPendingCandidate,
  isStrictDailyAlertEntry,
  LEGACY_PENDING_MODEL_ID,
  normalizeSourceUrlForComparison,
  PENDING_MODEL_ID,
  resolveSourceVolatilityTier,
  semanticSignaturesStable,
  summarizeDistinctVendorFailures,
  summarizeBrowserHookFailure,
  toZendeskHelpCenterApiTarget,
} from "./check-policies.js";

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function testMonitorCheckDoesNotClaimHumanVerification() {
  const sources = {
    last_checked: "2026-02-01",
    last_verified_utc: "2026-03-02T06:47:25Z",
    hash_profile: "old-profile",
  };
  const result = applyMonitorSourceCheckMetadata(sources, {
    successfulChecks: 100,
    checkedAtUtc: "2026-07-16T10:00:00Z",
    hashProfile: "policy-source-v2",
  });

  assert.equal(result.updated, true);
  assert.equal(result.sources.last_checked, "2026-07-16");
  assert.equal(result.sources.last_verified_utc, "2026-03-02T06:47:25Z");
  assert.equal(result.sources.hash_profile, "policy-source-v2");
}

function testDistinctTier1FailuresCountVendorsOnceAcrossPolicies() {
  const summary = summarizeDistinctVendorFailures([
    { policyType: "refund", vendor: "amazon_prime" },
    { policyType: "cancel", vendor: "amazon_prime" },
    { policyType: "return", vendor: "amazon_prime" },
    { policyType: "trial", vendor: "amazon_prime" },
    { policyType: "refund", vendor: "adobe" },
  ]);

  assert.deepEqual(summary, {
    count: 2,
    sample: "adobe,amazon_prime",
  });
}

function testBrowserHookFailuresExposeSanitizedProviderReasons() {
  const summary = summarizeBrowserHookFailure(502, {
    error: "all_fetch_strategies_failed",
    source_url: "https://secret.example/policy?token=never-log-this",
    attempts: [
      { provider: "cloudflare_browser_run", error: "cloudflare_browser_run_rate_limited" },
      { provider: "browserless", error: "browserless_quota_exhausted" },
      { provider: "direct", error: "HTTP 403" },
    ],
  });

  assert.equal(
    summary,
    "HTTP 502 [cloudflare_browser_run=cloudflare_browser_run_rate_limited,browserless=browserless_quota_exhausted,direct=HTTP_403]"
  );
  assert.equal(summary.includes("secret.example"), false, "hook diagnostics must not echo source URLs");
  assert.equal(summary.includes("never-log-this"), false, "hook diagnostics must not echo query secrets");
}

async function testMinIntervalSchedulerSerializesBrowserHookRequests() {
  let now = 1000;
  const waits = [];
  const starts = [];
  const schedule = createMinIntervalScheduler({
    minIntervalMs: 100,
    nowFn: () => now,
    sleepFn: async (ms) => {
      waits.push(ms);
      now += ms;
    },
  });

  const results = await Promise.all([
    schedule(async () => {
      starts.push(now);
      return "first";
    }),
    schedule(async () => {
      starts.push(now);
      return "second";
    }),
    schedule(async () => {
      starts.push(now);
      return "third";
    }),
  ]);

  assert.deepEqual(results, ["first", "second", "third"]);
  assert.deepEqual(starts, [1000, 1100, 1200]);
  assert.deepEqual(waits, [100, 100]);
}

async function testWorkPoolStartsNextItemWithoutWaitingForBatchPeers() {
  const started = [];
  const releases = new Map();
  const releaseFor = (item) => new Promise((resolve) => releases.set(item, resolve));

  const pending = mapWithConcurrency([0, 1, 2], 2, async (item) => {
    started.push(item);
    await releaseFor(item);
    return `done-${item}`;
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, [0, 1], "the pool should initially fill only its configured workers");

  releases.get(1)();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(started, [0, 1, 2], "a free worker should start the next item before a slow peer finishes");

  releases.get(0)();
  releases.get(2)();
  assert.deepEqual(await pending, ["done-0", "done-1", "done-2"]);
}

async function testWorkPoolPreservesConcurrencyAndCooldown() {
  let active = 0;
  let maxActive = 0;
  const cooled = [];

  const results = await mapWithConcurrency(
    [0, 1, 2, 3, 4],
    2,
    async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      return item * 2;
    },
    {
      afterTask: async ({ index }) => {
        cooled.push(index);
      },
    }
  );

  assert.equal(maxActive, 2, "the pool must never exceed its configured concurrency");
  assert.deepEqual(results, [0, 2, 4, 6, 8], "results should retain input order");
  assert.deepEqual(cooled.sort((a, b) => a - b), [0, 1, 2, 3, 4]);
}

async function testWorkPoolStopsQueuedWorkAfterFailure() {
  const started = [];

  await assert.rejects(
    mapWithConcurrency([0, 1, 2, 3], 2, async (item) => {
      started.push(item);
      if (item === 1) throw new Error("source worker failed");
      await new Promise((resolve) => setImmediate(resolve));
      return item;
    }),
    /source worker failed/
  );

  assert.deepEqual(started, [0, 1], "a worker failure should prevent queued items from starting");
}

async function testDirectFetchLaneOwnsAbortLifecycle() {
  const text = await fetchText("data:text/plain,Refund%20policy%20available", 1);
  assert.equal(text, "Refund policy available");
}

async function testSuccessfulFetchCacheReusesSuccessfulReads() {
  const cache = createSuccessfulFetchCache();
  let loadCount = 0;
  const load = async () => {
    loadCount += 1;
    return { ok: true, text: "policy source" };
  };

  const first = await cache.load("direct:https://example.com/policy", load);
  const second = await cache.load("direct:https://example.com/policy", load);

  assert.deepEqual(second, first, "a successful raw source read should be reused within one run");
  assert.equal(loadCount, 1, "a shared successful source should only perform one network load");
  assert.deepEqual(cache.snapshot(), {
    hitCount: 1,
    missCount: 1,
    bypassCount: 0,
    networkLoadCount: 1,
    cachedSuccessCount: 1,
    entryCount: 1,
  });
}

async function testSuccessfulFetchCacheRetriesFailures() {
  const cache = createSuccessfulFetchCache();
  let loadCount = 0;

  const first = await cache.load("direct:https://example.com/policy", async () => {
    loadCount += 1;
    return { ok: false, error: "timeout" };
  });
  const second = await cache.load("direct:https://example.com/policy", async () => {
    loadCount += 1;
    return { ok: true, text: "recovered policy source" };
  });

  assert.equal(first.ok, false);
  assert.equal(second.ok, true);
  assert.equal(loadCount, 2, "failed source reads must not poison another policy surface");
  assert.equal(cache.snapshot().entryCount, 1, "only the recovered success should be retained");
}

async function testSuccessfulFetchCacheBypassReadsFreshWithoutReplacingCache() {
  const cache = createSuccessfulFetchCache();
  let loadCount = 0;
  const key = "direct:https://example.com/policy";

  const initial = await cache.load(key, async () => {
    loadCount += 1;
    return { ok: true, text: "initial source" };
  });
  const fresh = await cache.load(
    key,
    async () => {
      loadCount += 1;
      return { ok: true, text: "fresh confirmation source" };
    },
    { bypass: true }
  );
  const reused = await cache.load(key, async () => {
    loadCount += 1;
    return { ok: true, text: "unexpected replacement" };
  });

  assert.equal(initial.text, "initial source");
  assert.equal(fresh.text, "fresh confirmation source");
  assert.equal(reused.text, "initial source", "confirmation bypass must not overwrite the initial-run cache");
  assert.equal(loadCount, 2, "a bypass should perform exactly one additional network load");
  assert.deepEqual(cache.snapshot(), {
    hitCount: 1,
    missCount: 1,
    bypassCount: 1,
    networkLoadCount: 2,
    cachedSuccessCount: 1,
    entryCount: 1,
  });
}

async function testSuccessfulFetchCacheDefersRetentionUntilQualityPasses() {
  const cache = createSuccessfulFetchCache();
  const key = "direct:https://example.com/policy";
  let loadCount = 0;
  const load = async () => {
    loadCount += 1;
    return { ok: true, text: `source observation ${loadCount}` };
  };

  const first = await cache.load(key, load, { retainSuccess: false });
  const second = await cache.load(key, load, { retainSuccess: false });
  assert.equal(loadCount, 2, "unqualified HTTP successes should remain independently retryable");

  assert.equal(cache.retain(key, second), true);
  const reused = await cache.load(key, load, { retainSuccess: false });
  assert.equal(reused.text, second.text);
  assert.equal(first.text, "source observation 1");
  assert.equal(loadCount, 2, "a quality-approved observation should become reusable");
}

function testBlockedFetchReuseCacheRetainsOnlyExhaustedFailures() {
  const cache = createBlockedFetchReuseCache();
  const key = "blocked:example";
  const failure = { text: null, error: "HTTP 403", attemptedLanes: ["direct"] };

  assert.equal(cache.get(key), undefined);
  assert.equal(cache.retain(key, { text: "policy", error: "" }), false);
  assert.equal(cache.retain(key, failure), true);
  assert.equal(cache.retain(key, failure), true);
  assert.deepEqual(cache.get(key), failure);
  assert.deepEqual(cache.snapshot(), {
    hitCount: 1,
    missCount: 1,
    retainedFailureCount: 1,
    entryCount: 1,
  });
}

function testPolicyFetchScheduleDefersKnownBlockedSources() {
  const blockedFetchCache = createBlockedFetchReuseCache();
  const runBlockedConfig = { url: "https://run-blocked.example/policy", fetch_lanes: ["direct"] };
  blockedFetchCache.retain(
    buildBlockedFetchPlanKey("run_blocked", runBlockedConfig),
    { text: null, error: "HTTP 403" }
  );
  const vendors = [
    ["queued", { url: "https://queued.example/policy" }],
    ["healthy", { url: "https://healthy.example/policy" }],
    ["coverage_blocked", { url: "https://coverage.example/policy" }],
    ["streak_blocked", { url: "https://streak.example/policy" }],
    ["run_blocked", runBlockedConfig],
  ];

  const schedule = buildPolicyFetchSchedule(vendors, {
    blockedRetryVendors: { queued: { blocked_reason: "HTTP_403" } },
    coverageVendors: {
      coverage_blocked: { pending_fetch_blocked: true },
      streak_blocked: { consecutive_fetch_failures: 2 },
    },
    blockedFetchCache,
    quarantineStreak: 2,
  });

  assert.deepEqual(schedule.primaryVendors.map(([vendor]) => vendor), ["healthy"]);
  assert.deepEqual(
    schedule.blockedVendors.map(([vendor]) => vendor),
    ["queued", "coverage_blocked", "streak_blocked", "run_blocked"]
  );
  assert.deepEqual(
    schedule.scheduledVendors.map(([vendor]) => vendor),
    ["healthy", "queued", "coverage_blocked", "streak_blocked", "run_blocked"]
  );
}

async function testPolicySetsReuseExhaustedBlockedFetchPlans() {
  let getRequestCount = 0;
  const server = createServer((request, response) => {
    if (request.method === "HEAD") {
      response.writeHead(200, {
        etag: '"blocked-source-v1"',
        "content-type": "text/html; charset=utf-8",
      });
      response.end();
      return;
    }
    getRequestCount += 1;
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const sourceUrl = `http://127.0.0.1:${address.port}/policy`;
    const fixtureDir = mkdtempSync(join(tmpdir(), "decide-policy-blocked-cache-"));
    const rawFetchCache = createSuccessfulFetchCache();
    const blockedFetchCache = createBlockedFetchReuseCache();

    const buildPolicySet = (name) => {
      const policyPrefix = join(fixtureDir, name);
      const sourcesPath = `${policyPrefix}-sources.json`;
      writeJson(sourcesPath, {
        hash_profile: "focus-v3",
        vendors: {
          blocked_vendor: {
            url: sourceUrl,
            fetch_lanes: ["direct"],
          },
        },
      });
      return {
        name,
        sourcesPath,
        hashesPath: `${policyPrefix}-hashes.json`,
        candidatesPath: `${policyPrefix}-candidates.json`,
        coveragePath: `${policyPrefix}-coverage.json`,
        semanticPath: `${policyPrefix}-semantic.json`,
        baselinePath: `${policyPrefix}-baseline.json`,
        dailyFingerprintPath: `${policyPrefix}-daily.json`,
        blockedRetryPath: `${policyPrefix}-blocked.json`,
        rulesFile: `${name}-rules.json`,
        rawFetchCache,
        blockedFetchCache,
      };
    };

    const refundResult = await checkPolicySet(buildPolicySet("refund"));
    const requestsAfterFirstPolicy = getRequestCount;
    const cancelResult = await checkPolicySet(buildPolicySet("cancel"));

    assert.deepEqual(refundResult.errors, ["blocked_vendor"]);
    assert.deepEqual(cancelResult.errors, ["blocked_vendor"]);
    assert(requestsAfterFirstPolicy > 0, "the first policy surface should exhaust its configured fetch plan");
    assert.equal(
      getRequestCount,
      requestsAfterFirstPolicy,
      "later policy surfaces should reuse the exhausted blocked plan without more GET requests"
    );
    assert.deepEqual(cancelResult.blockedRetryLaneVendors, ["blocked_vendor"]);
    assert.equal(blockedFetchCache.snapshot().hitCount, 1);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function testPolicySetsShareSuccessfulRawSourceReads() {
  const policyText = [
    "Subscription refund and cancellation policy",
    "Customers may request a refund within fourteen days of the original purchase.",
    "Approved refunds return to the original payment method after review.",
    "Customers can cancel a subscription from account settings before renewal.",
    "Cancellation stops future renewal charges but does not erase prior invoices.",
    "Regional consumer protections may provide additional refund rights.",
    "Support can review billing evidence when a refund or cancellation needs help.",
    "These terms apply to the subscription service and its recurring billing cycle.",
  ].join("\n");
  let requestCount = 0;
  const server = createServer((_request, response) => {
    requestCount += 1;
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end(policyText);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address();
    assert(address && typeof address === "object");
    const sourceUrl = `http://127.0.0.1:${address.port}/policy`;
    const fixtureDir = mkdtempSync(join(tmpdir(), "decide-policy-cache-"));
    const rawFetchCache = createSuccessfulFetchCache();

    const buildPolicySet = (name) => {
      const policyPrefix = join(fixtureDir, name);
      const sourcesPath = `${policyPrefix}-sources.json`;
      writeJson(sourcesPath, {
        hash_profile: "focus-v3",
        vendors: {
          example_vendor: {
            url: sourceUrl,
            fetch_lanes: ["direct"],
          },
        },
      });
      return {
        name,
        sourcesPath,
        hashesPath: `${policyPrefix}-hashes.json`,
        candidatesPath: `${policyPrefix}-candidates.json`,
        coveragePath: `${policyPrefix}-coverage.json`,
        semanticPath: `${policyPrefix}-semantic.json`,
        baselinePath: `${policyPrefix}-baseline.json`,
        dailyFingerprintPath: `${policyPrefix}-daily.json`,
        blockedRetryPath: `${policyPrefix}-blocked.json`,
        rulesFile: `${name}-rules.json`,
        rawFetchCache,
      };
    };

    const refundResult = await checkPolicySet(buildPolicySet("refund"));
    const cancelResult = await checkPolicySet(buildPolicySet("cancel"));

    assert.equal(refundResult.successfulChecks, 1);
    assert.equal(cancelResult.successfulChecks, 1);
    assert.equal(requestCount, 1, "separate policy surfaces should share one successful raw source read");
    assert.equal(rawFetchCache.snapshot().hitCount, 1);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function testPolicySetWritesMonitorArtifactTimestamps() {
  const fixtureDir = mkdtempSync(join(tmpdir(), "decide-policy-check-"));
  const paths = {
    sourcesPath: join(fixtureDir, "sources.json"),
    hashesPath: join(fixtureDir, "hashes.json"),
    candidatesPath: join(fixtureDir, "candidates.json"),
    coveragePath: join(fixtureDir, "coverage.json"),
    semanticPath: join(fixtureDir, "semantic.json"),
    baselinePath: join(fixtureDir, "baseline.json"),
    dailyFingerprintPath: join(fixtureDir, "daily.json"),
    blockedRetryPath: join(fixtureDir, "blocked.json"),
  };
  writeJson(paths.sourcesPath, {
    hash_profile: "focus-v3",
    last_verified_utc: "2026-07-15T08:00:00Z",
    vendors: {},
  });

  const result = await checkPolicySet({
    name: "fixture",
    ...paths,
    rulesFile: "fixture-rules.json",
  });
  assert.equal(result.totalChecks, 0);

  const artifactPaths = [
    paths.semanticPath,
    paths.coveragePath,
    paths.baselinePath,
    paths.dailyFingerprintPath,
    paths.blockedRetryPath,
  ];
  const timestamps = artifactPaths.map((path) => readJson(path).updated_utc);
  assert.equal(new Set(timestamps).size, 1, "state artifacts should share one monitor timestamp");
  assert.match(timestamps[0], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.equal(readJson(paths.sourcesPath).last_verified_utc, "2026-07-15T08:00:00Z");

  // A fresh checkout restores mutable state, not the monitor's source-file edits.
  const sources = readJson(paths.sourcesPath);
  writeJson(paths.sourcesPath, { ...sources, hash_profile: "focus-v2" });
  const restored = await checkPolicySet({ name: "fixture", ...paths, rulesFile: "fixture-rules.json" });
  assert.equal(restored.rebaselineForProfile, false, "Matching restored state must not be treated as a new hash migration");
  const currentStates = Object.fromEntries([paths.semanticPath, paths.baselinePath, paths.dailyFingerprintPath]
    .map(path => [path, readJson(path)]));
  for (const override of [{ hash_profile: "focus-v2" }, { policy: "different-policy" }, { hash_profile: "" }]) {
    for (const [path, state] of Object.entries(currentStates)) writeJson(path, state);
    writeJson(paths.sourcesPath, { ...sources, hash_profile: "focus-v3" });
    writeJson(paths.dailyFingerprintPath, { ...currentStates[paths.dailyFingerprintPath], ...override });
    const inconsistent = await checkPolicySet({ name: "fixture", ...paths, rulesFile: "fixture-rules.json" });
    assert.equal(inconsistent.rebaselineForProfile, true, "Mixed, foreign or incomplete profiles must not inherit the checkout profile");
  }
}

function envInt(name, fallback) {
  const parsed = Number.parseInt(process.env[name] || String(fallback), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function configuredCrossRunWindowSize() {
  return Math.max(2, envInt("POLICY_CHECK_CROSS_RUN_WINDOW_SIZE", 6));
}

function configuredDefaultWindowRequired() {
  const size = configuredCrossRunWindowSize();
  return Math.max(2, Math.min(size, envInt("POLICY_CHECK_CROSS_RUN_WINDOW_REQUIRED", 3)));
}

function configuredHighSignalWindowRequired() {
  const size = configuredCrossRunWindowSize();
  return Math.max(2, Math.min(size, envInt("POLICY_CHECK_HIGH_SIGNAL_WINDOW_REQUIRED", 2)));
}

function configuredHighSignalMinPolicyHits() {
  return Math.max(1, envInt("POLICY_CHECK_HIGH_SIGNAL_MIN_POLICY_HITS", 2));
}

function configuredHighSignalMinLines() {
  return Math.max(2, envInt("POLICY_CHECK_HIGH_SIGNAL_MIN_LINES", 6));
}

function testImmediateBlockOnCloudflareAnd403() {
  const result = classifyFetchFailureBlock(
    [
      "https://help.x.com/en/using-x/x-premium [browser_hook] (interstitial:cloudflare_challenge)",
      "https://help.x.com/en/using-x/x-premium [direct] (HTTP 403)",
      "https://help.x.com/en/using-x/x-premium [mirror] (interstitial:just_a_moment)",
    ].join("; ")
  );

  assert.equal(result.immediateBlock, true, "expected anti-bot failure to quarantine immediately");
  assert.match(result.reason, /^known_fetch_blocker:/, "expected a normalized blocker reason");
}

function testImmediateBlockAllowsZendesk404AsAuxiliary() {
  const result = classifyFetchFailureBlock(
    [
      "https://help.crunchyroll.com/hc/en-us/articles/4963792118804-How-do-I-cancel-my-Premium-subscription [browser_hook] (interstitial:just_a_moment)",
      "https://help.crunchyroll.com/hc/en-us/articles/4963792118804-How-do-I-cancel-my-Premium-subscription [direct] (HTTP 403)",
      "https://help.crunchyroll.com/hc/en-us/articles/4963792118804-How-do-I-cancel-my-Premium-subscription [zendesk_api] (HTTP 404)",
      "https://help.crunchyroll.com/hc/en-us/articles/4963792118804-How-do-I-cancel-my-Premium-subscription [mirror] (interstitial:just_a_moment)",
    ].join("; ")
  );

  assert.equal(result.immediateBlock, true, "zendesk API misses should not prevent blocker quarantine");
}

function testTransientFailureDoesNotImmediateBlock() {
  const result = classifyFetchFailureBlock(
    [
      "https://example.com/policy [direct] (timeout)",
      "https://example.com/policy [mirror] (HTTP 500)",
    ].join("; ")
  );

  assert.equal(result.immediateBlock, false, "transient failures should wait for streak-based quarantine");
  assert.equal(result.reason, "", "transient failures should not emit a blocker reason");
}

function testPlain403StillImmediateBlocks() {
  const result = classifyFetchFailureBlock("HTTP 403");

  assert.equal(result.immediateBlock, true, "plain 403 failures should quarantine immediately");
  assert.match(result.reason, /http_403/, "expected HTTP status to be normalized in blocker reason");
}

function testLegacyPendingModelDefaults() {
  assert.equal(
    getCandidatePendingModelId({}),
    LEGACY_PENDING_MODEL_ID,
    "candidates without a model id should be treated as legacy"
  );
  assert.equal(isLegacyPendingCandidate({}), true, "legacy candidates should not drive current backlog metrics");
}

function testCurrentPendingModelStaysActive() {
  const candidate = {
    pending_model_id: PENDING_MODEL_ID,
    pending_model_first_observed_utc: "2026-03-06T12:00:00Z",
  };

  assert.equal(getCandidatePendingModelId(candidate), PENDING_MODEL_ID, "expected current model id to round-trip");
  assert.equal(isLegacyPendingCandidate(candidate), false, "current-model candidates should remain active");
}

function testZendeskApiTargetForArticle() {
  const result = toZendeskHelpCenterApiTarget(
    "https://help.crunchyroll.com/hc/en-us/articles/4963792118804-How-do-I-cancel-my-Premium-subscription"
  );

  assert.deepEqual(result, {
    kind: "article",
    apiUrl: "https://help.crunchyroll.com/api/v2/help_center/en-us/articles/4963792118804.json",
  });
}

function testZendeskApiTargetForSection() {
  const result = toZendeskHelpCenterApiTarget(
    "https://help.crunchyroll.com/hc/en-us/sections/21770446775956-Policies"
  );

  assert.deepEqual(result, {
    kind: "section",
    apiUrl: "https://help.crunchyroll.com/api/v2/help_center/en-us/sections/21770446775956/articles.json?per_page=100",
  });
}

function testZendeskApiTargetRejectsUnsupportedPaths() {
  const result = toZendeskHelpCenterApiTarget("https://help.x.com/en/using-x/x-premium");
  assert.equal(result, null, "non-help-center URLs should not produce a zendesk API target");
}

function testSemanticSignaturesStableForEmptyTokens() {
  assert.equal(
    semanticSignaturesStable("", ""),
    true,
    "empty semantic signatures should be treated as stable across runs"
  );
}

function testSemanticSignaturesStableForMatchingNonEmptyTokens() {
  assert.equal(
    semanticSignaturesStable("cancel:anytime|billing:auto_renew", "cancel:anytime|billing:auto_renew"),
    true,
    "matching semantic signatures should be stable"
  );
}

function testSemanticSignaturesStableRejectsMixedOrDifferentTokens() {
  assert.equal(
    semanticSignaturesStable("", "trial:auto_converts_to_paid"),
    false,
    "missing vs present semantic signature should not be stable"
  );
  assert.equal(
    semanticSignaturesStable("cancel:anytime", "cancel:fee_or_penalty"),
    false,
    "different semantic signatures should not be stable"
  );
}

function testReturnSignalsIgnoreCancellationOnlyLanguage() {
  assert.deepEqual(
    extractSemanticTokens(
      "Your subscription renews automatically every 14 days. Contact support to cancel.",
      "return"
    ),
    [],
    "return tracking must not classify renewal or cancellation language as a return-policy signal"
  );
}

function testRefundWindowsRequireDirectPolicyLanguage() {
  const linkedInTokens = extractSemanticTokens(
    "Last updated: 1 week ago. Refund Request. Premium subscriptions are refundable within 7 days of the charge.",
    "refund"
  );
  assert.deepEqual(
    linkedInTokens.filter((token) => token.startsWith("refund_window_days:")),
    ["refund_window_days:7"],
    "relative page metadata must not become a refund window"
  );

  const adobeTokens = extractSemanticTokens(
    "Annual plans are priced over 360 days. You receive a full refund when you cancel within 14 days of purchase.",
    "refund"
  );
  assert.deepEqual(
    adobeTokens.filter((token) => token.startsWith("refund_window_days:")),
    ["refund_window_days:14"],
    "unrelated plan durations must not become refund windows"
  );

  const wixTokens = extractSemanticTokens(
    "The 14-day money-back guarantee applies to eligible plans. Approved refunds may take 45 business days, and verification can take 72 hours.",
    "refund"
  );
  assert.deepEqual(
    wixTokens.filter((token) => token.startsWith("refund_window_days:")),
    ["refund_window_days:14"],
    "processing times must not become eligibility windows"
  );
}

function testRelativeMetadataStaysStableAcrossDailyRuns() {
  const dailyTokens = [1, 2, 3, 4].map((daysAgo) =>
    extractSemanticTokens(
      `Last updated ${daysAgo} days ago. Refund Request. Premium subscriptions are refundable within 7 days of the charge.`,
      "refund"
    )
  );

  for (const tokens of dailyTokens) {
    assert.deepEqual(
      tokens.filter((token) => token.startsWith("refund_window_days:")),
      ["refund_window_days:7"],
      "relative page metadata must not create a moving refund window"
    );
  }
  assert.equal(
    new Set(dailyTokens.map((tokens) => tokens.join("|"))).size,
    1,
    "daily relative metadata changes must keep the semantic signature stable"
  );
}

function testTrialWindowsRequireDirectPolicyLanguage() {
  const tokens = extractSemanticTokens(
    "Start a 30-day free trial. Billing begins after the trial ends. Last updated 2 weeks ago.",
    "trial"
  );
  assert.deepEqual(
    tokens.filter((token) => token.startsWith("trial_window_days:")),
    ["trial_window_days:30"],
    "trial duration should be extracted without dynamic page metadata"
  );
}

function testDailyAlertsPreserveReviewEvidence() {
  const alert = buildDailyAlertFromEvents(
    { date_utc: "2026-07-15", generated_at_utc: "2026-07-15T12:00:00Z" },
    [{
      event_id: "refund:expressvpn:hash-123",
      emitted_at_utc: "2026-07-15T11:00:00Z",
      policy: "refund",
      vendor: "expressvpn",
      source_url: "https://example.com/refund-policy",
      semantic_diff_summary: "+refund_window_days:30",
      run_url: "https://github.com/example/actions/runs/1",
    }]
  );

  assert.deepEqual(alert.sample_details, [{
    event_id: "refund:expressvpn:hash-123",
    key: "refund:expressvpn",
    policy: "refund",
    vendor: "expressvpn",
    source_url: "https://example.com/refund-policy",
    semantic_diff_summary: "+refund_window_days:30",
    emitted_at_utc: "2026-07-15T11:00:00Z",
    run_url: "https://github.com/example/actions/runs/1",
    review_status: "unreviewed",
    rulebook_updated: false,
  }]);
  assert.equal(alert.rulebook_status, "unchanged_pending_human_review");
  assert.equal(alert.decision_rule_impact, "not_auto_applied");
}

function testStrictDailyFeedRequiresReviewedChangeEvidence() {
  const unreviewedChange = buildDailyAlertFromEvents(
    { date_utc: "2026-07-16", generated_at_utc: "2026-07-16T12:00:00Z" },
    [{
      event_id: "refund:linkedin_premium:hash-123",
      emitted_at_utc: "2026-07-16T11:00:00Z",
      policy: "refund",
      vendor: "linkedin_premium",
    }]
  );
  assert.equal(
    isStrictDailyAlertEntry(unreviewedChange, { includeZeroChange: true }),
    false,
    "unreviewed change evidence must not enter the strict daily feed"
  );
  assert.equal(
    isStrictDailyAlertEntry({ changed_count: 0, sample_details: [] }, { includeZeroChange: true }),
    true,
    "zero-change continuity rows may remain strict"
  );

  const publication = classifyDailyAlertForPublication(unreviewedChange, { includeZeroChange: true });
  assert.equal(publication.strictEligible, false);
  assert.equal(publication.reason, "awaiting_event_review");
  assert.equal(publication.normalizedEntry.status, "review");
  assert.equal(publication.normalizedEntry.state, "needs_review");
  assert.equal(publication.normalizedEntry.change_review_state, "review_required");
}

function testBuildChangeKeyPrefersSemanticSignature() {
  const value = buildChangeKey("abc123hash", "cancel:anytime|billing:auto_renew");
  assert.equal(value, "cancel:anytime|billing:auto_renew", "semantic signature should drive change key when present");
}

function testBuildChangeKeyFallsBackToHash() {
  const value = buildChangeKey("abc123hash", "");
  assert.equal(value, "abc123hash", "hash should be used when semantic signature is absent");
}

function testBuildChangeKeyHandlesMissingValues() {
  const value = buildChangeKey("", "");
  assert.equal(value, "", "empty inputs should produce an empty change key");
}

function testHighSignalWindowCandidateDetection() {
  const minHits = configuredHighSignalMinPolicyHits();
  const minLines = configuredHighSignalMinLines();
  assert.equal(
    isHighSignalWindowCandidate({
      semanticSignature: "cancel:anytime",
      quality: { passed: true, policyKeywordHits: minHits, lineCount: minLines },
    }),
    true,
    "high-signal candidates should require semantic signal + quality thresholds"
  );
  assert.equal(
    isHighSignalWindowCandidate({
      semanticSignature: "",
      quality: { passed: true, policyKeywordHits: 3, lineCount: 9 },
    }),
    false,
    "semantic signature is required for high-signal classification"
  );
}

function testAdaptiveWindowRequiredForCandidate() {
  const minHits = configuredHighSignalMinPolicyHits();
  const minLines = configuredHighSignalMinLines();
  const defaultRequired = configuredDefaultWindowRequired();
  const expectedHighSignalRequired = Math.min(defaultRequired, configuredHighSignalWindowRequired());

  const highSignalRequired = getCrossRunWindowRequiredForCandidate({
    semanticSignature: "cancel:anytime",
    quality: { passed: true, policyKeywordHits: minHits, lineCount: minLines },
  });
  assert.equal(
    highSignalRequired,
    expectedHighSignalRequired,
    "high-signal candidates should use the configured relaxed window requirement"
  );

  const lowSignalRequired = getCrossRunWindowRequiredForCandidate({
    semanticSignature: "cancel:anytime",
    quality: { passed: true, policyKeywordHits: Math.max(0, minHits - 1), lineCount: minLines },
  });
  assert.equal(lowSignalRequired, defaultRequired, "low-signal candidates should keep the default required window");
}

function testEvaluateSignalWindowSupportsRequiredOverride() {
  const signals = ["sig:a", "sig:a", "sig:b"];
  const relaxedDecision = evaluateSignalWindow(signals, 2);
  assert.equal(relaxedDecision.required, 2, "expected required vote count override to be applied");
  assert.equal(relaxedDecision.hashDecision, "sig:a", "expected top signal to win with relaxed threshold");

  const strictDecision = evaluateSignalWindow(signals, 3);
  assert.equal(strictDecision.required, 3, "expected strict required vote count to be applied");
  assert.equal(strictDecision.hashDecision, "", "expected no winner when strict threshold is unmet");
}

function testCountSignalWindowChangeFlips() {
  assert.equal(
    countSignalWindowChangeFlips(["__baseline__", "sig:a", "__baseline__", "sig:a", "__baseline__"]),
    0,
    "baseline bounce should not count as a semantic flip"
  );
  assert.equal(
    countSignalWindowChangeFlips(["sig:a", "sig:b", "__baseline__", "sig:a", "sig:c"]),
    3,
    "expected non-baseline signal transitions to be counted"
  );
}

function testVolatileFlipThresholdOverrides() {
  const override = getVolatileFlipThresholdForVendor("cancel", "canva");
  assert.deepEqual(
    override,
    { threshold: 8, overridden: true },
    "expected known volatile vendor override to be applied"
  );

  const fallback = getVolatileFlipThresholdForVendor("cancel", "unknown_vendor");
  assert.equal(fallback.overridden, false, "unknown vendor should use default volatile threshold");
  assert.equal(fallback.threshold >= 1, true, "default volatile threshold should remain positive");
}

function testSourceVolatilityTierResolution() {
  const explicitFlaky = resolveSourceVolatilityTier(
    { volatility_tier: "flaky" },
    "https://www.example.com/legal/policy"
  );
  assert.equal(explicitFlaky, "flaky", "explicit vendor volatility_tier should win");

  const inferredFlaky = resolveSourceVolatilityTier(
    {},
    "https://help.example.com/hc/en-us/articles/123456-cancel-policy"
  );
  assert.equal(inferredFlaky, "flaky", "help/support style sources should infer flaky tier");

  const inferredNormal = resolveSourceVolatilityTier(
    {},
    "https://www.example.com/legal/terms"
  );
  assert.equal(inferredNormal, "normal", "stable canonical legal pages should remain normal tier");
}

function testVolatileFlipThresholdIncludesFlakyTierDelta() {
  const normalDefault = getVolatileFlipThresholdForVendor("cancel", "unknown_vendor", "normal");
  const flakyDefault = getVolatileFlipThresholdForVendor("cancel", "unknown_vendor", "flaky");
  assert.equal(
    flakyDefault.threshold,
    normalDefault.threshold + 2,
    "flaky tier should raise default volatile flip threshold by configured delta"
  );

  const normalOverride = getVolatileFlipThresholdForVendor("cancel", "canva", "normal");
  const flakyOverride = getVolatileFlipThresholdForVendor("cancel", "canva", "flaky");
  assert.equal(
    flakyOverride.threshold,
    normalOverride.threshold + 2,
    "flaky tier should raise override volatile flip threshold by configured delta"
  );
}

function testFallbackSignalTransitionRequiresStrongSignatures() {
  const emptyNext = evaluateFallbackSignalTransition({
    previousStrongSignature: "abc123",
    nextStrongSignature: "",
    previousConsecutiveRuns: 4,
    thresholdRuns: 2,
  });
  assert.deepEqual(
    emptyNext,
    {
      changed: false,
      consecutiveRuns: 0,
      actionable: false,
      reason: "no_strong_signal",
    },
    "missing strong signal should reset fallback transition counters"
  );

  const firstStrong = evaluateFallbackSignalTransition({
    previousStrongSignature: "",
    nextStrongSignature: "def456",
    previousConsecutiveRuns: 1,
    thresholdRuns: 2,
  });
  assert.equal(firstStrong.changed, false, "first observed strong signature should not be treated as a change");
  assert.equal(firstStrong.actionable, false, "first observed strong signature should not be actionable");
  assert.equal(firstStrong.reason, "first_strong_signal", "first strong signature should emit first-signal reason");
}

function testFallbackSignalTransitionStableSignatureResetsConsecutiveRuns() {
  const stable = evaluateFallbackSignalTransition({
    previousStrongSignature: "abc123",
    nextStrongSignature: "abc123",
    previousConsecutiveRuns: 3,
    thresholdRuns: 2,
  });
  assert.deepEqual(
    stable,
    {
      changed: false,
      consecutiveRuns: 0,
      actionable: false,
      reason: "stable_strong_signal",
    },
    "stable strong signatures should reset consecutive changed-run counter"
  );
}

function testFallbackSignalTransitionActionableThreshold() {
  const belowThreshold = evaluateFallbackSignalTransition({
    previousStrongSignature: "abc123",
    nextStrongSignature: "def456",
    previousConsecutiveRuns: 0,
    thresholdRuns: 2,
  });
  assert.equal(belowThreshold.changed, true, "signature change should be detected");
  assert.equal(belowThreshold.consecutiveRuns, 1, "first changed run should increment to one");
  assert.equal(belowThreshold.actionable, false, "single changed run should stay non-actionable");

  const atThreshold = evaluateFallbackSignalTransition({
    previousStrongSignature: "abc123",
    nextStrongSignature: "def456",
    previousConsecutiveRuns: 1,
    thresholdRuns: 2,
  });
  assert.equal(atThreshold.changed, true, "signature change should remain detected");
  assert.equal(atThreshold.consecutiveRuns, 2, "second changed run should increment to threshold");
  assert.equal(atThreshold.actionable, true, "changed runs at threshold should become actionable");
  assert.equal(atThreshold.reason, "strong_signal_changed", "expected changed reason for actionable transition");
}

function testNormalizeSourceUrlForComparisonCanonicalizesTrivialDifferences() {
  const left = normalizeSourceUrlForComparison("https://EXAMPLE.com/path/?b=2&a=1#fragment");
  const right = normalizeSourceUrlForComparison("https://example.com/path?a=1&b=2");
  assert.equal(left, right, "URL normalization should ignore host case, hash, query order, and trailing slash");
}

function testEvaluateVendorSourceMigrationDetectsPrimaryUrlChanges() {
  const migration = evaluateVendorSourceMigration({
    configuredSourceUrl: "https://www.nfl.com/legal/subscriptions_terms",
    candidateSourceUrl: "https://support.nfl.com/hc/en-us/articles/5402041435292-NFL-Subscription-Renewals-Cancellations",
  });
  assert.equal(migration.migrated, true, "different source roots should trigger migration reset");
  assert.equal(migration.reason, "primary_source_url_changed", "expected explicit migration reason");
}

function testEvaluateVendorSourceMigrationSkipsStableOrMissingSources() {
  const stable = evaluateVendorSourceMigration({
    configuredSourceUrl: "https://example.com/policy/",
    baselineSourceUrl: "https://example.com/policy",
  });
  assert.equal(stable.migrated, false, "equivalent URLs should not trigger migration reset");
  assert.equal(stable.reason, "stable_source", "stable URL comparison should emit stable_source reason");

  const noPrior = evaluateVendorSourceMigration({
    configuredSourceUrl: "https://example.com/policy",
    baselineSourceUrl: "",
    candidateSourceUrl: "",
    coverageSourceUrl: "",
    semanticSourceUrl: "",
  });
  assert.equal(noPrior.migrated, false, "missing previous source should not trigger migration reset");
  assert.equal(noPrior.reason, "no_prior_source", "missing prior source should emit no_prior_source reason");
}

async function main() {
  testMonitorCheckDoesNotClaimHumanVerification();
  console.log("PASS check-policies machine checks preserve human verification time");
  testDistinctTier1FailuresCountVendorsOnceAcrossPolicies();
  console.log("PASS check-policies Tier-1 gate counts distinct vendors");
  testBrowserHookFailuresExposeSanitizedProviderReasons();
  console.log("PASS check-policies browser-hook diagnostics are sanitized");
  await testMinIntervalSchedulerSerializesBrowserHookRequests();
  console.log("PASS check-policies browser-hook requests respect minimum spacing");
  await testWorkPoolStartsNextItemWithoutWaitingForBatchPeers();
  console.log("PASS check-policies worker pool avoids batch head-of-line blocking");
  await testWorkPoolPreservesConcurrencyAndCooldown();
  console.log("PASS check-policies worker pool preserves concurrency and cooldowns");
  await testWorkPoolStopsQueuedWorkAfterFailure();
  console.log("PASS check-policies worker pool stops queued work after failure");
  await testDirectFetchLaneOwnsAbortLifecycle();
  console.log("PASS check-policies direct fetch owns its abort lifecycle");
  await testSuccessfulFetchCacheReusesSuccessfulReads();
  console.log("PASS check-policies successful raw reads are reused within a run");
  await testSuccessfulFetchCacheRetriesFailures();
  console.log("PASS check-policies failed raw reads are retried");
  await testSuccessfulFetchCacheBypassReadsFreshWithoutReplacingCache();
  console.log("PASS check-policies confirmation reads bypass the run cache");
  await testSuccessfulFetchCacheDefersRetentionUntilQualityPasses();
  console.log("PASS check-policies raw reads are retained only after quality approval");
  testBlockedFetchReuseCacheRetainsOnlyExhaustedFailures();
  console.log("PASS check-policies exhausted blocker cache retains only failures");
  testPolicyFetchScheduleDefersKnownBlockedSources();
  console.log("PASS check-policies healthy sources run before blocked retry sources");
  await testPolicySetsReuseExhaustedBlockedFetchPlans();
  console.log("PASS check-policies policy surfaces reuse exhausted blocked fetch plans");
  await testPolicySetsShareSuccessfulRawSourceReads();
  console.log("PASS check-policies policy surfaces share successful raw source reads");
  await testPolicySetWritesMonitorArtifactTimestamps();
  console.log("PASS check-policies state artifacts use monitor timestamp");
  testImmediateBlockOnCloudflareAnd403();
  console.log("PASS check-policies immediate block on anti-bot");

  testImmediateBlockAllowsZendesk404AsAuxiliary();
  console.log("PASS check-policies zendesk auxiliary miss");

  testTransientFailureDoesNotImmediateBlock();
  console.log("PASS check-policies transient failure");

  testPlain403StillImmediateBlocks();
  console.log("PASS check-policies plain 403");

  testLegacyPendingModelDefaults();
  console.log("PASS check-policies legacy pending default");

  testCurrentPendingModelStaysActive();
  console.log("PASS check-policies current pending model");

  testZendeskApiTargetForArticle();
  console.log("PASS check-policies zendesk article target");

  testZendeskApiTargetForSection();
  console.log("PASS check-policies zendesk section target");

  testZendeskApiTargetRejectsUnsupportedPaths();
  console.log("PASS check-policies zendesk unsupported path");

  testSemanticSignaturesStableForEmptyTokens();
  console.log("PASS check-policies semantic stability empty signatures");

  testSemanticSignaturesStableForMatchingNonEmptyTokens();
  console.log("PASS check-policies semantic stability matching signatures");

  testSemanticSignaturesStableRejectsMixedOrDifferentTokens();
  console.log("PASS check-policies semantic stability rejects mismatches");

  testReturnSignalsIgnoreCancellationOnlyLanguage();
  console.log("PASS check-policies return signals ignore cancellation-only language");

  testRefundWindowsRequireDirectPolicyLanguage();
  console.log("PASS check-policies refund windows require direct policy language");

  testRelativeMetadataStaysStableAcrossDailyRuns();
  console.log("PASS check-policies relative metadata stable across daily runs");

  testTrialWindowsRequireDirectPolicyLanguage();
  console.log("PASS check-policies trial windows require direct policy language");

  testDailyAlertsPreserveReviewEvidence();
  console.log("PASS check-policies daily alerts preserve review evidence");

  testStrictDailyFeedRequiresReviewedChangeEvidence();
  console.log("PASS check-policies strict feed requires reviewed change evidence");

  testBuildChangeKeyPrefersSemanticSignature();
  console.log("PASS check-policies change key prefers semantic signature");

  testBuildChangeKeyFallsBackToHash();
  console.log("PASS check-policies change key fallback hash");

  testBuildChangeKeyHandlesMissingValues();
  console.log("PASS check-policies change key missing inputs");

  testHighSignalWindowCandidateDetection();
  console.log("PASS check-policies high-signal candidate detection");

  testAdaptiveWindowRequiredForCandidate();
  console.log("PASS check-policies adaptive window required votes");

  testEvaluateSignalWindowSupportsRequiredOverride();
  console.log("PASS check-policies signal window required override");

  testCountSignalWindowChangeFlips();
  console.log("PASS check-policies signal window change flips");

  testVolatileFlipThresholdOverrides();
  console.log("PASS check-policies volatile threshold overrides");

  testSourceVolatilityTierResolution();
  console.log("PASS check-policies source volatility tier resolution");

  testVolatileFlipThresholdIncludesFlakyTierDelta();
  console.log("PASS check-policies volatile threshold source-tier delta");

  testFallbackSignalTransitionRequiresStrongSignatures();
  console.log("PASS check-policies fallback transition strong signal requirement");

  testFallbackSignalTransitionStableSignatureResetsConsecutiveRuns();
  console.log("PASS check-policies fallback transition stability reset");

  testFallbackSignalTransitionActionableThreshold();
  console.log("PASS check-policies fallback transition actionable threshold");

  testNormalizeSourceUrlForComparisonCanonicalizesTrivialDifferences();
  console.log("PASS check-policies URL normalization");

  testEvaluateVendorSourceMigrationDetectsPrimaryUrlChanges();
  console.log("PASS check-policies source migration detection");

  testEvaluateVendorSourceMigrationSkipsStableOrMissingSources();
  console.log("PASS check-policies source migration stable/missing");

  console.log("Check-policies tests passed: 51/51");
}

try {
  await main();
} catch (error) {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
}
