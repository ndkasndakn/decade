import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildPolicySourceHash, withLineage } from "./lineage.js";
import { evaluateRefundPolicyRulebook } from "./refund-rulebook.js";
import { evaluatePolicyEvidence } from "./policy-runtime-evidence.js";
import { bindPolicyRequest } from "./policy-request-binding.cjs";
import { resolveQualifyingConditionContext } from "./policy-context.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rules = JSON.parse(
  readFileSync(join(__dirname, "..", "rules", "v1_us_individual.json"), "utf8")
);
const policySources = JSON.parse(
  readFileSync(join(__dirname, "..", "rules", "policy-sources.json"), "utf8")
);
const POLICY_VERSION = rules.rules_version || "unknown";
const SOURCE_HASH = buildPolicySourceHash({
  policy: "refund",
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
    policy_decision_mode: rule?.decision_mode || null,
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
export function validateInput({ vendor, days_since_purchase, region, plan, qualifying_conditions_met }) {
  // Validate required fields
  if (typeof vendor !== "string" || !vendor.trim()) {
    return {
      refundable: null,
      verdict: "UNKNOWN",
      code: "MISSING_VENDOR",
      message: "vendor is required and must be a non-empty string",
      rules_version: rules.rules_version,
    };
  }

  if (typeof days_since_purchase !== "number") {
    return {
      refundable: null,
      verdict: "UNKNOWN",
      code: "INVALID_DAYS_SINCE_PURCHASE",
      message: "days_since_purchase must be a number",
      rules_version: rules.rules_version,
    };
  }

  if (!Number.isFinite(days_since_purchase) || days_since_purchase < 0) {
    return {
      refundable: null,
      verdict: "UNKNOWN",
      code: "INVALID_DAYS_SINCE_PURCHASE",
      message: "days_since_purchase must be a non-negative finite number",
      rules_version: rules.rules_version,
    };
  }

  if (!Number.isInteger(days_since_purchase)) {
    return {
      refundable: null,
      verdict: "UNKNOWN",
      code: "INVALID_DAYS_SINCE_PURCHASE",
      message: "days_since_purchase must be an integer (whole number)",
      rules_version: rules.rules_version,
    };
  }

  if (typeof region !== "string" || !region.trim()) {
    return {
      refundable: null,
      verdict: "UNKNOWN",
      code: "MISSING_REGION",
      message: "region is required and must be a non-empty string",
      rules_version: rules.rules_version,
    };
  }

  if (typeof plan !== "string" || !plan.trim()) {
    return {
      refundable: null,
      verdict: "UNKNOWN",
      code: "MISSING_PLAN",
      message: "plan is required and must be a non-empty string",
      rules_version: rules.rules_version,
    };
  }

  if (qualifying_conditions_met !== undefined && typeof qualifying_conditions_met !== "boolean") {
    return {
      refundable: null,
      verdict: "UNKNOWN",
      code: "INVALID_QUALIFYING_CONDITIONS",
      message: "qualifying_conditions_met must be a boolean when provided",
      rules_version: rules.rules_version,
    };
  }

  return null; // Valid
}

/**
 * Computes refund eligibility based on vendor rules
 * @param {object} params - {vendor, days_since_purchase, region, plan}
 * @returns {object} Refund eligibility result
 */
export function compute(
  { vendor, days_since_purchase, region, plan, qualifying_conditions_met },
  { requireCompleteContext = true, evidenceSnapshot = null, now = new Date() } = {}
) {
  // Normalize vendor name to lowercase
  vendor = typeof vendor === "string" ? vendor.toLowerCase().trim() : vendor;

  // Validate input first
  const validationError = validateInput({
    vendor,
    days_since_purchase,
    region,
    plan,
    qualifying_conditions_met,
  });
  if (validationError) {
    return withSource(validationError, vendor);
  }

  const vendorRule = rules.vendors?.[vendor];
  const policySource = policySources.vendors?.[vendor];
  const policyEvidence = evaluatePolicyEvidence({ policy: "refund", vendor, snapshot: evidenceSnapshot,
    sourceHash: SOURCE_HASH, policyVersion: POLICY_VERSION, sourceUrl: policySource?.url,
    verifiedAt: policySource?.last_verified_utc || policySources.last_verified_utc, now });
  const { decisionMode, hasConditionalPolicy, requiresManualReview, contextComplete, conditionsSatisfied, missingContext } =
    resolveQualifyingConditionContext({
      decisionMode: vendorRule?.decision_mode,
      qualifyingConditionsMet: qualifying_conditions_met,
      requireCompleteContext,
    });
  const baseWindowDays = Number.isInteger(vendorRule?.window_days) ? vendorRule.window_days : -1;
  const windowDays = qualifying_conditions_met === true && Number.isInteger(vendorRule?.conditional_window_days)
    ? vendorRule.conditional_window_days
    : baseWindowDays;
  const conditionsAllowRefund = conditionsSatisfied;
  const conditionOnlyEligibility = vendorRule?.condition_only === true && conditionsAllowRefund;
  const refundsSupported = Boolean(
    vendorRule && conditionsAllowRefund && (windowDays > 0 || conditionOnlyEligibility)
  );
  const withinWindow = Boolean(
    refundsSupported && (conditionOnlyEligibility || days_since_purchase <= windowDays)
  );
  const rulebookResult = evaluateRefundPolicyRulebook({
    policy_request: bindPolicyRequest("refund", { vendor, region, plan, days_since_purchase, qualifying_conditions_met }),
    policy_evidence_current: policyEvidence.current,
    policy_evidence: policyEvidence,
    region_supported: region === "US",
    plan_supported: plan === "individual",
    vendor_supported: Boolean(vendorRule),
    context_complete: contextComplete,
    missing_context: missingContext,
    qualifying_conditions_met: qualifying_conditions_met === true,
    refunds_supported: refundsSupported,
    within_window: withinWindow,
    days_since_purchase,
    window_days: windowDays,
    vendor,
    region,
    plan,
    policy_rules_version: POLICY_VERSION,
    policy_source_url: policySource?.url || "",
    policy_source_notes: policySource?.notes || "",
  });

  if (rulebookResult.reason_code === "NON_US_REGION") {
    return withRulebook({
      refundable: null,
      verdict: rulebookResult.application_verdict,
      code: rulebookResult.reason_code,
      message: `Region "${region}" is not supported. Currently only "US" is supported.`,
      rules_version: rules.rules_version,
    }, vendor, rulebookResult);
  }

  if (rulebookResult.reason_code === "NON_INDIVIDUAL_PLAN") {
    return withRulebook({
      refundable: null,
      verdict: rulebookResult.application_verdict,
      code: rulebookResult.reason_code,
      message: `Plan "${plan}" is not supported. Currently only "individual" plans are supported.`,
      rules_version: rules.rules_version,
    }, vendor, rulebookResult);
  }

  if (rulebookResult.reason_code === "UNSUPPORTED_VENDOR") {
    const supportedVendors = Object.keys(rules.vendors || {}).sort();
    return withRulebook({
      refundable: null,
      verdict: rulebookResult.application_verdict,
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
      refundable: null,
    }, vendor, rulebookResult);
  }

  if (rulebookResult.reason_code === "MISSING_REQUIRED_CONTEXT") {
    const requiredContext = requiresManualReview ? ["manual_policy_review"] : ["qualifying_conditions_met"];
    return withRulebook({
      refundable: null,
      verdict: "UNKNOWN",
      code: rulebookResult.reason_code,
      message: requiresManualReview
        ? `${vendor} refund eligibility depends on an approval, channel, or policy branch this rulebook cannot safely automate. Route it to policy review.`
        : `${vendor} refund eligibility depends on source-specific conditions. Confirm those conditions before acting.`,
      rules_version: rules.rules_version,
      vendor,
      required_context: requiredContext,
      qualifying_conditions_met: qualifying_conditions_met ?? null,
      automation_safe: false,
    }, vendor, rulebookResult);
  }

  if (rulebookResult.reason_code === "NO_REFUNDS") {
    return withRulebook({
      refundable: false,
      verdict: rulebookResult.application_verdict,
      code: rulebookResult.reason_code,
      message: `${vendor} does not offer refunds for individual plans`,
      rules_version: rules.rules_version,
      vendor,
      window_days: windowDays,
      automation_safe: true,
    }, vendor, rulebookResult);
  }

  const allowed = rulebookResult.application_verdict === "ALLOWED";
  return withRulebook({
    refundable: allowed,
    verdict: rulebookResult.application_verdict,
    code: rulebookResult.reason_code,
    message: allowed
      ? (conditionOnlyEligibility
          ? `Refund is allowed because the vendor-specific qualifying conditions were confirmed.`
          : `Refund is allowed. Purchase is ${days_since_purchase} day(s) old, within ${windowDays} day window.`)
      : `Refund window expired. Purchase is ${days_since_purchase} day(s) old, exceeds ${windowDays} day window.`,
    rules_version: rules.rules_version,
    vendor,
    window_days: windowDays,
    days_since_purchase,
    qualifying_conditions_met: hasConditionalPolicy ? qualifying_conditions_met : null,
    automation_safe: decisionMode !== "review_only",
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
