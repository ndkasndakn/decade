import { compute, getSupportedVendors } from "../lib/return-compute.js";
import { createMcpHandler } from "../lib/mcp-handler.js";
import { loadPolicyEvidenceSnapshot } from "../lib/policy-evidence-snapshot.js";
import {
  buildPolicyMcpOutputSchema,
  POLICY_MCP_READ_ONLY_ANNOTATIONS,
  POLICY_MCP_VERSION,
} from "../lib/policy-mcp-metadata.js";

const supportedVendors = getSupportedVendors();

export const TOOL = {
  name: "return_eligibility",
  title: "Check return eligibility",
  description:
    "Evaluate whether a US consumer subscription purchase can be reversed under versioned source-backed rules. Returns UNKNOWN when required conditions are absent or manual review is required.",
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
  outputSchema: buildPolicyMcpOutputSchema(["RETURNABLE", "EXPIRED", "NON_RETURNABLE", "UNKNOWN"], {
    returnable: { type: ["boolean", "null"] },
    return_window_days: { type: "number" },
    return_type: { type: "string" },
    method: { type: "string" },
    days_since_purchase: { type: "number" },
  }),
  annotations: { ...POLICY_MCP_READ_ONLY_ANNOTATIONS },
};

function formatTextMessage(payload) {
  return `Return Eligibility: ${payload.verdict}\n\nVendor: ${payload.vendor || "N/A"}\nCode: ${payload.code}\nReturn Type: ${payload.return_type || "N/A"}\nMethod: ${payload.method || "N/A"}\n${payload.message || ""}\nSource: ${payload.policy_source_url || "N/A"}\nSource Notes: ${payload.policy_source_notes || "N/A"}\nSource Last Checked: ${payload.policy_last_checked || "N/A"}\nLast Verified (UTC): ${payload.policy_last_verified_utc || "Pending first verification"}`;
}

export const MCP_TOOL_CONFIG = {
  compute: async (args) => compute(args, { requireCompleteContext: true, evidenceSnapshot: await loadPolicyEvidenceSnapshot() }),
  tool: TOOL,
  formatTextMessage,
};

export default createMcpHandler({
  ...MCP_TOOL_CONFIG,
  documentationUrl: "https://return.decide.fyi",
  serverInfo: {
    name: "return.decide.fyi",
    title: "ReturnDecide Notary",
    version: POLICY_MCP_VERSION,
    description: "Deterministic return eligibility checker (stateless).",
    websiteUrl: "https://return.decide.fyi",
  },
  instructions: "Call tools/list, then tools/call with return_eligibility.",
  logPrefix: "Return MCP Request",
  logEventName: "return_mcp_request",
});
