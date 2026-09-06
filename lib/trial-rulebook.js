import { readFileSync } from "node:fs";

import { buildRulebookAttestation } from "./rulebook-attestation.js";
import { isRulebookAttestationSignatureRequired } from "./rulebook-attestation-signing.js";
import { evaluateRulebookV1 } from "./rulebook-v1.js";
import { attachPolicyDecisionMaterial } from "./policy-decision-material.js";

export const TRIAL_POLICY_RULEBOOK = Object.freeze(
  JSON.parse(readFileSync(new URL("../rules/trial-policy-notary-v1.json", import.meta.url), "utf8"))
);

export function evaluateTrialPolicyRulebook(inputs) {
  const evaluation = evaluateRulebookV1({
    rulebook: TRIAL_POLICY_RULEBOOK,
    inputs,
  });
  if (!evaluation.ok) {
    throw new Error(`Trial policy rulebook invalid: ${evaluation.error}`);
  }
  const result = evaluation.result;
  const rulebookAttestation = buildRulebookAttestation(result);
  if (
    isRulebookAttestationSignatureRequired() &&
    rulebookAttestation.signature?.status !== "signed"
  ) {
    const error = new Error("Rulebook attestation signing is required, but no valid signing key is available.");
    error.code = "RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED";
    error.statusCode = 503;
    error.signatureStatus = rulebookAttestation.signature?.status || "missing";
    error.signatureError = rulebookAttestation.signature?.error;
    throw error;
  }
  return attachPolicyDecisionMaterial(
    {
      ...result,
      policy_inputs: inputs,
      policy_evidence: inputs.policy_evidence,
      rulebook_attestation: rulebookAttestation,
    },
    { rulebook: TRIAL_POLICY_RULEBOOK, inputs }
  );
}
