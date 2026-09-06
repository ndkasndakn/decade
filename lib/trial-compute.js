import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildPolicySourceHash, withLineage } from "./lineage.js";
import { evaluateTrialPolicyRulebook } from "./trial-rulebook.js";
import { evaluatePolicyEvidence } from "./policy-runtime-evidence.js";
import { bindPolicyRequest } from "./policy-request-binding.cjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rules = JSON.parse(
  readFileSync(join(__dirname, "..", "rules", "v1_us_individual_trial.json"), "utf8")
);
const policySources = JSON.parse(
  readFileSync(join(__dirname, "..", "rules", "trial-policy-sources.json"), "utf8")
);
const POLICY_VERSION = rules.rules_version || "unknown";
const SOURCE_HASH = buildPolicySourceHash({
  policy: "trial",
  policyVersion: POLICY_VERSION,
  rules: rules.vendors || {},
  sources: policySources.vendors || {},
  lastVerifiedUtc: policySources.last_verified_utc || "",
  verificationScope: policySources.verification_scope || "",
});

function withSource(result, vendor) {
  const source = vendor ? policySources.vendors?.[vendor] : null;
  const rule = vendor ? rules.vendors?.[vendor] : null;
  return withLineage({
    ...result,
    automation_safe: result.automation_safe === true,
    policy_offer_mode: rule?.offer_mode || null,
    policy_source_url: source?.url || null,
    policy_source_notes: source?.notes || null,
    policy_last_checked: policySources.last_checked || null,
    policy_last_verified_utc: policySources.last_verified_utc || null,
  }, { policyVersion: POLICY_VERSION, sourceHash: SOURCE_HASH, evaluatedAt: result.rulebook_result?.policy_evidence?.evaluated_at });
}

function withRulebook(result, vendor, rulebookResult) {
  return withSource({
    ...result,
    policy_evidence: rulebookResult.policy_evidence,
    rulebook_result: rulebookResult,
  }, vendor);
}

/**
 * Validates input parameters
 * @returns {object|null} Error object if invalid, null if valid
 */
export function validateInput({
  vendor,
  region,
  plan,
  offer_confirmed,
  observed_trial_days,
  observed_card_required,
  observed_auto_converts,
}) {
  if (typeof vendor !== "string" || !vendor.trim()) {
    return {
      verdict: "UNKNOWN",
      code: "MISSING_VENDOR",
      message: "vendor is required and must be a non-empty string",
      rules_version: rules.rules_version,
    };
  }

  if (typeof region !== "string" || !region.trim()) {
    return {
      verdict: "UNKNOWN",
      code: "MISSING_REGION",
      message: "region is required and must be a non-empty string",
      rules_version: rules.rules_version,
    };
  }

  if (typeof plan !== "string" || !plan.trim()) {
    return {
      verdict: "UNKNOWN",
      code: "MISSING_PLAN",
      message: "plan is required and must be a non-empty string",
      rules_version: rules.rules_version,
    };
  }

  if (offer_confirmed !== undefined && typeof offer_confirmed !== "boolean") {
    return {
      verdict: "UNKNOWN",
      code: "INVALID_OFFER_CONFIRMATION",
      message: "offer_confirmed must be a boolean when provided",
      rules_version: rules.rules_version,
    };
  }

  if (
    observed_trial_days !== undefined &&
    (!Number.isInteger(observed_trial_days) || observed_trial_days < 0 || observed_trial_days > 365)
  ) {
    return {
      verdict: "UNKNOWN",
      code: "INVALID_OBSERVED_TRIAL_DAYS",
      message: "observed_trial_days must be an integer from 0 to 365 when provided",
      rules_version: rules.rules_version,
    };
  }

  if (observed_card_required !== undefined && typeof observed_card_required !== "boolean") {
    return {
      verdict: "UNKNOWN",
      code: "INVALID_OBSERVED_CARD_REQUIRED",
      message: "observed_card_required must be a boolean when provided",
      rules_version: rules.rules_version,
    };
  }

  if (observed_auto_converts !== undefined && typeof observed_auto_converts !== "boolean") {
    return {
      verdict: "UNKNOWN",
      code: "INVALID_OBSERVED_AUTO_CONVERTS",
      message: "observed_auto_converts must be a boolean when provided",
      rules_version: rules.rules_version,
    };
  }

  return null;
}

