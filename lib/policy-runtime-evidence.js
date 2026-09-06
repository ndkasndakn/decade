// Evidence is a runtime input, never a caller-supplied permission to act.
export function evaluatePolicyEvidence({ policy, vendor, snapshot, sourceHash, policyVersion, sourceUrl, verifiedAt, now = new Date() }) {
  const evidence = {
    schema_version: "policy_evidence_v1",
    policy,
    vendor,
    evaluated_at: new Date(now).toISOString(),
    status: "unavailable",
    reason: "trusted_snapshot_missing",
    current: false,
  };
  const row = Array.isArray(snapshot?.policies) ? snapshot.policies.find((entry) => entry?.policy === policy && entry.vendor === vendor) : null;
  if (!row) return evidence;
  if (row.source_hash !== sourceHash || row.policy_version !== policyVersion || row.source_url !== sourceUrl || row.verified_at !== verifiedAt) {
    return { ...evidence, reason: "policy_snapshot_mismatch" };
  }
  const evaluatedTime = Date.parse(evidence.evaluated_at);
  const timestamps = [row.checked_at, row.verified_at, snapshot.generated_at];
  if (snapshot.schema_version !== "policy_evidence_snapshot_v1"
    || !/^[a-f0-9]{64}$/.test(snapshot.snapshot_hash || "")
    || timestamps.some((value) => !Number.isFinite(Date.parse(value)) || Date.parse(value) > evaluatedTime)
    || Date.parse(row.checked_at) > Date.parse(snapshot.generated_at)
    || (row.last_confirmed_change_at && !Number.isFinite(Date.parse(row.last_confirmed_change_at)))) {
    return { ...evidence, reason: "invalid_evidence_timestamps_or_identity" };
  }
  if (!["unchanged", "fetch_failed", "fetch_blocked"].includes(row.status)
    || !Array.isArray(row.flags) || row.flags.some((flag) => flag !== "flaky_source")
    || Date.parse(row.last_confirmed_change_at) > Date.parse(row.verified_at)) {
    return { ...evidence, status: "review_required", reason: "source_change_requires_review" };
  }
  const validUntil = Math.min(
    Date.parse(row.checked_at) + (policy === "trial" ? 7 : 30) * 86400000,
    Date.parse(row.verified_at) + 90 * 86400000,
    Date.parse(snapshot.generated_at) + 72 * 3600000,
  );
  const current = Number.isFinite(validUntil) && Date.parse(evidence.evaluated_at) < validUntil;
  return {
    ...evidence,
    status: current ? "current" : "expired",
    reason: current ? "within_evidence_window" : "evidence_window_expired",
    current,
    valid_until: Number.isFinite(validUntil) ? new Date(validUntil).toISOString() : null,
    snapshot_hash: snapshot.snapshot_hash,
    snapshot_generated_at: snapshot.generated_at,
    source_url: row.source_url,
    source_hash: row.source_hash,
    policy_version: row.policy_version,
    checked_at: row.checked_at,
    verified_at: row.verified_at,
  };
}
