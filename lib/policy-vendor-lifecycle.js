const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_FRESHNESS_DAYS = {
  refund: 30,
  cancel: 30,
  return: 30,
  trial: 7,
};

const DEGRADED_CHECK_STATUSES = new Set([
  "fetch_blocked",
  "fetch_failed",
  "quality_gate_held",
]);

function parseDate(value) {
  const parsed = new Date(String(value || ""));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function ageDays(value, now) {
  const timestamp = parseDate(value);
  const current = parseDate(now) || new Date();
  if (!timestamp) return null;
  return Math.max(0, Math.floor((current.getTime() - timestamp.getTime()) / DAY_MS));
}

function normalizeAdmission(registry = {}) {
  const admission = registry?.admission && typeof registry.admission === "object"
    ? registry.admission
    : {};
  return {
    minimum_observations: Math.max(1, Number(admission.minimum_observations || 56)),
    minimum_success_rate: Math.min(1, Math.max(0, Number(admission.minimum_success_rate || 0.99))),
    minimum_hash_stability_rate: Math.min(
      1,
      Math.max(0, Number(admission.minimum_hash_stability_rate ?? 0.95))
    ),
    max_consecutive_failures: Math.max(0, Number(admission.max_consecutive_failures || 0)),
    freshness_days_by_policy: {
      ...DEFAULT_FRESHNESS_DAYS,
      ...(admission.freshness_days_by_policy || {}),
    },
  };
}

export function evaluateMonitoredVendorPolicy(row = {}, {
  now = new Date(),
  freshnessDaysByPolicy = DEFAULT_FRESHNESS_DAYS,
  deprecatedVendors = new Set(),
} = {}) {
  const policy = String(row.policy || "").trim();
  const vendor = String(row.vendor || "").trim();
  const lastSuccess = String(row.last_successful_fetch_utc || "").trim();
  const freshnessLimit = Math.max(1, Number(freshnessDaysByPolicy[policy] || 30));
  const freshnessAge = ageDays(lastSuccess, now);

  let lifecycle = "monitored";
  let reason = "source_monitoring_current";

  if (deprecatedVendors.has(vendor)) {
    lifecycle = "deprecated";
    reason = "vendor_deprecated_by_review";
  } else if (!lastSuccess) {
    lifecycle = "degraded";
    reason = "missing_successful_fetch";
  } else if (freshnessAge > freshnessLimit) {
    lifecycle = "expired";
    reason = "source_freshness_expired";
  } else if (DEGRADED_CHECK_STATUSES.has(String(row.status || "").trim())) {
    lifecycle = "degraded";
    reason = `latest_check_${String(row.status || "unknown").trim() || "unknown"}`;
  }

  return {
    ...row,
    lifecycle,
    lifecycle_reason: reason,
    freshness_age_days: freshnessAge,
    freshness_limit_days: freshnessLimit,
  };
}

function evaluateCandidatePolicy({
  policy,
  config = {},
  state = {},
  admission,
  now,
}) {
  const monitor = String(config.monitor || "").trim();
  if (monitor === "manual_review") {
    const reviewStatus = String(config.review_status || "pending").trim();
    const reviewed = Date.parse(config.reviewed_at_utc);
    const reviewAge = new Date(now).getTime() - reviewed;
    const hasEvidence = Array.isArray(config.evidence_urls) && config.evidence_urls.length > 0
      && config.evidence_urls.every(value => { try { return new URL(value).protocol === "https:"; } catch { return false; } });
    const completeSignoff = ["review_owner", "reviewed_by", "review_scope", "review_id"]
      .every(field => typeof config[field] === "string" && config[field].trim())
      && config.review_disposition === "not_applicable_to_scoped_subscription"
      && hasEvidence && Number.isFinite(reviewed) && reviewAge >= 0 && reviewAge < 90 * DAY_MS;
    const approved = reviewStatus === "approved" && completeSignoff;
    return {
      policy,
      monitor,
      review_status: reviewStatus,
      review_owner: config.review_owner || null,
      review_owner_role: config.review_owner_role || "policy_maintainer",
      review_id: config.review_id || "",
      review_disposition: config.review_disposition || "unresolved",
      review_evidence_file: config.review_evidence_file || "",
      lifecycle: approved ? "manual_review_approved" : "candidate",
      ready_for_review: approved,
      blocker: approved ? "" : reviewStatus === "approved" ? "manual_review_signoff_incomplete_or_expired" : "manual_policy_applicability_review_required",
      observation_count: 0,
      success_rate: null,
      consecutive_failures: 0,
      last_successful_fetch_utc: "",
    };
  }

  const observations = Array.isArray(state.observations) ? state.observations : [];
  const observationCount = observations.length;
  const successCount = observations.filter((entry) => entry?.status === "success").length;
  const successRate = observationCount > 0 ? successCount / observationCount : 0;
  const configuredHashStability = Number(state.hash_stability_rate);
  const hashStabilityRate = Number.isFinite(configuredHashStability)
    ? configuredHashStability
    : 1;
  const consecutiveFailures = Math.max(0, Number(state.consecutive_failures || 0));
  const lastSuccess = String(state.last_successful_fetch_utc || "").trim();
  const freshnessLimit = Math.max(1, Number(admission.freshness_days_by_policy[policy] || 30));
  const freshnessAge = ageDays(lastSuccess, now);
  const latestStatus = String(state.last_status || "missing").trim() || "missing";

  const blockers = [];
  if (observationCount < admission.minimum_observations) blockers.push("minimum_observations_not_met");
  if (successRate < admission.minimum_success_rate) blockers.push("success_rate_below_threshold");
  if (
    successCount >= admission.minimum_observations
    && hashStabilityRate < admission.minimum_hash_stability_rate
  ) {
    blockers.push("hash_stability_below_threshold");
  }
  if (consecutiveFailures > admission.max_consecutive_failures) blockers.push("consecutive_failure_limit_exceeded");
  if (!lastSuccess) blockers.push("missing_successful_fetch");
  if (freshnessAge !== null && freshnessAge > freshnessLimit) blockers.push("source_freshness_expired");
  if (latestStatus !== "success") blockers.push("latest_observation_failed");

  const reliabilityFailure = blockers.some((blocker) => [
    "success_rate_below_threshold",
    "hash_stability_below_threshold",
    "consecutive_failure_limit_exceeded",
    "source_freshness_expired",
    "latest_observation_failed",
  ].includes(blocker));
  const ready = blockers.length === 0;

  return {
    policy,
    monitor,
    lifecycle: ready ? "ready_for_review" : (reliabilityFailure ? "candidate_degraded" : "candidate"),
    ready_for_review: ready,
    blocker: blockers.join(","),
    observation_count: observationCount,
    success_count: successCount,
    success_rate: Number(successRate.toFixed(4)),
    required_observations: admission.minimum_observations,
    required_success_rate: admission.minimum_success_rate,
    hash_stability_rate: Number(hashStabilityRate.toFixed(4)),
    required_hash_stability_rate: admission.minimum_hash_stability_rate,
    consecutive_failures: consecutiveFailures,
    last_status: latestStatus,
    last_successful_fetch_utc: lastSuccess,
    freshness_age_days: freshnessAge,
    freshness_limit_days: freshnessLimit,
    source_updated_at: String(state.source_updated_at || ""),
  };
}

function aggregateMonitoredVendors(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.vendor)) groups.set(row.vendor, []);
    groups.get(row.vendor).push(row);
  }

  const priority = ["deprecated", "expired", "degraded", "monitored"];
  return [...groups.entries()]
    .map(([vendor, policies]) => {
      const lifecycle = priority.find((status) => policies.some((entry) => entry.lifecycle === status)) || "degraded";
      return {
        vendor,
        lifecycle,
        policy_count: policies.length,
        degraded_policy_count: policies.filter((entry) => entry.lifecycle === "degraded").length,
        expired_policy_count: policies.filter((entry) => entry.lifecycle === "expired").length,
        policies,
      };
    })
    .sort((a, b) => a.vendor.localeCompare(b.vendor));
}

