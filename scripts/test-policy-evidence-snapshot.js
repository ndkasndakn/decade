import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { buildPolicyEvidenceSnapshot, readPolicyEvidenceCatalog, loadPolicyEvidenceSnapshot } from "../lib/policy-evidence-snapshot.js";

const now = "2026-09-06T12:00:00Z";
const catalog = readPolicyEvidenceCatalog();
const report = {
  generated_at_utc: "2026-09-06T03:00:00Z", run_id: "34008402916", run_attempt: "1", commit_sha: "a".repeat(40),
  rows: Object.entries(catalog).flatMap(([policy, family]) => Object.entries(family.vendors).map(([vendor, source]) => ({
    policy, vendor, status: "unchanged", flags: [], source_url: source.url,
    last_successful_fetch_utc: "2026-09-06T02:00:00Z", last_confirmed_change_utc: "",
  }))),
};
const snapshot = buildPolicyEvidenceSnapshot(report);
assert.equal(snapshot.policies.length, 400);
const heldReport = structuredClone(report);
heldReport.rows[0].status = 'fetch_failed';
heldReport.rows[0].pending_candidate = true;
heldReport.rows[0].quality_gate_failed = true;
heldReport.rows[0].last_runtime_evidence_reset_utc = '2026-09-05T00:00:00Z';
const heldRow = buildPolicyEvidenceSnapshot(heldReport).policies[0];
assert.ok(heldRow.flags.includes('pending_candidate'));
assert.ok(heldRow.flags.includes('quality_gate_failed'));
assert.equal(heldRow.last_confirmed_change_at, '2026-09-05T00:00:00Z');
const content = JSON.stringify(snapshot);
const artifact = {
  artifact_path: "rules/policy-runtime-evidence.json", content_text: content,
  content_sha256: createHash("sha256").update(content).digest("hex"),
  source: "check-policies.js", run_id: report.run_id, run_attempt: "1", commit_sha: report.commit_sha,
  updated_at_utc: "2026-09-06T03:01:00Z",
};
const env = { SUPABASE_URL: "https://evidence-test.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-only-not-a-secret" };
const fetchImpl = async (url, init) => {
  assert.equal(new URL(url).pathname, "/rest/v1/rpc/read_policy_runtime_evidence");
  assert.equal(init.method, "POST");
  return new Response(JSON.stringify([artifact]));
};
const loaded = await loadPolicyEvidenceSnapshot({ env, fetchImpl, now });
assert.equal(loaded?.snapshot_hash, artifact.content_sha256);
assert.equal(loaded?.policies.length, 400);
console.log("PASS: generated monitoring evidence loads through the validated durable-state boundary");

for (const mutate of [
  (row) => { row.content_text += " "; },
  (row) => { row.run_id = "other"; },
  (row) => { row.source = "untrusted"; },
  (row) => { row.updated_at_utc = "2026-09-07T00:00:00Z"; },
  (row) => { const data = JSON.parse(row.content_text); data.policies.pop(); row.content_text = JSON.stringify(data); row.content_sha256 = createHash("sha256").update(row.content_text).digest("hex"); },
  (row) => { const data = JSON.parse(row.content_text); data.policies[0].source_url = "https://wrong.example/"; row.content_text = JSON.stringify(data); row.content_sha256 = createHash("sha256").update(row.content_text).digest("hex"); },
]) {
  const bad = structuredClone(artifact); mutate(bad);
  assert.equal(await loadPolicyEvidenceSnapshot({ env, now, fetchImpl: async () => new Response(JSON.stringify([bad])) }), null);
}
assert.equal(await loadPolicyEvidenceSnapshot({ env, now: "2026-09-10T00:00:00Z", fetchImpl }), null);
assert.equal(await loadPolicyEvidenceSnapshot({ env: {}, now, fetchImpl: () => { throw new Error("Must not fetch without server credentials"); } }), null);
for (const stalledFetch of [async () => new Promise(() => {}), async () => ({ ok: true, text: () => new Promise(() => {}) })]) {
  const started = performance.now();
  assert.equal(await loadPolicyEvidenceSnapshot({ env, now, timeoutMs: 25, fetchImpl: stalledFetch }), null);
  assert.ok(performance.now() - started < 500, "The evidence deadline includes response body reads");
}
console.log("PASS: corrupt, foreign, incomplete, stale, unconfigured and stalled evidence fails closed");
