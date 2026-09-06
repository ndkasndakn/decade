import { compute, getSupportedVendors } from "../lib/refund-compute.js";
import { createMcpHandler } from "../lib/mcp-handler.js";
import { loadPolicyEvidenceSnapshot } from "../lib/policy-evidence-snapshot.js";
import {
  buildPolicyMcpOutputSchema,
  POLICY_MCP_READ_ONLY_ANNOTATIONS,
  POLICY_MCP_VERSION,
} from "../lib/policy-mcp-metadata.js";

const supportedVendors = getSupportedVendors();

export const TOOL = {
  name: "refund_eligibility",
  title: "Check refund eligibility",
  description:
    "Evaluate a US consumer subscription refund against versioned source-backed rules. Returns UNKNOWN when required conditions are absent or the vendor requires approval or manual policy review.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      vendor: {
        type: "string",
        enum: supportedVendors,
        description: "Vendor identifier (lowercase, underscore-separated).",
      },
      days_since_purchase: {
        type: "number",
        description: "Number of days since the subscription was purchased.",
        minimum: 0,
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
      qualifying_conditions_met: {
        type: "boolean",
        description: "Required when the vendor policy has source-specific conditions such as first purchase, unused benefits, or an eligible annual plan.",
      },
    },
    required: ["vendor", "days_since_purchase", "region", "plan"],
  },
  outputSchema: buildPolicyMcpOutputSchema(["ALLOWED", "DENIED", "UNKNOWN"], {
    refundable: { type: ["boolean", "null"] },
    window_days: { type: "number" },
    days_since_purchase: { type: "number" },
  }),
  annotations: { ...POLICY_MCP_READ_ONLY_ANNOTATIONS },
};

function formatTextMessage(payload) {
  return `Refund Eligibility: ${payload.verdict}\n\nVendor: ${payload.vendor || "N/A"}\nCode: ${payload.code}\n${payload.message || ""}\nSource: ${payload.policy_source_url || "N/A"}\nSource Notes: ${payload.policy_source_notes || "N/A"}\nSource Last Checked: ${payload.policy_last_checked || "N/A"}\nLast Verified (UTC): ${payload.policy_last_verified_utc || "Pending first verification"}`;
}

export const MCP_TOOL_CONFIG = {
  compute: async (args) => compute(args, { requireCompleteContext: true, evidenceSnapshot: await loadPolicyEvidenceSnapshot() }),
  tool: TOOL,
  formatTextMessage,
};

export default createMcpHandler({
  ...MCP_TOOL_CONFIG,
  documentationUrl: "https://refund.decide.fyi",
  serverInfo: {
    name: "refund.decide.fyi",
    title: "RefundDecide Notary",
    version: POLICY_MCP_VERSION,
    description: "Deterministic refund eligibility notary (stateless).",
    websiteUrl: "https://refund.decide.fyi",
  },
  instructions: "Call tools/list, then tools/call with refund_eligibility.",
  logPrefix: "MCP Request",
  logEventName: "mcp_request",
});