export function buildPolicyVendorLifecycleReport({
  rows = [],
  candidateRegistry = {},
  candidateState = {},
  now = new Date(),
} = {}) {
  const admission = normalizeAdmission(candidateRegistry);
  const deprecatedVendors = new Set(
    Object.entries(candidateRegistry?.existing_vendor_overrides || {})
      .filter(([, config]) => String(config?.lifecycle || "") === "deprecated")
      .map(([vendor]) => vendor)
  );
  const monitoredPolicies = rows.map((row) => evaluateMonitoredVendorPolicy(row, {
    now,
    freshnessDaysByPolicy: admission.freshness_days_by_policy,
    deprecatedVendors,
  }));
  const monitoredVendors = aggregateMonitoredVendors(monitoredPolicies);

  const candidates = Object.entries(candidateRegistry?.candidates || {})
    .map(([vendor, config]) => {
      const policyState = candidateState?.candidates?.[vendor]?.policies || {};
      const policies = Object.entries(config?.policies || {})
        .map(([policy, policyConfig]) => evaluateCandidatePolicy({
          policy,
          config: policyConfig,
          state: policyState[policy] || {},
          admission,
          now,
        }))
        .sort((a, b) => a.policy.localeCompare(b.policy));
      const ready = policies.length > 0 && policies.every((policy) => policy.ready_for_review);
      return {
        vendor,
        display_name: String(config?.display_name || vendor),
        lifecycle: ready ? "ready_for_review" : "candidate",
        automatic_promotion: false,
        ready_for_review: ready,
        blockers: policies.filter((policy) => !policy.ready_for_review).map((policy) => `${policy.policy}:${policy.blocker}`),
        policies,
      };
    })
    .sort((a, b) => a.vendor.localeCompare(b.vendor));

  const lifecycleCounts = monitoredVendors.reduce((counts, vendor) => {
    counts[vendor.lifecycle] = Number(counts[vendor.lifecycle] || 0) + 1;
    return counts;
  }, {});

  return {
    schema_version: "policy_vendor_lifecycle_v1",
    generated_at_utc: (parseDate(now) || new Date()).toISOString(),
    runtime_enforcement_active: true,
    runtime_enforcement_basis: "policy_runtime_code_contract_not_live_deployment_probe",
    runtime_enforcement_mode: "trusted_evidence_required_for_new_policy_evaluations",
    monitoring_mutates_rulebook: false,
    automatic_candidate_promotion: false,
    admission,
    totals: {
      monitored_vendor_count: monitoredVendors.length,
      monitored_policy_count: monitoredPolicies.length,
      lifecycle_counts: lifecycleCounts,
      candidate_count: candidates.length,
      candidates_ready_for_review: candidates.filter((candidate) => candidate.ready_for_review).length,
    },
    monitored_vendors: monitoredVendors,
    candidates,
  };
}

