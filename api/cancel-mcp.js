import { compute, getSupportedVendors } from "../lib/cancel-compute.js";
import { createMcpHandler } from "../lib/mcp-handler.js";
import { loadPolicyEvidenceSnapshot } from "../lib/policy-evidence-snapshot.js";
import {
  buildPolicyMcpOutputSchema,
  POLICY_MCP_READ_ONLY_ANNOTATIONS,
  POLICY_MCP_VERSION,
} from "../lib/policy-mcp-metadata.js";

const supportedVendors = getSupportedVendors();

export const TOOL = {
  name: "cancellation_penalty",
  title: "Check cancellation penalty",
  description:
    "Evaluate whether cancelling a US consumer subscription incurs a penalty or lock. Returns UNKNOWN when billing cadence is required or the policy needs manual review.",
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
      billing_cadence: {
        type: "string",
        enum: ["monthly", "annual"],
        description: "Required when the vendor applies different cancellation terms to monthly and annual plans.",
      },
    },
    required: ["vendor", "region", "plan"],
  },
  outputSchema: buildPolicyMcpOutputSchema(["FREE_CANCEL", "PENALTY", "LOCKED", "UNKNOWN"], {
    policy: { type: "string" },
    penalty: { type: "string" },
    notice_days: { type: "number" },
    billing_cadence: { type: ["string", "null"] },
  }),
  annotations: { ...POLICY_MCP_READ_ONLY_ANNOTATIONS },
};

function formatTextMessage(payload) {
  return `Cancellation Status: ${payload.verdict}\n\nVendor: ${payload.vendor || "N/A"}\nCode: ${payload.code}\nBilling Cadence: ${payload.billing_cadence || "N/A"}\n${payload.message || ""}\nSource: ${payload.policy_source_url || "N/A"}\nSource Notes: ${payload.policy_source_notes || "N/A"}\nSource Last Checked: ${payload.policy_last_checked || "N/A"}\nLast Verified (UTC): ${payload.policy_last_verified_utc || "Pending first verification"}`;
}

export const MCP_TOOL_CONFIG = {
  compute: async (args) => compute(args, { requireCompleteContext: true, evidenceSnapshot: await loadPolicyEvidenceSnapshot() }),
  tool: TOOL,
  formatTextMessage,
};

export default createMcpHandler({
  ...MCP_TOOL_CONFIG,
  documentationUrl: "https://cancel.decide.fyi",
  serverInfo: {
    name: "cancel.decide.fyi",
    title: "CancelDecide Notary",
    version: POLICY_MCP_VERSION,
    description: "Deterministic cancellation penalty checker (stateless).",
    websiteUrl: "https://cancel.decide.fyi",
  },
  instructions: "Call tools/list, then tools/call with cancellation_penalty.",
  logPrefix: "Cancel MCP Request",
  logEventName: "cancel_mcp_request",
});
