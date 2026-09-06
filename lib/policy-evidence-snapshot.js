import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { buildPolicySourceHash } from "./lineage.js";
import { getPolicySupabaseConfig } from "./policy-supabase.js";

export const POLICY_EVIDENCE_ARTIFACT_PATH = "rules/policy-runtime-evidence.json";
// Literal URLs keep all catalog inputs visible to serverless file tracing.
const SOURCES = {
  refund: new URL("../rules/policy-sources.json", import.meta.url),
  cancel: new URL("../rules/cancel-policy-sources.json", import.meta.url),
  return: new URL("../rules/return-policy-sources.json", import.meta.url),
  trial: new URL("../rules/trial-policy-sources.json", import.meta.url),
};
const RULES = {
  refund: new URL("../rules/v1_us_individual.json", import.meta.url),
  cancel: new URL("../rules/v1_us_individual_cancel.json", import.meta.url),
  return: new URL("../rules/v1_us_individual_return.json", import.meta.url),
  trial: new URL("../rules/v1_us_individual_trial.json", import.meta.url),
};
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function readPolicyEvidenceCatalog() {
  return Object.fromEntries(Object.entries(SOURCES).map(([policy, file]) => {
    const sources = JSON.parse(readFileSync(file, "utf8"));
    const rules = JSON.parse(readFileSync(RULES[policy], "utf8"));
    return [policy, {
      policy_version: rules.rules_version,
      source_hash: buildPolicySourceHash({ policy, policyVersion: rules.rules_version, rules: rules.vendors,
        sources: sources.vendors, lastVerifiedUtc: sources.last_verified_utc || "", verificationScope: sources.verification_scope || "" }),
      vendors: Object.fromEntries(Object.keys(rules.vendors).map((vendor) => [vendor, {
        url: sources.vendors[vendor]?.url || "",
        verified_at: sources.vendors[vendor]?.last_verified_utc || sources.last_verified_utc || "",
      }])),
    }];
  }));
}

const CATALOG = readPolicyEvidenceCatalog();

// The monitor can withhold evidence, but cannot invent or promote a reviewed rule.
export function buildPolicyEvidenceSnapshot(report, catalog = CATALOG) {
  return {
    schema_version: "policy_evidence_snapshot_v1",
    generated_at: report.generated_at_utc,
    run_id: report.run_id,
    run_attempt: report.run_attempt,
    commit_sha: report.commit_sha,
    policies: (report.rows || []).map((row) => {
      const family = catalog[row.policy];
      const source = family?.vendors[row.vendor];
      if (!source || source.url !== row.source_url) throw new Error("POLICY_EVIDENCE_SOURCE_MISMATCH");
      return {
        policy: row.policy, vendor: row.vendor, status: row.status,
        flags: [...new Set([...(row.flags || []), ...(row.pending_candidate ? ["pending_candidate"] : []),
          ...(row.quality_gate_failed ? ["quality_gate_failed"] : [])])],
        source_url: source.url, source_hash: family.source_hash, policy_version: family.policy_version,
        verified_at: source.verified_at, checked_at: row.last_successful_fetch_utc || "",
        last_confirmed_change_at: [row.last_confirmed_change_utc, row.last_runtime_evidence_reset_utc]
          .filter(Boolean).sort((a, b) => Date.parse(b) - Date.parse(a))[0] || "",
      };
    }),
  };
}

function decodeArtifact(row, now) {
  if (row?.artifact_path !== POLICY_EVIDENCE_ARTIFACT_PATH || row.source !== "check-policies.js"
    || typeof row.content_text !== "string" || Buffer.byteLength(row.content_text) > 1000000
    || !/^[a-f0-9]{64}$/.test(row.content_sha256 || "") || sha256(row.content_text) !== row.content_sha256) return null;
  const snapshot = JSON.parse(row.content_text);
  const generated = Date.parse(snapshot.generated_at);
  const updated = Date.parse(row.updated_at_utc);
  const evaluated = new Date(now).getTime();
  if (snapshot.schema_version !== "policy_evidence_snapshot_v1" || !Array.isArray(snapshot.policies)
    || !/^\d+$/.test(row.run_id || "") || !/^[1-9]\d*$/.test(row.run_attempt || "")
    || !/^[a-f0-9]{40}$/.test(row.commit_sha || "")
    || snapshot.run_id !== row.run_id || snapshot.run_attempt !== row.run_attempt || snapshot.commit_sha !== row.commit_sha
    || !Number.isFinite(generated) || !Number.isFinite(updated) || !Number.isFinite(evaluated)
    || generated > evaluated || updated < generated || updated > evaluated || evaluated - generated >= 72 * 3600000) return null;
  const expected = new Set(Object.entries(CATALOG).flatMap(([policy, family]) => Object.keys(family.vendors).map((vendor) => `${policy}:${vendor}`)));
  if (snapshot.policies.length !== expected.size) return null;
  for (const entry of snapshot.policies) {
    const family = CATALOG[entry.policy];
    const source = family?.vendors[entry.vendor];
    if (!expected.delete(`${entry.policy}:${entry.vendor}`) || !source
      || source.url !== entry.source_url || source.verified_at !== entry.verified_at
      || family.source_hash !== entry.source_hash || family.policy_version !== entry.policy_version
      || typeof entry.status !== "string" || !Array.isArray(entry.flags)) return null;
  }
  return { ...snapshot, snapshot_hash: row.content_sha256 };
}

let cached = null;
let pending = null;

export async function loadPolicyEvidenceSnapshot(options = {}) {
  const env = options.env || process.env;
  const config = getPolicySupabaseConfig(env);
  if (!config.configured) return null;
  const now = options.now || new Date();
  const fetchImpl = options.fetchImpl || fetch;
  const useCache = !options.env && !options.fetchImpl && !options.now;
  const key = sha256(`${config.url}\n${config.serviceRoleKey}`);
  if (useCache && cached?.key === key && cached.expires > Date.now()) return cached.snapshot;
  if (useCache && pending?.key === key) return pending.promise;
  const promise = (async () => {
    const controller = new AbortController();
    let timeout;
    try {
      // This reader exists only after the server-only artifact boundary is installed.
      // No fallback to the legacy table endpoint if the migration is absent.
      const url = new URL("/rest/v1/rpc/read_policy_runtime_evidence", config.url);
      if (url.protocol !== "https:") return null;
      const budget = Math.max(10, Math.min(Number(options.timeoutMs) || 1500, 3000));
      const operation = (async () => {
        const response = await fetchImpl(url.toString(), {
          method: "POST", body: "{}", headers: { "content-type": "application/json", apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}` },
          signal: controller.signal, redirect: "error",
        });
        if (!response.ok) return null;
        const text = await response.text();
        if (Buffer.byteLength(text) > 2000000) return null;
        const rows = JSON.parse(text);
        return Array.isArray(rows) && rows.length === 1 ? decodeArtifact(rows[0], now) : null;
      })();
      const snapshot = await Promise.race([operation, new Promise((resolve) => {
        timeout = setTimeout(() => { controller.abort(); resolve(null); }, budget);
      })]);
      if (useCache) cached = { key, snapshot, expires: Date.now() + (snapshot ? 60000 : 5000) };
      return snapshot;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  })();
  if (useCache) pending = { key, promise };
  try { return await promise; } finally { if (pending?.promise === promise) pending = null; }
}
