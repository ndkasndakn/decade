// Test-only durable-state boundary. No environment switch bypasses runtime checks.
import { mock } from "node:test";
import { createHash } from "node:crypto";
import { buildPolicyEvidenceSnapshot, readPolicyEvidenceCatalog, POLICY_EVIDENCE_ARTIFACT_PATH } from "../../lib/policy-evidence-snapshot.js";

mock.timers.enable({ apis: ["Date"], now: new Date("2026-09-06T12:00:00Z") });
const catalog = readPolicyEvidenceCatalog();
const report = {
  generated_at_utc: "2026-09-06T03:00:00Z", run_id: "1", run_attempt: "1", commit_sha: "a".repeat(40),
  rows: Object.entries(catalog).flatMap(([policy, family]) => Object.entries(family.vendors).map(([vendor, source]) => ({
    policy, vendor, status: "unchanged", flags: [], source_url: source.url,
    last_successful_fetch_utc: "2026-09-06T02:00:00Z", last_confirmed_change_utc: "",
  }))),
};
const snapshot = buildPolicyEvidenceSnapshot(report);
const content = JSON.stringify(snapshot);
const artifact = {
  artifact_path: POLICY_EVIDENCE_ARTIFACT_PATH, content_text: content,
  content_sha256: createHash("sha256").update(content).digest("hex"), source: "check-policies.js",
  run_id: report.run_id, run_attempt: report.run_attempt, commit_sha: report.commit_sha,
  updated_at_utc: "2026-09-06T03:01:00Z",
};
process.env.SUPABASE_URL = "https://policy-evidence-fixture.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-only-not-a-real-key";
globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  if (url.origin === process.env.SUPABASE_URL && url.pathname === "/rest/v1/rpc/read_policy_runtime_evidence") {
    return new Response(JSON.stringify([artifact]));
  }
  throw new Error("TEST_EXTERNAL_NETWORK_DISABLED");
};

export const testPolicyEvidenceSnapshot = { ...snapshot, snapshot_hash: artifact.content_sha256 };
