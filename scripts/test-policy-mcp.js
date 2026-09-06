import assert from "node:assert/strict";
import "./test-helpers/install-policy-evidence-fixture.js";
import { readFileSync } from "node:fs";

import policyMcp from "../api/policy-mcp.js";
import { MCP_TOOL_CONFIG as refundTool } from "../api/mcp.js";
import { MCP_TOOL_CONFIG as cancelTool } from "../api/cancel-mcp.js";
import { MCP_TOOL_CONFIG as returnTool } from "../api/return-mcp.js";
import { MCP_TOOL_CONFIG as trialTool } from "../api/trial-mcp.js";
import refundEligibilityHandler from "../lib/routes/v1/policies/refund-eligibility.js";
import trialTermsHandler from "../lib/routes/v1/policies/trial-terms.js";
import {
  buildPolicyMcpServerCard,
  buildPolicyRegistryServer,
} from "../lib/policy-mcp-metadata.js";
import { buildPolicySourceHash } from "../lib/lineage.js";
import { validateJsonSchema } from "../lib/json-schema-lite.js";
import middleware from "../middleware.js";
import { invokeJson } from "./test-helpers/http-harness.js";

async function testListsAllPolicyNotaryTools() {
  const response = await invokeJson(policyMcp, {
    method: "POST",
    headers: { "user-agent": "policy-mcp-test" },
    body: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    response.json?.result?.tools?.map((tool) => tool.name),
    [
      "refund_eligibility",
      "cancellation_penalty",
      "return_eligibility",
      "trial_terms",
    ]
  );
}

async function testSupportsLifecyclePingAndProtocolNegotiation() {
  for (const protocolVersion of [
    "2025-11-25",
    "2025-06-18",
    "2025-03-26",
    "2024-11-05",
  ]) {
    const initialized = await invokeJson(policyMcp, {
      method: "POST",
      headers: { "user-agent": "policy-mcp-test" },
      body: {
        jsonrpc: "2.0",
        id: `initialize-${protocolVersion}`,
        method: "initialize",
        params: {
          protocolVersion,
          clientInfo: { name: "policy-mcp-test", version: "1.0.0" },
        },
      },
    });

    assert.equal(initialized.statusCode, 200);
    assert.equal(initialized.json?.result?.protocolVersion, protocolVersion);
  }

  const ping = await invokeJson(policyMcp, {
    method: "POST",
    headers: {
      "user-agent": "policy-mcp-test",
      "mcp-protocol-version": "2025-03-26",
    },
    body: {
      jsonrpc: "2.0",
      id: "ping",
      method: "ping",
      params: {},
    },
  });

  assert.equal(ping.statusCode, 200);
  assert.deepEqual(ping.json, {
    jsonrpc: "2.0",
    id: "ping",
    result: {},
  });
}

function testPublishesReadOnlyToolContracts() {
  const configs = [refundTool, cancelTool, returnTool, trialTool];
  for (const config of configs) {
    assert.deepEqual(config.tool.annotations, {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    assert.equal(config.tool.outputSchema?.type, "object");
    assert.equal(config.tool.outputSchema?.additionalProperties, true);
    assert.ok(Array.isArray(config.tool.outputSchema?.properties?.verdict?.enum));
    assert.ok(config.tool.outputSchema.properties.verdict.enum.includes("UNKNOWN"));
  }
}

async function testCallsCancellationTool() {
  const response = await invokeJson(policyMcp, {
    method: "POST",
    headers: { "user-agent": "policy-mcp-test" },
    body: {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "cancellation_penalty",
        arguments: { vendor: "adobe", region: "US", plan: "individual", billing_cadence: "annual" },
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json?.result?.structuredContent?.verdict, "PENALTY");
  assert.equal(
    response.json?.result?.structuredContent?.rulebook_result?.engine,
    "decide_rulebook_v1"
  );
}

async function testRoutesAmbiguousCancellationContextToReview() {
  const response = await invokeJson(policyMcp, {
    method: "POST",
    headers: { "user-agent": "policy-mcp-test" },
    body: {
      jsonrpc: "2.0",
      id: 20,
      method: "tools/call",
      params: {
        name: "cancellation_penalty",
        arguments: { vendor: "adobe", region: "US", plan: "individual" },
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json?.result?.structuredContent?.verdict, "UNKNOWN");
  assert.equal(response.json?.result?.structuredContent?.code, "MISSING_REQUIRED_CONTEXT");
  assert.equal(
    response.json?.result?.structuredContent?.rulebook_result?.matched_rule_id,
    "review_missing_context"
  );
  assert.equal(response.json?.result?.isError, true);

  const monthly = await invokeJson(policyMcp, {
    method: "POST",
    headers: { "user-agent": "policy-mcp-test" },
    body: {
      jsonrpc: "2.0",
      id: 25,
      method: "tools/call",
      params: {
        name: "cancellation_penalty",
        arguments: {
          vendor: "adobe",
          region: "US",
          plan: "individual",
          billing_cadence: "monthly",
        },
      },
    },
  });

  assert.equal(monthly.json?.result?.structuredContent?.verdict, "FREE_CANCEL");
  assert.equal(monthly.json?.result?.structuredContent?.code, "NO_PENALTY");
}

async function testRoutesVariableTrialOfferToReview() {
  const response = await invokeJson(policyMcp, {
    method: "POST",
    headers: { "user-agent": "policy-mcp-test" },
    body: {
      jsonrpc: "2.0",
      id: 26,
      method: "tools/call",
      params: {
        name: "trial_terms",
        arguments: { vendor: "amazon_music_unlimited", region: "US", plan: "individual" },
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json?.result?.structuredContent?.verdict, "UNKNOWN");
  assert.equal(response.json?.result?.structuredContent?.code, "MISSING_REQUIRED_CONTEXT");
  assert.deepEqual(
    response.json?.result?.structuredContent?.required_context,
    ["offer_confirmed", "observed_trial_days", "observed_card_required", "observed_auto_converts"]
  );

  const confirmed = await invokeJson(policyMcp, {
    method: "POST",
    headers: { "user-agent": "policy-mcp-test" },
    body: {
      jsonrpc: "2.0",
      id: 27,
      method: "tools/call",
      params: {
        name: "trial_terms",
        arguments: {
          vendor: "amazon_music_unlimited",
          region: "US",
          plan: "individual",
          offer_confirmed: true,
          observed_trial_days: 14,
          observed_card_required: true,
          observed_auto_converts: true,
        },
      },
    },
  });

  assert.equal(confirmed.json?.result?.structuredContent?.verdict, "TRIAL_AVAILABLE");
  assert.equal(confirmed.json?.result?.structuredContent?.trial_days, 14);
}

async function testRoutesDynamicTrialsToReview() {
  const response = await invokeJson(policyMcp, {
    method: "POST",
    headers: { "user-agent": "policy-mcp-test" },
    body: {
      jsonrpc: "2.0",
      id: 261,
      method: "tools/call",
      params: {
        name: "trial_terms",
        arguments: { vendor: "grammarly", region: "US", plan: "individual" },
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json?.result?.structuredContent?.verdict, "UNKNOWN");
  assert.equal(response.json?.result?.structuredContent?.code, "MISSING_REQUIRED_CONTEXT");

  const observed = await invokeJson(policyMcp, {
    method: "POST",
    headers: { "user-agent": "policy-mcp-test" },
    body: {
      jsonrpc: "2.0",
      id: 262,
      method: "tools/call",
      params: {
        name: "trial_terms",
        arguments: {
          vendor: "grammarly",
          region: "US",
          plan: "individual",
          offer_confirmed: true,
          observed_trial_days: 7,
          observed_card_required: true,
          observed_auto_converts: true,
        },
      },
    },
  });

  assert.equal(observed.json?.result?.structuredContent?.verdict, "TRIAL_AVAILABLE");
  assert.equal(observed.json?.result?.structuredContent?.trial_days, 7);
}

async function testRoutesConditionalRefundToReview() {
  const response = await invokeJson(policyMcp, {
    method: "POST",
    headers: { "user-agent": "policy-mcp-test" },
    body: {
      jsonrpc: "2.0",
      id: 28,
      method: "tools/call",
      params: {
        name: "refund_eligibility",
        arguments: {
          vendor: "expressvpn",
          days_since_purchase: 5,
          region: "US",
          plan: "individual",
        },
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json?.result?.structuredContent?.verdict, "UNKNOWN");
  assert.equal(response.json?.result?.structuredContent?.code, "MISSING_REQUIRED_CONTEXT");
  assert.deepEqual(
    response.json?.result?.structuredContent?.required_context,
    ["qualifying_conditions_met"]
  );

  for (const [qualifyingConditionsMet, expectedVerdict] of [[true, "ALLOWED"], [false, "DENIED"]]) {
    const qualified = await invokeJson(policyMcp, {
      method: "POST",
      headers: { "user-agent": "policy-mcp-test" },
      body: {
        jsonrpc: "2.0",
        id: `refund-${qualifyingConditionsMet}`,
        method: "tools/call",
        params: {
          name: "refund_eligibility",
          arguments: {
            vendor: "expressvpn",
            days_since_purchase: 5,
            region: "US",
            plan: "individual",
            qualifying_conditions_met: qualifyingConditionsMet,
          },
        },
      },
    });
    assert.equal(qualified.json?.result?.structuredContent?.verdict, expectedVerdict);
  }
}

async function testKeepsApprovalBasedRefundsInManualReview() {
  const approvalBasedVendors = [
    "apple_app_store",
    "google_play",
    "youtube_premium",
    "strava",
    "xbox_game_pass",
  ];

  for (const vendor of approvalBasedVendors) {
    for (const qualifyingConditionsMet of [undefined, true]) {
      const response = await invokeJson(policyMcp, {
        method: "POST",
        headers: { "user-agent": "policy-mcp-test" },
        body: {
          jsonrpc: "2.0",
          id: `${vendor}-refund-${qualifyingConditionsMet}`,
          method: "tools/call",
          params: {
            name: "refund_eligibility",
            arguments: {
              vendor,
              days_since_purchase: 5,
              region: "US",
              plan: "individual",
              ...(qualifyingConditionsMet === undefined
                ? {}
                : { qualifying_conditions_met: true }),
            },
          },
        },
      });

      assert.equal(response.statusCode, 200);
      assert.equal(response.json?.result?.structuredContent?.verdict, "UNKNOWN");
      assert.equal(response.json?.result?.structuredContent?.code, "MISSING_REQUIRED_CONTEXT");
      assert.deepEqual(
        response.json?.result?.structuredContent?.required_context,
        ["manual_policy_review"]
      );
    }
  }
}

async function testPublicPolicyRoutesFailClosed() {
  const refund = await invokeJson(refundEligibilityHandler, {
    method: "POST",
    headers: { "user-agent": "policy-rest-test" },
    body: {
      vendor: "expressvpn",
      days_since_purchase: 5,
      region: "US",
      plan: "individual",
    },
  });
  assert.equal(refund.statusCode, 200);
  assert.equal(refund.json?.verdict, "UNKNOWN");
  assert.equal(refund.json?.code, "MISSING_REQUIRED_CONTEXT");

  const trial = await invokeJson(trialTermsHandler, {
    method: "POST",
    headers: { "user-agent": "policy-rest-test" },
    body: { vendor: "grammarly", region: "US", plan: "individual" },
  });
  assert.equal(trial.statusCode, 200);
  assert.equal(trial.json?.verdict, "UNKNOWN");
  assert.equal(trial.json?.code, "MISSING_REQUIRED_CONTEXT");
}

function testPolicyAutomationModesAreExplicit() {
  const refundRules = readJson("../rules/v1_us_individual.json");
  const refundSources = readJson("../rules/policy-sources.json");
  const cancelRules = readJson("../rules/v1_us_individual_cancel.json");
  const cancelSources = readJson("../rules/cancel-policy-sources.json");
  const returnRules = readJson("../rules/v1_us_individual_return.json");
  const returnSources = readJson("../rules/return-policy-sources.json");
  const trialRules = readJson("../rules/v1_us_individual_trial.json");
  const trialSources = readJson("../rules/trial-policy-sources.json");
  const decisionModes = new Set(["deterministic", "conditional", "review_only"]);
  const offerModes = new Set(["fixed", "observed", "none"]);
  const ambiguousDenialSource = /\b(generally|typically|can vary|depend(?:s|ing)?|guidance|billing behavior|billing conditions|terms page|customer agreement|subscription details|management and cancellation|physical return process)\b/i;
  const categoricalDenialSource = /\bno refunds?\b|\bnon-refundable\b|\ball sales final\b|\bno returns?\b/i;

  for (const [policy, rulebook, sourcebook] of [
    ["refund", refundRules, refundSources],
    ["cancel", cancelRules, cancelSources],
    ["return", returnRules, returnSources],
    ["trial", trialRules, trialSources],
  ]) {
    assert.deepEqual(
      Object.keys(sourcebook.vendors || {}).sort(),
      Object.keys(rulebook.vendors || {}).sort(),
      `${policy} rules and source evidence must cover the same vendors`
    );
    for (const [vendor, source] of Object.entries(sourcebook.vendors || {})) {
      assert.match(source.url || "", /^https:\/\//, `${policy}/${vendor} needs an HTTPS primary source`);
      assert.ok(String(source.notes || "").trim(), `${policy}/${vendor} needs source notes`);
    }
  }

  for (const [vendor, rule] of Object.entries(refundRules.vendors)) {
    assert.ok(decisionModes.has(rule.decision_mode), `${vendor} refund decision_mode must be explicit`);
    if (rule.decision_mode === "deterministic" && rule.window_days === 0) {
      const notes = refundSources.vendors?.[vendor]?.notes || "";
      assert.doesNotMatch(notes, ambiguousDenialSource, `${vendor} ambiguous refund source must fail closed`);
      assert.match(notes, categoricalDenialSource, `${vendor} deterministic refund denial needs categorical source notes`);
    }
  }
  for (const [vendor, rule] of Object.entries(cancelRules.vendors)) {
    assert.ok(decisionModes.has(rule.decision_mode), `${vendor} cancel decision_mode must be explicit`);
  }
  for (const [vendor, rule] of Object.entries(returnRules.vendors)) {
    assert.ok(decisionModes.has(rule.decision_mode), `${vendor} return decision_mode must be explicit`);
    if (rule.decision_mode === "deterministic" && rule.return_window_days === 0) {
      const notes = returnSources.vendors?.[vendor]?.notes || "";
      assert.doesNotMatch(notes, ambiguousDenialSource, `${vendor} ambiguous return source must fail closed`);
      assert.match(notes, categoricalDenialSource, `${vendor} deterministic return denial needs categorical source notes`);
    }
  }
  for (const [vendor, rule] of Object.entries(trialRules.vendors)) {
    assert.ok(offerModes.has(rule.offer_mode), `${vendor} trial offer_mode must be explicit`);
    if (rule.offer_mode === "observed") {
      assert.equal(rule.trial_available, false, `${vendor} observed trial must not publish static availability`);
      assert.equal(rule.trial_days, 0, `${vendor} observed trial must not publish a static duration`);
    }
  }
}

function testPolicySourceHashTracksReviewedPolicyNotMonitorTime() {
  const base = {
    policy: "refund",
    policyVersion: "2026-07-16",
    rules: { adobe: { window_days: 14, decision_mode: "conditional" } },
    sources: { adobe: { url: "https://example.com/refunds", notes: "14-day window" } },
    lastVerifiedUtc: "2026-07-16T10:50:53Z",
    verificationScope: "Official source reviewed.",
    lastChecked: "2026-07-16",
  };

  const initial = buildPolicySourceHash(base);
  const afterMonitorOnly = buildPolicySourceHash({ ...base, lastChecked: "2026-07-17" });
  const afterSourceRevision = buildPolicySourceHash({
    ...base,
    sources: { adobe: { ...base.sources.adobe, notes: "Updated reviewed source note" } },
  });

  assert.equal(afterMonitorOnly, initial, "monitor timestamps must not change policy lineage");
  assert.notEqual(afterSourceRevision, initial, "reviewed source changes must change policy lineage");
}

async function testRoutesConditionalReturnToReview() {
  const response = await invokeJson(policyMcp, {
    method: "POST",
    headers: { "user-agent": "policy-mcp-test" },
    body: {
      jsonrpc: "2.0",
      id: 29,
      method: "tools/call",
      params: {
        name: "return_eligibility",
        arguments: {
          vendor: "expressvpn",
          days_since_purchase: 5,
          region: "US",
          plan: "individual",
        },
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json?.result?.structuredContent?.verdict, "UNKNOWN");
  assert.equal(response.json?.result?.structuredContent?.code, "MISSING_REQUIRED_CONTEXT");
  assert.deepEqual(
    response.json?.result?.structuredContent?.required_context,
    ["qualifying_conditions_met"]
  );

  for (const [qualifyingConditionsMet, expectedVerdict] of [[true, "RETURNABLE"], [false, "NON_RETURNABLE"]]) {
    const qualified = await invokeJson(policyMcp, {
      method: "POST",
      headers: { "user-agent": "policy-mcp-test" },
      body: {
        jsonrpc: "2.0",
        id: `return-${qualifyingConditionsMet}`,
        method: "tools/call",
        params: {
          name: "return_eligibility",
          arguments: {
            vendor: "expressvpn",
            days_since_purchase: 5,
            region: "US",
            plan: "individual",
            qualifying_conditions_met: qualifyingConditionsMet,
          },
        },
      },
    });
    assert.equal(qualified.json?.result?.structuredContent?.verdict, expectedVerdict);
  }
}

async function testCallsEveryPolicyTool() {
  const cases = [
    {
      name: "refund_eligibility",
      arguments: {
        vendor: "adobe",
        days_since_purchase: 5,
        region: "US",
        plan: "individual",
        qualifying_conditions_met: true,
      },
      verdict: "ALLOWED",
    },
    {
      name: "cancellation_penalty",
      arguments: { vendor: "adobe", region: "US", plan: "individual", billing_cadence: "annual" },
      verdict: "PENALTY",
    },
    {
      name: "return_eligibility",
      arguments: {
        vendor: "adobe",
        days_since_purchase: 5,
        region: "US",
        plan: "individual",
        qualifying_conditions_met: true,
      },
      verdict: "RETURNABLE",
    },
    {
      name: "trial_terms",
      arguments: {
        vendor: "adobe",
        region: "US",
        plan: "individual",
        offer_confirmed: true,
        observed_trial_days: 7,
        observed_card_required: true,
        observed_auto_converts: true,
      },
      verdict: "TRIAL_AVAILABLE",
    },
  ];

  for (const testCase of cases) {
    const response = await invokeJson(policyMcp, {
      method: "POST",
      headers: { "user-agent": "policy-mcp-test" },
      body: {
        jsonrpc: "2.0",
        id: testCase.name,
        method: "tools/call",
        params: { name: testCase.name, arguments: testCase.arguments },
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json?.result?.structuredContent?.verdict, testCase.verdict);
    assert.equal(response.json?.result?.structuredContent?.rulebook_result?.engine, "decide_rulebook_v1");
    const tool = [refundTool, cancelTool, returnTool, trialTool].find((entry) => entry.tool.name === testCase.name)?.tool;
    assert.equal(
      validateJsonSchema(response.json?.result?.structuredContent, tool.outputSchema).valid,
      true,
      `${testCase.name} structured output should match its published schema`
    );
  }
}

async function testLabelsSourceAndRuleFreshnessPrecisely() {
  const response = await invokeJson(policyMcp, {
    method: "POST",
    headers: { "user-agent": "policy-mcp-test" },
    body: {
      jsonrpc: "2.0",
      id: "freshness-labels",
      method: "tools/call",
      params: {
        name: "refund_eligibility",
        arguments: {
          vendor: "adobe",
          days_since_purchase: 5,
          region: "US",
          plan: "individual",
        },
      },
    },
  });

  const text = response.json?.result?.content?.[0]?.text || "";
  assert.match(text, /Source Last Checked:/);
  assert.match(text, /Last Verified \(UTC\):/);
  assert.doesNotMatch(text, /Policy Updated:/);
}

async function testRejectsArgumentsOutsidePublishedSchema() {
  const response = await invokeJson(policyMcp, {
    method: "POST",
    headers: { "user-agent": "policy-mcp-test" },
    body: {
      jsonrpc: "2.0",
      id: 21,
      method: "tools/call",
      params: {
        name: "refund_eligibility",
        arguments: {
          vendor: "adobe",
          days_since_purchase: 5,
          region: "US",
          plan: "individual",
          unexpected: "accepted",
        },
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json?.error?.code, -32602);
  assert.match(response.json?.error?.data?.message || "", /unexpected/i);
  assert.equal(response.json?.result, undefined);
}

async function testRejectsUnexpectedBrowserOrigin() {
  const response = await invokeJson(policyMcp, {
    method: "POST",
    headers: {
      origin: "https://attacker.example",
      "user-agent": "policy-mcp-test",
    },
    body: {
      jsonrpc: "2.0",
      id: 22,
      method: "tools/list",
      params: {},
    },
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json?.error?.data?.code, "ORIGIN_NOT_ALLOWED");
  assert.notEqual(response.headers["access-control-allow-origin"], "*");
}

async function testAcceptsInitializedNotificationWithoutResponseBody() {
  const response = await invokeJson(policyMcp, {
    method: "POST",
    headers: { "user-agent": "policy-mcp-test" },
    body: {
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    },
  });

  assert.equal(response.statusCode, 202);
  assert.equal(response.body, "");
}

async function testRejectsGetWhenSseIsNotImplemented() {
  const response = await invokeJson(policyMcp, {
    method: "GET",
    headers: {
      accept: "text/event-stream",
      "user-agent": "policy-mcp-test",
    },
  });

  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.allow, "POST, OPTIONS");
}

async function testRejectsNonJsonRpcTwoRequests() {
  const response = await invokeJson(policyMcp, {
    method: "POST",
    headers: { "user-agent": "policy-mcp-test" },
    body: {
      jsonrpc: "1.0",
      id: 23,
      method: "tools/list",
      params: {},
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json?.error?.code, -32600);
  assert.match(response.json?.error?.data?.message || "", /jsonrpc/i);
}

async function testRejectsUnsupportedProtocolVersionHeader() {
  const response = await invokeJson(policyMcp, {
    method: "POST",
    headers: {
      "mcp-protocol-version": "2099-01-01",
      "user-agent": "policy-mcp-test",
    },
    body: {
      jsonrpc: "2.0",
      id: 24,
      method: "tools/list",
      params: {},
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json?.error?.data?.code, "UNSUPPORTED_PROTOCOL_VERSION");
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));
}

function testPublishesCanonicalDiscoveryMetadata() {
  const registryServer = readJson("../server.json");
  const serverCard = readJson("../public/.well-known/mcp/server-card.json");
  const agentCard = readJson("../public/.well-known/agent-card.json");
  const ucp = readJson("../public/.well-known/ucp.json");

  assert.deepEqual(registryServer, buildPolicyRegistryServer());
  assert.ok(
    registryServer.description.length <= 100,
    "Official MCP Registry descriptions must not exceed 100 characters"
  );
  assert.deepEqual(
    serverCard,
    buildPolicyMcpServerCard([refundTool, cancelTool, returnTool, trialTool].map((entry) => entry.tool))
  );
  assert.equal(registryServer.name, "io.github.decidefyi/policy-notaries");
  assert.deepEqual(registryServer.remotes, [
    { type: "streamable-http", url: "https://policy.decide.fyi/api/mcp" },
  ]);
  assert.equal(serverCard.serverInfo?.name, "policy.decide.fyi");
  assert.match(serverCard.serverInfo?.description || "", /100 US subscription vendors/);
  assert.deepEqual(serverCard.serverInfo?.icons, [
    {
      src: "https://policy.decide.fyi/favicon.svg",
      mimeType: "image/svg+xml",
      sizes: ["any"],
    },
  ]);
  assert.equal(agentCard.services?.[0]?.mcp_url, "https://policy.decide.fyi/api/mcp");
  assert.deepEqual(
    serverCard.tools?.map((tool) => tool.name),
    [
      "refund_eligibility",
      "cancellation_penalty",
      "return_eligibility",
      "trial_terms",
    ]
  );

  const ucpServices = new Map((ucp.services || []).map((service) => [service.tool_name, service]));
  for (const { tool } of [refundTool, cancelTool, returnTool, trialTool]) {
    const service = ucpServices.get(tool.name);
    assert.ok(service, `${tool.name} must be published in UCP discovery`);
    const required = new Set(tool.inputSchema?.required || []);
    const expectedInputs = Object.fromEntries(
      Object.entries(tool.inputSchema?.properties || {}).map(([name, schema]) => [
        name,
        { ...schema, required: required.has(name) },
      ])
    );
    assert.deepEqual(service.inputs, expectedInputs, `${tool.name} UCP inputs must match the MCP schema`);
  }
}

async function testPublishesOnePolicyMcpVersion() {
  const packageMetadata = readJson("../package.json");
  const registryServer = readJson("../server.json");
  const serverCard = readJson("../public/.well-known/mcp/server-card.json");
  const agentCard = readJson("../public/.well-known/agent-card.json");
  const ucp = readJson("../public/.well-known/ucp.json");
  const initialized = await invokeJson(policyMcp, {
    method: "POST",
    headers: { "user-agent": "policy-mcp-test" },
    body: {
      jsonrpc: "2.0",
      id: 3,
      method: "initialize",
      params: { protocolVersion: "2025-11-25" },
    },
  });

  assert.deepEqual(
    new Set([
      packageMetadata.version,
      registryServer.version,
      serverCard.serverInfo?.version,
      agentCard.version,
      ucp.version,
      initialized.json?.result?.serverInfo?.version,
    ]),
    new Set(["1.3.1"])
  );
}

async function testRoutesCanonicalPolicyHostname() {
  const originalFetch = globalThis.fetch;
  let destination = null;
  globalThis.fetch = async (input) => {
    destination = String(input);
    return new Response(null, { status: 204 });
  };

  try {
    const request = new Request("https://policy.decide.fyi/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", host: "policy.decide.fyi" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    const response = await middleware(request);

    assert.equal(response?.status, 204);
    assert.equal(destination, "https://policy.decide.fyi/api/policy-mcp");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

await testListsAllPolicyNotaryTools();
console.log("PASS policy MCP lists all four notary tools");
await testSupportsLifecyclePingAndProtocolNegotiation();
console.log("PASS policy MCP supports lifecycle ping and published protocol versions");
testPublishesReadOnlyToolContracts();
console.log("PASS policy MCP publishes read-only tool contracts");
await testCallsCancellationTool();
console.log("PASS policy MCP dispatches cancellation tool");
await testRoutesAmbiguousCancellationContextToReview();
console.log("PASS policy MCP routes ambiguous cancellation context to review");
await testRoutesVariableTrialOfferToReview();
console.log("PASS policy MCP routes variable trial offers to review");
await testRoutesDynamicTrialsToReview();
console.log("PASS policy MCP routes dynamic trial offers to review");
await testRoutesConditionalRefundToReview();
console.log("PASS policy MCP routes conditional refunds to review");
await testKeepsApprovalBasedRefundsInManualReview();
console.log("PASS policy MCP keeps approval-based refunds in manual review");
await testRoutesConditionalReturnToReview();
console.log("PASS policy MCP routes conditional returns to review");
await testPublicPolicyRoutesFailClosed();
console.log("PASS public policy routes fail closed like MCP");
testPolicyAutomationModesAreExplicit();
console.log("PASS policy automation modes are explicit in every vendor rule");
testPolicySourceHashTracksReviewedPolicyNotMonitorTime();
console.log("PASS policy source hash tracks reviewed policy, not monitor time");
await testCallsEveryPolicyTool();
console.log("PASS policy MCP dispatches every listed tool");
await testLabelsSourceAndRuleFreshnessPrecisely();
console.log("PASS policy MCP labels source and rule freshness precisely");
await testRejectsArgumentsOutsidePublishedSchema();
console.log("PASS policy MCP rejects arguments outside the published schema");
await testRejectsUnexpectedBrowserOrigin();
console.log("PASS policy MCP rejects unexpected browser origins");
await testAcceptsInitializedNotificationWithoutResponseBody();
console.log("PASS policy MCP accepts initialized notifications without a response body");
await testRejectsGetWhenSseIsNotImplemented();
console.log("PASS policy MCP rejects GET when SSE is not implemented");
await testRejectsNonJsonRpcTwoRequests();
console.log("PASS policy MCP rejects requests outside JSON-RPC 2.0");
await testRejectsUnsupportedProtocolVersionHeader();
console.log("PASS policy MCP rejects unsupported protocol-version headers");
testPublishesCanonicalDiscoveryMetadata();
console.log("PASS policy MCP publishes canonical discovery metadata");
await testPublishesOnePolicyMcpVersion();
console.log("PASS policy MCP publishes one release version");
await testRoutesCanonicalPolicyHostname();
console.log("PASS policy MCP routes canonical hostname");
