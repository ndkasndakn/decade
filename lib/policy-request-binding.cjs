// Shared wire contract. Keep this file identical in decide, decidesite and krafthaus.
const FIELDS = Object.freeze({
  refund: ["vendor", "region", "plan", "days_since_purchase", "qualifying_conditions_met"],
  return: ["vendor", "region", "plan", "days_since_purchase", "qualifying_conditions_met"],
  cancel: ["vendor", "region", "plan", "billing_cadence"],
  trial: ["vendor", "region", "plan", "offer_confirmed", "observed_trial_days", "observed_card_required", "observed_auto_converts"],
});
function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort((a, b) => a.localeCompare(b)).map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}
function bindPolicyRequest(policy, input = {}) {
  if (!FIELDS[policy] || !input || typeof input !== "object" || Array.isArray(input)) return null;
  const parameters = {};
  for (const field of FIELDS[policy]) {
    if (input[field] === undefined) continue;
    parameters[field] = ["vendor", "billing_cadence"].includes(field) && typeof input[field] === "string"
      ? input[field].trim().toLowerCase() : input[field];
  }
  return { schema_version: "policy_request_v1", policy, parameters };
}
function policyRequestMatchesInputs(policy, request, inputs) {
  const binding = bindPolicyRequest(policy, request);
  if (!binding || !inputs || canonicalJson(binding) !== canonicalJson(inputs.policy_request)) return false;
  const expected = binding.parameters;
  for (const field of ["vendor", "region", "plan", "days_since_purchase"]) {
    if (expected[field] !== undefined && expected[field] !== inputs[field]) return false;
  }
  if (policy === "cancel" && (expected.billing_cadence || "") !== inputs.billing_cadence) return false;
  if (["refund", "return"].includes(policy) && (expected.qualifying_conditions_met === true) !== inputs.qualifying_conditions_met) return false;
  if (policy === "trial" && ((expected.offer_confirmed === true) !== inputs.offer_confirmed
    || (expected.observed_trial_days ?? 0) !== inputs.observed_trial_days)) return false;
  return true;
}
module.exports = { bindPolicyRequest, canonicalJson, policyRequestMatchesInputs };
