import "./test-helpers/install-policy-evidence-fixture.js";
import zendeskWorkflowRoute from "../api/v1/workflows/zendesk/[workflow].js";

function createReq({
  method = "GET",
  headers = {},
  body,
  query = {},
  url = "/",
  remoteAddress = "127.0.0.1",
} = {}) {
  return {
    method,
    headers,
    body,
    query,
    url,
    socket: { remoteAddress },
    [Symbol.asyncIterator]: async function* () {
      if (typeof body === "string") {
        yield Buffer.from(body);
      }
    },
  };
}

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(key, value) {
      this.headers[key] = value;
    },
    end(chunk = "") {
      this.body += String(chunk ?? "");
    },
  };
}

function parseJson(label, body) {
  try {
    return JSON.parse(body || "{}");
  } catch (error) {
    throw new Error(`${label}: invalid JSON (${error.message})`);
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function runCase(label, handler, reqOptions, assertFn) {
  const req = createReq(reqOptions);
  const res = createRes();
  await handler(req, res);
  const json = parseJson(label, res.body);
  assertFn({ statusCode: res.statusCode, headers: res.headers, json });
  console.log(`PASS ${label}`);
}

async function withEnvironment(overrides, work) {
  const previous = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    return await work();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function main() {
  await withEnvironment(
    {
      NODE_ENV: "test",
      WORKFLOW_TEST_MODE: "1",
      VERCEL_ENV: undefined,
      WORKFLOW_API_TOKEN: undefined,
      WORKFLOW_API_AUTH_REQUIRED: undefined,
    },
    async () => {
      await withEnvironment(
        {
          VERCEL_ENV: "production",
          WORKFLOW_API_TOKEN: "workflow-test-token",
          WORKFLOW_TEST_MODE: "0",
        },
        async () => {
          await runCase(
            "production workflow requires bearer token",
            zendeskWorkflowRoute,
            {
              method: "POST",
              headers: { "user-agent": "workflow-test", "content-type": "application/json" },
              url: "/api/v1/workflows/zendesk/refund",
              query: { workflow: "refund" },
            },
            ({ statusCode, json }) => {
              expect(statusCode === 401, "expected production workflow auth failure");
              expect(json.error === "WORKFLOW_UNAUTHORIZED", "expected WORKFLOW_UNAUTHORIZED");
            }
          );

          await runCase(
            "production workflow rejects decision override",
            zendeskWorkflowRoute,
            {
              method: "POST",
              headers: {
                "user-agent": "workflow-test",
                "content-type": "application/json",
                authorization: "Bearer workflow-test-token",
              },
              body: {
                ticket_id: "ZD-9000",
                workflow_type: "refund",
                vendor: "adobe",
                days_since_purchase: 5,
                decision_override: "yes",
              },
              url: "/api/v1/workflows/zendesk/refund",
              query: { workflow: "refund" },
            },
            ({ statusCode, json }) => {
              expect(statusCode === 400, "expected production decision_override rejection");
              expect(json.error === "DECISION_OVERRIDE_TEST_ONLY", "expected test-only override error");
            }
          );
        }
      );

      await withEnvironment(
        { VERCEL_ENV: "production", WORKFLOW_API_TOKEN: undefined },
        async () => {
          await runCase(
            "production workflow fails closed without configured token",
            zendeskWorkflowRoute,
            {
              method: "POST",
              headers: { "user-agent": "workflow-test", "content-type": "application/json" },
              url: "/api/v1/workflows/zendesk/refund",
              query: { workflow: "refund" },
            },
            ({ statusCode, json }) => {
              expect(statusCode === 503, "expected production workflow configuration failure");
              expect(json.error === "WORKFLOW_AUTH_NOT_CONFIGURED", "expected WORKFLOW_AUTH_NOT_CONFIGURED");
            }
          );
        }
      );

  await runCase(
    "refund workflow => approve_refund",
    zendeskWorkflowRoute,
    {
      method: "POST",
      headers: { "user-agent": "workflow-test", "content-type": "application/json" },
      body: {
        ticket_id: "ZD-9001",
        workflow_type: "refund",
        question: "Should this Adobe annual plan refund request proceed under policy?",
        vendor: "adobe",
        region: "US",
        plan: "individual",
        days_since_purchase: 5,
        qualifying_conditions_met: true,
        idempotency_key: "ZD-9001:refund:adobe:5:US:individual",
        decision_override: "yes",
      },
      url: "/api/v1/workflows/zendesk/refund",
      query: { workflow: "refund" },
    },
    ({ statusCode, json }) => {
      expect(statusCode === 200, "expected 200");
      expect(json.ok === true, "expected ok=true");
      expect(json.decision?.c === "yes", "expected decision yes");
      expect(json.policy?.verdict === "ALLOWED", "expected policy ALLOWED");
      expect(json.policy?.code === "WITHIN_WINDOW", "expected policy code WITHIN_WINDOW");
      expect(json.action?.type === "approve_refund", "expected action approve_refund");
      expect(json.action?.execution_allowed === false, "expected reference action execution guard");
      expect(json.workflow_contract?.execution_allowed === false, "expected reference workflow contract");
      expect(json.decision?.decision_contract?.authority === "test_fixture", "expected fixture decision contract");
      expect(Array.isArray(json.action?.zendesk_tags), "expected zendesk_tags");
      expect(json.action.zendesk_tags.includes("refund_allowed"), "expected refund_allowed tag");
      expect(String(json.action?.zendesk_private_note || "").includes("request_id:"), "expected request_id in note");
    }
  );

  await runCase(
    "review-only refund => policy owner escalation",
    zendeskWorkflowRoute,
    {
      method: "POST",
      headers: { "user-agent": "workflow-test", "content-type": "application/json" },
      body: {
        ticket_id: "ZD-9001-REVIEW",
        workflow_type: "refund",
        question: "Should this Apple App Store refund request proceed under policy?",
        vendor: "apple_app_store",
        region: "US",
        plan: "individual",
        days_since_purchase: 5,
        qualifying_conditions_met: true,
        idempotency_key: "ZD-9001-REVIEW:refund:apple_app_store:5:US:individual",
        decision_override: "yes",
      },
      url: "/api/v1/workflows/zendesk/refund",
      query: { workflow: "refund" },
    },
    ({ statusCode, json }) => {
      expect(statusCode === 200, "expected 200");
      expect(json.ok === true, "expected ok=true");
      expect(json.decision?.c === "yes", "expected decision yes");
      expect(json.policy?.verdict === "UNKNOWN", "expected policy UNKNOWN");
      expect(json.policy?.code === "MISSING_REQUIRED_CONTEXT", "expected fail-closed policy code");
      expect(json.policy?.required_context?.includes("manual_policy_review"), "expected manual review context");
      expect(json.action?.type === "escalate_policy_owner", "expected policy owner escalation");
      expect(json.action.zendesk_tags.includes("refund_unknown"), "expected refund_unknown tag");
    }
  );

  await runCase(
    "cancel workflow => penalty escalation",
    zendeskWorkflowRoute,
    {
      method: "POST",
      headers: { "user-agent": "workflow-test", "content-type": "application/json" },
      body: {
        ticket_id: "ZD-9002",
        workflow_type: "cancel",
        question: "Should this Adobe cancellation request proceed under policy?",
        vendor: "adobe",
        region: "US",
        plan: "individual",
        billing_cadence: "annual",
        idempotency_key: "ZD-9002:cancel:adobe::US:individual",
        decision_override: "yes",
      },
      url: "/api/v1/workflows/zendesk/cancel",
      query: { workflow: "cancel" },
    },
    ({ statusCode, json }) => {
      expect(statusCode === 200, "expected 200");
      expect(json.ok === true, "expected ok=true");
      expect(json.decision?.c === "yes", "expected decision yes");
      expect(json.policy?.verdict === "PENALTY", "expected policy PENALTY");
      expect(json.action?.type === "escalate_with_penalty_disclosure", "expected escalation with penalty");
      expect(json.action.zendesk_tags.includes("cancel_penalty"), "expected cancel_penalty tag");
    }
  );

  await runCase(
    "return workflow => approve_return",
    zendeskWorkflowRoute,
    {
      method: "POST",
      headers: { "user-agent": "workflow-test", "content-type": "application/json" },
      body: {
        ticket_id: "ZD-9003",
        workflow_type: "return",
        question: "Should this Adobe return request proceed under policy?",
        vendor: "adobe",
        region: "US",
        plan: "individual",
        days_since_purchase: 5,
        qualifying_conditions_met: true,
        idempotency_key: "ZD-9003:return:adobe:5:US:individual",
        decision_override: "yes",
      },
      url: "/api/v1/workflows/zendesk/return",
      query: { workflow: "return" },
    },
    ({ statusCode, json }) => {
      expect(statusCode === 200, "expected 200");
      expect(json.ok === true, "expected ok=true");
      expect(json.decision?.c === "yes", "expected decision yes");
      expect(json.policy?.verdict === "RETURNABLE", "expected policy RETURNABLE");
      expect(json.action?.type === "approve_return", "expected action approve_return");
      expect(json.action.zendesk_tags.includes("return_returnable"), "expected return_returnable tag");
    }
  );

  await runCase(
    "trial workflow => approve_trial",
    zendeskWorkflowRoute,
    {
      method: "POST",
      headers: { "user-agent": "workflow-test", "content-type": "application/json" },
      body: {
        ticket_id: "ZD-9004",
        workflow_type: "trial",
        question: "Should this Adobe trial request proceed under policy?",
        vendor: "adobe",
        region: "US",
        plan: "individual",
        offer_confirmed: true,
        observed_trial_days: 7,
        observed_card_required: true,
        observed_auto_converts: true,
        idempotency_key: "ZD-9004:trial:adobe::US:individual",
        decision_override: "yes",
      },
      url: "/api/v1/workflows/zendesk/trial",
      query: { workflow: "trial" },
    },
    ({ statusCode, json }) => {
      expect(statusCode === 200, "expected 200");
      expect(json.ok === true, "expected ok=true");
      expect(json.decision?.c === "yes", "expected decision yes");
      expect(json.policy?.verdict === "TRIAL_AVAILABLE", "expected policy TRIAL_AVAILABLE");
      expect(json.action?.type === "approve_trial", "expected action approve_trial");
      expect(json.action.zendesk_tags.includes("trial_trial_available"), "expected trial_trial_available tag");
    }
  );

  await runCase(
    "refund idempotency replay returns cached result",
    zendeskWorkflowRoute,
    {
      method: "POST",
      headers: { "user-agent": "workflow-test", "content-type": "application/json" },
      body: {
        ticket_id: "ZD-9001",
        workflow_type: "refund",
        question: "Should this Adobe annual plan refund request proceed under policy?",
        vendor: "adobe",
        region: "US",
        plan: "individual",
        days_since_purchase: 5,
        qualifying_conditions_met: true,
        idempotency_key: "ZD-9001:refund:adobe:5:US:individual",
        decision_override: "yes",
      },
      url: "/api/v1/workflows/zendesk/refund",
      query: { workflow: "refund" },
    },
    ({ statusCode, headers, json }) => {
      expect(statusCode === 200, "expected 200");
      expect(headers["X-Idempotent-Replay"] === "1", "expected idempotent replay header");
      expect(json.idempotent_replay === true, "expected idempotent_replay=true");
      expect(json.action?.type === "approve_refund", "expected cached approve_refund");
    }
  );

  await runCase(
    "tie path => escalate_policy_owner",
    zendeskWorkflowRoute,
    {
      method: "POST",
      headers: { "user-agent": "workflow-test", "content-type": "application/json" },
      body: {
        ticket_id: "ZD-9010",
        workflow_type: "trial",
        vendor: "adobe",
        region: "US",
        plan: "individual",
        idempotency_key: "ZD-9010:trial:adobe::US:individual",
        decision_override: "tie",
      },
      url: "/api/v1/workflows/zendesk/trial",
      query: { workflow: "trial" },
    },
    ({ statusCode, json }) => {
      expect(statusCode === 200, "expected 200");
      expect(json.decision?.c === "tie", "expected decision tie");
      expect(json.policy === null, "expected no policy call on tie");
      expect(json.action?.type === "escalate_policy_owner", "expected escalation");
    }
  );

    }
  );

  console.log("Workflow test complete.");
}

main().catch((error) => {
  console.error(`FAIL ${error.message}`);
  process.exitCode = 1;
});
