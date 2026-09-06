import { compute, getSupportedVendors } from "../lib/trial-compute.js";
import { createMcpHandler } from "../lib/mcp-handler.js";
import { loadPolicyEvidenceSnapshot } from "../lib/policy-evidence-snapshot.js";
import {
  buildPolicyMcpOutputSchema,
  POLICY_MCP_READ_ONLY_ANNOTATIONS,
  POLICY_MCP_VERSION,
} from "../lib/policy-mcp-metadata.js";

const supportedVendors = getSupportedVendors();

export const TOOL = {
  name: "trial_terms",
  title: "Check trial terms",
  description:
    "Evaluate a live US consumer subscription trial offer. Supply observed availability, duration, card, and auto-conversion facts; the tool returns UNKNOWN instead of inferring current offers from static data.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      vendor: {
        type: "string",
        enum: supportedVendors,
        description: "Vendor identifier (lowercase, underscore-separated).",
      },
      region: {
        type: "string",
        enum: ["US"],
        description: "Region code. Currently only 'US' is supported.",
      },
      plan: {
        type: "string",
        enum: ["individual"],
        description: "Plan type. Currently only 'individual' plans are supported.",
      },
      offer_confirmed: {
        type: "boolean",
        description: "For account- or promotion-specific trials, whether a live offer has been confirmed for this account.",
      },
      observed_trial_days: {
        type: "integer",
        minimum: 0,
        maximum: 365,
        description: "Trial duration shown by the confirmed live offer. Required when offer_confirmed is true for a variable offer.",
      },
      observed_card_required: {
        type: "boolean",
        description: "Whether the confirmed live offer requires a payment card.",
      },
      observed_auto_converts: {
        type: "boolean",
        description: "Whether the confirmed live offer converts to a paid subscription after the trial.",
      },
    },
    required: ["vendor", "region", "plan"],
  },
  outputSchema: buildPolicyMcpOutputSchema(["TRIAL_AVAILABLE", "NO_TRIAL", "UNKNOWN"], {
    trial_available: { type: "boolean" },
    trial_days: { type: "integer" },
    card_required: { type: "boolean" },
    auto_converts: { type: "boolean" },
  }),
  annotations: { ...POLICY_MCP_READ_ONLY_ANNOTATIONS },
};

function formatTextMessage(payload) {
  return `Trial Terms: ${payload.verdict}\n\nVendor: ${payload.vendor || "N/A"}\nCode: ${payload.code}\nTrial Days: ${payload.trial_days ?? "N/A"}\nCard Required: ${payload.card_required ?? "N/A"}\nAuto-Converts: ${payload.auto_converts ?? "N/A"}\n${payload.message || ""}\nSource: ${payload.policy_source_url || "N/A"}\nSource Notes: ${payload.policy_source_notes || "N/A"}\nSource Last Checked: ${payload.policy_last_checked || "N/A"}\nLast Verified (UTC): ${payload.policy_last_verified_utc || "Pending first verification"}`;
}

export const MCP_TOOL_CONFIG = {
  compute: async (args) => compute(args, { requireCompleteContext: true, evidenceSnapshot: await loadPolicyEvidenceSnapshot() }),
  tool: TOOL,
  formatTextMessage,
};

export default createMcpHandler({
  ...MCP_TOOL_CONFIG,
  documentationUrl: "https://trial.decide.fyi",
  serverInfo: {
    name: "trial.decide.fyi",
    title: "TrialDecide Notary",
    version: POLICY_MCP_VERSION,
    description: "Deterministic free trial terms checker (stateless).",
    websiteUrl: "https://trial.decide.fyi",
  },
  instructions: "Call tools/list, then tools/call with trial_terms.",
  logPrefix: "Trial MCP Request",
  logEventName: "trial_mcp_request",
});
