import { testPolicyEvidenceSnapshot as snapshot } from "./test-helpers/install-policy-evidence-fixture.js";
import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020.js";
import { TOOL as refund } from "../api/mcp.js";
import { TOOL as cancel } from "../api/cancel-mcp.js";
import { TOOL as returns } from "../api/return-mcp.js";
import { TOOL as trial } from "../api/trial-mcp.js";
import { validateJsonSchema } from "../lib/json-schema-lite.js";

const validator = new Ajv2020({ allErrors: true, strict: true });
const { compute } = await import("../lib/cancel-compute.js");
const output = compute({ vendor: "1password", region: "US", plan: "individual" }, { evidenceSnapshot: snapshot });
const validate = validator.compile(cancel.outputSchema);
assert.equal(validate(output), true, JSON.stringify(validate.errors));
console.log("PASS: ordinary cancellation without billing cadence matches the published schema");

for (const [policy, tool] of [["refund", refund], ["return", returns]]) {
  const { compute: evaluate } = await import(`../lib/${policy}-compute.js`);
  const unknown = evaluate({ vendor: "1password", region: "US", plan: "individual", days_since_purchase: 5 }, { evidenceSnapshot: snapshot });
  const check = validator.compile(tool.outputSchema);
  assert.equal(check(unknown), true, `${policy}: ${JSON.stringify(check.errors)}`);
}
console.log("PASS: unknown eligibility remains nullable without violating the advertised contract");

assert.equal(validateJsonSchema({ refundable: "yes" }, refund.outputSchema).valid, false);
const badBoolean = { verdict: "UNKNOWN", code: "TEST", message: "Test", refundable: "yes" };
assert.equal(validateJsonSchema(badBoolean, refund.outputSchema).valid, false, "The lightweight validator must not treat union types as unrestricted");

const eligibilityCases = [undefined, false, true].flatMap((condition) => [0, 5, 31].map((days) => ({ days_since_purchase: days,
  ...(condition === undefined ? {} : { qualifying_conditions_met: condition }) })));
for (const [policy, tool, variations] of [
  ["refund", refund, eligibilityCases], ["return", returns, eligibilityCases],
  ["cancel", cancel, [{}, { billing_cadence: "monthly" }, { billing_cadence: "annual" }]],
  ["trial", trial, [{}, { offer_confirmed: false }, { offer_confirmed: true }, { offer_confirmed: true, observed_trial_days: 7, observed_card_required: true, observed_auto_converts: true }]],
]) {
  const { compute: evaluate } = await import(`../lib/${policy}-compute.js`);
  const checkInput = validator.compile(tool.inputSchema);
  const checkOutput = validator.compile(tool.outputSchema);
  let count = 0;
  for (const vendor of tool.inputSchema.properties.vendor.enum) {
    for (const variation of variations) {
      const args = { vendor, region: "US", plan: "individual", ...variation };
      assert.equal(checkInput(args), true);
      for (const evidenceSnapshot of [snapshot, null]) {
        const payload = evaluate(args, { evidenceSnapshot });
        assert.equal(checkOutput(payload), true, `${policy}/${vendor}: ${JSON.stringify(checkOutput.errors)}`);
        assert.equal(validateJsonSchema(payload, tool.outputSchema).valid, true);
        count++;
      }
    }
  }
  console.log(`PASS: ${policy} ${count} strict-schema cases with fresh and unavailable evidence`);
}
