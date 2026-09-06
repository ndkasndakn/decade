// Explicit sibling checkouts are required. No network or production credentials.
import { testPolicyEvidenceSnapshot } from './test-helpers/install-policy-evidence-fixture.js';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import decide from '../api/decide.js';
import { invokeJson } from './test-helpers/http-harness.js';
import { exposePolicyDecisionMaterial } from '../lib/policy-decision-material.js';
const require = createRequire(import.meta.url);
const [siteRoot, appRoot] = process.argv.slice(2);
assert.ok(siteRoot && appRoot, 'Pass the exact site and Krafthaus checkouts to verify');
const { ensureDecisionContract } = require(resolve(siteRoot, 'lib/decision-contract.js'));
const { fetchPolicyNotaryEvidence } = require(resolve(appRoot, 'lib/policy-notary-evidence-client.js'));
for (const root of [siteRoot, appRoot]) assert.equal(
  readFileSync(resolve(root, 'lib/policy-request-binding.cjs'), 'utf8'),
  readFileSync(new URL('../lib/policy-request-binding.cjs', import.meta.url), 'utf8'), 'Wire contract copies must be identical');
for (const policy of ['refund', 'cancel', 'return', 'trial']) {
  const { compute } = await import(`../lib/${policy}-compute.js`);
  const input = { vendor: 'adobe', region: 'US', plan: 'individual',
    ...(policy === 'cancel' ? { billing_cadence: 'annual' }
      : policy === 'trial' ? { offer_confirmed: true, observed_trial_days: 7, observed_card_required: true, observed_auto_converts: true }
        : { days_since_purchase: 5, qualifying_conditions_met: true }) };
  for (const snapshot of [testPolicyEvidenceSnapshot, null]) {
    const applicationResult = compute(input, { evidenceSnapshot: snapshot });
    const material = exposePolicyDecisionMaterial({ headers: { 'x-decide-policy-record': '1' } }, applicationResult).decision_record_material;
    const evaluated = await invokeJson(decide, { method: 'POST', body: material.request, headers: { 'content-type': 'application/json' } });
    assert.equal(evaluated.statusCode, 200, JSON.stringify(evaluated.json));
    const { contract } = ensureDecisionContract({ requestPayload: material.request,
      responsePayload: { ...evaluated.json, application_result: applicationResult } });
    const options = { fetchImpl: async () => ({ ok: true, json: async () => contract }) };
    const accepted = await fetchPolicyNotaryEvidence(policy, input, options);
    assert.equal(accepted.ok, true, `${policy}: ${JSON.stringify(accepted)}`);
    if (!snapshot) assert.equal(accepted.evidence.policy_disposition, 'review');
    assert.equal((await fetchPolicyNotaryEvidence(policy, { ...input, vendor: 'canva' }, options)).ok, false);
  }
}
console.log('PASS: real engine evaluation, site Decision Record and both fresh/review Krafthaus boundaries agree for all four policies');