/**
 * Computes free trial availability and terms for a vendor
 * @param {object} params - {vendor, region, plan}
 * @returns {object} Trial terms result
 */
export function compute(
  {
    vendor,
    region,
    plan,
    offer_confirmed,
    observed_trial_days,
    observed_card_required,
    observed_auto_converts,
  },
  { requireCompleteContext = true, evidenceSnapshot = null, now = new Date() } = {}
) {
  vendor = typeof vendor === "string" ? vendor.toLowerCase().trim() : vendor;

  const validationError = validateInput({
    vendor,
    region,
    plan,
    offer_confirmed,
    observed_trial_days,
    observed_card_required,
    observed_auto_converts,
  });
  if (validationError) {
    return withSource(validationError, vendor);
  }

  const v = rules.vendors?.[vendor];
  const policySource = policySources.vendors?.[vendor];
  const policyEvidence = evaluatePolicyEvidence({ policy: "trial", vendor, snapshot: evidenceSnapshot,
    sourceHash: SOURCE_HASH, policyVersion: POLICY_VERSION, sourceUrl: policySource?.url,
    verifiedAt: policySource?.last_verified_utc || policySources.last_verified_utc, now });
  const offerMode = ["fixed", "observed", "none"].includes(v?.offer_mode)
    ? v.offer_mode
    : "observed";
  const hasVariableOffer = offerMode === "observed";
  const missingContext = [];
  if (requireCompleteContext && hasVariableOffer && offer_confirmed === undefined) {
    missingContext.push(
      "offer_confirmed",
      "observed_trial_days",
      "observed_card_required",
      "observed_auto_converts"
    );
  } else if (requireCompleteContext && hasVariableOffer && offer_confirmed === true) {
    if (observed_trial_days === undefined) missingContext.push("observed_trial_days");
    if (observed_card_required === undefined) missingContext.push("observed_card_required");
    if (observed_auto_converts === undefined) missingContext.push("observed_auto_converts");
  }
  const contextComplete = missingContext.length === 0;
  const effectiveTrialAvailable = hasVariableOffer && offer_confirmed !== undefined
    ? offer_confirmed
    : (offerMode === "none" ? false : Boolean(v?.trial_available));
  const effectiveTrialDays = hasVariableOffer && offer_confirmed === true
    ? observed_trial_days
    : (effectiveTrialAvailable && Number.isInteger(v?.trial_days) ? v.trial_days : 0);
  const effectiveCardRequired = hasVariableOffer && offer_confirmed === true
    ? observed_card_required
    : Boolean(v?.card_required);
  const effectiveAutoConverts = hasVariableOffer && offer_confirmed === true
    ? observed_auto_converts
    : Boolean(v?.auto_converts);
  const rulebookResult = evaluateTrialPolicyRulebook({
    policy_request: bindPolicyRequest("trial", { vendor, region, plan, offer_confirmed, observed_trial_days, observed_card_required, observed_auto_converts }),
    policy_evidence_current: policyEvidence.current,
    policy_evidence: policyEvidence,
    region_supported: region === "US",
    plan_supported: plan === "individual",
    vendor_supported: Boolean(v),
    context_complete: contextComplete,
    missing_context: missingContext.join(","),
    offer_confirmed: offer_confirmed === true,
    observed_trial_days: Number.isInteger(observed_trial_days) ? observed_trial_days : 0,
    trial_available: effectiveTrialAvailable,
    auto_converts: effectiveAutoConverts === true,
    trial_days: Number.isInteger(effectiveTrialDays) ? effectiveTrialDays : 0,
    card_required: effectiveCardRequired === true,
    vendor,
    region,
    plan,
    policy_rules_version: POLICY_VERSION,
    policy_source_url: policySource?.url || "",
    policy_source_notes: policySource?.notes || "",
  });

  if (rulebookResult.reason_code === "NON_US_REGION") {
    return withRulebook({
      verdict: "UNKNOWN",
      code: rulebookResult.reason_code,
      message: `Region "${region}" is not supported. Currently only "US" is supported.`,
      rules_version: rules.rules_version,
    }, vendor, rulebookResult);
  }

  if (rulebookResult.reason_code === "NON_INDIVIDUAL_PLAN") {
    return withRulebook({
      verdict: "UNKNOWN",
      code: rulebookResult.reason_code,
      message: `Plan "${plan}" is not supported. Currently only "individual" plans are supported.`,
      rules_version: rules.rules_version,
    }, vendor, rulebookResult);
  }

  if (rulebookResult.reason_code === "UNSUPPORTED_VENDOR") {
    const supportedVendors = Object.keys(rules.vendors || {}).sort();
    return withRulebook({
      verdict: "UNKNOWN",
      code: rulebookResult.reason_code,
      message: `Vendor "${vendor}" is not supported. Supported vendors: ${supportedVendors.join(", ")}`,
      rules_version: rules.rules_version,
      vendor,
      supported_vendors: supportedVendors,
    }, vendor, rulebookResult);
  }

  if (rulebookResult.reason_code === "POLICY_EVIDENCE_NOT_CURRENT") {
    return withRulebook({
      verdict: "UNKNOWN",
      code: rulebookResult.reason_code,
      message: "Current reviewed policy evidence is unavailable. Route this request to policy review.",
      rules_version: rules.rules_version,
      vendor,
      automation_safe: false,
    }, vendor, rulebookResult);
  }

  if (rulebookResult.reason_code === "MISSING_REQUIRED_CONTEXT") {
    return withRulebook({
      verdict: "UNKNOWN",
      code: rulebookResult.reason_code,
      message: `${vendor} trial availability or duration varies by account or promotion. Confirm the live offer before acting.`,
      rules_version: rules.rules_version,
      vendor,
      required_context: missingContext,
      offer_confirmed: offer_confirmed ?? null,
      observed_trial_days: observed_trial_days ?? null,
      observed_card_required: observed_card_required ?? null,
      observed_auto_converts: observed_auto_converts ?? null,
      automation_safe: false,
    }, vendor, rulebookResult);
  }

  if (rulebookResult.reason_code === "TRIAL_NOT_AVAILABLE") {
    return withRulebook({
      verdict: "NO_TRIAL",
      code: rulebookResult.reason_code,
      message: hasVariableOffer
        ? `No live trial offer was confirmed for ${vendor}.`
        : `${vendor} does not offer a free trial. ${v.notes}`,
      rules_version: rules.rules_version,
      vendor,
      trial_available: false,
      trial_days: 0,
      card_required: v.card_required,
      auto_converts: v.auto_converts,
      offer_confirmed: hasVariableOffer ? false : null,
      automation_safe: true,
    }, vendor, rulebookResult);
  }

  return withRulebook({
    verdict: "TRIAL_AVAILABLE",
    code: rulebookResult.reason_code,
    message: `A live ${effectiveTrialDays}-day ${vendor} trial offer was confirmed. ${effectiveCardRequired ? "Credit card required." : "No credit card required."} ${effectiveAutoConverts ? "Auto-converts to paid plan." : "Does not auto-convert."}`,
    rules_version: rules.rules_version,
    vendor,
    trial_available: true,
    trial_days: effectiveTrialDays,
    card_required: effectiveCardRequired === true,
    auto_converts: effectiveAutoConverts === true,
    offer_confirmed: hasVariableOffer ? offer_confirmed === true : null,
    automation_safe: true,
  }, vendor, rulebookResult);
}

/**
 * Returns list of supported vendors
 */
export function getSupportedVendors() {
  return Object.keys(rules.vendors || {}).sort();
}

/**
 * Returns the rules version
 */
export function getRulesVersion() {
  return POLICY_VERSION;
}
