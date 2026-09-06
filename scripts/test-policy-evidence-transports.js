import "./test-helpers/install-policy-evidence-fixture.js";
import assert from "node:assert/strict";
import policyMcp from "../api/policy-mcp.js";
import cancel from "../lib/routes/v1/policies/cancel-penalty.js";
import { invokeJson } from "./test-helpers/http-harness.js";

const input = { vendor: "canva", region: "US", plan: "individual" };
const rest = await invokeJson(cancel, { method: "POST", body: input, headers: { "x-decide-policy-record": "1" } });
assert.equal(rest.json.verdict, "FREE_CANCEL");
assert.equal(rest.json.policy_evidence.current, true);
const mcp = await invokeJson(policyMcp, { method: "POST", body: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "cancellation_penalty", arguments: input } } });
assert.deepEqual(mcp.json.result.structuredContent.policy_evidence, rest.json.policy_evidence);
assert.equal(rest.json.decision_record_material.request.context.inputs.policy_evidence.current, true);
assert.deepEqual(rest.json.rulebook_result.policy_inputs.policy_request, {
  schema_version: "policy_request_v1", policy: "cancel", parameters: input,
});
assert.deepEqual(rest.json.rulebook_result.policy_inputs, rest.json.decision_record_material.request.context.inputs);
console.log("PASS: REST and MCP consume the same validated evidence and preserve it in replay material");

process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-missing-state-not-a-real-key';
globalThis.fetch = async () => new Response('[]');
const routes = { refund: ['refund-eligibility', 'refund_eligibility'], cancel: ['cancel-penalty', 'cancellation_penalty'],
  return: ['return-eligibility', 'return_eligibility'], trial: ['trial-terms', 'trial_terms'] };
for (const [policy, [route, tool]] of Object.entries(routes)) {
  const { default: handler } = await import(`../lib/routes/v1/policies/${route}.js`);
  const args = { vendor: 'adobe', region: 'US', plan: 'individual',
    ...(policy === 'cancel' ? { billing_cadence: 'annual' }
      : policy === 'trial' ? { offer_confirmed: true, observed_trial_days: 7, observed_card_required: true, observed_auto_converts: true }
        : { days_since_purchase: 5, qualifying_conditions_met: true }) };
  const response = await invokeJson(handler, { method: 'POST', body: { ...args,
    policy_evidence_current: true, evidenceSnapshot: { current: true }, now: '2026-07-16T12:00:00Z' } });
  assert.equal(response.json.verdict, 'UNKNOWN');
  assert.equal(response.json.automation_safe, false);
  const rpc = await invokeJson(policyMcp, { method: 'POST', body: { jsonrpc: '2.0', id: policy,
    method: 'tools/call', params: { name: tool, arguments: args } } });
  assert.equal(rpc.json.result.structuredContent.verdict, 'UNKNOWN');
  assert.equal(rpc.json.result.structuredContent.automation_safe, false);
  assert.equal(rpc.json.result.isError, true);
}
console.log('PASS: all four REST and MCP paths fail closed, and callers cannot inject evidence or a historical evaluation clock');