export function formatPolicyVendorLifecycleMarkdown(report = {}) {
  const lines = [
    "# Policy Vendor Lifecycle",
    "",
    `Generated UTC: ${report.generated_at_utc || "unknown"}`,
    "Runtime enforcement: disabled (audit-only)",
    "Automatic candidate promotion: disabled",
    "",
    "## Current vendors",
  ];

  for (const vendor of report.monitored_vendors || []) {
    const exceptions = (vendor.policies || [])
      .filter((policy) => policy.lifecycle !== "monitored")
      .map((policy) => `${policy.policy}:${policy.lifecycle}(${policy.lifecycle_reason})`);
    lines.push(`- ${vendor.vendor}: ${vendor.lifecycle}${exceptions.length ? `; ${exceptions.join(", ")}` : ""}`);
  }

  lines.push("", "## Candidate burn-in");
  for (const candidate of report.candidates || []) {
    lines.push(`- ${candidate.display_name}: ${candidate.lifecycle}`);
    for (const policy of candidate.policies || []) {
      const rate = policy.success_rate === null ? "n/a" : `${(policy.success_rate * 100).toFixed(2)}%`;
      lines.push(
        `  - ${policy.policy}: ${policy.lifecycle}; observations=${policy.observation_count}; success=${rate}${policy.blocker ? `; blocker=${policy.blocker}` : ""}`
      );
    }
  }

  lines.push(
    "",
    "Candidates become ready for human review only after the configured burn-in. Promotion never occurs automatically."
  );
  return `${lines.join("\n").trimEnd()}\n`;
}
