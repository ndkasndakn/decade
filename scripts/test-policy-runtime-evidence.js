import assert from "node:assert/strict";
import { compute } from "../lib/cancel-compute.js";
import { readFileSync } from "node:fs";

const input = { vendor: "canva", region: "US", plan: "individual" };
const result = await compute(input, { evidenceSnapshot: null, now: "2026-09-06T12:00:00Z" });
assert.equal(result.verdict, "UNKNOWN", "Missing trusted source evidence must not produce FREE_CANCEL");
assert.equal(result.automation_safe, false);
assert.equal(result.rulebook_result.action, "review_policy_evidence");
assert.equal(result.policy_evidence.status, "unavailable");
console.log("PASS: missing evidence fails closed through the cancellation rulebook");

const sources = JSON.parse(readFileSync(new URL("../rules/cancel-policy-sources.json", import.meta.url)));
const snapshot = {
  schema_version: "policy_evidence_snapshot_v1",
  generated_at: "2026-09-06T03:00:00Z",
  snapshot_hash: "a".repeat(64),
  run_id: "34008402916",
  policies: [{
    policy: "cancel", vendor: "canva", status: "unchanged", flags: [],
    source_url: sources.vendors.canva.url,
    source_hash: result.source_hash,
    policy_version: result.policy_version,
    verified_at: sources.last_verified_utc,
    checked_at: "2026-09-06T02:00:00Z",
    last_confirmed_change_at: "",
  }],
};
const fresh = await compute(input, { evidenceSnapshot: snapshot, now: "2026-09-06T12:00:00Z" });
assert.equal(fresh.verdict, "FREE_CANCEL", "Current source evidence preserves the reviewed cancellation rule");
assert.equal(fresh.automation_safe, true);
assert.equal(fresh.policy_evidence.status, "current");
console.log("PASS: current evidence preserves supported cancellation decisions");

const expiredSnapshot = structuredClone(snapshot);
expiredSnapshot.policies[0].checked_at = "2026-08-01T00:00:00Z";
const expired = await compute(input, { evidenceSnapshot: expiredSnapshot, now: "2026-09-06T12:00:00Z" });
assert.equal(expired.verdict, "UNKNOWN");
assert.equal(expired.automation_safe, false);
assert.equal(expired.policy_evidence.status, "expired");
console.log("PASS: expired monitoring evidence cannot authorize cancellation");

const pending = structuredClone(snapshot);
pending.policies[0].status = "pending_confirmation";
const pendingResult = await compute(input, { evidenceSnapshot: pending, now: "2026-09-06T12:00:00Z" });
assert.equal(pendingResult.verdict, "UNKNOWN");
assert.equal(pendingResult.policy_evidence.status, "review_required");
console.log("PASS: pending source changes require review");

const future = structuredClone(snapshot);
future.policies[0].checked_at = "2026-09-07T12:00:00Z";
assert.equal((await compute(input, { evidenceSnapshot: future, now: "2026-09-06T12:00:00Z" })).verdict, "UNKNOWN");
console.log("PASS: future-dated evidence fails closed");

const held = structuredClone(snapshot);
held.policies[0].status = "fetch_failed";
held.policies[0].flags = ["pending_candidate"];
assert.equal((await compute(input, { evidenceSnapshot: held, now: "2026-09-06T12:00:00Z" })).verdict, "UNKNOWN");
console.log("PASS: a fetch failure cannot hide a pending change");

for (const policy of ["refund", "return", "trial"]) {
  const { compute: evaluate } = await import(`../lib/${policy}-compute.js`);
  const checked = await evaluate({ vendor: "adobe", region: "US", plan: "individual", days_since_purchase: 1,
    offer_confirmed: true, observed_trial_days: 7, observed_card_required: true, observed_auto_converts: true },
  { evidenceSnapshot: null, now: "2026-09-06T12:00:00Z" });
  assert.equal(checked.verdict, "UNKNOWN", `${policy} must require trusted evidence`);
  assert.equal(checked.automation_safe, false);
  assert.equal(checked.rulebook_result.action, "review_policy_evidence");
}
console.log("PASS: all four policy families require trusted evidence");

const temporary = structuredClone(snapshot);
temporary.policies[0].status = "fetch_failed";
assert.equal(compute(input, { evidenceSnapshot: temporary, now: "2026-09-06T12:00:00Z" }).verdict, "FREE_CANCEL");
for (const mutate of [
  (s) => { s.generated_at = "2026-09-01T03:00:00Z"; s.policies[0].checked_at = "2026-09-01T02:00:00Z"; },
  (s) => { s.policies[0].checked_at = ""; },
  (s) => { s.policies[0].source_hash = "wrong"; },
  (s) => { s.policies[0].last_confirmed_change_at = "2026-09-01T00:00:00Z"; },
]) {
  const bad = structuredClone(snapshot); mutate(bad);
  assert.equal(compute(input, { evidenceSnapshot: bad, now: "2026-09-06T12:00:00Z" }).verdict, "UNKNOWN");
}
const { exposePolicyDecisionMaterial } = await import("../lib/policy-decision-material.js");
const { evaluateRulebookV1 } = await import("../lib/rulebook-v1.js");
const material = exposePolicyDecisionMaterial({ headers: { "x-decide-policy-record": "1" } }, fresh).decision_record_material.request;
const replay = evaluateRulebookV1({ rulebook: material.rulebook, inputs: material.context.inputs });
assert.equal(replay.result.input_hash, fresh.rulebook_result.input_hash);
assert.equal(replay.result.application_verdict, "FREE_CANCEL");
assert.equal(compute(input, { evidenceSnapshot: snapshot, now: "2027-01-01T00:00:00Z" }).verdict, "UNKNOWN");
assert.equal(evaluateRulebookV1({ rulebook: material.rulebook, inputs: material.context.inputs }).result.application_verdict, "FREE_CANCEL");
console.log("PASS: temporary failures preserve valid evidence; historical replay preserves the recorded evaluation facts");

const boundary = structuredClone(snapshot);
boundary.policies[0].checked_at = '2026-08-07T12:00:00Z';
assert.equal(compute(input, { evidenceSnapshot: boundary, now: '2026-09-06T11:59:59Z' }).verdict, 'FREE_CANCEL');
assert.equal(compute(input, { evidenceSnapshot: boundary, now: '2026-09-06T12:00:00Z' }).verdict, 'UNKNOWN');
for (const policy of ['refund', 'cancel', 'return', 'trial']) {
  const { compute: evaluate } = await import(`../lib/${policy}-compute.js`);
  assert.equal(evaluate({}).automation_safe, false, `${policy}: malformed requests are explicitly unsafe to automate`);
}
