#!/usr/bin/env node
import "./test-helpers/install-policy-evidence-fixture.js";

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  verify as cryptoVerify,
} from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

import decideHandler from "../api/decide.js";
import rulebookAttestationKeysHandler from "../api/rulebook-attestation-keys.js";
import v1PolicyDispatcher from "../api/v1/[policy]/[action].js";
import zendeskWorkflowDispatcher from "../api/v1/workflows/zendesk/[workflow].js";
import {
  RULEBOOK_OUTPUT_MATERIAL_FIELDS,
  buildAdvisoryDecisionContract,
  buildAdvisoryResponseContractManifest,
  buildRulebookRuntimeManifest,
} from "../lib/rulebook-runtime-contract.js";
import { evaluateRulebookV1 } from "../lib/rulebook-v1.js";
import {
  auditTrustedAdapterImplementation,
  getTrustedAdapterManifest,
  getTrustedAdapterVersionLock,
} from "../lib/trusted-adapters.js";
import { invokeJson } from "./test-helpers/http-harness.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, "fixtures", "decision-contract");
const CONTRACT_GEMINI_BUDGET_URL = "https://gemini-budget.contract.test";
process.env.DECIDE_GEMINI_BUDGET_KV_REST_API_URL = CONTRACT_GEMINI_BUDGET_URL;
process.env.DECIDE_GEMINI_BUDGET_KV_REST_API_TOKEN = "contract-budget-token";

function createBudgetedGeminiFetch(providerFetch) {
  return async (url, options = {}) => {
    if (String(url).startsWith(`${CONTRACT_GEMINI_BUDGET_URL}/`)) {
      const pipeline = JSON.parse(String(options.body || "[]"));
      const command = pipeline?.[0] || [];
      const keyCount = Number(command[2]);
      return {
        ok: true,
        status: 200,
        async json() {
          if (command[0] !== "EVAL") return [{ error: "unexpected budget command" }];
          if (keyCount === 4) return [{ result: [1, "allowed", 1, 1, 1] }];
          if (keyCount === 1) return [{ result: 1 }];
          return [{ error: "unexpected budget key count" }];
        },
      };
    }
    return providerFetch(url, options);
  };
}

function loadFixture(fileName) {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, fileName), "utf8"));
}

function loadJsonFromRepo(...segments) {
  return JSON.parse(readFileSync(join(__dirname, "..", ...segments), "utf8"));
}

function loadPublicRulebookConformanceFixture(fileName) {
  return loadJsonFromRepo("public", "conformance", "rulebook-v1", fileName);
}

function loadPublicRulebookGoldenReplayFixture(fileName) {
  return loadJsonFromRepo("public", "replay", "rulebook-v1", fileName);
}

function assertIsoTimestamp(value, label) {
  assert.equal(typeof value, "string", `${label}: expected string`);
  assert.ok(Number.isFinite(Date.parse(value)), `${label}: expected ISO timestamp`);
}

function assertLineage(payload, label) {
  assert.equal(typeof payload.policy_version, "string", `${label}: missing policy_version`);
  assert.ok(payload.policy_version.length > 0, `${label}: policy_version is empty`);
  assert.equal(typeof payload.source_hash, "string", `${label}: missing source_hash`);
  assert.ok(payload.source_hash.length >= 8, `${label}: source_hash looks too short`);
  assertIsoTimestamp(payload.evaluated_at, `${label}.evaluated_at`);
}

function assertUnknownField(errors, expectedField, label) {
  assert.ok(Array.isArray(errors), `${label}: errors missing`);
  assert.ok(
    errors.some((entry) => entry?.code === "unknown_field" && entry?.field === expectedField),
    `${label}: expected unknown_field for ${expectedField}`
  );
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  return `{${Object.keys(value)
    .sort((left, right) => left.localeCompare(right))
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function verifySignature({ publicKeyPem, bundleHash, signature }) {
  return cryptoVerify(
    null,
    Buffer.from(String(bundleHash || ""), "utf8"),
    createPublicKey(publicKeyPem),
    Buffer.from(String(signature || ""), "base64url")
  );
}

function assertRulebookAttestation(payload, label) {
  const attestation = payload?.rulebook_attestation;
  const signature = attestation?.signature;
  assert.equal(attestation?.schema_version, "rulebook_attestation_v1", `${label}: attestation schema mismatch`);
  assert.match(attestation?.bundle_hash || "", /^[a-f0-9]{64}$/, `${label}: attestation bundle hash must be sha256 hex`);
  assert.equal(
    attestation.bundle_hash,
    sha256(canonicalJson(attestation.bundle)),
    `${label}: attestation bundle hash must match canonical bundle`
  );
  assert.equal(attestation?.bundle?.engine, payload?.engine, `${label}: attestation engine mismatch`);
  assert.equal(
    attestation?.bundle?.evaluator_version,
    payload?.evaluator_version,
    `${label}: attestation evaluator mismatch`
  );
  assert.deepEqual(attestation?.bundle?.rulebook, payload?.rulebook, `${label}: attestation rulebook mismatch`);
  assert.equal(attestation?.bundle?.input_hash, payload?.input_hash, `${label}: attestation input hash mismatch`);
  assert.deepEqual(
    attestation?.bundle?.outcome,
    {
      status: payload?.status,
      verdict: payload?.verdict,
      application_verdict: payload?.application_verdict,
      action: payload?.action,
      reason_code: payload?.reason_code,
      matched_rule_id: payload?.matched_rule_id,
    },
    `${label}: attestation outcome mismatch`
  );
  assert.deepEqual(
    attestation?.bundle?.runtime_binding,
    payload?.runtime_binding,
    `${label}: attestation runtime binding mismatch`
  );

  if (payload?.trusted_adapter) {
    assert.deepEqual(
      attestation?.bundle?.trusted_adapter,
      payload.trusted_adapter,
      `${label}: attestation trusted adapter mismatch`
    );
  } else {
    assert.equal(attestation?.bundle?.trusted_adapter, null, `${label}: attestation trusted adapter should be null`);
  }

  assert.equal(
    signature?.schema_version,
    "rulebook_attestation_signature_v1",
    `${label}: attestation signature schema mismatch`
  );
  assert.equal(signature?.algorithm, "Ed25519", `${label}: attestation signature algorithm mismatch`);
  assert.equal(signature?.signed_field, "bundle_hash", `${label}: attestation signature must cover bundle_hash`);
  assert.equal(
    signature?.public_key_url,
    "https://api.decide.fyi/.well-known/rulebook-attestation-keys.json",
    `${label}: attestation signature public key URL mismatch`
  );
  assert.ok(
    ["signed", "unsigned"].includes(signature?.status),
    `${label}: attestation signature status must be signed or unsigned`
  );
  if (signature.status === "signed") {
    assert.equal(typeof signature.key_id, "string", `${label}: signed attestation key id missing`);
    assert.match(signature.signature || "", /^[A-Za-z0-9_-]+$/, `${label}: signed attestation signature must be base64url`);
    assert.match(signature.public_key_pem || "", /^-----BEGIN PUBLIC KEY-----/, `${label}: signed attestation public key missing`);
    assert.equal(
      verifySignature({
        publicKeyPem: signature.public_key_pem,
        bundleHash: attestation.bundle_hash,
        signature: signature.signature,
      }),
      true,
      `${label}: signed attestation signature verification failed`
    );
  } else {
    assert.equal(signature.signature, null, `${label}: unsigned attestation signature should be null`);
  }
}

function assertRuntimeBinding(payload, expectedMode, label) {
  assert.deepEqual(
    payload?.runtime_binding,
    {
      production_core: "hybrid_declarative_rulebook_with_trusted_adapters",
      binding_mode: expectedMode,
      verdict_authority: "declarative_rulebook",
      ...(expectedMode === "trusted_adapter_facts_then_declarative_rulebook"
        ? { adapter_authority: "facts_only" }
        : {}),
      customer_supplied_code: "rejected",
    },
    `${label}: runtime binding mismatch`
  );
}

function assertAdvisoryDecisionContract(payload, expectedMode, label) {
  assert.deepEqual(
    payload?.decision_contract,
    buildAdvisoryDecisionContract({ mode: expectedMode }),
    `${label}: advisory decision contract mismatch`
  );
  assert.equal(payload?.rulebook_contract, undefined, `${label}: advisory response must not expose rulebook contract`);
  assert.equal(payload?.runtime_binding, undefined, `${label}: advisory response must not expose runtime binding`);
}

function generateSigningEnv(keyId = "contract-test-rulebook-key") {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }),
    keyId,
  };
}

function runTrustedAdapterCapabilityRuntimeProbe() {
  return new Promise((resolve, reject) => {
    const capabilityModuleUrl = new URL("../lib/trusted-adapter-capabilities.js", import.meta.url).href;
    const source = `
      import { parentPort } from "node:worker_threads";
      import { installDeniedAmbientCapabilities } from ${JSON.stringify(capabilityModuleUrl)};

      const results = {};
      const probe = (name, operation) => {
        try {
          operation();
          results[name] = "allowed";
        } catch (error) {
          results[name] = String(error?.message || error);
        }
      };

      installDeniedAmbientCapabilities();
      probe("environment_access", () => process.env);
      probe("clock_access", () => performance.now());
      probe("randomness_access", () => crypto.randomUUID());
      probe("network_access", () => fetch("https://example.com"));
      probe("timer_access", () => setImmediate(() => {}));
      probe("network_override", () => {
        globalThis.fetch = () => ({ ok: true });
      });
      parentPort.postMessage(results);
    `;
    const worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(source)}`), {
      type: "module",
      env: {},
    });
    worker.once("message", (message) => {
      void worker.terminate();
      resolve(message);
    });
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) reject(new Error(`capability runtime probe exited with code ${code}`));
    });
  });
}

async function testDecideSingleFixture() {
  const fixture = loadFixture("decide-single.json");
  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  const previousGeminiMode = process.env.DECIDE_GEMINI_MODE;
  process.env.GEMINI_API_KEY = "contract-test";
  process.env.DECIDE_API_KEY = "";
  process.env.DECIDE_GEMINI_MODE = "paid";
  global.fetch = createBudgetedGeminiFetch(async () => ({
    ok: true,
    async json() {
      return {
        candidates: [
          {
            content: {
              parts: [{ text: "yes" }],
            },
          },
        ],
      };
    },
  }));

  try {
    const result = await invokeJson(decideHandler, {
      ...fixture.request,
      headers: { ...(fixture.request.headers || {}), "x-forwarded-for": "127.0.0.201" },
    });
    assert.equal(result.statusCode, fixture.expect.statusCode, "decide status mismatch");
    assert.equal(result.json?.c, fixture.expect.c, "decide c mismatch");
    assert.equal(result.json?.v, fixture.expect.v, "decide v mismatch");
    assert.equal(typeof result.json?.request_id, "string", "decide request_id missing");
    assertAdvisoryDecisionContract(result.json, "single", "decide");
    assertLineage(result.json, "decide");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
    if (previousGeminiMode === undefined) delete process.env.DECIDE_GEMINI_MODE;
    else process.env.DECIDE_GEMINI_MODE = previousGeminiMode;
  }
}

async function testDecideMultiAdvisoryContract() {
  const request = {
    method: "POST",
    url: "/api/decide",
    headers: {
      "content-type": "application/json",
      "user-agent": "contract-test-multi",
    },
    body: {
      mode: "multi",
      stem: "Which implementation path should we take?",
      options: ["Declarative rulebook", "Customer executable code", "LLM-only judgement"],
    },
  };
  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  const previousGeminiMode = process.env.DECIDE_GEMINI_MODE;
  process.env.GEMINI_API_KEY = "contract-test";
  process.env.DECIDE_API_KEY = "";
  process.env.DECIDE_GEMINI_MODE = "paid";
  let providerBody = null;
  global.fetch = createBudgetedGeminiFetch(async (_url, options = {}) => {
    providerBody = JSON.parse(String(options.body || "{}"));
    return {
      ok: true,
      async json() {
        return {
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify({ scores: [9.1, 2.4, 1.8], reason: "bounded rulebooks are replayable" }) }],
              },
            },
          ],
        };
      },
    };
  });

  try {
    const result = await invokeJson(decideHandler, request);
    assert.equal(result.statusCode, 200, "decide multi status mismatch");
    assert.equal(result.json?.c, "ok", "decide multi c mismatch");
    assert.equal(result.json?.v, "ok", "decide multi v mismatch");
    assert.equal(result.json?.winner_index, 0, "decide multi winner mismatch");
    assert.equal(
      providerBody?.generationConfig?.responseMimeType,
      "application/json",
      "multi advisory must request structured JSON"
    );
    assert.equal(
      providerBody?.generationConfig?.responseJsonSchema?.properties?.scores?.minItems,
      request.body.options.length,
      "multi advisory schema must require one score per option"
    );
    assert.equal(
      providerBody?.generationConfig?.responseJsonSchema?.properties?.scores?.maxItems,
      request.body.options.length,
      "multi advisory schema must reject extra scores"
    );
    assertAdvisoryDecisionContract(result.json, "multi", "decide multi");
    assertLineage(result.json, "decide_multi");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
    if (previousGeminiMode === undefined) delete process.env.DECIDE_GEMINI_MODE;
    else process.env.DECIDE_GEMINI_MODE = previousGeminiMode;
  }
}

async function testDecideApiKeyFixture() {
  const fixture = loadFixture("decide-single.json");
  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  const previousGeminiMode = process.env.DECIDE_GEMINI_MODE;
  process.env.GEMINI_API_KEY = "contract-test";
  process.env.DECIDE_API_KEY = "decide-auth-token";
  process.env.DECIDE_GEMINI_MODE = "paid";
  global.fetch = createBudgetedGeminiFetch(async () => ({
    ok: true,
    async json() {
      return {
        candidates: [
          {
            content: {
              parts: [{ text: "yes" }],
            },
          },
        ],
      };
    },
  }));

  try {
    const unauthorized = await invokeJson(decideHandler, fixture.request);
    assert.equal(unauthorized.statusCode, 401, "decide unauthorized status mismatch");
    assert.equal(unauthorized.json?.error, "DECIDE_API_UNAUTHORIZED", "decide unauthorized error mismatch");

    const authorized = await invokeJson(decideHandler, {
      ...fixture.request,
      headers: {
        ...(fixture.request.headers || {}),
        "x-api-key": "decide-auth-token",
      },
    });
    assert.equal(authorized.statusCode, fixture.expect.statusCode, "decide authorized status mismatch");
    assert.equal(authorized.json?.c, fixture.expect.c, "decide authorized c mismatch");
    assert.equal(authorized.json?.v, fixture.expect.v, "decide authorized v mismatch");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
    if (previousGeminiMode === undefined) delete process.env.DECIDE_GEMINI_MODE;
    else process.env.DECIDE_GEMINI_MODE = previousGeminiMode;
  }
}

async function testDecideProductionRequiresTrustedEdge() {
  const fixture = loadFixture("decide-single.json");
  const originalFetch = global.fetch;
  const envKeys = [
    "GEMINI_API_KEY",
    "DECIDE_API_KEY",
    "DECIDE_PROXY_SHARED_TOKEN",
    "DECIDE_API_AUTH_REQUIRED",
    "DECIDE_GEMINI_MODE",
    "VERCEL_ENV",
  ];
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  process.env.GEMINI_API_KEY = "contract-test";
  process.env.DECIDE_API_KEY = "";
  process.env.DECIDE_PROXY_SHARED_TOKEN = "trusted-proxy-token";
  process.env.DECIDE_GEMINI_MODE = "paid";
  delete process.env.DECIDE_API_AUTH_REQUIRED;
  process.env.VERCEL_ENV = "production";
  global.fetch = createBudgetedGeminiFetch(async () => ({
    ok: true,
    async json() {
      return {
        candidates: [{ content: { parts: [{ text: "yes" }] } }],
      };
    },
  }));

  try {
    const direct = await invokeJson(decideHandler, fixture.request);
    assert.equal(direct.statusCode, 401, "production direct decide request must require a trusted edge");
    assert.equal(direct.json?.error, "DECIDE_API_UNAUTHORIZED", "production direct auth error mismatch");

    const proxied = await invokeJson(decideHandler, {
      ...fixture.request,
      headers: {
        ...(fixture.request.headers || {}),
        "x-decide-proxy-token": "trusted-proxy-token",
        "x-decide-rate-limit-bypass": "1",
      },
    });
    assert.equal(proxied.statusCode, 200, "trusted proxy request should reach the decision runtime");
    assert.equal(proxied.json?.c, "yes", "trusted proxy decision mismatch");
  } finally {
    global.fetch = originalFetch;
    for (const key of envKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  }
}

async function testDecideRuntimeFixture() {
  const fixture = loadFixture("decide-runtime.json");
  const sensitiveInputValue = "sk_live_should_not_echo";
  fixture.request.body.context.inputs.api_key = sensitiveInputValue;
  fixture.request.body.context.inputs.access_token = "tok_should_not_echo";
  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  const previousGeminiMode = process.env.DECIDE_GEMINI_MODE;
  process.env.GEMINI_API_KEY = "contract-test";
  process.env.DECIDE_API_KEY = "";
  process.env.DECIDE_GEMINI_MODE = "paid";
  let runtimeProviderText = JSON.stringify({
    decision: {
      recommended_option: "Burst packs",
      confidence: 1.2,
    },
    scorecard: [
      { option: "Burst packs", score: 8.7, confidence: 1.1, impact: "high projected expansion", risk: "low", rank: 1 },
      { option: "Automatic overage", score: 8.4, confidence: 0.67, impact: "high expansion with trust risk", risk: "high", rank: 2 },
      { option: "Hybrid grace + overage", score: 8.2, confidence: 0.7, impact: "balanced expansion and retention", risk: "medium", rank: 3 },
    ],
    tradeoffs: ["Burst packs add packaging complexity compared with automatic overage."],
    next_actions: ["Run a bounded Burst packs pilot with a rollback owner."],
    citations: [
      {
        title: "Requester context evidence",
        url: "",
        reasoning_lines: [
          "Compared all submitted packaging options.",
          "Applied the stated expansion and trust constraints.",
        ],
      },
    ],
  });
  let runtimeProviderBody = null;
  global.fetch = createBudgetedGeminiFetch(async (_url, options = {}) => {
    runtimeProviderBody = JSON.parse(String(options.body || "{}"));
    return {
      ok: true,
      async json() {
        return {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: runtimeProviderText,
                  },
                ],
              },
            },
          ],
        };
      },
    };
  });

  try {
    const result = await invokeJson(decideHandler, {
      ...fixture.request,
      headers: { ...(fixture.request.headers || {}), "x-forwarded-for": "127.0.0.202" },
    });
    assert.equal(result.statusCode, fixture.expect.statusCode, "decide runtime status mismatch");
    assert.equal(result.json?.status, "ok", "decide runtime status field mismatch");
    assert.equal(result.json?.engine, "decide", "decide runtime engine mismatch");
    assert.equal(result.json?.c, "ok", "decide runtime c mismatch");
    assert.equal(result.json?.v, "ok", "decide runtime v mismatch");
    assert.equal(
      runtimeProviderBody?.generationConfig?.responseMimeType,
      "application/json",
      "runtime advisory must request structured JSON"
    );
    assert.deepEqual(
      runtimeProviderBody?.generationConfig?.responseJsonSchema?.properties?.decision?.properties
        ?.recommended_option?.enum,
      fixture.request.body.context.options,
      "runtime advisory schema must bind the recommendation to submitted options"
    );
    assertAdvisoryDecisionContract(result.json, "runtime", "decide runtime");

    const recommended = result.json?.decision?.recommended_option;
    const options = fixture.request.body.context.options;
    assert.equal(typeof recommended, "string", "decide runtime recommended option missing");
    assert.ok(options.includes(recommended), "decide runtime recommended option must match one of the options");
    assert.equal(typeof result.json?.decision?.confidence, "number", "decide runtime confidence missing");
    assert.equal(result.json?.decision?.confidence, 1, "decide runtime confidence should clamp slight >1 overflows");

    assert.ok(Array.isArray(result.json?.scorecard), "decide runtime scorecard missing");
    assert.equal(result.json.scorecard.length, options.length, "decide runtime scorecard length mismatch");
    result.json.scorecard.forEach((row, idx) => {
      assert.equal(typeof row?.confidence, "number", `decide runtime scorecard confidence missing for row ${idx}`);
      assert.ok(row.confidence >= 0 && row.confidence <= 1, `decide runtime scorecard confidence out of range for row ${idx}`);
    });

    assert.ok(Array.isArray(result.json?.tradeoffs), "decide runtime tradeoffs missing");
    assert.ok(result.json.tradeoffs.length >= 1, "decide runtime tradeoffs must be non-empty");
    assert.ok(Array.isArray(result.json?.next_actions), "decide runtime next_actions missing");
    assert.ok(result.json.next_actions.length >= 1, "decide runtime next_actions must be non-empty");
    assert.ok(Array.isArray(result.json?.citations), "decide runtime citations missing");
    assert.ok(result.json.citations.length >= 1, "decide runtime citations must be non-empty");

    const firstCitation = result.json.citations[0] || {};
    assert.equal(typeof firstCitation.title, "string", "decide runtime citation title missing");
    assert.ok(Array.isArray(firstCitation.reasoning_lines), "decide runtime citation reasoning_lines missing");
    assert.ok(firstCitation.reasoning_lines.length >= 2, "decide runtime citation reasoning_lines must be non-empty");
    const reasoningText = result.json.citations
      .flatMap((entry) => (Array.isArray(entry?.reasoning_lines) ? entry.reasoning_lines : []))
      .join(" ");
    assert.equal(reasoningText.includes(sensitiveInputValue), false, "sensitive input value leaked into fallback citation reasoning");
    assert.equal(/api[_-]?key\s*=/.test(reasoningText.toLowerCase()), false, "sensitive input key should not be echoed in reasoning");

    assertLineage(result.json, "decide_runtime");

    runtimeProviderText = "not valid runtime advisory JSON";
    const malformed = await invokeJson(decideHandler, {
      ...fixture.request,
      headers: { ...(fixture.request.headers || {}), "x-forwarded-for": "127.0.0.203" },
    });
    assert.equal(malformed.statusCode, 200, "invalid runtime provider output must preserve advisory HTTP compatibility");
    assert.equal(malformed.json?.status, "degraded", "invalid runtime provider output must be marked degraded");
    assert.equal(malformed.json?.c, "unclear", "invalid runtime provider output must fail closed");
    assert.equal(
      malformed.json?.error,
      "DECIDE_AI_PROVIDER_INVALID_RESPONSE",
      "invalid runtime provider output error code mismatch"
    );
    assert.equal(malformed.json?.decision, undefined, "invalid runtime provider output must not synthesize a recommendation");

    runtimeProviderText = JSON.stringify({
      decision: { recommended_option: "Burst packs", confidence: null },
      scorecard: [
        { option: "Burst packs", score: null, confidence: null, impact: "high projected expansion", risk: "low" },
        { option: "Automatic overage", score: false, confidence: "", impact: "high expansion with trust risk", risk: "high" },
        { option: "Hybrid grace + overage", score: 8.2, confidence: 0.7, impact: "balanced expansion and retention", risk: "medium" },
      ],
      tradeoffs: ["Burst packs add packaging complexity compared with automatic overage."],
      next_actions: ["Run a bounded Burst packs pilot with a rollback owner."],
      citations: [
        {
          title: "Requester context evidence",
          reasoning_lines: ["Compared all submitted options.", "Applied the stated constraints."],
        },
      ],
    });
    const coercedNumbers = await invokeJson(decideHandler, {
      ...fixture.request,
      headers: { ...(fixture.request.headers || {}), "x-forwarded-for": "127.0.0.204" },
    });
    assert.equal(coercedNumbers.statusCode, 200, "non-numeric provider values must preserve advisory HTTP compatibility");
    assert.equal(coercedNumbers.json?.status, "degraded", "non-numeric provider values must be marked degraded");
    assert.equal(
      coercedNumbers.json?.error,
      "DECIDE_AI_PROVIDER_INVALID_RESPONSE",
      "non-numeric provider values must expose the invalid-response code"
    );
    assert.equal(coercedNumbers.json?.decision, undefined, "non-numeric provider values must not synthesize a recommendation");

    runtimeProviderText = JSON.stringify({
      decision: { recommended_option: "Burst packs", confidence: 0.8 },
      scorecard: [
        { option: "Burst packs", score: 8.7, confidence: 0.8, impact: {}, risk: "low" },
        { option: "Automatic overage", score: 8.4, confidence: 0.7, impact: "high expansion with trust risk", risk: "high" },
        { option: "Hybrid grace + overage", score: 8.2, confidence: 0.7, impact: "balanced expansion and retention", risk: "medium" },
      ],
      tradeoffs: [{}],
      next_actions: [false],
      citations: [{ title: {}, reasoning_lines: [{}, {}] }],
    });
    const structuredGarbage = await invokeJson(decideHandler, {
      ...fixture.request,
      headers: { ...(fixture.request.headers || {}), "x-forwarded-for": "127.0.0.205" },
    });
    assert.equal(structuredGarbage.statusCode, 200, "non-string provider evidence must preserve advisory HTTP compatibility");
    assert.equal(structuredGarbage.json?.status, "degraded", "non-string provider evidence must be marked degraded");
    assert.equal(
      structuredGarbage.json?.error,
      "DECIDE_AI_PROVIDER_INVALID_RESPONSE",
      "non-string provider evidence must expose the invalid-response code"
    );
    assert.equal(structuredGarbage.json?.decision, undefined, "non-string provider evidence must not synthesize a recommendation");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
    if (previousGeminiMode === undefined) delete process.env.DECIDE_GEMINI_MODE;
    else process.env.DECIDE_GEMINI_MODE = previousGeminiMode;
  }
}

async function testDecideRulebookFixture() {
  const fixture = loadFixture("decide-rulebook-v1.json");
  const schemaText = readFileSync(join(__dirname, "..", "public", "schemas", "rulebook-v1.schema.json"), "utf8");
  const schemaHash = sha256(schemaText);
  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "";
  process.env.DECIDE_API_KEY = "";
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("rulebook evaluation must not call an LLM");
  };

  try {
    const first = await invokeJson(decideHandler, fixture.request);
    const second = await invokeJson(decideHandler, fixture.request);

    assert.equal(first.statusCode, fixture.expect.statusCode, "rulebook status mismatch");
    assert.equal(first.json?.verdict, fixture.expect.decision, "rulebook decision mismatch");
    assert.equal(first.json?.application_verdict, fixture.expect.application_verdict, "rulebook application verdict mismatch");
    assert.equal(first.json?.action, fixture.expect.action, "rulebook action mismatch");
    assert.equal(first.json?.reason_code, fixture.expect.reason_code, "rulebook reason code mismatch");
    assert.equal(first.json?.matched_rule_id, fixture.expect.matched_rule_id, "rulebook matched rule mismatch");
    assert.equal(first.json?.engine, "decide_rulebook_v1", "rulebook engine mismatch");
    assert.equal(first.json?.rulebook?.schema_version, "rulebook_v1", "rulebook schema version mismatch");
    assert.deepEqual(
      first.json?.rulebook_contract,
      {
        schema_version: "rulebook_v1",
        schema_url: "https://api.decide.fyi/schemas/rulebook-v1.schema.json",
        schema_hash: schemaHash,
        evaluator_version: "decide_rulebook_v1",
      },
      "rulebook response must identify the enforced schema contract"
    );
    assertRuntimeBinding(first.json, "direct_declarative_rulebook", "rulebook");
    assert.equal(first.json?.rulebook?.id, fixture.request.body.rulebook.rulebook_id, "rulebook id mismatch");
    assert.equal(first.json?.rulebook?.version, fixture.request.body.rulebook.version, "rulebook version mismatch");
    assert.equal(typeof first.json?.rulebook?.hash, "string", "rulebook hash missing");
    assert.equal(typeof first.json?.input_hash, "string", "rulebook input hash missing");
    assert.match(first.json.input_hash, /^[a-f0-9]{64}$/, "rulebook input hash must be sha256 hex");
    assertRulebookAttestation(first.json, "rulebook");
    assert.equal(first.json?.policy_version, fixture.request.body.rulebook.version, "rulebook policy version mismatch");
    assert.equal(first.json?.source_hash, first.json?.rulebook?.hash, "rulebook source hash mismatch");
    assert.deepEqual(
      {
        verdict: second.json?.verdict,
        application_verdict: second.json?.application_verdict,
        action: second.json?.action,
        reason_code: second.json?.reason_code,
        matched_rule_id: second.json?.matched_rule_id,
        rulebook_hash: second.json?.rulebook?.hash,
        input_hash: second.json?.input_hash,
        attestation_hash: second.json?.rulebook_attestation?.bundle_hash,
      },
      {
        verdict: first.json?.verdict,
        application_verdict: first.json?.application_verdict,
        action: first.json?.action,
        reason_code: first.json?.reason_code,
        matched_rule_id: first.json?.matched_rule_id,
        rulebook_hash: first.json?.rulebook?.hash,
        input_hash: first.json?.input_hash,
        attestation_hash: first.json?.rulebook_attestation?.bundle_hash,
      },
      "same rulebook and inputs must produce the same semantic result"
    );
    assert.equal(fetchCalled, false, "rulebook evaluation unexpectedly called an LLM");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
  }
}

async function testDecideRulebookEnforcesPublishedSchema() {
  const fixture = loadFixture("decide-rulebook-v1.json");
  const request = JSON.parse(JSON.stringify(fixture.request));
  request.body.rulebook.rules[0].outcome.decision = "NO";
  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "";
  process.env.DECIDE_API_KEY = "";
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("schema-invalid rulebook must not call an LLM");
  };

  try {
    const result = await invokeJson(decideHandler, request);
    assert.equal(result.statusCode, 422, "schema-invalid rulebook status mismatch");
    assert.equal(result.json?.error, "RULEBOOK_INVALID", "schema-invalid rulebook error mismatch");
    assert.ok(
      result.json?.errors?.some(
        (entry) =>
          entry?.code === "schema_violation" &&
          entry?.field === "rulebook.rules[0].outcome.decision" &&
          String(entry?.message || "").includes("one of yes, no, review")
      ),
      "runtime must enforce the published Rulebook v1 schema enum without normalization"
    );
    assert.equal(fetchCalled, false, "schema-invalid rulebook unexpectedly called an LLM");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
  }
}

async function testDecideRulebookMissingInput() {
  const fixture = loadFixture("decide-rulebook-v1.json");
  const request = JSON.parse(JSON.stringify(fixture.request));
  delete request.body.context.inputs.margin_percent;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "";
  process.env.DECIDE_API_KEY = "";

  try {
    const result = await invokeJson(decideHandler, request);
    assert.equal(result.statusCode, 200, "missing rulebook input should return a bounded decision");
    assert.equal(result.json?.status, "needs_input", "missing rulebook input status mismatch");
    assert.equal(result.json?.verdict, "review", "missing rulebook input must fail closed to review");
    assert.equal(result.json?.application_verdict, "NEEDS_INPUT", "missing rulebook application verdict mismatch");
    assert.equal(result.json?.action, "collect_required_input", "missing rulebook input action mismatch");
    assert.equal(result.json?.reason_code, "INPUT_SCHEMA_FAILED", "missing rulebook input reason mismatch");
    assert.equal(
      result.json?.rulebook_contract?.schema_url,
      "https://api.decide.fyi/schemas/rulebook-v1.schema.json",
      "missing-input response must identify the enforced schema contract"
    );
    assert.equal(typeof result.json?.input_hash, "string", "missing rulebook input hash missing");
    assert.match(result.json.input_hash, /^[a-f0-9]{64}$/, "missing rulebook input hash must be sha256 hex");
    assertRuntimeBinding(result.json, "direct_declarative_rulebook", "missing rulebook input");
    assertRulebookAttestation(result.json, "missing rulebook input");
    assert.deepEqual(result.json?.missing_fields, ["margin_percent"], "missing rulebook fields mismatch");
    assert.equal(result.json?.matched_rule_id, null, "missing input must not match a rule");
  } finally {
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
  }
}

async function testDecideRulebookAttestationSigning() {
  const fixture = loadFixture("decide-rulebook-v1.json");
  const signing = generateSigningEnv();
  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  const previousSigningKey = process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
  const previousSigningKeyId = process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID;
  const previousSignatureRequired = process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
  process.env.GEMINI_API_KEY = "";
  process.env.DECIDE_API_KEY = "";
  process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = signing.privateKeyPem;
  process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID = signing.keyId;
  process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = "true";
  global.fetch = async () => {
    throw new Error("signed rulebook evaluation must not call an LLM");
  };

  try {
    const result = await invokeJson(decideHandler, fixture.request);
    assert.equal(result.statusCode, 200, "signed rulebook status mismatch");
    assertRulebookAttestation(result.json, "signed rulebook");
    const signature = result.json?.rulebook_attestation?.signature;
    assert.equal(signature?.status, "signed", "attestation should be signed when signing key is configured");
    assert.equal(signature?.key_id, signing.keyId, "attestation signing key id mismatch");
    assert.equal(signature?.public_key_pem, signing.publicKeyPem, "attestation public key mismatch");
    assert.equal(
      verifySignature({
        publicKeyPem: signing.publicKeyPem,
        bundleHash: result.json.rulebook_attestation.bundle_hash,
        signature: signature.signature,
      }),
      true,
      "attestation signature should verify with exported public key"
    );

    const keys = await invokeJson(rulebookAttestationKeysHandler, {
      method: "GET",
      headers: { "user-agent": "contract-test" },
    });
    assert.equal(keys.statusCode, 200, "attestation keys status mismatch");
    assert.equal(keys.json?.schema_version, "rulebook_attestation_keys_v1", "attestation keys schema mismatch");
    assert.equal(keys.json?.active_key_id, signing.keyId, "active attestation key id mismatch");
    assert.equal(keys.json?.keys?.[0]?.key_id, signing.keyId, "published attestation key id mismatch");
    assert.equal(keys.json?.keys?.[0]?.algorithm, "Ed25519", "published attestation key algorithm mismatch");
    assert.equal(keys.json?.keys?.[0]?.public_key_pem, signing.publicKeyPem, "published attestation public key mismatch");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
    if (previousSigningKey === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = previousSigningKey;
    if (previousSigningKeyId === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID = previousSigningKeyId;
    if (previousSignatureRequired === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = previousSignatureRequired;
  }
}

async function testDecideRulebookRequiresSignedAttestation() {
  const fixture = loadFixture("decide-rulebook-v1.json");
  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  const previousSigningKey = process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
  const previousSigningKeyId = process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID;
  const previousSignatureRequired = process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
  process.env.GEMINI_API_KEY = "";
  process.env.DECIDE_API_KEY = "";
  delete process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
  delete process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID;
  process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = "true";
  global.fetch = async () => {
    throw new Error("required signed rulebook evaluation must not call an LLM");
  };

  try {
    const result = await invokeJson(decideHandler, fixture.request);
    assert.equal(result.statusCode, 503, "required signed rulebook should fail closed without signing key");
    assert.equal(result.json?.error, "RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED", "required signature error mismatch");
    assert.equal(result.json?.signature_status, "unsigned", "required signature status mismatch");

    const keys = await invokeJson(rulebookAttestationKeysHandler, {
      method: "GET",
      headers: { "user-agent": "contract-test" },
    });
    assert.equal(keys.statusCode, 503, "required attestation keys should fail closed without signing key");
    assert.equal(keys.json?.error, "RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED", "required keys error mismatch");
    assert.equal(keys.json?.status, "unsigned", "required keys signature status mismatch");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
    if (previousSigningKey === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = previousSigningKey;
    if (previousSigningKeyId === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID = previousSigningKeyId;
    if (previousSignatureRequired === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = previousSignatureRequired;
  }
}

async function testRulebookAttestationPublishesKeyHistory() {
  const active = generateSigningEnv("contract-test-active-key");
  const retired = generateSigningEnv("contract-test-retired-key");
  const previousSigningKey = process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
  const previousSigningKeyId = process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID;
  const previousSignatureRequired = process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
  const previousKeyHistory = process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_HISTORY_JSON;
  process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = active.privateKeyPem;
  process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID = active.keyId;
  process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = "true";
  process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_HISTORY_JSON = JSON.stringify([
    {
      key_id: retired.keyId,
      algorithm: "Ed25519",
      public_key_pem: retired.publicKeyPem,
      status: "retired",
      not_before: "2026-06-01T00:00:00.000Z",
      not_after: "2026-06-11T00:00:00.000Z",
      use: "rulebook_attestation_signature",
    },
  ]);

  try {
    const keys = await invokeJson(rulebookAttestationKeysHandler, {
      method: "GET",
      headers: { "user-agent": "contract-test" },
    });
    assert.equal(keys.statusCode, 200, "attestation key history status mismatch");
    assert.equal(keys.json?.schema_version, "rulebook_attestation_keys_v1", "attestation keys schema mismatch");
    assert.equal(keys.json?.status, "signed", "attestation keys status mismatch");
    assert.equal(keys.json?.signature_required, true, "attestation keys required flag mismatch");
    assert.equal(keys.json?.active_key_id, active.keyId, "active attestation key id mismatch");
    assert.equal(keys.json?.key_history_count, 1, "attestation key history count mismatch");
    assert.deepEqual(
      keys.json?.keys?.map((key) => key.key_id),
      [active.keyId, retired.keyId],
      "attestation keys should publish active key followed by retired keys"
    );
    assert.equal(keys.json?.keys?.[0]?.status, "active", "active key status mismatch");
    assert.equal(keys.json?.keys?.[1]?.status, "retired", "retired key status mismatch");
    assert.equal(keys.json?.keys?.[1]?.not_before, "2026-06-01T00:00:00.000Z", "retired key not_before mismatch");
    assert.equal(keys.json?.keys?.[1]?.not_after, "2026-06-11T00:00:00.000Z", "retired key not_after mismatch");
    assert.equal(keys.json?.keys?.[1]?.public_key_pem, retired.publicKeyPem.trim(), "retired key public key mismatch");
  } finally {
    if (previousSigningKey === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = previousSigningKey;
    if (previousSigningKeyId === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID = previousSigningKeyId;
    if (previousSignatureRequired === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = previousSignatureRequired;
    if (previousKeyHistory === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_HISTORY_JSON;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_HISTORY_JSON = previousKeyHistory;
  }
}

async function testRulebookAttestationRejectsInvalidKeyHistory() {
  const active = generateSigningEnv("contract-test-active-key");
  const previousSigningKey = process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
  const previousSigningKeyId = process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID;
  const previousSignatureRequired = process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
  const previousKeyHistory = process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_HISTORY_JSON;
  process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = active.privateKeyPem;
  process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID = active.keyId;
  process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = "true";
  process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_HISTORY_JSON = JSON.stringify([
    {
      key_id: active.keyId,
      algorithm: "Ed25519",
      public_key_pem: active.publicKeyPem,
      status: "retired",
    },
  ]);

  try {
    const keys = await invokeJson(rulebookAttestationKeysHandler, {
      method: "GET",
      headers: { "user-agent": "contract-test" },
    });
    assert.equal(keys.statusCode, 503, "invalid attestation key history status mismatch");
    assert.equal(keys.json?.ok, false, "invalid attestation key history ok mismatch");
    assert.equal(
      keys.json?.error,
      "RULEBOOK_ATTESTATION_KEY_HISTORY_INVALID",
      "invalid attestation key history error mismatch"
    );
    assert.equal(keys.json?.status, "error", "invalid attestation key history signing status mismatch");
    assert.equal(keys.json?.key_history_count, 0, "invalid attestation key history count mismatch");
  } finally {
    if (previousSigningKey === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = previousSigningKey;
    if (previousSigningKeyId === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID = previousSigningKeyId;
    if (previousSignatureRequired === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = previousSignatureRequired;
    if (previousKeyHistory === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_HISTORY_JSON;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_HISTORY_JSON = previousKeyHistory;
  }
}

async function testDecideRulebookRejectsExecutableOperator() {
  const fixture = loadFixture("decide-rulebook-v1.json");
  const request = JSON.parse(JSON.stringify(fixture.request));
  request.body.rulebook.rules[0].condition.operator = "javascript";
  request.body.rulebook.rules[0].condition.value = "return process.env";
  request.body.rulebook.rules[0].script = "return process.env";
  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "";
  process.env.DECIDE_API_KEY = "";
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("invalid rulebook must not call an LLM");
  };

  try {
    const result = await invokeJson(decideHandler, request);
    assert.equal(result.statusCode, 422, "unsupported rulebook operator status mismatch");
    assert.equal(result.json?.error, "RULEBOOK_INVALID", "unsupported rulebook operator error mismatch");
    assert.ok(Array.isArray(result.json?.errors), "unsupported rulebook operator errors missing");
    assert.ok(
      result.json.errors.some((entry) => entry?.code === "unsupported_operator"),
      "unsupported rulebook operator validation detail missing"
    );
    assert.ok(
      result.json.errors.some((entry) => entry?.code === "unknown_field"),
      "executable-like rulebook field must be rejected instead of ignored"
    );
    assert.equal(fetchCalled, false, "invalid rulebook unexpectedly called an LLM");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
  }
}

async function testDecideRulebookRejectsExecutablePayloadFields() {
  const fixture = loadFixture("decide-rulebook-v1.json");
  const request = JSON.parse(JSON.stringify(fixture.request));
  request.body.rulebook.code = "return { decision: 'yes' }";
  request.body.rulebook.handler = "pricingException";
  request.body.rulebook.rules[0].condition.function = "return process.env";
  request.body.rulebook.default_outcome.javascript = "return 'approve'";
  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "";
  process.env.DECIDE_API_KEY = "";
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("executable rulebook payload must not call an LLM");
  };

  try {
    const result = await invokeJson(decideHandler, request);
    assert.equal(result.statusCode, 422, "executable rulebook payload status mismatch");
    assert.equal(result.json?.error, "RULEBOOK_INVALID", "executable rulebook payload error mismatch");
    assertUnknownField(result.json?.errors, "rulebook.code", "executable rulebook payload");
    assertUnknownField(result.json?.errors, "rulebook.handler", "executable rulebook payload");
    assertUnknownField(result.json?.errors, "rulebook.rules[0].condition.function", "executable rulebook payload");
    assertUnknownField(result.json?.errors, "rulebook.default_outcome.javascript", "executable rulebook payload");
    assert.equal(fetchCalled, false, "executable rulebook payload unexpectedly called an LLM");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
  }
}

async function testDecideRulebookRejectsUnsupportedBindingMode() {
  const fixture = loadFixture("decide-rulebook-v1.json");
  const request = JSON.parse(JSON.stringify(fixture.request));
  request.body.binding_mode = "customer_executable_rulebook";
  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "";
  process.env.DECIDE_API_KEY = "";
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("unsupported rulebook binding mode must not call an LLM");
  };

  try {
    const result = await invokeJson(decideHandler, { ...request, remoteAddress: "127.0.0.41" });
    assert.equal(result.statusCode, 422, "unsupported rulebook binding mode status mismatch");
    assert.equal(
      result.json?.error,
      "RULEBOOK_BINDING_MODE_UNSUPPORTED",
      "unsupported rulebook binding mode error mismatch"
    );
    assert.equal(result.json?.binding_mode, "customer_executable_rulebook", "unsupported binding mode echo mismatch");
    assert.equal(fetchCalled, false, "unsupported rulebook binding mode unexpectedly called an LLM");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
  }
}

async function testDecideRulebookRejectsBindingModeShapeConflict() {
  const fixture = loadFixture("decide-rulebook-v1.json");
  const request = JSON.parse(JSON.stringify(fixture.request));
  request.body.binding_mode = "trusted_adapter_facts_then_declarative_rulebook";
  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "";
  process.env.DECIDE_API_KEY = "";
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("conflicting rulebook binding mode must not call an LLM");
  };

  try {
    const result = await invokeJson(decideHandler, { ...request, remoteAddress: "127.0.0.42" });
    assert.equal(result.statusCode, 422, "conflicting rulebook binding mode status mismatch");
    assert.equal(
      result.json?.error,
      "RULEBOOK_BINDING_MODE_CONFLICT",
      "conflicting rulebook binding mode error mismatch"
    );
    assert.equal(
      result.json?.binding_mode,
      "trusted_adapter_facts_then_declarative_rulebook",
      "conflicting requested binding mode echo mismatch"
    );
    assert.equal(
      result.json?.inferred_binding_mode,
      "direct_declarative_rulebook",
      "conflicting inferred binding mode mismatch"
    );
    assert.equal(fetchCalled, false, "conflicting rulebook binding mode unexpectedly called an LLM");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
  }
}

async function testDecideRulebookRejectsCallerSuppliedDecisionMaterial() {
  const fixture = loadFixture("decide-trusted-adapter-v1.json");
  const manifest = getTrustedAdapterManifest("solana_execution_gate", "1.0.0");
  const request = JSON.parse(JSON.stringify(fixture.request));
  request.body.adapter.manifest_hash = manifest.manifest_hash;
  request.body.runtime_binding = {
    production_core: "hybrid_declarative_rulebook_with_trusted_adapters",
    binding_mode: "trusted_adapter_facts_then_declarative_rulebook",
    verdict_authority: "caller_override",
    adapter_authority: "verdict_selector",
    customer_supplied_code: "accepted",
  };
  request.body.trusted_adapter = {
    adapter_id: "solana_execution_gate",
    version: "1.0.0",
    manifest_hash: manifest.manifest_hash,
  };
  request.body.adapter_facts = {
    decision_score: 100,
    recipient_verified: true,
  };
  request.body.rulebook_attestation = {
    bundle_hash: "caller_supplied",
  };
  request.body.decision_contract = {
    authority: "production_verdict",
    production_verdict: true,
  };
  request.body.application_verdict = "APPROVE";
  request.body.action = "authorize_execution";
  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "";
  process.env.DECIDE_API_KEY = "";
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("caller-supplied decision material must not call an LLM");
  };

  try {
    const result = await invokeJson(decideHandler, { ...request, remoteAddress: "127.0.0.43" });
    assert.equal(result.statusCode, 422, "caller-supplied decision material status mismatch");
    assert.equal(
      result.json?.error,
      "RULEBOOK_OUTPUT_MATERIAL_FORBIDDEN",
      "caller-supplied decision material error mismatch"
    );
    assert.deepEqual(
      result.json?.forbidden_fields,
      [
        "runtime_binding",
        "trusted_adapter",
        "adapter_facts",
        "rulebook_attestation",
        "decision_contract",
        "application_verdict",
        "action",
      ],
      "caller-supplied decision material fields mismatch"
    );
    assert.equal(fetchCalled, false, "caller-supplied decision material unexpectedly called an LLM");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
  }
}

async function testDecideRulebookRejectsCallerSuppliedDecisionMaterialInInputs() {
  const fixture = loadFixture("decide-rulebook-v1.json");
  const request = JSON.parse(JSON.stringify(fixture.request));
  request.body.context.inputs.runtime_binding = {
    production_core: "hybrid_declarative_rulebook_with_trusted_adapters",
    binding_mode: "direct_declarative_rulebook",
    verdict_authority: "caller_override",
  };
  request.body.context.inputs.audit = {
    rulebook_attestation: {
      bundle_hash: "caller_supplied",
    },
  };
  request.body.context.inputs.nested = {
    decision: {
      decision_contract: {
        authority: "production_verdict",
        production_verdict: true,
      },
      application_verdict: "APPROVE",
      action: "approve_discount",
    },
  };
  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "";
  process.env.DECIDE_API_KEY = "";
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("caller-supplied input decision material must not call an LLM");
  };

  try {
    const result = await invokeJson(decideHandler, { ...request, remoteAddress: "127.0.0.44" });
    assert.equal(result.statusCode, 422, "caller-supplied input decision material status mismatch");
    assert.equal(
      result.json?.error,
      "RULEBOOK_OUTPUT_MATERIAL_FORBIDDEN",
      "caller-supplied input decision material error mismatch"
    );
    assert.deepEqual(
      result.json?.forbidden_fields,
      [
        "context.inputs.audit.rulebook_attestation",
        "context.inputs.nested.decision.action",
        "context.inputs.nested.decision.application_verdict",
        "context.inputs.nested.decision.decision_contract",
        "context.inputs.runtime_binding",
      ],
      "caller-supplied input decision material fields mismatch"
    );
    assert.equal(fetchCalled, false, "caller-supplied input decision material unexpectedly called an LLM");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
  }
}

function testRulebookCoreRejectsUnsupportedBindingMode() {
  const fixture = loadFixture("decide-rulebook-v1.json");
  const evaluation = evaluateRulebookV1({
    rulebook: fixture.request.body.rulebook,
    inputs: fixture.request.body.context.inputs,
    bindingMode: "customer_executable_rulebook",
  });

  assert.equal(evaluation.ok, false, "Rulebook core must reject unsupported binding modes");
  assert.equal(evaluation.statusCode, 422, "unsupported core binding mode status mismatch");
  assert.equal(
    evaluation.error,
    "RULEBOOK_BINDING_MODE_UNSUPPORTED",
    "unsupported core binding mode error mismatch"
  );
  assert.equal(
    evaluation.binding_mode,
    "customer_executable_rulebook",
    "unsupported core binding mode echo mismatch"
  );
}

async function testDecideTrustedAdapterFixture() {
  const fixture = loadFixture("decide-trusted-adapter-v1.json");
  const manifest = getTrustedAdapterManifest("solana_execution_gate", "1.0.0");
  fixture.request.body.adapter.manifest_hash = manifest.manifest_hash;
  assert.equal(
    fixture.request.body.binding_mode,
    "trusted_adapter_facts_then_declarative_rulebook",
    "trusted adapter fixture must declare the trusted-adapter binding mode"
  );
  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "";
  process.env.DECIDE_API_KEY = "";
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("trusted adapter evaluation must not call a network dependency");
  };

  try {
    const first = await invokeJson(decideHandler, fixture.request);
    const second = await invokeJson(decideHandler, fixture.request);
    assert.equal(first.statusCode, fixture.expect.statusCode, "trusted adapter status mismatch");
    assert.equal(first.json?.verdict, fixture.expect.decision, "trusted adapter decision mismatch");
    assert.equal(first.json?.application_verdict, fixture.expect.application_verdict, "trusted adapter verdict mismatch");
    assert.equal(first.json?.action, fixture.expect.action, "trusted adapter action mismatch");
    assert.equal(first.json?.reason_code, fixture.expect.reason_code, "trusted adapter reason mismatch");
    assert.equal(first.json?.matched_rule_id, fixture.expect.matched_rule_id, "trusted adapter matched rule mismatch");
    assert.equal(first.json?.adapter_facts?.decision_score, fixture.expect.decision_score, "adapter score mismatch");
    assert.equal(
      first.json?.adapter_facts?.decision_edge_points,
      fixture.expect.decision_edge_points,
      "adapter edge mismatch"
    );
    assert.equal(first.json?.adapter_facts?.confidence_pct, fixture.expect.confidence_pct, "adapter confidence mismatch");
    assert.equal(first.json?.trusted_adapter?.adapter_id, "solana_execution_gate", "adapter id missing");
    assert.equal(first.json?.trusted_adapter?.version, "1.0.0", "adapter version missing");
    assert.equal(
      first.json?.trusted_adapter?.implementation_hash,
      manifest.implementation_hash,
      "adapter implementation hash mismatch"
    );
    assert.equal(first.json?.trusted_adapter?.manifest_hash, manifest.manifest_hash, "adapter manifest hash mismatch");
    assert.equal(typeof first.json?.input_hash, "string", "adapter-backed rulebook input hash missing");
    assert.match(first.json.input_hash, /^[a-f0-9]{64}$/, "adapter-backed rulebook input hash must be sha256 hex");
    assert.equal(typeof first.json?.trusted_adapter?.input_hash, "string", "adapter input hash missing");
    assert.equal(typeof first.json?.trusted_adapter?.output_hash, "string", "adapter output hash missing");
    assert.equal(
      first.json?.input_hash,
      first.json?.trusted_adapter?.output_hash,
      "adapter-backed rulebook input hash should bind adapter facts"
    );
    assertRuntimeBinding(first.json, "trusted_adapter_facts_then_declarative_rulebook", "trusted adapter rulebook");
    assertRulebookAttestation(first.json, "trusted adapter rulebook");
    assert.equal(
      first.json?.trusted_adapter?.execution_isolation,
      "worker_thread_one_shot_v1",
      "adapter execution isolation missing"
    );
    assert.equal(
      first.json?.trusted_adapter?.capability_enforcement,
      "ambient_capability_deny_v2",
      "adapter capability enforcement missing"
    );
    assert.equal(first.json?.trusted_adapter?.execution_timeout_ms, 1000, "adapter timeout attestation mismatch");
    assert.deepEqual(
      {
        verdict: second.json?.application_verdict,
        score: second.json?.adapter_facts?.decision_score,
        rulebook_input_hash: second.json?.input_hash,
        attestation_hash: second.json?.rulebook_attestation?.bundle_hash,
        input_hash: second.json?.trusted_adapter?.input_hash,
        output_hash: second.json?.trusted_adapter?.output_hash,
      },
      {
        verdict: first.json?.application_verdict,
        score: first.json?.adapter_facts?.decision_score,
        rulebook_input_hash: first.json?.input_hash,
        attestation_hash: first.json?.rulebook_attestation?.bundle_hash,
        input_hash: first.json?.trusted_adapter?.input_hash,
        output_hash: first.json?.trusted_adapter?.output_hash,
      },
      "same adapter, input, and rulebook must reproduce the same semantic facts"
    );
    assert.equal(fetchCalled, false, "trusted adapter evaluation unexpectedly called a network dependency");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
  }
}

async function testDecideDecisionMemoReadinessAdapterFixture() {
  const fixture = loadFixture("decide-decision-memo-readiness-adapter-v1.json");
  const manifest = getTrustedAdapterManifest("decision_memo_readiness", "1.0.0");
  assert.equal(manifest?.adapter_id, "decision_memo_readiness", "decision memo adapter manifest missing");
  assert.equal(manifest?.version, "1.0.0", "decision memo adapter version mismatch");
  fixture.request.body.adapter.manifest_hash = manifest.manifest_hash;
  assert.equal(
    fixture.request.body.binding_mode,
    "trusted_adapter_facts_then_declarative_rulebook",
    "decision memo readiness fixture must declare the trusted-adapter binding mode"
  );
  fixture.request.headers = {
    ...(fixture.request.headers || {}),
    "x-forwarded-for": "10.253.0.1",
  };
  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "";
  process.env.DECIDE_API_KEY = "";
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("decision memo readiness gate must not call a network dependency");
  };

  try {
    const first = await invokeJson(decideHandler, fixture.request);
    const second = await invokeJson(decideHandler, fixture.request);
    assert.equal(first.statusCode, fixture.expect.statusCode, "decision memo readiness status mismatch");
    assert.equal(first.json?.verdict, fixture.expect.decision, "decision memo readiness decision mismatch");
    assert.equal(
      first.json?.application_verdict,
      fixture.expect.application_verdict,
      "decision memo readiness verdict mismatch"
    );
    assert.equal(first.json?.action, fixture.expect.action, "decision memo readiness action mismatch");
    assert.equal(first.json?.reason_code, fixture.expect.reason_code, "decision memo readiness reason mismatch");
    assert.equal(first.json?.matched_rule_id, fixture.expect.matched_rule_id, "decision memo readiness matched rule mismatch");
    assert.equal(
      first.json?.adapter_facts?.readiness_score,
      fixture.expect.readiness_score,
      "decision memo readiness score mismatch"
    );
    assert.equal(
      first.json?.adapter_facts?.readiness_band,
      fixture.expect.readiness_band,
      "decision memo readiness band mismatch"
    );
    assert.equal(
      first.json?.adapter_facts?.missing_count,
      fixture.expect.missing_count,
      "decision memo readiness missing count mismatch"
    );
    assert.equal(first.json?.trusted_adapter?.adapter_id, "decision_memo_readiness", "decision memo adapter id missing");
    assert.equal(first.json?.trusted_adapter?.version, "1.0.0", "decision memo adapter version missing");
    assert.equal(
      first.json?.trusted_adapter?.implementation_hash,
      manifest.implementation_hash,
      "decision memo adapter implementation hash mismatch"
    );
    assert.equal(
      first.json?.trusted_adapter?.manifest_hash,
      manifest.manifest_hash,
      "decision memo adapter manifest hash mismatch"
    );
    assert.equal(
      first.json?.input_hash,
      first.json?.trusted_adapter?.output_hash,
      "decision memo rulebook input hash should bind adapter facts"
    );
    assertRuntimeBinding(
      first.json,
      "trusted_adapter_facts_then_declarative_rulebook",
      "decision memo readiness rulebook"
    );
    assertRulebookAttestation(first.json, "decision memo readiness rulebook");
    assert.deepEqual(
      {
        verdict: second.json?.application_verdict,
        score: second.json?.adapter_facts?.readiness_score,
        band: second.json?.adapter_facts?.readiness_band,
        rulebook_input_hash: second.json?.input_hash,
        attestation_hash: second.json?.rulebook_attestation?.bundle_hash,
        input_hash: second.json?.trusted_adapter?.input_hash,
        output_hash: second.json?.trusted_adapter?.output_hash,
      },
      {
        verdict: first.json?.application_verdict,
        score: first.json?.adapter_facts?.readiness_score,
        band: first.json?.adapter_facts?.readiness_band,
        rulebook_input_hash: first.json?.input_hash,
        attestation_hash: first.json?.rulebook_attestation?.bundle_hash,
        input_hash: first.json?.trusted_adapter?.input_hash,
        output_hash: first.json?.trusted_adapter?.output_hash,
      },
      "same decision memo adapter, input, and rulebook must reproduce the same semantic facts"
    );

    const blockedRequest = JSON.parse(JSON.stringify(fixture.request));
    blockedRequest.headers["x-forwarded-for"] = "10.253.0.2";
    blockedRequest.body.adapter.input.owner = "";
    blockedRequest.body.adapter.input.option_count = 1;
    blockedRequest.body.adapter.input.blocker_count = 1;
    const blocked = await invokeJson(decideHandler, blockedRequest);
    assert.equal(blocked.statusCode, 200, "blocked decision memo readiness status mismatch");
    assert.equal(blocked.json?.application_verdict, "BLOCKED", "blocked decision memo readiness verdict mismatch");
    assert.equal(blocked.json?.verdict, "no", "blocked decision memo readiness decision mismatch");
    assert.equal(blocked.json?.action, "block_memo_analysis", "blocked decision memo readiness action mismatch");
    assert.equal(blocked.json?.reason_code, "MEMO_PACKET_BLOCKED", "blocked decision memo readiness reason mismatch");
    assert.equal(
      blocked.json?.matched_rule_id,
      "block_incomplete_memo_packet",
      "blocked decision memo readiness rule mismatch"
    );

    const needsInputRequest = JSON.parse(JSON.stringify(fixture.request));
    needsInputRequest.headers["x-forwarded-for"] = "10.253.0.3";
    needsInputRequest.body.adapter.input.evidence_count = 0;
    needsInputRequest.body.adapter.input.has_target = false;
    const needsInput = await invokeJson(decideHandler, needsInputRequest);
    assert.equal(needsInput.statusCode, 200, "needs-input decision memo readiness status mismatch");
    assert.equal(
      needsInput.json?.application_verdict,
      "NEEDS_INPUT",
      "needs-input decision memo readiness verdict mismatch"
    );
    assert.equal(needsInput.json?.verdict, "review", "needs-input decision memo readiness decision mismatch");
    assert.equal(
      needsInput.json?.action,
      "request_missing_packet_fields",
      "needs-input decision memo readiness action mismatch"
    );
    assert.equal(needsInput.json?.reason_code, "MEMO_NEEDS_INPUT", "needs-input decision memo readiness reason mismatch");
    assert.equal(
      needsInput.json?.matched_rule_id,
      "request_missing_memo_inputs",
      "needs-input decision memo readiness rule mismatch"
    );

    assert.equal(fetchCalled, false, "decision memo readiness unexpectedly called a network dependency");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
  }
}

async function testDecideKrafthausWorkflowReadinessAdapterFixture() {
  const fixture = loadFixture("decide-krafthaus-workflow-readiness-adapter-v1.json");
  const manifest = getTrustedAdapterManifest("krafthaus_workflow_readiness", "1.0.0");
  assert.equal(manifest?.adapter_id, "krafthaus_workflow_readiness", "Krafthaus workflow adapter manifest missing");
  assert.equal(manifest?.version, "1.0.0", "Krafthaus workflow adapter version mismatch");
  fixture.request.body.adapter.manifest_hash = manifest.manifest_hash;
  assert.equal(
    fixture.request.body.binding_mode,
    "trusted_adapter_facts_then_declarative_rulebook",
    "Krafthaus workflow readiness fixture must declare the trusted-adapter binding mode"
  );
  fixture.request.headers = {
    ...(fixture.request.headers || {}),
    "x-forwarded-for": "10.253.1.1",
  };
  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "";
  process.env.DECIDE_API_KEY = "";
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("Krafthaus workflow readiness gate must not call a network dependency");
  };

  try {
    const first = await invokeJson(decideHandler, fixture.request);
    const second = await invokeJson(decideHandler, fixture.request);
    assert.equal(first.statusCode, fixture.expect.statusCode, "Krafthaus workflow readiness status mismatch");
    assert.equal(first.json?.verdict, fixture.expect.decision, "Krafthaus workflow readiness decision mismatch");
    assert.equal(
      first.json?.application_verdict,
      fixture.expect.application_verdict,
      "Krafthaus workflow readiness verdict mismatch"
    );
    assert.equal(first.json?.action, fixture.expect.action, "Krafthaus workflow readiness action mismatch");
    assert.equal(first.json?.reason_code, fixture.expect.reason_code, "Krafthaus workflow readiness reason mismatch");
    assert.equal(
      first.json?.matched_rule_id,
      fixture.expect.matched_rule_id,
      "Krafthaus workflow readiness matched rule mismatch"
    );
    assert.equal(
      first.json?.adapter_facts?.workflow_score,
      fixture.expect.workflow_score,
      "Krafthaus workflow readiness score mismatch"
    );
    assert.equal(
      first.json?.adapter_facts?.workflow_band,
      fixture.expect.workflow_band,
      "Krafthaus workflow readiness band mismatch"
    );
    assert.equal(
      first.json?.adapter_facts?.handoff_risk,
      fixture.expect.handoff_risk,
      "Krafthaus workflow readiness handoff risk mismatch"
    );
    assert.equal(
      first.json?.adapter_facts?.ready_to_bind,
      fixture.expect.ready_to_bind,
      "Krafthaus workflow readiness bind flag mismatch"
    );
    assert.equal(
      first.json?.trusted_adapter?.adapter_id,
      "krafthaus_workflow_readiness",
      "Krafthaus workflow adapter id missing"
    );
    assert.equal(first.json?.trusted_adapter?.version, "1.0.0", "Krafthaus workflow adapter version missing");
    assert.equal(
      first.json?.trusted_adapter?.implementation_hash,
      manifest.implementation_hash,
      "Krafthaus workflow adapter implementation hash mismatch"
    );
    assert.equal(
      first.json?.trusted_adapter?.manifest_hash,
      manifest.manifest_hash,
      "Krafthaus workflow adapter manifest hash mismatch"
    );
    assert.equal(
      first.json?.input_hash,
      first.json?.trusted_adapter?.output_hash,
      "Krafthaus workflow rulebook input hash should bind adapter facts"
    );
    assertRuntimeBinding(
      first.json,
      "trusted_adapter_facts_then_declarative_rulebook",
      "Krafthaus workflow readiness rulebook"
    );
    assertRulebookAttestation(first.json, "Krafthaus workflow readiness rulebook");
    assert.deepEqual(
      {
        verdict: second.json?.application_verdict,
        score: second.json?.adapter_facts?.workflow_score,
        band: second.json?.adapter_facts?.workflow_band,
        rulebook_input_hash: second.json?.input_hash,
        attestation_hash: second.json?.rulebook_attestation?.bundle_hash,
        input_hash: second.json?.trusted_adapter?.input_hash,
        output_hash: second.json?.trusted_adapter?.output_hash,
      },
      {
        verdict: first.json?.application_verdict,
        score: first.json?.adapter_facts?.workflow_score,
        band: first.json?.adapter_facts?.workflow_band,
        rulebook_input_hash: first.json?.input_hash,
        attestation_hash: first.json?.rulebook_attestation?.bundle_hash,
        input_hash: first.json?.trusted_adapter?.input_hash,
        output_hash: first.json?.trusted_adapter?.output_hash,
      },
      "same Krafthaus workflow adapter, input, and rulebook must reproduce the same semantic facts"
    );

    const routeRequest = JSON.parse(JSON.stringify(fixture.request));
    routeRequest.headers["x-forwarded-for"] = "10.253.1.2";
    routeRequest.body.adapter.input.automation_boundary_defined = false;
    routeRequest.body.adapter.input.integration_touchpoints = 2;
    routeRequest.body.adapter.input.exception_paths = 2;
    const route = await invokeJson(decideHandler, routeRequest);
    assert.equal(route.statusCode, 200, "route Krafthaus workflow readiness status mismatch");
    assert.equal(route.json?.application_verdict, "ROUTE_REVIEW", "route Krafthaus workflow readiness verdict mismatch");
    assert.equal(route.json?.verdict, "review", "route Krafthaus workflow readiness decision mismatch");
    assert.equal(route.json?.action, "route_workflow_design_review", "route Krafthaus workflow readiness action mismatch");
    assert.equal(route.json?.reason_code, "WORKFLOW_REVIEW_REQUIRED", "route Krafthaus workflow readiness reason mismatch");
    assert.equal(
      route.json?.matched_rule_id,
      "route_workflow_for_design_review",
      "route Krafthaus workflow readiness rule mismatch"
    );

    const blockedRequest = JSON.parse(JSON.stringify(fixture.request));
    blockedRequest.headers["x-forwarded-for"] = "10.253.1.3";
    blockedRequest.body.adapter.input.owner_present = false;
    blockedRequest.body.adapter.input.evidence_sources = 0;
    blockedRequest.body.adapter.input.exception_paths = 5;
    const blocked = await invokeJson(decideHandler, blockedRequest);
    assert.equal(blocked.statusCode, 200, "blocked Krafthaus workflow readiness status mismatch");
    assert.equal(blocked.json?.application_verdict, "BLOCKED", "blocked Krafthaus workflow readiness verdict mismatch");
    assert.equal(blocked.json?.verdict, "no", "blocked Krafthaus workflow readiness decision mismatch");
    assert.equal(blocked.json?.action, "block_workflow_binding", "blocked Krafthaus workflow readiness action mismatch");
    assert.equal(blocked.json?.reason_code, "WORKFLOW_BINDING_BLOCKED", "blocked Krafthaus workflow readiness reason mismatch");
    assert.equal(
      blocked.json?.matched_rule_id,
      "block_unowned_or_unsafe_workflow",
      "blocked Krafthaus workflow readiness rule mismatch"
    );

    assert.equal(fetchCalled, false, "Krafthaus workflow readiness unexpectedly called a network dependency");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
  }
}

function testTrustedAdapterVersionLocks() {
  assert.equal(
    typeof getTrustedAdapterVersionLock,
    "function",
    "trusted adapter runtime must expose version locks"
  );
  const expectedLocks = [
    {
      adapterId: "solana_execution_gate",
      version: "1.0.0",
      implementationHash: "8f59179307b0128e874dcd74a096600eff80dd1fb1cbd15148f8c88dea6327dc",
      manifestHash: "fd95907fb68ecc45be3ad9608410e2e3ea29a52b0e33b756086c21c6f520e967",
    },
    {
      adapterId: "decision_memo_readiness",
      version: "1.0.0",
      implementationHash: "1ecd415f9bd91bd1561a0ca0438af567e40b18081b954608b8cf643d4ec1d47f",
      manifestHash: "4613daa3efede7f0c155b59998e91773073f4124ba8d5f62b4ed64835c1f8256",
    },
    {
      adapterId: "krafthaus_workflow_readiness",
      version: "1.0.0",
      implementationHash: "37afe50da879b918c3ca7a558a5c066b8d9025b73685e7c0c6d916de66092440",
      manifestHash: "fbdced2047dc68944b5d620586ebd8ae1b1166b1448cbaa68490fadb00f69d9b",
    },
  ];

  for (const expected of expectedLocks) {
    const manifest = getTrustedAdapterManifest(expected.adapterId, expected.version);
    const lock = getTrustedAdapterVersionLock(expected.adapterId, expected.version);
    assert.deepEqual(
      lock,
      {
        adapter_id: expected.adapterId,
        version: expected.version,
        implementation_hash: expected.implementationHash,
        manifest_hash: expected.manifestHash,
      },
      `${expected.adapterId}@${expected.version} version lock mismatch`
    );
    assert.equal(
      manifest.implementation_hash,
      expected.implementationHash,
      `${expected.adapterId}@${expected.version} implementation hash drifted without an adapter version bump`
    );
    assert.equal(
      manifest.manifest_hash,
      expected.manifestHash,
      `${expected.adapterId}@${expected.version} manifest hash drifted without an adapter version bump`
    );
  }
}

function testTrustedAdapterCapabilityAudit() {
  const denied = auditTrustedAdapterImplementation(function forbiddenAdapter() {
    return { observed_at: Date.now(), random: Math.random(), secret: process.env.SECRET };
  });
  assert.equal(denied.ok, false, "forbidden ambient capabilities should fail registration audit");
  assert.deepEqual(
    denied.denied_capabilities,
    ["clock_access", "environment_access", "randomness_access"],
    "capability audit should report each denied ambient dependency"
  );
}

async function testTrustedAdapterCapabilityRuntimeEnforcement() {
  const results = await runTrustedAdapterCapabilityRuntimeProbe();
  assert.match(results.environment_access, /denied ambient capability: environment_access/i);
  assert.match(results.clock_access, /denied ambient capability: clock_access/i);
  assert.match(results.randomness_access, /denied ambient capability: randomness_access/i);
  assert.match(results.network_access, /denied ambient capability: network_access/i);
  assert.match(results.timer_access, /denied ambient capability: clock_access/i);
  assert.match(results.network_override, /denied ambient capability: network_access/i);
}

function testTrustedAdapterColdStartIsolation() {
  const isolationModuleUrl = new URL("../lib/trusted-adapter-isolation.js", import.meta.url).href;
  const source = `
    import { executeTrustedAdapterIsolated } from ${JSON.stringify(isolationModuleUrl)};
    const result = await executeTrustedAdapterIsolated({
      adapterId: "solana_execution_gate",
      version: "1.0.0",
      input: {
        sol_amount: 48,
        risk_level: "medium",
        evidence_level: "strong",
        quorum_signed: true,
        budget_within_policy: true,
        recipient_verified: true
      }
    });
    if (!result.ok) throw new Error(JSON.stringify(result));
    console.log(JSON.stringify({ ok: result.ok, decision_score: result.facts.decision_score }));
  `;
  const output = execFileSync(process.execPath, ["--input-type=module", "--eval", source], {
    cwd: join(__dirname, ".."),
    encoding: "utf8",
    timeout: 5000,
  });
  const result = JSON.parse(output.trim());
  assert.deepEqual(result, { ok: true, decision_score: 91 }, "cold trusted-adapter worker should execute safely");
}

async function testDecideTrustedAdapterRejectsManifestDrift() {
  const fixture = loadFixture("decide-trusted-adapter-v1.json");
  fixture.request.body.adapter.manifest_hash = "0".repeat(64);
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "";
  process.env.DECIDE_API_KEY = "";

  try {
    const result = await invokeJson(decideHandler, fixture.request);
    assert.equal(result.statusCode, 422, "adapter manifest mismatch status mismatch");
    assert.equal(
      result.json?.error,
      "TRUSTED_ADAPTER_MANIFEST_MISMATCH",
      "adapter manifest mismatch error missing"
    );
  } finally {
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
  }
}

async function testDecideTrustedAdapterRejectsExecutablePayloadFields() {
  const fixture = loadFixture("decide-trusted-adapter-v1.json");
  const manifest = getTrustedAdapterManifest("solana_execution_gate", "1.0.0");
  const request = JSON.parse(JSON.stringify(fixture.request));
  request.body.adapter.manifest_hash = manifest.manifest_hash;
  request.body.adapter.code = "return normalizedFacts";
  request.body.adapter.handler = "solanaExecutionGateV1";
  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "";
  process.env.DECIDE_API_KEY = "";
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("executable adapter payload must not call a network dependency");
  };

  try {
    const result = await invokeJson(decideHandler, request);
    assert.equal(result.statusCode, 422, "executable adapter payload status mismatch");
    assert.equal(result.json?.error, "TRUSTED_ADAPTER_INVALID", "executable adapter payload error mismatch");
    assertUnknownField(result.json?.errors, "adapter.code", "executable adapter payload");
    assertUnknownField(result.json?.errors, "adapter.handler", "executable adapter payload");
    assert.equal(fetchCalled, false, "executable adapter payload unexpectedly called a network dependency");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
  }
}

async function testDecideTrustedAdapterRejectsExecutableInputFields() {
  const fixture = loadFixture("decide-trusted-adapter-v1.json");
  const manifest = getTrustedAdapterManifest("solana_execution_gate", "1.0.0");
  const request = JSON.parse(JSON.stringify(fixture.request));
  request.body.adapter.manifest_hash = manifest.manifest_hash;
  request.body.adapter.input.script = "return process.env";
  request.body.adapter.input.wasm = "base64-module";
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "";
  process.env.DECIDE_API_KEY = "";

  try {
    const result = await invokeJson(decideHandler, request);
    assert.equal(result.statusCode, 422, "executable adapter input status mismatch");
    assert.equal(result.json?.error, "TRUSTED_ADAPTER_INPUT_INVALID", "executable adapter input error mismatch");
    assertUnknownField(result.json?.errors, "adapter.input.script", "executable adapter input");
    assertUnknownField(result.json?.errors, "adapter.input.wasm", "executable adapter input");
  } finally {
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
  }
}

async function testRulebookV1PublicConformanceFixtures() {
  const indexPath = join(__dirname, "..", "public", "conformance", "rulebook-v1", "index.json");
  assert.ok(existsSync(indexPath), "public Rulebook v1 conformance index is missing");
  const schema = loadJsonFromRepo("public", "schemas", "rulebook-v1.schema.json");
  const index = loadPublicRulebookConformanceFixture("index.json");
  assert.equal(index.conformance_version, "rulebook_v1_conformance_v1", "conformance index version mismatch");
  assert.equal(index.schema_url, schema.$id, "conformance index schema URL mismatch");
  assert.deepEqual(
    index.supported_binding_modes,
    ["direct_declarative_rulebook", "trusted_adapter_facts_then_declarative_rulebook"],
    "conformance index supported binding modes mismatch"
  );
  assert.deepEqual(
    index.unsupported_binding_modes,
    ["customer_executable_rulebook"],
    "conformance index unsupported binding modes mismatch"
  );
  assert.deepEqual(
    index.fixtures.map((fixture) => fixture.id),
    [
      "pricing_exception_direct_approve",
      "solana_execution_gate_adapter_approve",
      "krafthaus_workflow_readiness_adapter_bind",
      "executable_payload_rejected",
      "caller_output_material_rejected",
      "caller_input_output_material_rejected",
      "customer_executable_rulebook_rejected",
    ],
    "public Rulebook v1 conformance fixture set changed unexpectedly"
  );

  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "";
  process.env.DECIDE_API_KEY = "";
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("Rulebook v1 conformance fixtures must not call an LLM");
  };

  try {
    for (const [fixtureIndex, fixtureRef] of index.fixtures.entries()) {
      assert.ok(
        fixtureRef.url.startsWith("https://api.decide.fyi/conformance/rulebook-v1/"),
        `${fixtureRef.id}: fixture URL must use API origin`
      );
      const fileName = fixtureRef.url.split("/").pop();
      const fixture = loadPublicRulebookConformanceFixture(fileName);
      assert.equal(fixture.fixture_version, "rulebook_v1_conformance_v1", `${fixtureRef.id}: fixture version mismatch`);
      assert.equal(fixture.id, fixtureRef.id, `${fixtureRef.id}: fixture id mismatch`);
      assert.equal(fixture.schema_url, schema.$id, `${fixtureRef.id}: schema URL mismatch`);
      assert.equal(fixture.request?.method, "POST", `${fixtureRef.id}: request method mismatch`);
      assert.equal(fixture.request?.path, "/api/decide", `${fixtureRef.id}: request path mismatch`);
      assert.equal(fixture.request?.body?.mode, "rulebook", `${fixtureRef.id}: fixture must use rulebook mode`);
      if (fixture.expect.ok !== false) {
        assert.ok(
          fixture.expect.runtime_binding?.binding_mode,
          `${fixtureRef.id}: successful fixture must declare expected runtime binding`
        );
        assert.equal(
          fixture.request?.body?.binding_mode,
          fixture.expect.runtime_binding.binding_mode,
          `${fixtureRef.id}: successful fixture request must declare canonical binding mode`
        );
        assert.equal(
          fixture.expect.runtime_binding?.customer_supplied_code,
          "rejected",
          `${fixtureRef.id}: successful fixture must declare customer code rejection`
        );
      }
      if (fixture.request?.body?.adapter) {
        assert.equal(
          fixture.request.body.binding_mode,
          "trusted_adapter_facts_then_declarative_rulebook",
          `${fixtureRef.id}: adapter-backed fixture must declare binding mode`
        );
      }

      const request = {
        ...fixture.request,
        headers: {
          ...(fixture.request.headers || {}),
          "x-forwarded-for": `10.255.0.${fixtureIndex + 1}`,
        },
      };
      const first = await invokeJson(decideHandler, request);
      assert.equal(first.statusCode, fixture.expect.statusCode, `${fixtureRef.id}: status mismatch`);

      if (fixture.expect.ok === false) {
        assert.equal(first.json?.error, fixture.expect.error, `${fixtureRef.id}: error mismatch`);
        if (fixture.expect.error === "RULEBOOK_BINDING_MODE_UNSUPPORTED") {
          assert.deepEqual(
            fixture.expect.supported_binding_modes,
            ["direct_declarative_rulebook", "trusted_adapter_facts_then_declarative_rulebook"],
            `${fixtureRef.id}: unsupported binding fixture must declare supported modes`
          );
          assert.equal(first.json?.binding_mode, fixture.expect.binding_mode, `${fixtureRef.id}: binding mode mismatch`);
          assert.deepEqual(
            first.json?.supported_binding_modes,
            fixture.expect.supported_binding_modes,
            `${fixtureRef.id}: supported binding modes mismatch`
          );
        }
        for (const field of fixture.expect.expected_unknown_fields || []) {
          assertUnknownField(first.json?.errors, field, `${fixtureRef.id}: unknown field expectation`);
        }
        if (fixture.expect.error === "RULEBOOK_OUTPUT_MATERIAL_FORBIDDEN") {
          assert.deepEqual(
            first.json?.forbidden_fields,
            fixture.expect.forbidden_fields,
            `${fixtureRef.id}: forbidden output material mismatch`
          );
        }
        continue;
      }

      const second = await invokeJson(decideHandler, request);
      assert.equal(first.json?.engine, "decide_rulebook_v1", `${fixtureRef.id}: engine mismatch`);
      assert.equal(first.json?.rulebook?.schema_version, "rulebook_v1", `${fixtureRef.id}: rulebook schema mismatch`);
      assert.equal(
        fixture.expect.rulebook_contract?.schema_url,
        schema.$id,
        `${fixtureRef.id}: fixture must declare the Rulebook v1 contract URL`
      );
      assert.equal(
        fixture.expect.rulebook_contract?.schema_hash_format,
        "sha256_hex",
        `${fixtureRef.id}: fixture must declare the Rulebook v1 contract hash format`
      );
      assert.equal(
        fixture.expect.rulebook_contract?.evaluator_version,
        "decide_rulebook_v1",
        `${fixtureRef.id}: fixture must declare the Rulebook v1 evaluator version`
      );
      assert.deepEqual(
        {
          schema_version: first.json?.rulebook_contract?.schema_version,
          schema_url: first.json?.rulebook_contract?.schema_url,
          schema_hash_format: /^[a-f0-9]{64}$/.test(first.json?.rulebook_contract?.schema_hash || "") ? "sha256_hex" : null,
          evaluator_version: first.json?.rulebook_contract?.evaluator_version,
        },
        {
          schema_version: "rulebook_v1",
          schema_url: fixture.expect.rulebook_contract.schema_url,
          schema_hash_format: fixture.expect.rulebook_contract.schema_hash_format,
          evaluator_version: fixture.expect.rulebook_contract.evaluator_version,
        },
        `${fixtureRef.id}: runtime rulebook contract metadata mismatch`
      );
      assert.equal(first.json?.verdict, fixture.expect.decision, `${fixtureRef.id}: decision mismatch`);
      assert.equal(first.json?.application_verdict, fixture.expect.application_verdict, `${fixtureRef.id}: application verdict mismatch`);
      assert.equal(first.json?.action, fixture.expect.action, `${fixtureRef.id}: action mismatch`);
      assert.equal(first.json?.reason_code, fixture.expect.reason_code, `${fixtureRef.id}: reason code mismatch`);
      assert.equal(first.json?.matched_rule_id, fixture.expect.matched_rule_id, `${fixtureRef.id}: matched rule mismatch`);
      assertRuntimeBinding(
        first.json,
        fixture.expect.runtime_binding.binding_mode,
        `${fixtureRef.id}: conformance fixture`
      );
      assert.deepEqual(
        first.json?.runtime_binding,
        fixture.expect.runtime_binding,
        `${fixtureRef.id}: fixture runtime binding expectation mismatch`
      );
      assert.equal(typeof first.json?.rulebook?.hash, "string", `${fixtureRef.id}: rulebook hash missing`);
      assert.equal(typeof first.json?.input_hash, "string", `${fixtureRef.id}: input hash missing`);
      assert.match(first.json.input_hash, /^[a-f0-9]{64}$/, `${fixtureRef.id}: input hash must be sha256 hex`);
      assert.equal(
        fixture.expect.attestation?.schema_version,
        "rulebook_attestation_v1",
        `${fixtureRef.id}: fixture must declare attestation schema expectation`
      );
      assert.equal(
        fixture.expect.attestation?.bundle_hash_format,
        "sha256_hex",
        `${fixtureRef.id}: fixture must declare attestation hash format expectation`
      );
      assert.equal(
        fixture.expect.signature?.schema_version,
        "rulebook_attestation_signature_v1",
        `${fixtureRef.id}: fixture must declare attestation signature schema expectation`
      );
      assert.equal(
        fixture.expect.signature?.algorithm,
        "Ed25519",
        `${fixtureRef.id}: fixture must declare attestation signature algorithm expectation`
      );
      assert.equal(
        fixture.expect.signature?.signed_field,
        "bundle_hash",
        `${fixtureRef.id}: fixture must declare attestation signature field expectation`
      );
      assertRulebookAttestation(first.json, `${fixtureRef.id}: rulebook attestation`);
      assert.deepEqual(
        {
          verdict: second.json?.verdict,
          application_verdict: second.json?.application_verdict,
          action: second.json?.action,
          reason_code: second.json?.reason_code,
          matched_rule_id: second.json?.matched_rule_id,
          rulebook_hash: second.json?.rulebook?.hash,
          input_hash: second.json?.input_hash,
          attestation_hash: second.json?.rulebook_attestation?.bundle_hash,
          adapter_facts: second.json?.adapter_facts || null,
        },
        {
          verdict: first.json?.verdict,
          application_verdict: first.json?.application_verdict,
          action: first.json?.action,
          reason_code: first.json?.reason_code,
          matched_rule_id: first.json?.matched_rule_id,
          rulebook_hash: first.json?.rulebook?.hash,
          input_hash: first.json?.input_hash,
          attestation_hash: first.json?.rulebook_attestation?.bundle_hash,
          adapter_facts: first.json?.adapter_facts || null,
        },
        `${fixtureRef.id}: repeated fixture run must reproduce semantic output`
      );
      if (fixture.expect.adapter_facts) {
        for (const [field, expectedValue] of Object.entries(fixture.expect.adapter_facts)) {
          assert.equal(first.json?.adapter_facts?.[field], expectedValue, `${fixtureRef.id}: adapter fact ${field} mismatch`);
        }
      }
    }
    assert.equal(fetchCalled, false, "Rulebook v1 conformance fixtures unexpectedly called an LLM");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
  }
}

async function testRulebookV1GoldenReplayCorpus() {
  const indexPath = join(__dirname, "..", "public", "replay", "rulebook-v1", "index.json");
  assert.ok(existsSync(indexPath), "public Rulebook v1 golden replay corpus index is missing");
  const index = loadPublicRulebookGoldenReplayFixture("index.json");
  assert.equal(index.corpus_version, "rulebook_v1_golden_replay_v1", "golden replay corpus version mismatch");
  assert.equal(index.schema_version, "rulebook_v1", "golden replay schema version mismatch");
  assert.equal(index.compatibility_policy, "compatibility_policy_v1", "golden replay policy mismatch");
  assert.equal(index.replay_contract, "historical_rulebook_replay_v1", "golden replay contract mismatch");
  assert.deepEqual(
    index.fixtures.map((fixture) => fixture.id),
    [
      "pricing_exception_direct_approve",
      "solana_execution_gate_adapter_approve",
      "krafthaus_workflow_readiness_adapter_bind",
      "refund_policy_notary_allow",
      "trial_policy_notary_auto_convert",
      "cancel_policy_notary_penalty",
      "return_policy_notary_full_return",
    ],
    "golden replay corpus fixture set changed unexpectedly"
  );

  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "";
  process.env.DECIDE_API_KEY = "";
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("Rulebook v1 golden replay corpus must not call an LLM");
  };

  try {
    for (const [fixtureIndex, fixtureRef] of index.fixtures.entries()) {
      assert.ok(
        fixtureRef.url.startsWith("https://api.decide.fyi/replay/rulebook-v1/"),
        `${fixtureRef.id}: fixture URL must use API replay origin`
      );
      const fileName = fixtureRef.url.split("/").pop();
      const fixture = loadPublicRulebookGoldenReplayFixture(fileName);
      assert.equal(fixture.corpus_version, index.corpus_version, `${fixtureRef.id}: corpus version mismatch`);
      assert.equal(fixture.id, fixtureRef.id, `${fixtureRef.id}: fixture id mismatch`);
      assert.equal(fixture.compatibility_policy, index.compatibility_policy, `${fixtureRef.id}: policy mismatch`);
      assert.equal(fixture.replay_contract, index.replay_contract, `${fixtureRef.id}: replay contract mismatch`);
      assert.equal(
        fixture.historical_record?.semantic_output?.status,
        "ok",
        `${fixtureRef.id}: golden replay must contain a completed decision`
      );
      assert.notEqual(
        fixture.historical_record?.semantic_output?.reason_code,
        "INPUT_SCHEMA_FAILED",
        `${fixtureRef.id}: golden replay must not preserve an input-schema failure`
      );
      assert.equal(fixture.replay?.request?.method, "POST", `${fixtureRef.id}: replay request method mismatch`);
      assert.equal(fixture.replay?.request?.path, "/api/decide", `${fixtureRef.id}: replay request path mismatch`);
      assert.equal(fixture.replay?.request?.body?.mode, "rulebook", `${fixtureRef.id}: replay request must use rulebook mode`);
      if (fixture.replay?.request?.body?.adapter) {
        assert.equal(
          fixture.replay.request.body.binding_mode,
          "trusted_adapter_facts_then_declarative_rulebook",
          `${fixtureRef.id}: adapter-backed replay must declare binding mode`
        );
      }
      assert.equal(
        fixture.replay?.stored_material?.rulebook_snapshot?.rulebook_id,
        fixture.replay?.request?.body?.rulebook?.rulebook_id,
        `${fixtureRef.id}: stored rulebook snapshot must match replay request`
      );
      assert.equal(
        fixture.replay?.stored_material?.evaluator_version,
        "decide_rulebook_v1",
        `${fixtureRef.id}: stored evaluator version mismatch`
      );

      const request = {
        ...fixture.replay.request,
        headers: {
          ...(fixture.replay.request.headers || {}),
          "x-forwarded-for": `10.254.0.${fixtureIndex + 1}`,
        },
      };
      const first = await invokeJson(decideHandler, request);
      assert.equal(first.statusCode, fixture.historical_record?.statusCode, `${fixtureRef.id}: status mismatch`);
      assert.equal(first.json?.engine, fixture.historical_record?.engine, `${fixtureRef.id}: engine mismatch`);
      assert.equal(
        first.json?.evaluator_version,
        fixture.historical_record?.evaluator_version,
        `${fixtureRef.id}: evaluator version mismatch`
      );
      assert.deepEqual(
        {
          status: first.json?.status,
          verdict: first.json?.verdict,
          application_verdict: first.json?.application_verdict,
          action: first.json?.action,
          reason_code: first.json?.reason_code,
          matched_rule_id: first.json?.matched_rule_id,
        },
        fixture.historical_record?.semantic_output,
        `${fixtureRef.id}: semantic replay output mismatch`
      );
      assert.deepEqual(first.json?.rulebook, fixture.historical_record?.rulebook, `${fixtureRef.id}: rulebook lineage mismatch`);
      assert.deepEqual(
        first.json?.runtime_binding,
        fixture.historical_record?.runtime_binding,
        `${fixtureRef.id}: runtime binding mismatch`
      );
      assert.equal(first.json?.input_hash, fixture.historical_record?.input_hash, `${fixtureRef.id}: input hash mismatch`);
      assert.equal(
        first.json?.rulebook_attestation?.schema_version,
        "rulebook_attestation_v1",
        `${fixtureRef.id}: attestation schema mismatch`
      );
      assert.equal(
        first.json?.rulebook_attestation?.bundle_hash,
        fixture.historical_record?.rulebook_attestation?.bundle_hash,
        `${fixtureRef.id}: attestation hash mismatch`
      );
      assert.deepEqual(
        first.json?.rulebook_attestation?.bundle?.outcome,
        fixture.historical_record?.semantic_output,
        `${fixtureRef.id}: attestation outcome mismatch`
      );
      if (fixture.historical_record?.trusted_adapter) {
        assert.deepEqual(
          first.json?.trusted_adapter,
          fixture.historical_record.trusted_adapter,
          `${fixtureRef.id}: trusted adapter lineage mismatch`
        );
      }
      if (fixture.historical_record?.adapter_facts) {
        assert.deepEqual(
          first.json?.adapter_facts,
          fixture.historical_record.adapter_facts,
          `${fixtureRef.id}: adapter facts mismatch`
        );
      }

      const second = await invokeJson(decideHandler, request);
      assert.deepEqual(
        {
          evaluator_version: second.json?.evaluator_version,
          semantic_output: {
            status: second.json?.status,
            verdict: second.json?.verdict,
            application_verdict: second.json?.application_verdict,
            action: second.json?.action,
            reason_code: second.json?.reason_code,
            matched_rule_id: second.json?.matched_rule_id,
          },
          rulebook: second.json?.rulebook,
          runtime_binding: second.json?.runtime_binding,
          input_hash: second.json?.input_hash,
          attestation_hash: second.json?.rulebook_attestation?.bundle_hash,
          trusted_adapter: second.json?.trusted_adapter || null,
          adapter_facts: second.json?.adapter_facts || null,
        },
        {
          evaluator_version: fixture.historical_record?.evaluator_version,
          semantic_output: fixture.historical_record?.semantic_output,
          rulebook: fixture.historical_record?.rulebook,
          runtime_binding: fixture.historical_record?.runtime_binding,
          input_hash: fixture.historical_record?.input_hash,
          attestation_hash: fixture.historical_record?.rulebook_attestation?.bundle_hash,
          trusted_adapter: fixture.historical_record?.trusted_adapter || null,
          adapter_facts: fixture.historical_record?.adapter_facts || null,
        },
        `${fixtureRef.id}: repeated historical replay must reproduce the stored corpus record`
      );
    }
    assert.equal(fetchCalled, false, "Rulebook v1 golden replay corpus unexpectedly called an LLM");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
  }
}

async function testKrafthausWorkflowBindingExample() {
  const exampleDocPath = join(__dirname, "..", "docs", "KRAFTHAUS_WORKFLOW_BINDING_EXAMPLE.md");
  const exampleJsonPath = join(__dirname, "..", "public", "examples", "krafthaus-workflow-binding-v1.json");
  assert.ok(existsSync(exampleDocPath), "Krafthaus workflow binding example doc is missing");
  assert.ok(existsSync(exampleJsonPath), "public Krafthaus workflow binding JSON example is missing");

  const doc = readFileSync(exampleDocPath, "utf8");
  const applicationBindingDoc = readFileSync(join(__dirname, "..", "docs", "APPLICATION_BINDING_V1.md"), "utf8");
  const example = loadJsonFromRepo("public", "examples", "krafthaus-workflow-binding-v1.json");
  const conformance = loadPublicRulebookConformanceFixture("krafthaus-workflow-readiness-adapter-bind.json");
  assert.equal(
    example.example_version,
    "krafthaus_workflow_binding_example_v1",
    "Krafthaus workflow example version mismatch"
  );
  assert.equal(example.id, "krafthaus_workflow_readiness_binding_v1", "Krafthaus workflow example id mismatch");
  assert.equal(
    example.runtime_manifest_url,
    "https://api.decide.fyi/manifests/rulebook-runtime-v1.json",
    "Krafthaus workflow example manifest URL mismatch"
  );
  assert.equal(
    example.conformance_fixture_url,
    "https://api.decide.fyi/conformance/rulebook-v1/krafthaus-workflow-readiness-adapter-bind.json",
    "Krafthaus workflow example conformance URL mismatch"
  );
  assert.equal(
    example.replay_fixture_url,
    "https://api.decide.fyi/replay/rulebook-v1/krafthaus-workflow-readiness-adapter-bind.json",
    "Krafthaus workflow example replay URL mismatch"
  );
  assert.deepEqual(
    example.decide_request,
    {
      method: conformance.request.method,
      path: conformance.request.path,
      body: conformance.request.body,
    },
    "Krafthaus workflow example must embed the executable conformance request"
  );
  assert.equal(
    example.decide_request.body.binding_mode,
    "trusted_adapter_facts_then_declarative_rulebook",
    "Krafthaus workflow example must declare the trusted-adapter binding mode explicitly"
  );

  for (const requiredMaterial of [
    "rulebook_contract",
    "runtime_binding",
    "verdict",
    "application_verdict",
    "action",
    "reason_code",
    "matched_rule_id",
    "rulebook.hash",
    "input_hash",
    "rulebook_attestation.bundle_hash",
  ]) {
    assert.ok(
      example.bind_before_action?.required_decision_material?.includes(requiredMaterial),
      `Krafthaus workflow example missing required material: ${requiredMaterial}`
    );
  }
  assert.ok(
    example.prohibited_claims?.includes("llm_output_is_binding_production_verdict"),
    "Krafthaus workflow example must reject LLM-only binding claims"
  );

  for (const docMarker of [
    "https://api.decide.fyi/examples/krafthaus-workflow-binding-v1.json",
    "Krafthaus Workflow Readiness Binding",
    "bind_workflow_application",
    "rulebook_attestation.bundle_hash",
    "llm_output_is_binding_production_verdict",
    "await fetch",
  ]) {
    assert.ok(doc.includes(docMarker), `Krafthaus workflow binding doc missing marker: ${docMarker}`);
  }
  assert.ok(
    applicationBindingDoc.includes("https://api.decide.fyi/examples/krafthaus-workflow-binding-v1.json"),
    "application binding doc must link the public Krafthaus workflow example"
  );
  assert.ok(
    applicationBindingDoc.includes("KRAFTHAUS_WORKFLOW_BINDING_EXAMPLE.md"),
    "application binding doc must link the Krafthaus workflow example notes"
  );

  const originalFetch = global.fetch;
  const previousApiKey = process.env.GEMINI_API_KEY;
  const previousDecideApiKey = process.env.DECIDE_API_KEY;
  process.env.GEMINI_API_KEY = "";
  process.env.DECIDE_API_KEY = "";
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("Krafthaus workflow binding example must not call an LLM");
  };

  try {
    const result = await invokeJson(decideHandler, {
      method: example.decide_request.method,
      path: example.decide_request.path,
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "10.252.0.1",
      },
      body: example.decide_request.body,
    });
    assert.equal(result.statusCode, 200, "Krafthaus workflow example status mismatch");
    assert.equal(result.json?.application_verdict, example.expected_response.application_verdict, "Krafthaus workflow example verdict mismatch");
    assert.equal(result.json?.action, example.expected_response.action, "Krafthaus workflow example action mismatch");
    assert.equal(result.json?.reason_code, example.expected_response.reason_code, "Krafthaus workflow example reason mismatch");
    assert.equal(result.json?.matched_rule_id, example.expected_response.matched_rule_id, "Krafthaus workflow example rule mismatch");
    assert.equal(
      result.json?.trusted_adapter?.adapter_id,
      example.expected_response.trusted_adapter.adapter_id,
      "Krafthaus workflow example adapter mismatch"
    );
    assertRuntimeBinding(
      result.json,
      example.expected_response.runtime_binding.binding_mode,
      "Krafthaus workflow example"
    );
    for (const [field, expectedValue] of Object.entries(example.expected_response.adapter_facts || {})) {
      assert.equal(result.json?.adapter_facts?.[field], expectedValue, `Krafthaus workflow example adapter fact mismatch: ${field}`);
    }
    assertRulebookAttestation(result.json, "Krafthaus workflow example");
    assert.equal(fetchCalled, false, "Krafthaus workflow binding example unexpectedly called an LLM");
  } finally {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = previousApiKey;
    process.env.DECIDE_API_KEY = previousDecideApiKey;
  }
}

function testRulebookMigrationDryRunCli() {
  const repoRoot = join(__dirname, "..");
  const migrationManifestSchemaUrl = "https://api.decide.fyi/schemas/rulebook-migration-v1.schema.json";
  const migrationManifestSchemaPath = join(repoRoot, "public", "schemas", "rulebook-migration-v1.schema.json");
  const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
  const compatibilityPolicy = readFileSync(join(repoRoot, "docs", "RULEBOOK_COMPATIBILITY_POLICY.md"), "utf8");
  const migrationExamples = readFileSync(join(repoRoot, "docs", "RULEBOOK_MIGRATION_EXAMPLES.md"), "utf8");
  const migrationManifestDoc = readFileSync(join(repoRoot, "docs", "RULEBOOK_MIGRATION_MANIFEST_V1.md"), "utf8");
  const command = "npm run rulebook:migration-dry-run";
  assert.ok(existsSync(migrationManifestSchemaPath), "Rulebook migration manifest JSON Schema must be published");
  const migrationManifestSchema = loadJsonFromRepo("public", "schemas", "rulebook-migration-v1.schema.json");
  assert.equal(migrationManifestSchema.$id, migrationManifestSchemaUrl, "migration manifest schema URL mismatch");
  assert.equal(
    migrationManifestSchema.properties?.schema_version?.const,
    "rulebook_migration_v1",
    "migration manifest schema must pin schema_version"
  );
  assert.equal(migrationManifestSchema.additionalProperties, false, "migration manifest schema must be closed");
  assert.ok(migrationManifestSchema.properties?.candidate?.properties?.rulebooks, "schema missing candidate.rulebooks");
  assert.ok(migrationManifestSchema.properties?.candidate?.properties?.adapters, "schema missing candidate.adapters");
  assert.ok(migrationManifestSchema.properties?.expected_drift, "schema missing expected_drift");
  assert.ok(migrationManifestSchema.properties?.approval, "schema missing approval");
  assert.ok(readme.includes(command), "README must document the migration dry-run command");
  assert.ok(compatibilityPolicy.includes(command), "compatibility policy must document the migration dry-run command");
  assert.ok(migrationExamples.includes(command), "migration examples must document the migration dry-run command");
  assert.ok(readme.includes("--migration"), "README must document migration manifest usage");
  assert.ok(readme.includes(migrationManifestSchemaUrl), "README must publish migration manifest schema URL");
  assert.ok(compatibilityPolicy.includes(migrationManifestSchemaUrl), "compatibility policy must publish schema URL");
  assert.ok(migrationExamples.includes(migrationManifestSchemaUrl), "migration examples must publish schema URL");
  assert.ok(migrationManifestDoc.includes(migrationManifestSchemaUrl), "migration manifest doc must publish schema URL");
  assert.ok(compatibilityPolicy.includes("rulebook_migration_v1"), "compatibility policy must mention migration manifests");
  assert.ok(migrationExamples.includes("rulebook_migration_v1"), "migration examples must mention migration manifests");
  assert.ok(migrationManifestDoc.includes("rulebook_migration_v1"), "migration manifest doc must define schema version");
  assert.ok(migrationManifestDoc.includes("gate_passed"), "migration manifest doc must define gate_passed semantics");

  const env = {
    ...process.env,
    GEMINI_API_KEY: "",
    DECIDE_API_KEY: "",
  };
  const baselineOutput = execFileSync(process.execPath, ["scripts/rulebook-migration-dry-run.js", "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
    env,
  });
  const baseline = JSON.parse(baselineOutput);
  assert.equal(baseline.ok, true, "migration dry-run baseline should pass");
  assert.equal(baseline.corpus_version, "rulebook_v1_golden_replay_v1", "dry-run corpus version mismatch");
  assert.equal(baseline.replay_contract, "historical_rulebook_replay_v1", "dry-run replay contract mismatch");
  assert.equal(baseline.fixtures_total, 7, "dry-run fixture count mismatch");
  assert.equal(baseline.drift_count, 0, "baseline dry-run should have no drift");
  assert.deepEqual(
    baseline.results.map((entry) => entry.status),
    Array.from({ length: baseline.fixtures_total }, () => "pass"),
    "baseline dry-run should pass every fixture"
  );

  let driftReport = null;
  try {
    execFileSync(
      process.execPath,
      [
        "scripts/rulebook-migration-dry-run.js",
        "--json",
        "--fixture",
        "pricing_exception_direct_approve",
        "--candidate-evaluator-version",
        "decide_rulebook_v1_1",
        "--candidate-rulebook",
        "pricing_exception=scripts/fixtures/decision-contract/pricing-exception-2026-07-01-rulebook.json",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
  } catch (error) {
    driftReport = JSON.parse(String(error.stdout || ""));
    assert.equal(error.status, 1, "candidate drift dry-run should exit 1");
  }
  assert.ok(driftReport, "candidate drift dry-run should fail with a JSON report");
  assert.equal(driftReport.ok, false, "candidate drift report should be marked not ok");
  assert.equal(driftReport.candidate_evaluator_version, "decide_rulebook_v1_1", "candidate evaluator label mismatch");
  assert.deepEqual(
    driftReport.candidate_rulebooks,
    ["pricing_exception"],
    "candidate rulebook selector should be reported"
  );
  assert.equal(driftReport.fixtures_total, 1, "candidate dry-run should filter one fixture");
  assert.equal(driftReport.drift_count, 1, "candidate dry-run should report one drift");
  assert.equal(driftReport.results?.[0]?.id, "pricing_exception_direct_approve", "candidate drift fixture mismatch");
  assert.equal(driftReport.results?.[0]?.status, "drift", "candidate result should be drift");
  assert.ok(
    driftReport.results?.[0]?.drifts?.some((entry) => entry.field === "rulebook"),
    "candidate drift should include rulebook lineage drift"
  );
  assert.ok(
    driftReport.results?.[0]?.drifts?.some((entry) => entry.field === "attestation_hash"),
    "candidate drift should include attestation hash drift"
  );

  const allowedOutput = execFileSync(
    process.execPath,
    [
      "scripts/rulebook-migration-dry-run.js",
      "--json",
      "--allow-drift",
      "--fixture",
      "pricing_exception_direct_approve",
      "--candidate-rulebook",
      "pricing_exception=scripts/fixtures/decision-contract/pricing-exception-2026-07-01-rulebook.json",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env,
    }
  );
  const allowed = JSON.parse(allowedOutput);
  assert.equal(allowed.ok, false, "allow-drift should preserve not-ok report semantics");
  assert.equal(allowed.drift_count, 1, "allow-drift should preserve drift count");

  let invalidManifestReport = null;
  try {
    execFileSync(
      process.execPath,
      [
        "scripts/rulebook-migration-dry-run.js",
        "--json",
        "--migration",
        "scripts/fixtures/decision-contract/invalid-migration-extra-field.json",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
  } catch (error) {
    invalidManifestReport = JSON.parse(String(error.stdout || ""));
    assert.equal(error.status, 2, "invalid migration manifest should exit 2 before replay");
  }
  assert.ok(invalidManifestReport, "invalid manifest dry-run should fail with a JSON report");
  assert.equal(invalidManifestReport.gate_passed, false, "invalid manifest gate should block");
  assert.ok(
    invalidManifestReport.config_errors?.some(
      (entry) => entry.includes("unexpected") && entry.includes("additionalProperties")
    ),
    "invalid manifest should report schema additionalProperties violation"
  );

  let pendingManifestReport = null;
  try {
    execFileSync(
      process.execPath,
      [
        "scripts/rulebook-migration-dry-run.js",
        "--json",
        "--migration",
        "scripts/fixtures/decision-contract/pricing-exception-2026-07-01-migration-pending.json",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
  } catch (error) {
    pendingManifestReport = JSON.parse(String(error.stdout || ""));
    assert.equal(error.status, 1, "pending manifest with expected drift should exit 1");
  }
  assert.ok(pendingManifestReport, "pending manifest dry-run should fail with a JSON report");
  assert.equal(pendingManifestReport.migration?.schema_version, "rulebook_migration_v1", "manifest schema mismatch");
  assert.equal(
    pendingManifestReport.migration?.migration_id,
    "pricing_exception_2026_07_01_pending",
    "manifest id mismatch"
  );
  assert.equal(pendingManifestReport.migration?.approval_status, "pending", "pending approval status mismatch");
  assert.equal(pendingManifestReport.gate_passed, false, "pending manifest gate should block");
  assert.equal(pendingManifestReport.approval_required, true, "pending manifest should require approval");
  assert.equal(pendingManifestReport.expected_drift_count, 2, "pending manifest should classify expected drift fields");
  assert.equal(pendingManifestReport.unexpected_drift_count, 0, "pending manifest should have no unexpected drift");

  const approvedManifestOutput = execFileSync(
    process.execPath,
    [
      "scripts/rulebook-migration-dry-run.js",
      "--json",
      "--migration",
      "scripts/fixtures/decision-contract/pricing-exception-2026-07-01-migration-approved.json",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env,
    }
  );
  const approvedManifest = JSON.parse(approvedManifestOutput);
  assert.equal(approvedManifest.ok, false, "approved manifest should still report drift in strict ok semantics");
  assert.equal(approvedManifest.gate_passed, true, "approved manifest gate should pass expected drift");
  assert.equal(approvedManifest.migration?.approval_status, "approved", "approved manifest status mismatch");
  assert.equal(approvedManifest.expected_drift_count, 2, "approved manifest expected drift count mismatch");
  assert.equal(approvedManifest.unexpected_drift_count, 0, "approved manifest unexpected drift mismatch");
}

function testRulebookRuntimeArchitectureDoc() {
  const architecturePath = join(__dirname, "..", "docs", "RULEBOOK_RUNTIME_ARCHITECTURE.md");
  const rulebookDocPath = join(__dirname, "..", "docs", "RULEBOOK_V1.md");
  const compatibilityPolicyPath = join(__dirname, "..", "docs", "RULEBOOK_COMPATIBILITY_POLICY.md");
  const migrationExamplesPath = join(__dirname, "..", "docs", "RULEBOOK_MIGRATION_EXAMPLES.md");
  const applicationBindingPath = join(__dirname, "..", "docs", "APPLICATION_BINDING_V1.md");
  const trustedAdaptersPath = join(__dirname, "..", "docs", "TRUSTED_ADAPTERS_V1.md");
  const runtimeSmokePath = join(__dirname, "..", "scripts", "rulebook-runtime-production-smoke.js");
  const schemaPath = join(__dirname, "..", "public", "schemas", "rulebook-v1.schema.json");
  assert.ok(existsSync(architecturePath), "rulebook runtime architecture doc is missing");
  assert.ok(existsSync(rulebookDocPath), "rulebook contract doc is missing");
  assert.ok(existsSync(compatibilityPolicyPath), "rulebook compatibility policy doc is missing");
  assert.ok(existsSync(migrationExamplesPath), "rulebook migration examples doc is missing");
  assert.ok(existsSync(applicationBindingPath), "application binding doc is missing");
  assert.ok(existsSync(trustedAdaptersPath), "trusted adapters doc is missing");
  assert.ok(existsSync(runtimeSmokePath), "rulebook runtime production smoke script is missing");
  assert.ok(existsSync(schemaPath), "public Rulebook v1 JSON Schema artifact is missing");
  const architecture = readFileSync(architecturePath, "utf8");
  const rulebookDoc = readFileSync(rulebookDocPath, "utf8");
  const compatibilityPolicy = readFileSync(compatibilityPolicyPath, "utf8");
  const migrationExamples = readFileSync(migrationExamplesPath, "utf8");
  const applicationBinding = readFileSync(applicationBindingPath, "utf8");
  const trustedAdaptersDoc = readFileSync(trustedAdaptersPath, "utf8");
  const runtimeSmoke = readFileSync(runtimeSmokePath, "utf8");
  const schema = loadJsonFromRepo("public", "schemas", "rulebook-v1.schema.json");
  const readme = readFileSync(join(__dirname, "..", "README.md"), "utf8");
  assert.ok(architecture.includes("Status: Accepted"), "runtime architecture doc must record accepted status");
  assert.ok(
    architecture.includes("Rulebook v1 is the public production determinism contract"),
    "runtime architecture doc must name Rulebook v1 as the public deterministic core"
  );
  assert.ok(
    architecture.includes("hybrid_declarative_rulebook_with_trusted_adapters"),
    "runtime architecture doc must name the hybrid production core"
  );
  assert.ok(
    architecture.includes("Customer-supplied executable rulebooks do not run inside Decide"),
    "runtime architecture doc must reject customer executable rulebooks"
  );
  assert.ok(
    architecture.includes("RULEBOOK_BINDING_MODE_UNSUPPORTED"),
    "runtime architecture doc must document explicit unsupported binding mode rejection"
  );
  assert.ok(
    architecture.includes("RULEBOOK_OUTPUT_MATERIAL_FORBIDDEN"),
    "runtime architecture doc must document caller-supplied output material rejection"
  );
  assert.ok(
    applicationBinding.includes("RULEBOOK_OUTPUT_MATERIAL_FORBIDDEN"),
    "application binding doc must document caller-supplied output material rejection"
  );
  assert.ok(
    architecture.includes("Trusted adapters may emit facts, but they do not select the binding verdict"),
    "runtime architecture doc must keep trusted adapters out of verdict selection"
  );
  assert.ok(
    architecture.includes("runtime_binding"),
    "runtime architecture doc must document runtime binding metadata"
  );
  assert.ok(
    architecture.includes("Krafthaus Workflow Readiness Binding"),
    "runtime architecture doc must name the broader Krafthaus workflow binding example"
  );
  assert.ok(
    rulebookDoc.includes("Krafthaus Workflow Readiness Binding"),
    "rulebook contract doc must name the broader Krafthaus workflow binding example"
  );
  assert.ok(
    trustedAdaptersDoc.includes("krafthaus_workflow_readiness@1.0.0"),
    "trusted adapters doc must document the Krafthaus workflow readiness adapter"
  );
  assert.ok(
    readme.includes("Krafthaus Workflow Readiness Binding"),
    "README must name the broader Krafthaus workflow binding example"
  );
  assert.ok(
    rulebookDoc.includes("runtime_binding"),
    "rulebook contract doc must document runtime binding metadata"
  );
  assert.ok(
    rulebookDoc.includes("RULEBOOK_BINDING_MODE_UNSUPPORTED"),
    "rulebook contract doc must document explicit unsupported binding mode rejection"
  );
  assert.ok(readme.includes("runtime_binding"), "README must document runtime binding metadata");
  assert.ok(architecture.includes("decision_contract"), "runtime architecture doc must document advisory decision contract");
  assert.ok(readme.includes("decision_contract"), "README must document advisory decision contract");
  assert.ok(
    applicationBinding.includes("decision_contract") &&
      applicationBinding.includes("advisory_only") &&
      applicationBinding.includes("production_verdict: false"),
    "application binding doc must explain advisory-only non-rulebook responses"
  );
  assert.ok(runtimeSmoke.includes("assertAdvisoryDecisionContract"), "production smoke must verify advisory decision contract");
  assert.ok(runtimeSmoke.includes("decision_contract"), "production smoke must inspect advisory decision contract");
  assert.ok(
    runtimeSmoke.includes("buildAdvisoryDecisionContract"),
    "production smoke must verify the shared advisory contract helper"
  );
  assert.ok(
    runtimeSmoke.includes("sameJson(payload?.decision_contract, buildAdvisoryDecisionContract"),
    "production smoke must compare advisory responses against the full shared contract"
  );
  assert.ok(
    runtimeSmoke.includes("assertKrafthausWorkflowReadinessBinding"),
    "production smoke must verify Krafthaus workflow readiness binding"
  );
  assert.ok(
    runtimeSmoke.includes("krafthaus-workflow-readiness-adapter-bind.json"),
    "production smoke must load the Krafthaus workflow readiness conformance fixture"
  );
  assert.ok(
    runtimeSmoke.includes("krafthaus_workflow_readiness_adapter_bind"),
    "production smoke must name the Krafthaus workflow readiness fixture id"
  );
  assert.ok(
    runtimeSmoke.includes("caller-output-material-rejected.json"),
    "production smoke must verify caller-supplied output material rejection"
  );
  assert.ok(
    readme.includes("docs/RULEBOOK_RUNTIME_ARCHITECTURE.md"),
    "README must link the runtime architecture decision"
  );
  assert.ok(
    rulebookDoc.includes("RULEBOOK_COMPATIBILITY_POLICY.md"),
    "rulebook contract doc must link the compatibility policy"
  );
  assert.ok(
    architecture.includes("RULEBOOK_COMPATIBILITY_POLICY.md"),
    "runtime architecture doc must link the compatibility policy"
  );
  assert.ok(
    readme.includes("docs/RULEBOOK_COMPATIBILITY_POLICY.md"),
    "README must link the compatibility policy"
  );
  assert.ok(
    rulebookDoc.includes("RULEBOOK_MIGRATION_EXAMPLES.md"),
    "rulebook contract doc must link migration examples"
  );
  assert.ok(
    compatibilityPolicy.includes("RULEBOOK_MIGRATION_EXAMPLES.md"),
    "compatibility policy must link migration examples"
  );
  assert.ok(
    readme.includes("docs/RULEBOOK_MIGRATION_EXAMPLES.md"),
    "README must link migration examples"
  );
  for (const requiredReplayMarker of [
    "https://api.decide.fyi/replay/rulebook-v1/index.json",
    "rulebook_v1_golden_replay_v1",
    "historical_rulebook_replay_v1"
  ]) {
    assert.ok(rulebookDoc.includes(requiredReplayMarker), `rulebook contract doc missing replay marker: ${requiredReplayMarker}`);
    assert.ok(
      compatibilityPolicy.includes(requiredReplayMarker),
      `compatibility policy missing replay marker: ${requiredReplayMarker}`
    );
  }
  for (const requiredMigrationMarker of [
    "Evaluator Migration Example",
    "Adapter Migration Example",
    "Rulebook Migration Example",
    "golden replay corpus",
    "rulebook_v1_golden_replay_v1",
    "historical_rulebook_replay_v1",
    "DECIDE_RULEBOOK_EVALUATOR_NEXT",
    "solana_execution_gate@1.1.0",
    "pricing_exception@2026-07-01"
  ]) {
    assert.ok(
      migrationExamples.includes(requiredMigrationMarker),
      `rulebook migration examples doc missing marker: ${requiredMigrationMarker}`
    );
  }
  for (const requiredCompatibilityMarker of [
    "Policy version: `compatibility_policy_v1`",
    "Historical replay never reinterprets stored records with the current evaluator or adapter",
    "The same `rulebook_id` plus `version` cannot bind to a different canonical rulebook hash",
    "The same `rulebook_id` plus `version` cannot silently move to a different evaluator version",
    "Adapter dependency changes require a new adapter version, a new manifest hash, and an explicit rulebook version migration",
    "Rulebook v1 remains declarative",
    "Evaluator Migration",
    "Adapter Migration",
    "Public API Compatibility",
    "conformance fixtures",
    "golden replay corpus",
    "add optional fields",
    "remove, rename, or change the meaning"
  ]) {
    assert.ok(
      compatibilityPolicy.includes(requiredCompatibilityMarker),
      `compatibility policy doc missing marker: ${requiredCompatibilityMarker}`
    );
  }
  assert.equal(schema.$id, "https://api.decide.fyi/schemas/rulebook-v1.schema.json", "schema id must use the API origin");
  assert.equal(schema.properties?.schema_version?.const, "rulebook_v1", "schema must lock the Rulebook v1 version");
  assert.equal(schema.additionalProperties, false, "schema root must be closed");
  assert.equal(schema.$defs?.rule?.additionalProperties, false, "schema rule objects must be closed");
  assert.equal(schema.$defs?.outcome?.additionalProperties, false, "schema outcomes must be closed");
  assert.equal(
    schema.$defs?.condition?.oneOf?.[3]?.properties?.operator?.enum?.includes("javascript"),
    false,
    "schema must not expose executable operators"
  );
  for (const field of ["code", "source", "script", "function", "handler", "javascript", "typescript", "wasm"]) {
    assert.equal(schema.properties?.[field], undefined, `schema root must not expose executable field ${field}`);
    assert.equal(schema.$defs?.rule?.properties?.[field], undefined, `schema rules must not expose executable field ${field}`);
  }
  assert.ok(
    rulebookDoc.includes("https://api.decide.fyi/schemas/rulebook-v1.schema.json"),
    "rulebook contract doc must link the public JSON Schema artifact"
  );
  assert.ok(
    rulebookDoc.includes("rulebook_contract"),
    "rulebook contract doc must document runtime schema contract metadata"
  );
  assert.ok(
    architecture.includes("validates the request rulebook against the published JSON Schema"),
    "runtime architecture doc must say the production path validates against the published schema"
  );
  assert.ok(
    architecture.includes("rulebook_attestation_v1"),
    "runtime architecture doc must mention the Rulebook v1 registry attestation"
  );
  assert.ok(
    rulebookDoc.includes("rulebook_attestation_v1"),
    "rulebook contract doc must document the Rulebook v1 registry attestation"
  );
  assert.ok(
    readme.includes("rulebook_attestation_v1"),
    "README must mention the Rulebook v1 attestation bundle"
  );
  assert.ok(
    architecture.includes("rulebook_attestation_signature_v1"),
    "runtime architecture doc must mention the Rulebook v1 signature envelope"
  );
  assert.ok(
    rulebookDoc.includes("rulebook_attestation_signature_v1"),
    "rulebook contract doc must document the Rulebook v1 signature envelope"
  );
  assert.ok(
    readme.includes("rulebook_attestation_signature_v1"),
    "README must mention the Rulebook v1 attestation signature"
  );
  assert.ok(
    rulebookDoc.includes("/.well-known/rulebook-attestation-keys.json"),
    "rulebook contract doc must document the attestation public key endpoint"
  );
  assert.ok(
    architecture.includes("DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED=true"),
    "runtime architecture doc must document the required-signature production guard"
  );
  assert.ok(
    rulebookDoc.includes("DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED=true"),
    "rulebook contract doc must document the required-signature production guard"
  );
  assert.ok(
    readme.includes("DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED=true"),
    "README must mention the required-signature production guard"
  );
  assert.ok(
    architecture.includes("DECIDE_RULEBOOK_ATTESTATION_KEY_HISTORY_JSON"),
    "runtime architecture doc must document attestation key history"
  );
  assert.ok(
    architecture.includes("ambient_capability_deny_v2"),
    "runtime architecture doc must document the enforced trusted-adapter capability contract"
  );
  assert.ok(
    rulebookDoc.includes("TRUSTED_ADAPTER_CAPABILITY_DENIED"),
    "rulebook contract doc must document trusted-adapter runtime capability denial"
  );
  assert.ok(
    rulebookDoc.includes("DECIDE_RULEBOOK_ATTESTATION_KEY_HISTORY_JSON"),
    "rulebook contract doc must document attestation key history"
  );
  assert.ok(
    rulebookDoc.includes("Refund, Trial, Cancel, and Return Policy MCP notaries"),
    "rulebook contract doc must identify the direct-rulebook Policy MCP notaries"
  );
  assert.ok(
    rulebookDoc.includes("rules/trial-policy-notary-v1.json"),
    "rulebook contract doc must identify the trial direct-rulebook notary"
  );
  assert.ok(
    rulebookDoc.includes("rules/cancel-policy-notary-v1.json"),
    "rulebook contract doc must identify the cancel direct-rulebook notary"
  );
  assert.ok(
    rulebookDoc.includes("rules/return-policy-notary-v1.json"),
    "rulebook contract doc must identify the return direct-rulebook notary"
  );
  assert.ok(
    readme.includes("DECIDE_RULEBOOK_ATTESTATION_KEY_HISTORY_JSON"),
    "README must mention attestation key history"
  );
  assert.ok(
    rulebookDoc.includes("key_history_count"),
    "rulebook contract doc must document the key history count"
  );
  assert.equal(
    rulebookDoc.includes("Add a signed rulebook bundle or registry attestation"),
    false,
    "rulebook contract doc should not list implemented registry attestation as future work"
  );
  assert.equal(
    rulebookDoc.includes("Add cryptographic signing for `rulebook_attestation.bundle_hash`"),
    false,
    "rulebook contract doc should not list implemented attestation signing as future work"
  );
  assert.equal(
    rulebookDoc.includes("Add key-rotation history for multiple active and retired attestation keys"),
    false,
    "rulebook contract doc should not list implemented attestation key history as future work"
  );
  assert.equal(
    rulebookDoc.includes("Add stronger runtime enforcement for declared adapter capability denial"),
    false,
    "rulebook contract doc should not list implemented adapter capability enforcement as future work"
  );
  assert.equal(
    rulebookDoc.includes("Migrate a second materially different Krafthaus application"),
    false,
    "rulebook contract doc should not list the completed second-application migration as future work"
  );
  assert.equal(
    rulebookDoc.includes("Define evaluator and adapter migration plus long-term compatibility policy"),
    false,
    "rulebook contract doc should not list implemented compatibility policy as future work"
  );
}

async function testDecideGeminiDisabledByDefault() {
  const fixture = loadFixture("decide-single.json");
  const originalFetch = global.fetch;
  const envKeys = ["GEMINI_API_KEY", "DECIDE_API_KEY", "DECIDE_GEMINI_MODE", "DECIDE_GEMINI_MODEL"];
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  process.env.GEMINI_API_KEY = "contract-test";
  process.env.DECIDE_API_KEY = "";
  delete process.env.DECIDE_GEMINI_MODE;
  delete process.env.DECIDE_GEMINI_MODEL;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    throw new Error("zero-cost mode must never call Gemini");
  };

  try {
    const result = await invokeJson(decideHandler, fixture.request);
    assert.equal(result.statusCode, 503, "disabled Gemini mode should be explicitly unavailable");
    assert.equal(result.json?.c, "unclear", "disabled Gemini mode must fail closed");
    assert.equal(result.json?.v, "unavailable", "disabled Gemini mode verdict mismatch");
    assert.equal(result.json?.error, "DECIDE_AI_DISABLED_ZERO_COST", "disabled mode error mismatch");
    assert.equal(fetchCalls, 0, "disabled Gemini mode must make zero provider calls");
    assertAdvisoryDecisionContract(result.json, "single", "disabled decide advisory");
  } finally {
    global.fetch = originalFetch;
    for (const key of envKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  }
}

async function testDecideGeminiDisabledPreservesDeterministicGuards() {
  const originalFetch = global.fetch;
  const envKeys = ["GEMINI_API_KEY", "DECIDE_API_KEY", "DECIDE_GEMINI_MODE", "DECIDE_GEMINI_MODEL"];
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  process.env.GEMINI_API_KEY = "contract-test";
  process.env.DECIDE_API_KEY = "";
  delete process.env.DECIDE_GEMINI_MODE;
  delete process.env.DECIDE_GEMINI_MODEL;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    throw new Error("deterministic guards must run without Gemini");
  };

  const cases = [
    {
      label: "short single",
      ip: "127.0.0.91",
      body: { mode: "single", question: "hi" },
      expected: { c: "unclear", v: "Ask a question" },
    },
    {
      label: "invalid multi",
      ip: "127.0.0.92",
      body: { mode: "multi", stem: "Pick one", options: ["Only option"] },
      expected: { c: "unclear", v: "Need 2-8 options" },
    },
    {
      label: "filtered single",
      ip: "127.0.0.93",
      body: { mode: "single", question: "Should I buy this stock?" },
      expected: { c: "filtered", v: "Cannot provide finance advice" },
    },
    {
      label: "filtered multi",
      ip: "127.0.0.94",
      body: { mode: "multi", stem: "Should I buy this stock?", options: ["Buy", "Wait"] },
      expected: { c: "filtered", v: "Cannot provide finance advice" },
    },
    {
      label: "filtered runtime",
      ip: "127.0.0.95",
      body: {
        mode: "runtime",
        prompt: "Should I buy this stock?",
        context: { options: ["Buy", "Wait"] },
      },
      expected: { c: "filtered", v: "Cannot provide finance advice" },
    },
  ];

  try {
    for (const entry of cases) {
      const result = await invokeJson(decideHandler, {
        method: "POST",
        url: "/api/decide",
        headers: {
          "content-type": "application/json",
          "user-agent": "contract-test",
          "x-forwarded-for": entry.ip,
        },
        body: entry.body,
      });
      assert.equal(result.statusCode, 200, `${entry.label}: deterministic response status mismatch`);
      assert.equal(result.json?.c, entry.expected.c, `${entry.label}: response class mismatch`);
      assert.equal(result.json?.v, entry.expected.v, `${entry.label}: response verdict mismatch`);
    }
    assert.equal(fetchCalls, 0, "disabled deterministic guards must make zero provider calls");
  } finally {
    global.fetch = originalFetch;
    for (const key of envKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  }
}

async function testDecideGeminiDisabledRuntimeLineage() {
  const originalFetch = global.fetch;
  const envKeys = ["GEMINI_API_KEY", "DECIDE_API_KEY", "DECIDE_GEMINI_MODE", "DECIDE_GEMINI_MODEL"];
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  process.env.GEMINI_API_KEY = "contract-test";
  process.env.DECIDE_API_KEY = "";
  delete process.env.DECIDE_GEMINI_MODE;
  delete process.env.DECIDE_GEMINI_MODEL;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    throw new Error("disabled runtime must never call Gemini");
  };

  const request = (prompt, ip) => ({
    method: "POST",
    url: "/api/decide",
    headers: {
      "content-type": "application/json",
      "user-agent": "contract-test",
      "x-forwarded-for": ip,
    },
    body: {
      mode: "runtime",
      prompt,
      context: { options: ["Ship now", "Wait"] },
    },
  });

  try {
    const first = await invokeJson(decideHandler, request("Choose the rollout path", "127.0.0.96"));
    const second = await invokeJson(decideHandler, request("Choose the support path", "127.0.0.97"));
    for (const [label, result] of [["first", first], ["second", second]]) {
      assert.equal(result.statusCode, 503, `${label} disabled runtime status mismatch`);
      assert.equal(result.json?.error, "DECIDE_AI_DISABLED_ZERO_COST", `${label} disabled runtime error mismatch`);
      assertAdvisoryDecisionContract(result.json, "runtime", `${label} disabled runtime`);
      assertLineage(result.json, `${label} disabled runtime`);
    }
    assert.notEqual(first.json?.source_hash, second.json?.source_hash, "distinct runtime prompts need distinct lineage hashes");
    assert.equal(fetchCalls, 0, "disabled runtime lineage checks must make zero provider calls");
  } finally {
    global.fetch = originalFetch;
    for (const key of envKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  }
}

async function testDecideGeminiPaidMissingKeyFailsClosed() {
  const fixture = loadFixture("decide-single.json");
  const originalFetch = global.fetch;
  const envKeys = ["GEMINI_API_KEY", "DECIDE_API_KEY", "DECIDE_GEMINI_MODE", "DECIDE_GEMINI_MODEL"];
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  delete process.env.GEMINI_API_KEY;
  process.env.DECIDE_API_KEY = "";
  process.env.DECIDE_GEMINI_MODE = "paid";
  process.env.DECIDE_GEMINI_MODEL = "gemini-3.1-flash-lite";
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    throw new Error("missing-key paid mode must never call Gemini");
  };

  try {
    const result = await invokeJson(decideHandler, {
      ...fixture.request,
      headers: {
        ...(fixture.request.headers || {}),
        "x-forwarded-for": "127.0.0.98",
      },
    });
    assert.equal(result.statusCode, 500, "paid mode without a key must fail closed");
    assert.equal(result.json?.c, "unclear", "missing-key paid mode response class mismatch");
    assert.equal(fetchCalls, 0, "missing-key paid mode must make zero provider calls");
  } finally {
    global.fetch = originalFetch;
    for (const key of envKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  }
}

async function testDecideGeminiBudgetMissingFailsClosed() {
  const fixture = loadFixture("decide-single.json");
  const originalFetch = global.fetch;
  const envKeys = [
    "GEMINI_API_KEY",
    "DECIDE_API_KEY",
    "DECIDE_GEMINI_MODE",
    "DECIDE_GEMINI_MODEL",
    "DECIDE_GEMINI_BUDGET_KV_REST_API_URL",
    "DECIDE_GEMINI_BUDGET_KV_REST_API_TOKEN",
    "DECIDE_KV_REST_API_URL",
    "DECIDE_KV_REST_API_TOKEN",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
  ];
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  process.env.GEMINI_API_KEY = "contract-test";
  process.env.DECIDE_API_KEY = "";
  process.env.DECIDE_GEMINI_MODE = "paid";
  process.env.DECIDE_GEMINI_MODEL = "gemini-3.1-flash-lite";
  for (const key of envKeys.slice(4)) delete process.env[key];
  let providerCalls = 0;
  global.fetch = async () => {
    providerCalls += 1;
    return {
      ok: true,
      status: 200,
      async json() {
        return { candidates: [{ content: { parts: [{ text: "yes" }] } }] };
      },
    };
  };

  try {
    const result = await invokeJson(decideHandler, {
      ...fixture.request,
      headers: { ...(fixture.request.headers || {}), "x-forwarded-for": "127.0.0.211" },
    });
    assert.equal(result.statusCode, 503, "paid advisory must fail closed without its durable budget store");
    assert.equal(result.json?.error, "DECIDE_AI_BUDGET_UNAVAILABLE", "missing budget store error mismatch");
    assert.equal(providerCalls, 0, "missing budget store must prevent every provider call");
  } finally {
    global.fetch = originalFetch;
    for (const key of envKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  }
}

async function testDecideGeminiBudgetCapFailsClosed() {
  const fixture = loadFixture("decide-single.json");
  const originalFetch = global.fetch;
  const envKeys = [
    "GEMINI_API_KEY",
    "DECIDE_API_KEY",
    "DECIDE_GEMINI_MODE",
    "DECIDE_GEMINI_MODEL",
    "DECIDE_GEMINI_BUDGET_KV_REST_API_URL",
    "DECIDE_GEMINI_BUDGET_KV_REST_API_TOKEN",
  ];
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  process.env.GEMINI_API_KEY = "contract-test";
  process.env.DECIDE_API_KEY = "";
  process.env.DECIDE_GEMINI_MODE = "paid";
  process.env.DECIDE_GEMINI_MODEL = "gemini-3.1-flash-lite";
  process.env.DECIDE_GEMINI_BUDGET_KV_REST_API_URL = "https://budget.example.test";
  process.env.DECIDE_GEMINI_BUDGET_KV_REST_API_TOKEN = "budget-test-token";
  let providerCalls = 0;
  global.fetch = createBudgetedGeminiFetch(async (url) => {
    if (String(url).startsWith("https://budget.example.test/")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return [{ result: [0, "monthly", 4, 100, 221] }];
        },
      };
    }
    providerCalls += 1;
    return {
      ok: true,
      status: 200,
      async json() {
        return { candidates: [{ content: { parts: [{ text: "yes" }] } }] };
      },
    };
  });

  try {
    const result = await invokeJson(decideHandler, {
      ...fixture.request,
      headers: { ...(fixture.request.headers || {}), "x-forwarded-for": "127.0.0.212" },
    });
    assert.equal(result.statusCode, 429, "exhausted durable advisory budget must reject the request");
    assert.equal(result.json?.error, "DECIDE_AI_BUDGET_EXHAUSTED", "budget cap error mismatch");
    assert.equal(result.json?.budget_reason, "monthly_cap_reached", "budget cap reason mismatch");
    assert.equal(providerCalls, 0, "exhausted durable budget must prevent every provider call");
  } finally {
    global.fetch = originalFetch;
    for (const key of envKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  }
}

async function testDecideGeminiPaidSingleAttempt() {
  const fixture = loadFixture("decide-single.json");
  const originalFetch = global.fetch;
  const envKeys = [
    "GEMINI_API_KEY",
    "DECIDE_API_KEY",
    "DECIDE_GEMINI_MODE",
    "DECIDE_GEMINI_MODEL",
    "DECIDE_GEMINI_LOW_LATENCY_MODEL_LADDER",
  ];
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  process.env.GEMINI_API_KEY = "contract-test";
  process.env.DECIDE_API_KEY = "";
  process.env.DECIDE_GEMINI_MODE = "paid";
  process.env.DECIDE_GEMINI_MODEL = "gemini-3.1-flash-lite";
  process.env.DECIDE_GEMINI_LOW_LATENCY_MODEL_LADDER = "gemini-3.1-pro-preview,gemini-3.5-flash";
  const urls = [];
  const providerBodies = [];
  let providerStatus = 503;
  global.fetch = createBudgetedGeminiFetch(async (url, options = {}) => {
    urls.push(String(url));
    providerBodies.push(JSON.parse(String(options.body || "{}")));
    return {
      ok: false,
      status: providerStatus,
      async json() {
        return { error: { message: "temporarily unavailable" } };
      },
    };
  });

  try {
    const result = await invokeJson(decideHandler, {
      ...fixture.request,
      headers: { ...(fixture.request.headers || {}), "x-forwarded-for": "127.0.0.214" },
    });
    assert.equal(
      result.statusCode,
      200,
      `paid provider failure should preserve advisory response compatibility: ${JSON.stringify(result.json)}`
    );
    assert.equal(result.json?.c, "unclear", "paid provider failure must fail closed");
    assert.equal(result.json?.status, "degraded", "paid provider failure must be explicitly degraded");
    assert.equal(
      result.json?.error,
      "DECIDE_AI_PROVIDER_UNAVAILABLE",
      "paid provider failure must expose a stable safe error code"
    );
    assert.equal(urls.length, 1, "paid mode must make exactly one provider attempt");
    assert.match(
      urls[0],
      /models\/gemini-3\.1-flash-lite:generateContent/,
      "paid mode must use the exact reviewed model"
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(providerBodies[0]?.generationConfig || {}, "candidateCount"),
      false,
      "Gemini 3 requests must use the provider's one-candidate default"
    );
    assert.equal(providerBodies[0]?.generationConfig?.maxOutputTokens, 32, "single mode output cap mismatch");
    assert.equal(
      Object.prototype.hasOwnProperty.call(providerBodies[0]?.generationConfig || {}, "temperature"),
      false,
      "Gemini 3 requests must use the provider's reviewed default temperature"
    );
    assert.equal(
      providerBodies[0]?.generationConfig?.thinkingConfig?.thinkingLevel,
      "minimal",
      "Gemini 3 Flash-Lite must use its lowest supported thinking level"
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        providerBodies[0]?.generationConfig?.thinkingConfig || {},
        "thinkingBudget"
      ),
      false,
      "Gemini 3 Flash-Lite requests must not use the legacy Gemini 2.5 thinking budget"
    );
    assert.equal(
      providerBodies[0]?.generationConfig?.responseMimeType,
      "application/json",
      "single advisory must request structured JSON"
    );
    assert.deepEqual(
      providerBodies[0]?.generationConfig?.responseJsonSchema?.properties?.answer?.enum,
      ["yes", "no"],
      "single advisory schema must restrict the provider answer"
    );

    providerStatus = 429;
    const rateLimitedResult = await invokeJson(decideHandler, {
      ...fixture.request,
      headers: { ...(fixture.request.headers || {}), "x-forwarded-for": "127.0.0.215" },
    });
    assert.equal(rateLimitedResult.statusCode, 200, "provider rate limit must preserve advisory HTTP compatibility");
    assert.equal(rateLimitedResult.json?.status, "degraded", "provider rate limit must be explicitly degraded");
    assert.equal(
      rateLimitedResult.json?.error,
      "DECIDE_AI_PROVIDER_RATE_LIMITED",
      "provider rate limit error code mismatch"
    );
    assert.equal(urls.length, 2, "each paid advisory request must make exactly one provider attempt");
  } finally {
    global.fetch = originalFetch;
    for (const key of envKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  }
}

async function testDecideGeminiEmptyTextSingleAttempt() {
  const fixture = loadFixture("decide-single.json");
  const originalFetch = global.fetch;
  const envKeys = ["GEMINI_API_KEY", "DECIDE_API_KEY", "DECIDE_GEMINI_MODE", "DECIDE_GEMINI_MODEL"];
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  process.env.GEMINI_API_KEY = "contract-test";
  process.env.DECIDE_API_KEY = "";
  process.env.DECIDE_GEMINI_MODE = "paid";
  process.env.DECIDE_GEMINI_MODEL = "gemini-3.1-flash-lite";
  let fetchCalls = 0;
  global.fetch = createBudgetedGeminiFetch(async () => {
    fetchCalls += 1;
    return {
      ok: true,
      status: 200,
      async json() {
        return { candidates: [{ content: { parts: [{ text: "" }] } }] };
      },
    };
  });

  try {
    const result = await invokeJson(decideHandler, fixture.request);
    assert.equal(result.statusCode, 200, "empty provider output must preserve advisory HTTP compatibility");
    assert.equal(result.json?.c, "unclear", "empty provider output must fail closed");
    assert.equal(result.json?.status, "degraded", "empty provider output must be explicitly degraded");
    assert.equal(
      result.json?.error,
      "DECIDE_AI_PROVIDER_INVALID_RESPONSE",
      "empty provider output must expose a stable safe error code"
    );
    assert.equal(fetchCalls, 1, "empty provider output must not trigger a second attempt");
  } finally {
    global.fetch = originalFetch;
    for (const key of envKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  }
}

async function testDecideGeminiIncompleteFinishReasonFailsClosed() {
  const fixture = loadFixture("decide-single.json");
  const originalFetch = global.fetch;
  const envKeys = ["GEMINI_API_KEY", "DECIDE_API_KEY", "DECIDE_GEMINI_MODE", "DECIDE_GEMINI_MODEL"];
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  process.env.GEMINI_API_KEY = "contract-test";
  process.env.DECIDE_API_KEY = "";
  process.env.DECIDE_GEMINI_MODE = "paid";
  process.env.DECIDE_GEMINI_MODEL = "gemini-3.1-flash-lite";
  global.fetch = createBudgetedGeminiFetch(async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        candidates: [
          {
            finishReason: "MAX_TOKENS",
            content: { parts: [{ text: JSON.stringify({ answer: "yes" }) }] },
          },
        ],
      };
    },
  }));

  try {
    const result = await invokeJson(decideHandler, fixture.request);
    assert.equal(result.statusCode, 200, "incomplete provider output must preserve advisory HTTP compatibility");
    assert.equal(result.json?.c, "unclear", "incomplete provider output must fail closed");
    assert.equal(result.json?.status, "degraded", "incomplete provider output must be explicitly degraded");
    assert.equal(
      result.json?.error,
      "DECIDE_AI_PROVIDER_INVALID_RESPONSE",
      "incomplete provider output must expose a stable safe error code"
    );
  } finally {
    global.fetch = originalFetch;
    for (const key of envKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  }
}

async function testDecideGeminiDeadline() {
  const fixture = loadFixture("decide-single.json");
  const originalFetch = global.fetch;
  const envKeys = [
    "GEMINI_API_KEY",
    "DECIDE_API_KEY",
    "DECIDE_GEMINI_MODE",
    "DECIDE_GEMINI_MODEL",
    "DECIDE_GEMINI_TIMEOUT_MS",
  ];
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  let signalSeen = false;
  let signalAborted = false;
  process.env.GEMINI_API_KEY = "contract-test";
  process.env.DECIDE_API_KEY = "";
  process.env.DECIDE_GEMINI_MODE = "paid";
  process.env.DECIDE_GEMINI_MODEL = "gemini-3.1-flash-lite";
  process.env.DECIDE_GEMINI_TIMEOUT_MS = "20";
  global.fetch = createBudgetedGeminiFetch(async (_url, options = {}) =>
    new Promise((_resolve, reject) => {
      signalSeen = Boolean(options.signal);
      const fallback = setTimeout(() => reject(new Error("Gemini wait exceeded without abort")), 100);
      options.signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(fallback);
          signalAborted = true;
          const error = new Error("Gemini request aborted");
          error.name = "AbortError";
          reject(error);
        },
        { once: true }
      );
    }));

  try {
    const startedAt = Date.now();
    const result = await invokeJson(decideHandler, {
      ...fixture.request,
      headers: {
        ...(fixture.request.headers || {}),
        "x-forwarded-for": "127.0.0.77",
      },
    });
    assert.equal(result.statusCode, 200, "advisory timeout must preserve advisory HTTP compatibility");
    assert.equal(result.json?.c, "unclear", "advisory timeout should fail closed to unclear");
    assert.equal(result.json?.status, "degraded", "advisory timeout must be explicitly degraded");
    assert.equal(result.json?.error, "DECIDE_AI_PROVIDER_TIMEOUT", "advisory timeout error code mismatch");
    assert.equal(signalSeen, true, "Gemini requests must receive an abort signal");
    assert.equal(signalAborted, true, "Gemini requests must abort at the configured deadline");
    assert.ok(Date.now() - startedAt < 90, "Gemini deadline should complete before the fallback wait");
  } finally {
    global.fetch = originalFetch;
    for (const key of envKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  }
}

async function testDecideGeminiPromptLimit() {
  const fixture = loadFixture("decide-single.json");
  const originalFetch = global.fetch;
  const envKeys = [
    "GEMINI_API_KEY",
    "DECIDE_API_KEY",
    "DECIDE_GEMINI_MODE",
    "DECIDE_GEMINI_MODEL",
    "DECIDE_GEMINI_MAX_PROMPT_CHARS",
  ];
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  process.env.GEMINI_API_KEY = "contract-test";
  process.env.DECIDE_API_KEY = "";
  process.env.DECIDE_GEMINI_MODE = "paid";
  process.env.DECIDE_GEMINI_MODEL = "gemini-3.1-flash-lite";
  process.env.DECIDE_GEMINI_MAX_PROMPT_CHARS = "512";
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    throw new Error("oversized prompts must fail before fetch");
  };

  try {
    const result = await invokeJson(decideHandler, {
      ...fixture.request,
      headers: {
        ...(fixture.request.headers || {}),
        "x-forwarded-for": "127.0.0.88",
      },
      body: {
        ...fixture.request.body,
        question: `Should I choose ${"x".repeat(700)}?`,
      },
    });
    assert.equal(result.statusCode, 413, "oversized advisory prompt should be rejected");
    assert.equal(result.json?.c, "unclear", "oversized advisory prompt must fail closed");
    assert.equal(result.json?.error, "DECIDE_AI_PROMPT_TOO_LARGE", "prompt limit error mismatch");
    assert.equal(fetchCalls, 0, "oversized advisory prompt must make zero provider calls");
  } finally {
    global.fetch = originalFetch;
    for (const key of envKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  }
}

async function testPolicyV1Fixture() {
  const fixture = loadFixture("policy-refund-v1.json");
  const result = await invokeJson(v1PolicyDispatcher, fixture.request);
  assert.equal(result.statusCode, fixture.expect.statusCode, "policy status mismatch");
  assert.equal(result.json?.verdict, fixture.expect.verdict, "policy verdict mismatch");
  assert.equal(result.json?.code, fixture.expect.code, "policy code mismatch");
  assertLineage(result.json, "policy_v1");
  assert.equal(result.json?.rulebook_result?.engine, "decide_rulebook_v1", "refund policy should use Rulebook v1");
  assert.equal(
    result.json?.rulebook_result?.application_verdict,
    fixture.expect.verdict,
    "refund policy Rulebook v1 application verdict mismatch"
  );
  assert.equal(
    result.json?.rulebook_result?.reason_code,
    fixture.expect.code,
    "refund policy Rulebook v1 reason code mismatch"
  );
  assert.equal(
    result.json?.rulebook_result?.matched_rule_id,
    "allow_within_refund_window",
    "refund policy Rulebook v1 matched rule mismatch"
  );
  assert.equal(result.json?.rulebook_result?.trusted_adapter, undefined, "refund policy should not use a trusted adapter");
  assertRulebookAttestation(result.json?.rulebook_result, "refund policy Rulebook v1");
  assert.equal(
    result.json?.decision_record_material,
    undefined,
    "legacy policy responses must not expose internal Decision Record material"
  );
}

async function testPolicyDecisionRecordMaterialFixture() {
  const fixture = loadFixture("policy-refund-v1.json");
  const result = await invokeJson(v1PolicyDispatcher, {
    ...fixture.request,
    headers: {
      ...(fixture.request.headers || {}),
      "x-decide-policy-record": "1",
    },
  });

  assert.equal(result.statusCode, 200, "policy Decision Record material status mismatch");
  assert.equal(
    result.json?.decision_record_material?.schema_version,
    "direct_rulebook_decision_material_v1",
    "policy Decision Record material schema mismatch"
  );
  assert.equal(
    result.json?.decision_record_material?.request?.mode,
    "rulebook",
    "policy Decision Record material must replay through rulebook mode"
  );
  assert.equal(
    result.json?.decision_record_material?.request?.rulebook?.rulebook_id,
    "refund_policy_notary",
    "policy Decision Record material rulebook mismatch"
  );
  assert.equal(
    result.json?.decision_record_material?.request?.context?.inputs?.vendor,
    "adobe",
    "policy Decision Record material must preserve normalized facts"
  );
  assert.equal(
    sha256(canonicalJson(result.json?.decision_record_material?.request?.context?.inputs || {})),
    result.json?.rulebook_result?.input_hash,
    "policy Decision Record material facts must match the evaluated input hash"
  );
}

async function testRefundPolicyRulebookOutcomes() {
  const cases = [
    {
      label: "vendor without refunds",
      body: { vendor: "netflix", days_since_purchase: 1, region: "US", plan: "individual" },
      verdict: "DENIED",
      code: "NO_REFUNDS",
      matchedRuleId: "deny_vendor_without_refunds",
    },
    {
      label: "outside refund window",
      body: {
        vendor: "adobe",
        days_since_purchase: 15,
        region: "US",
        plan: "individual",
        qualifying_conditions_met: true,
      },
      verdict: "DENIED",
      code: "OUTSIDE_WINDOW",
      matchedRuleId: null,
    },
    {
      label: "unsupported vendor",
      body: { vendor: "unknown_vendor", days_since_purchase: 1, region: "US", plan: "individual" },
      verdict: "UNKNOWN",
      code: "UNSUPPORTED_VENDOR",
      matchedRuleId: "review_unsupported_vendor",
    },
    {
      label: "unsupported region",
      body: { vendor: "adobe", days_since_purchase: 1, region: "SE", plan: "individual" },
      verdict: "UNKNOWN",
      code: "NON_US_REGION",
      matchedRuleId: "review_unsupported_region",
    },
  ];

  for (const testCase of cases) {
    const result = await invokeJson(v1PolicyDispatcher, {
      method: "POST",
      url: "/api/v1/refund/eligibility",
      query: { policy: "refund", action: "eligibility" },
      headers: { "content-type": "application/json", "user-agent": "contract-test" },
      body: testCase.body,
    });
    assert.equal(result.statusCode, 200, `${testCase.label}: policy status mismatch`);
    assert.equal(result.json?.verdict, testCase.verdict, `${testCase.label}: legacy verdict mismatch`);
    assert.equal(result.json?.code, testCase.code, `${testCase.label}: legacy reason code mismatch`);
    assert.equal(
      result.json?.rulebook_result?.application_verdict,
      testCase.verdict,
      `${testCase.label}: Rulebook v1 application verdict mismatch`
    );
    assert.equal(
      result.json?.rulebook_result?.reason_code,
      testCase.code,
      `${testCase.label}: Rulebook v1 reason code mismatch`
    );
    assert.equal(
      result.json?.rulebook_result?.matched_rule_id,
      testCase.matchedRuleId,
      `${testCase.label}: Rulebook v1 matched rule mismatch`
    );
    assertRulebookAttestation(result.json?.rulebook_result, `${testCase.label} Rulebook v1`);
  }
}

async function testRefundPolicyRulebookBindsEvidenceIdentity() {
  const evaluate = async (vendor) =>
    invokeJson(v1PolicyDispatcher, {
      method: "POST",
      url: "/api/v1/refund/eligibility",
      query: { policy: "refund", action: "eligibility" },
      headers: { "content-type": "application/json", "user-agent": "contract-test" },
      body: { vendor, days_since_purchase: 5, region: "US", plan: "individual" },
    });

  const netflix = await evaluate("netflix");
  const hulu = await evaluate("hulu");
  assert.equal(netflix.json?.window_days, hulu.json?.window_days, "evidence-binding comparison requires equal windows");
  assert.equal(
    netflix.json?.rulebook_result?.rulebook?.hash,
    hulu.json?.rulebook_result?.rulebook?.hash,
    "refund applications should share one declarative rulebook"
  );
  assert.notEqual(
    netflix.json?.rulebook_result?.input_hash,
    hulu.json?.rulebook_result?.input_hash,
    "rulebook input hash must bind vendor and policy-source identity"
  );
}

async function testRefundPolicyRulebookSignsAttestation() {
  const signing = generateSigningEnv("refund-policy-contract-key");
  const previousRequired = process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
  const previousPrivateKey = process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
  const previousKeyId = process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID;
  process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = "true";
  process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = signing.privateKeyPem;
  process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID = signing.keyId;

  try {
    const result = await invokeJson(v1PolicyDispatcher, {
      method: "POST",
      url: "/api/v1/refund/eligibility",
      query: { policy: "refund", action: "eligibility" },
      headers: { "content-type": "application/json", "user-agent": "contract-test" },
      body: {
        vendor: "adobe",
        days_since_purchase: 5,
        region: "US",
        plan: "individual",
        qualifying_conditions_met: true,
      },
    });
    const attestation = result.json?.rulebook_result?.rulebook_attestation;
    assert.equal(result.statusCode, 200, "signed refund policy status mismatch");
    assert.equal(attestation?.signature?.status, "signed", "refund policy attestation should be signed");
    assert.equal(attestation?.signature?.key_id, signing.keyId, "refund policy signing key id mismatch");
    assert.equal(
      verifySignature({
        publicKeyPem: signing.publicKeyPem,
        bundleHash: attestation?.bundle_hash,
        signature: attestation?.signature?.signature,
      }),
      true,
      "refund policy attestation signature should verify"
    );
  } finally {
    if (previousRequired === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = previousRequired;
    if (previousPrivateKey === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = previousPrivateKey;
    if (previousKeyId === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID = previousKeyId;
  }
}

async function testRefundPolicyRulebookRequiresSignedAttestation() {
  const previousRequired = process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
  const previousPrivateKey = process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
  process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = "true";
  process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = "";

  try {
    const result = await invokeJson(v1PolicyDispatcher, {
      method: "POST",
      url: "/api/v1/refund/eligibility",
      query: { policy: "refund", action: "eligibility" },
      headers: { "content-type": "application/json", "user-agent": "contract-test" },
      body: {
        vendor: "adobe",
        days_since_purchase: 5,
        region: "US",
        plan: "individual",
        qualifying_conditions_met: true,
      },
    });
    assert.equal(result.statusCode, 503, "refund policy must fail closed when a required signature is unavailable");
    assert.equal(
      result.json?.error,
      "RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED",
      "refund policy required-signature error mismatch"
    );
  } finally {
    if (previousRequired === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = previousRequired;
    if (previousPrivateKey === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = previousPrivateKey;
  }
}

async function testTrialPolicyRulebookFixture() {
  const result = await invokeJson(v1PolicyDispatcher, {
    method: "POST",
    url: "/api/v1/trial/terms",
    query: { policy: "trial", action: "terms" },
    headers: { "content-type": "application/json", "user-agent": "contract-test" },
    body: {
      vendor: "adobe",
      region: "US",
      plan: "individual",
      offer_confirmed: true,
      observed_trial_days: 7,
      observed_card_required: true,
      observed_auto_converts: true,
    },
  });
  assert.equal(result.statusCode, 200, "trial policy status mismatch");
  assert.equal(result.json?.verdict, "TRIAL_AVAILABLE", "trial policy legacy verdict mismatch");
  assert.equal(result.json?.code, "AUTO_CONVERTS", "trial policy legacy reason code mismatch");
  assertLineage(result.json, "trial_policy_v1");
  assert.equal(result.json?.rulebook_result?.engine, "decide_rulebook_v1", "trial policy should use Rulebook v1");
  assert.equal(
    result.json?.rulebook_result?.rulebook?.id,
    "trial_policy_notary",
    "trial policy should use the trial policy rulebook"
  );
  assert.equal(
    result.json?.rulebook_result?.application_verdict,
    "TRIAL_AVAILABLE",
    "trial policy Rulebook v1 application verdict mismatch"
  );
  assert.equal(
    result.json?.rulebook_result?.reason_code,
    "AUTO_CONVERTS",
    "trial policy Rulebook v1 reason code mismatch"
  );
  assert.equal(
    result.json?.rulebook_result?.matched_rule_id,
    "allow_trial_with_auto_conversion",
    "trial policy Rulebook v1 matched rule mismatch"
  );
  assert.equal(result.json?.rulebook_result?.trusted_adapter, undefined, "trial policy should not use a trusted adapter");
  assertRulebookAttestation(result.json?.rulebook_result, "trial policy Rulebook v1");
}

async function testTrialPolicyRulebookOutcomes() {
  const cases = [
    {
      label: "vendor without trial",
      body: { vendor: "netflix", region: "US", plan: "individual", offer_confirmed: false },
      verdict: "NO_TRIAL",
      code: "TRIAL_NOT_AVAILABLE",
      matchedRuleId: "deny_no_trial",
    },
    {
      label: "trial without auto conversion",
      body: {
        vendor: "1password",
        region: "US",
        plan: "individual",
        offer_confirmed: true,
        observed_trial_days: 14,
        observed_card_required: false,
        observed_auto_converts: false,
      },
      verdict: "TRIAL_AVAILABLE",
      code: "NO_AUTO_CONVERT",
      matchedRuleId: "allow_trial_without_auto_conversion",
    },
    {
      label: "unsupported vendor",
      body: { vendor: "unknown_vendor", region: "US", plan: "individual" },
      verdict: "UNKNOWN",
      code: "UNSUPPORTED_VENDOR",
      matchedRuleId: "review_unsupported_vendor",
    },
    {
      label: "unsupported region",
      body: { vendor: "adobe", region: "SE", plan: "individual" },
      verdict: "UNKNOWN",
      code: "NON_US_REGION",
      matchedRuleId: "review_unsupported_region",
    },
  ];

  for (const testCase of cases) {
    const result = await invokeJson(v1PolicyDispatcher, {
      method: "POST",
      url: "/api/v1/trial/terms",
      query: { policy: "trial", action: "terms" },
      headers: { "content-type": "application/json", "user-agent": "contract-test" },
      body: testCase.body,
    });
    assert.equal(result.statusCode, 200, `${testCase.label}: policy status mismatch`);
    assert.equal(result.json?.verdict, testCase.verdict, `${testCase.label}: legacy verdict mismatch`);
    assert.equal(result.json?.code, testCase.code, `${testCase.label}: legacy reason code mismatch`);
    assert.equal(
      result.json?.rulebook_result?.application_verdict,
      testCase.verdict,
      `${testCase.label}: Rulebook v1 application verdict mismatch`
    );
    assert.equal(
      result.json?.rulebook_result?.reason_code,
      testCase.code,
      `${testCase.label}: Rulebook v1 reason code mismatch`
    );
    assert.equal(
      result.json?.rulebook_result?.matched_rule_id,
      testCase.matchedRuleId,
      `${testCase.label}: Rulebook v1 matched rule mismatch`
    );
    assertRulebookAttestation(result.json?.rulebook_result, `${testCase.label} Rulebook v1`);
  }
}

async function testTrialPolicyRulebookBindsEvidenceIdentity() {
  const evaluate = async (vendor) =>
    invokeJson(v1PolicyDispatcher, {
      method: "POST",
      url: "/api/v1/trial/terms",
      query: { policy: "trial", action: "terms" },
      headers: { "content-type": "application/json", "user-agent": "contract-test" },
      body: {
        vendor,
        region: "US",
        plan: "individual",
        offer_confirmed: true,
        observed_trial_days: 7,
        observed_card_required: true,
        observed_auto_converts: true,
      },
    });

  const adobe = await evaluate("adobe");
  const crunchyroll = await evaluate("crunchyroll");
  assert.equal(adobe.json?.trial_days, crunchyroll.json?.trial_days, "evidence-binding comparison requires equal trial days");
  assert.equal(adobe.json?.auto_converts, crunchyroll.json?.auto_converts, "evidence-binding comparison requires equal auto conversion");
  assert.equal(
    adobe.json?.rulebook_result?.rulebook?.hash,
    crunchyroll.json?.rulebook_result?.rulebook?.hash,
    "trial applications should share one declarative rulebook"
  );
  assert.notEqual(
    adobe.json?.rulebook_result?.input_hash,
    crunchyroll.json?.rulebook_result?.input_hash,
    "trial rulebook input hash must bind vendor and policy-source identity"
  );
}

async function testTrialPolicyRulebookSignsAttestation() {
  const signing = generateSigningEnv("trial-policy-contract-key");
  const previousRequired = process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
  const previousPrivateKey = process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
  const previousKeyId = process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID;
  process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = "true";
  process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = signing.privateKeyPem;
  process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID = signing.keyId;

  try {
    const result = await invokeJson(v1PolicyDispatcher, {
      method: "POST",
      url: "/api/v1/trial/terms",
      query: { policy: "trial", action: "terms" },
      headers: { "content-type": "application/json", "user-agent": "contract-test" },
      body: {
        vendor: "adobe",
        region: "US",
        plan: "individual",
        offer_confirmed: true,
        observed_trial_days: 7,
        observed_card_required: true,
        observed_auto_converts: true,
      },
    });
    const attestation = result.json?.rulebook_result?.rulebook_attestation;
    assert.equal(result.statusCode, 200, "signed trial policy status mismatch");
    assert.equal(attestation?.signature?.status, "signed", "trial policy attestation should be signed");
    assert.equal(attestation?.signature?.key_id, signing.keyId, "trial policy signing key id mismatch");
    assert.equal(
      verifySignature({
        publicKeyPem: signing.publicKeyPem,
        bundleHash: attestation?.bundle_hash,
        signature: attestation?.signature?.signature,
      }),
      true,
      "trial policy attestation signature should verify"
    );
  } finally {
    if (previousRequired === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = previousRequired;
    if (previousPrivateKey === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = previousPrivateKey;
    if (previousKeyId === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID = previousKeyId;
  }
}

async function testTrialPolicyRulebookRequiresSignedAttestation() {
  const previousRequired = process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
  const previousPrivateKey = process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
  process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = "true";
  process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = "";

  try {
    const result = await invokeJson(v1PolicyDispatcher, {
      method: "POST",
      url: "/api/v1/trial/terms",
      query: { policy: "trial", action: "terms" },
      headers: { "content-type": "application/json", "user-agent": "contract-test" },
      body: {
        vendor: "adobe",
        region: "US",
        plan: "individual",
        offer_confirmed: true,
        observed_trial_days: 7,
        observed_card_required: true,
        observed_auto_converts: true,
      },
    });
    assert.equal(result.statusCode, 503, "trial policy must fail closed when a required signature is unavailable");
    assert.equal(
      result.json?.error,
      "RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED",
      "trial policy required-signature error mismatch"
    );
  } finally {
    if (previousRequired === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = previousRequired;
    if (previousPrivateKey === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = previousPrivateKey;
  }
}

async function testCancelPolicyRulebookFixture() {
  const result = await invokeJson(v1PolicyDispatcher, {
    method: "POST",
    url: "/api/v1/cancel/penalty",
    query: { policy: "cancel", action: "penalty" },
    headers: { "content-type": "application/json", "user-agent": "contract-test" },
    body: { vendor: "adobe", region: "US", plan: "individual", billing_cadence: "annual" },
  });
  assert.equal(result.statusCode, 200, "cancel policy status mismatch");
  assert.equal(result.json?.verdict, "PENALTY", "cancel policy legacy verdict mismatch");
  assert.equal(result.json?.code, "EARLY_TERMINATION_FEE", "cancel policy legacy reason code mismatch");
  assertLineage(result.json, "cancel_policy_v1");
  assert.equal(result.json?.rulebook_result?.engine, "decide_rulebook_v1", "cancel policy should use Rulebook v1");
  assert.equal(
    result.json?.rulebook_result?.rulebook?.id,
    "cancel_policy_notary",
    "cancel policy should use the cancel policy rulebook"
  );
  assert.equal(
    result.json?.rulebook_result?.application_verdict,
    "PENALTY",
    "cancel policy Rulebook v1 application verdict mismatch"
  );
  assert.equal(
    result.json?.rulebook_result?.reason_code,
    "EARLY_TERMINATION_FEE",
    "cancel policy Rulebook v1 reason code mismatch"
  );
  assert.equal(
    result.json?.rulebook_result?.matched_rule_id,
    "penalty_early_termination_fee",
    "cancel policy Rulebook v1 matched rule mismatch"
  );
  assert.equal(result.json?.rulebook_result?.trusted_adapter, undefined, "cancel policy should not use a trusted adapter");
  assertRulebookAttestation(result.json?.rulebook_result, "cancel policy Rulebook v1");
}

async function testCancelPolicyRulebookOutcomes() {
  const cases = [
    {
      label: "free cancellation",
      body: { vendor: "netflix", region: "US", plan: "individual" },
      verdict: "FREE_CANCEL",
      code: "NO_PENALTY",
      matchedRuleId: "allow_free_cancel",
    },
    {
      label: "early termination fee",
      body: { vendor: "adobe", region: "US", plan: "individual", billing_cadence: "annual" },
      verdict: "PENALTY",
      code: "EARLY_TERMINATION_FEE",
      matchedRuleId: "penalty_early_termination_fee",
    },
    {
      label: "unsupported vendor",
      body: { vendor: "unknown_vendor", region: "US", plan: "individual" },
      verdict: "UNKNOWN",
      code: "UNSUPPORTED_VENDOR",
      matchedRuleId: "review_unsupported_vendor",
    },
    {
      label: "unsupported region",
      body: { vendor: "adobe", region: "SE", plan: "individual" },
      verdict: "UNKNOWN",
      code: "NON_US_REGION",
      matchedRuleId: "review_unsupported_region",
    },
  ];

  for (const testCase of cases) {
    const result = await invokeJson(v1PolicyDispatcher, {
      method: "POST",
      url: "/api/v1/cancel/penalty",
      query: { policy: "cancel", action: "penalty" },
      headers: { "content-type": "application/json", "user-agent": "contract-test" },
      body: testCase.body,
    });
    assert.equal(result.statusCode, 200, `${testCase.label}: policy status mismatch`);
    assert.equal(result.json?.verdict, testCase.verdict, `${testCase.label}: legacy verdict mismatch`);
    assert.equal(result.json?.code, testCase.code, `${testCase.label}: legacy reason code mismatch`);
    assert.equal(
      result.json?.rulebook_result?.application_verdict,
      testCase.verdict,
      `${testCase.label}: Rulebook v1 application verdict mismatch`
    );
    assert.equal(
      result.json?.rulebook_result?.reason_code,
      testCase.code,
      `${testCase.label}: Rulebook v1 reason code mismatch`
    );
    assert.equal(
      result.json?.rulebook_result?.matched_rule_id,
      testCase.matchedRuleId,
      `${testCase.label}: Rulebook v1 matched rule mismatch`
    );
    assertRulebookAttestation(result.json?.rulebook_result, `${testCase.label} Rulebook v1`);
  }
}

async function testCancelPolicyRulebookBindsEvidenceIdentity() {
  const evaluate = async (vendor) =>
    invokeJson(v1PolicyDispatcher, {
      method: "POST",
      url: "/api/v1/cancel/penalty",
      query: { policy: "cancel", action: "penalty" },
      headers: { "content-type": "application/json", "user-agent": "contract-test" },
      body: { vendor, region: "US", plan: "individual" },
    });

  const netflix = await evaluate("netflix");
  const hulu = await evaluate("hulu");
  assert.equal(netflix.json?.policy, hulu.json?.policy, "evidence-binding comparison requires equal policy enum");
  assert.equal(netflix.json?.notice_days, hulu.json?.notice_days, "evidence-binding comparison requires equal notice days");
  assert.equal(
    netflix.json?.rulebook_result?.rulebook?.hash,
    hulu.json?.rulebook_result?.rulebook?.hash,
    "cancel applications should share one declarative rulebook"
  );
  assert.notEqual(
    netflix.json?.rulebook_result?.input_hash,
    hulu.json?.rulebook_result?.input_hash,
    "cancel rulebook input hash must bind vendor and policy-source identity"
  );
}

async function testCancelPolicyRulebookSignsAttestation() {
  const signing = generateSigningEnv("cancel-policy-contract-key");
  const previousRequired = process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
  const previousPrivateKey = process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
  const previousKeyId = process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID;
  process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = "true";
  process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = signing.privateKeyPem;
  process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID = signing.keyId;

  try {
    const result = await invokeJson(v1PolicyDispatcher, {
      method: "POST",
      url: "/api/v1/cancel/penalty",
      query: { policy: "cancel", action: "penalty" },
      headers: { "content-type": "application/json", "user-agent": "contract-test" },
      body: { vendor: "adobe", region: "US", plan: "individual", billing_cadence: "annual" },
    });
    const attestation = result.json?.rulebook_result?.rulebook_attestation;
    assert.equal(result.statusCode, 200, "signed cancel policy status mismatch");
    assert.equal(attestation?.signature?.status, "signed", "cancel policy attestation should be signed");
    assert.equal(attestation?.signature?.key_id, signing.keyId, "cancel policy signing key id mismatch");
    assert.equal(
      verifySignature({
        publicKeyPem: signing.publicKeyPem,
        bundleHash: attestation?.bundle_hash,
        signature: attestation?.signature?.signature,
      }),
      true,
      "cancel policy attestation signature should verify"
    );
  } finally {
    if (previousRequired === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = previousRequired;
    if (previousPrivateKey === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = previousPrivateKey;
    if (previousKeyId === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID = previousKeyId;
  }
}

async function testCancelPolicyRulebookRequiresSignedAttestation() {
  const previousRequired = process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
  const previousPrivateKey = process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
  process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = "true";
  process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = "";

  try {
    const result = await invokeJson(v1PolicyDispatcher, {
      method: "POST",
      url: "/api/v1/cancel/penalty",
      query: { policy: "cancel", action: "penalty" },
      headers: { "content-type": "application/json", "user-agent": "contract-test" },
      body: { vendor: "adobe", region: "US", plan: "individual", billing_cadence: "annual" },
    });
    assert.equal(result.statusCode, 503, "cancel policy must fail closed when a required signature is unavailable");
    assert.equal(
      result.json?.error,
      "RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED",
      "cancel policy required-signature error mismatch"
    );
  } finally {
    if (previousRequired === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = previousRequired;
    if (previousPrivateKey === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = previousPrivateKey;
  }
}

async function testReturnPolicyRulebookFixture() {
  const result = await invokeJson(v1PolicyDispatcher, {
    method: "POST",
    url: "/api/v1/return/eligibility",
    query: { policy: "return", action: "eligibility" },
    headers: { "content-type": "application/json", "user-agent": "contract-test" },
    body: {
      vendor: "adobe",
      days_since_purchase: 5,
      region: "US",
      plan: "individual",
      qualifying_conditions_met: true,
    },
  });
  assert.equal(result.statusCode, 200, "return policy status mismatch");
  assert.equal(result.json?.verdict, "RETURNABLE", "return policy legacy verdict mismatch");
  assert.equal(result.json?.code, "FULL_RETURN", "return policy legacy reason code mismatch");
  assertLineage(result.json, "return_policy_v1");
  assert.equal(result.json?.rulebook_result?.engine, "decide_rulebook_v1", "return policy should use Rulebook v1");
  assert.equal(
    result.json?.rulebook_result?.rulebook?.id,
    "return_policy_notary",
    "return policy should use the return policy rulebook"
  );
  assert.equal(
    result.json?.rulebook_result?.application_verdict,
    "RETURNABLE",
    "return policy Rulebook v1 application verdict mismatch"
  );
  assert.equal(
    result.json?.rulebook_result?.reason_code,
    "FULL_RETURN",
    "return policy Rulebook v1 reason code mismatch"
  );
  assert.equal(
    result.json?.rulebook_result?.matched_rule_id,
    "allow_full_return",
    "return policy Rulebook v1 matched rule mismatch"
  );
  assert.equal(result.json?.rulebook_result?.trusted_adapter, undefined, "return policy should not use a trusted adapter");
  assertRulebookAttestation(result.json?.rulebook_result, "return policy Rulebook v1");
}

async function testReturnPolicyRulebookOutcomes() {
  const cases = [
    {
      label: "full return",
      body: {
        vendor: "adobe",
        days_since_purchase: 5,
        region: "US",
        plan: "individual",
        qualifying_conditions_met: true,
      },
      verdict: "RETURNABLE",
      code: "FULL_RETURN",
      matchedRuleId: "allow_full_return",
    },
    {
      label: "approval-based return",
      body: { vendor: "playstation_plus", days_since_purchase: 5, region: "US", plan: "individual" },
      verdict: "UNKNOWN",
      code: "MISSING_REQUIRED_CONTEXT",
      matchedRuleId: "review_missing_context",
    },
    {
      label: "vendor without returns",
      body: { vendor: "netflix", days_since_purchase: 1, region: "US", plan: "individual" },
      verdict: "NON_RETURNABLE",
      code: "NO_RETURNS",
      matchedRuleId: "deny_no_returns",
    },
    {
      label: "expired return window",
      body: {
        vendor: "adobe",
        days_since_purchase: 30,
        region: "US",
        plan: "individual",
        qualifying_conditions_met: true,
      },
      verdict: "EXPIRED",
      code: "OUTSIDE_WINDOW",
      matchedRuleId: null,
    },
    {
      label: "unsupported vendor",
      body: { vendor: "unknown_vendor", days_since_purchase: 1, region: "US", plan: "individual" },
      verdict: "UNKNOWN",
      code: "UNSUPPORTED_VENDOR",
      matchedRuleId: "review_unsupported_vendor",
    },
    {
      label: "unsupported region",
      body: { vendor: "adobe", days_since_purchase: 1, region: "SE", plan: "individual" },
      verdict: "UNKNOWN",
      code: "NON_US_REGION",
      matchedRuleId: "review_unsupported_region",
    },
  ];

  for (const testCase of cases) {
    const result = await invokeJson(v1PolicyDispatcher, {
      method: "POST",
      url: "/api/v1/return/eligibility",
      query: { policy: "return", action: "eligibility" },
      headers: { "content-type": "application/json", "user-agent": "contract-test" },
      body: testCase.body,
    });
    assert.equal(result.statusCode, 200, `${testCase.label}: policy status mismatch`);
    assert.equal(result.json?.verdict, testCase.verdict, `${testCase.label}: legacy verdict mismatch`);
    assert.equal(result.json?.code, testCase.code, `${testCase.label}: legacy reason code mismatch`);
    assert.equal(
      result.json?.rulebook_result?.application_verdict,
      testCase.verdict,
      `${testCase.label}: Rulebook v1 application verdict mismatch`
    );
    assert.equal(
      result.json?.rulebook_result?.reason_code,
      testCase.code,
      `${testCase.label}: Rulebook v1 reason code mismatch`
    );
    assert.equal(
      result.json?.rulebook_result?.matched_rule_id,
      testCase.matchedRuleId,
      `${testCase.label}: Rulebook v1 matched rule mismatch`
    );
    assertRulebookAttestation(result.json?.rulebook_result, `${testCase.label} Rulebook v1`);
  }
}

async function testReturnPolicyRulebookBindsEvidenceIdentity() {
  const evaluate = async (vendor) =>
    invokeJson(v1PolicyDispatcher, {
      method: "POST",
      url: "/api/v1/return/eligibility",
      query: { policy: "return", action: "eligibility" },
      headers: { "content-type": "application/json", "user-agent": "contract-test" },
      body: { vendor, days_since_purchase: 5, region: "US", plan: "individual" },
    });

  const netflix = await evaluate("netflix");
  const hulu = await evaluate("hulu");
  assert.equal(netflix.json?.return_window_days, hulu.json?.return_window_days, "evidence-binding comparison requires equal return windows");
  assert.equal(netflix.json?.return_type, hulu.json?.return_type, "evidence-binding comparison requires equal return type");
  assert.equal(
    netflix.json?.rulebook_result?.rulebook?.hash,
    hulu.json?.rulebook_result?.rulebook?.hash,
    "return applications should share one declarative rulebook"
  );
  assert.notEqual(
    netflix.json?.rulebook_result?.input_hash,
    hulu.json?.rulebook_result?.input_hash,
    "return rulebook input hash must bind vendor and policy-source identity"
  );
}

async function testReturnPolicyRulebookSignsAttestation() {
  const signing = generateSigningEnv("return-policy-contract-key");
  const previousRequired = process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
  const previousPrivateKey = process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
  const previousKeyId = process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID;
  process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = "true";
  process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = signing.privateKeyPem;
  process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID = signing.keyId;

  try {
    const result = await invokeJson(v1PolicyDispatcher, {
      method: "POST",
      url: "/api/v1/return/eligibility",
      query: { policy: "return", action: "eligibility" },
      headers: { "content-type": "application/json", "user-agent": "contract-test" },
      body: {
        vendor: "adobe",
        days_since_purchase: 5,
        region: "US",
        plan: "individual",
        qualifying_conditions_met: true,
      },
    });
    const attestation = result.json?.rulebook_result?.rulebook_attestation;
    assert.equal(result.statusCode, 200, "signed return policy status mismatch");
    assert.equal(attestation?.signature?.status, "signed", "return policy attestation should be signed");
    assert.equal(attestation?.signature?.key_id, signing.keyId, "return policy signing key id mismatch");
    assert.equal(
      verifySignature({
        publicKeyPem: signing.publicKeyPem,
        bundleHash: attestation?.bundle_hash,
        signature: attestation?.signature?.signature,
      }),
      true,
      "return policy attestation signature should verify"
    );
  } finally {
    if (previousRequired === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = previousRequired;
    if (previousPrivateKey === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = previousPrivateKey;
    if (previousKeyId === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_KEY_ID = previousKeyId;
  }
}

async function testReturnPolicyRulebookRequiresSignedAttestation() {
  const previousRequired = process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
  const previousPrivateKey = process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
  process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = "true";
  process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = "";

  try {
    const result = await invokeJson(v1PolicyDispatcher, {
      method: "POST",
      url: "/api/v1/return/eligibility",
      query: { policy: "return", action: "eligibility" },
      headers: { "content-type": "application/json", "user-agent": "contract-test" },
      body: {
        vendor: "adobe",
        days_since_purchase: 5,
        region: "US",
        plan: "individual",
        qualifying_conditions_met: true,
      },
    });
    assert.equal(result.statusCode, 503, "return policy must fail closed when a required signature is unavailable");
    assert.equal(
      result.json?.error,
      "RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED",
      "return policy required-signature error mismatch"
    );
  } finally {
    if (previousRequired === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED = previousRequired;
    if (previousPrivateKey === undefined) delete process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM;
    else process.env.DECIDE_RULEBOOK_ATTESTATION_PRIVATE_KEY_PEM = previousPrivateKey;
  }
}

async function testWorkflowFixture() {
  const fixture = loadFixture("workflow-zendesk-refund.json");
  const previousProxyToken = process.env.DECIDE_PROXY_SHARED_TOKEN;
  const previousVercelEnv = process.env.VERCEL_ENV;
  const previousWorkflowToken = process.env.WORKFLOW_API_TOKEN;
  const previousWorkflowTestMode = process.env.WORKFLOW_TEST_MODE;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.DECIDE_PROXY_SHARED_TOKEN = "workflow-shared-proxy-token";
  process.env.VERCEL_ENV = "production";
  process.env.WORKFLOW_API_TOKEN = "workflow-contract-token";
  process.env.WORKFLOW_TEST_MODE = "1";
  process.env.NODE_ENV = "test";

  try {
    const unauthorized = await invokeJson(zendeskWorkflowDispatcher, fixture.request);
    assert.equal(unauthorized.statusCode, 401, "production workflow must require an authorized caller");
    assert.equal(unauthorized.json?.error, "WORKFLOW_UNAUTHORIZED", "workflow auth error mismatch");

    const request = {
      ...fixture.request,
      headers: {
        ...(fixture.request.headers || {}),
        authorization: "Bearer workflow-contract-token",
      },
    };
    const first = await invokeJson(zendeskWorkflowDispatcher, request);
    assert.equal(first.statusCode, fixture.expect.statusCode, "workflow status mismatch");
    assert.equal(first.json?.ok, fixture.expect.ok, "workflow ok mismatch");
    assert.equal(first.json?.flow, fixture.expect.flow, "workflow flow mismatch");
    assert.equal(first.json?.decision?.c, fixture.expect.decision, "workflow decision mismatch");
    assert.equal(first.json?.action?.type, fixture.expect.action, "workflow action mismatch");
    assert.equal(first.json?.policy?.verdict, fixture.expect.policy_verdict, "workflow policy verdict mismatch");
    assert.equal(first.json?.workflow_contract?.execution_allowed, false, "workflow must not authorize execution directly");
    assert.equal(first.json?.decision?.decision_contract?.authority, "test_fixture", "workflow fixture contract mismatch");
    assertLineage(first.json, "workflow");
    assertLineage(first.json?.policy || {}, "workflow.policy");

    const second = await invokeJson(zendeskWorkflowDispatcher, request);
    assert.equal(second.statusCode, fixture.expect.statusCode, "workflow replay status mismatch");
    assert.equal(second.json?.idempotent_replay, true, "workflow idempotent replay expected");
  } finally {
    if (previousProxyToken === undefined) delete process.env.DECIDE_PROXY_SHARED_TOKEN;
    else process.env.DECIDE_PROXY_SHARED_TOKEN = previousProxyToken;
    if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousVercelEnv;
    if (previousWorkflowToken === undefined) delete process.env.WORKFLOW_API_TOKEN;
    else process.env.WORKFLOW_API_TOKEN = previousWorkflowToken;
    if (previousWorkflowTestMode === undefined) delete process.env.WORKFLOW_TEST_MODE;
    else process.env.WORKFLOW_TEST_MODE = previousWorkflowTestMode;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
}

async function testUcpVendorEnumConsistency() {
  const rules = loadJsonFromRepo("rules", "v1_us_individual.json");
  const ucp = loadJsonFromRepo("public", ".well-known", "ucp.json");

  const expectedVendors = Object.keys(rules?.vendors || {}).sort((a, b) => a.localeCompare(b));
  assert.ok(expectedVendors.length > 0, "rules vendor list should not be empty");

  for (const service of ucp?.services || []) {
    const actual = Array.isArray(service?.inputs?.vendor?.enum)
      ? [...service.inputs.vendor.enum].sort((a, b) => a.localeCompare(b))
      : null;

    assert.ok(actual, `${service?.name || "unknown service"} is missing inputs.vendor.enum`);
    assert.deepEqual(
      actual,
      expectedVendors,
      `${service?.name || "unknown service"} vendor enum drifted from rules/v1_us_individual.json`
    );
  }
}

function testRulebookRuntimeManifest() {
  const manifestPath = join(__dirname, "..", "public", "manifests", "rulebook-runtime-v1.json");
  const schemaPath = join(__dirname, "..", "public", "schemas", "rulebook-v1.schema.json");
  const manifestUrl = "https://api.decide.fyi/manifests/rulebook-runtime-v1.json";
  assert.ok(existsSync(manifestPath), "public Rulebook runtime manifest is missing");

  const manifest = loadJsonFromRepo("public", "manifests", "rulebook-runtime-v1.json");
  const schemaText = readFileSync(schemaPath, "utf8");
  const schema = JSON.parse(schemaText);
  const conformance = loadPublicRulebookConformanceFixture("index.json");
  const replay = loadJsonFromRepo("public", "replay", "rulebook-v1", "index.json");

  assert.deepEqual(manifest, buildRulebookRuntimeManifest(), "published runtime manifest is stale");
  assert.equal(manifest.manifest_version, "rulebook_runtime_manifest_v1", "runtime manifest version mismatch");
  assert.equal(manifest.manifest_url, manifestUrl, "runtime manifest URL mismatch");
  assert.deepEqual(
    manifest.rulebook_contract,
    {
      schema_version: schema.properties?.schema_version?.const,
      schema_url: schema.$id,
      schema_hash: sha256(schemaText),
      evaluator_version: schema["x-decide-evaluator-version"],
    },
    "runtime manifest must bind the active Rulebook contract"
  );
  assert.deepEqual(
    manifest.execution_model,
    {
      production_core: "hybrid_declarative_rulebook_with_trusted_adapters",
      binding_verdict_selector: "declarative_rulebook",
      customer_supplied_code: "rejected",
      trusted_adapters: "registered_fact_producers",
      response_only_material_policy: {
        status: "rejected_on_request",
        applies_to: ["request_body", "context.inputs", "adapter_facts"],
        fields: [...RULEBOOK_OUTPUT_MATERIAL_FIELDS],
        error: "RULEBOOK_OUTPUT_MATERIAL_FORBIDDEN",
      },
      binding_modes: [
        {
          mode: "direct_declarative_rulebook",
          status: "supported",
          request_material: ["rulebook", "context.inputs"],
          fact_source: "caller_supplied_inputs",
          verdict_authority: "declarative_rulebook",
          customer_supplied_code: "rejected",
        },
        {
          mode: "trusted_adapter_facts_then_declarative_rulebook",
          status: "supported",
          request_material: ["adapter", "rulebook"],
          fact_source: "registered_first_party_adapter",
          adapter_authority: "facts_only",
          verdict_authority: "declarative_rulebook",
          customer_supplied_code: "rejected",
        },
      ],
      unsupported_modes: [
        {
          mode: "customer_executable_rulebook",
          status: "rejected",
          reason: "Rulebook v1 is closed declarative JSON; executable policy logic requires a future versioned contract.",
        },
      ],
    },
    "runtime manifest must publish the production execution boundary"
  );
  assert.deepEqual(
    manifest.advisory_response_contract,
    buildAdvisoryResponseContractManifest(),
    "runtime manifest must publish the advisory response boundary"
  );
  assert.deepEqual(
    manifest.conformance,
    {
      index_url: "https://api.decide.fyi/conformance/rulebook-v1/index.json",
      version: conformance.conformance_version,
    },
    "runtime manifest conformance reference mismatch"
  );
  assert.deepEqual(
    manifest.replay,
    {
      index_url: "https://api.decide.fyi/replay/rulebook-v1/index.json",
      corpus_version: replay.corpus_version,
      contract: replay.replay_contract,
    },
    "runtime manifest replay reference mismatch"
  );
  assert.deepEqual(
    manifest.application_binding,
    {
      contract_version: "decide_application_binding_v1",
      applies_to: "krafthaus_workflow_applications",
      must_bind_before_action: true,
      accepted_fact_sources: ["context.inputs", "adapter_facts"],
      required_decision_material: [
        "rulebook_contract",
        "runtime_binding",
        "verdict",
        "application_verdict",
        "action",
        "reason_code",
        "matched_rule_id",
        "rulebook.hash",
        "input_hash",
        "rulebook_attestation.bundle_hash",
      ],
      replay_reference: "https://api.decide.fyi/replay/rulebook-v1/index.json",
      conformance_reference: "https://api.decide.fyi/conformance/rulebook-v1/index.json",
      prohibited_claims: [
        "llm_output_is_binding_production_verdict",
        "customer_executable_code_runs_as_rulebook_v1",
        "action_executes_before_decision_material_is_captured",
      ],
    },
    "runtime manifest must publish downstream application binding requirements"
  );

  const readme = readFileSync(join(__dirname, "..", "README.md"), "utf8");
  const applicationBindingDoc = readFileSync(
    join(__dirname, "..", "docs", "APPLICATION_BINDING_V1.md"),
    "utf8"
  );
  const packageJson = loadJsonFromRepo("package.json");
  const workflowFiles = new Map(
    [
      ["contract workflow", ["contract-policy-tests.yml"]],
      ["inventory freshness workflow", ["inventory-freshness.yml"]],
      ["daily policy check workflow", ["check-policies.yml"]],
    ].map(([label, parts]) => [
      label,
      readFileSync(join(__dirname, "..", ".github", "workflows", ...parts), "utf8"),
    ])
  );
  const contractWorkflow = workflowFiles.get("contract workflow");
  const dailyPolicyWorkflow = workflowFiles.get("daily policy check workflow");
  assert.ok(readme.includes(manifestUrl), "README must publish the Rulebook runtime manifest URL");
  assert.ok(
    readme.includes("hybrid_declarative_rulebook_with_trusted_adapters"),
    "README must name the production Rulebook runtime core"
  );
  assert.ok(readme.includes("decide_application_binding_v1"), "README must publish the application binding contract");
  assert.ok(
    readme.includes("production_binding_required"),
    "README must document advisory responses requiring Rulebook binding for production"
  );
  assert.ok(
    applicationBindingDoc.includes("decide_application_binding_v1"),
    "application binding doc must define the contract version"
  );
  assert.ok(
    applicationBindingDoc.includes("production_binding_required"),
    "application binding doc must document advisory responses requiring production binding"
  );
  assert.ok(
    applicationBindingDoc.includes("rulebook_attestation.bundle_hash"),
    "application binding doc must require attestation bundle hash capture"
  );
  assert.ok(
    applicationBindingDoc.includes("llm_output_is_binding_production_verdict"),
    "application binding doc must reject LLM-only production verdict claims"
  );
  assert.equal(
    packageJson.scripts?.["generate:rulebook-runtime-manifest"],
    "node scripts/generate-rulebook-runtime-manifest.js",
    "package scripts must expose the Rulebook runtime manifest generator"
  );
  for (const contractPath of ['"public/**"', '"docs/**"', '"README.md"']) {
    assert.ok(
      contractWorkflow.includes(contractPath),
      `contract workflow must run when ${contractPath} changes`
    );
  }
  assert.ok(
    contractWorkflow.includes("pull_request:"),
    "contract workflow must validate pull requests"
  );
  assert.equal(
    contractWorkflow.includes("- codex/**"),
    false,
    "contract workflow must not duplicate pull-request runs on codex branch pushes"
  );
  for (const [label, workflow] of workflowFiles.entries()) {
    assert.ok(
      workflow.includes("FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true"),
      `${label} must force JavaScript actions onto Node 24`
    );
    assert.ok(
      workflow.includes("actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6"),
      `${label} must pin the reviewed checkout v6 commit`
    );
    assert.ok(
      workflow.includes("actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6"),
      `${label} must pin the reviewed setup-node v6 commit`
    );
    assert.ok(workflow.includes('node-version: "24"'), `${label} must run tests on Node 24`);
    assert.equal(workflow.includes("actions/checkout@v"), false, `${label} must not use a mutable checkout tag`);
    assert.equal(workflow.includes("actions/setup-node@v"), false, `${label} must not use a mutable setup-node tag`);
    assert.equal(workflow.includes('node-version: "20"'), false, `${label} must not pin Node 20`);
  }
  assert.match(
    dailyPolicyWorkflow,
    /schedule:\s*\n(?:\s*#.*\n)*\s*- cron:\s*["']0 0 \* \* \*["']/,
    "daily policy workflow must run once per day"
  );
  assert.ok(
    dailyPolicyWorkflow.includes("workflow_dispatch:"),
    "daily policy workflow must remain manually runnable"
  );
  assert.ok(
    dailyPolicyWorkflow.includes('echo "checker_status=$status" >> "$GITHUB_OUTPUT"'),
    "daily policy workflow must publish the policy checker process status"
  );
  assert.ok(
    dailyPolicyWorkflow.includes("fetch_health_status=failed"),
    "daily policy workflow must never translate a crashed checker into healthy fetch status"
  );
  assert.ok(
    dailyPolicyWorkflow.includes("Fail workflow when policy checker crashes"),
    "daily policy workflow must fail after preserving crash evidence"
  );
  assert.ok(
    dailyPolicyWorkflow.includes('git checkout -f -B "${artifact_branch}" "origin/${base_branch}"'),
    "policy review branch must be rebuilt from the current base branch"
  );
  assert.ok(
    dailyPolicyWorkflow.includes('git push --force-with-lease origin "${artifact_branch}"'),
    "policy review branch refresh must use a lease-protected push"
  );
  assert.ok(
    dailyPolicyWorkflow.includes(
      "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4"
    ),
    "daily policy workflow must preserve a per-run review packet with the reviewed action commit"
  );
  assert.equal(
    dailyPolicyWorkflow.includes("actions/upload-artifact@v"),
    false,
    "daily policy workflow must not use a mutable upload-artifact tag"
  );
  assert.ok(
    dailyPolicyWorkflow.includes("Verify canonical policy alerts API") &&
      dailyPolicyWorkflow.includes("https://api.decide.fyi/api/policy-alerts"),
    "daily policy workflow must enforce the canonical policy alerts API bridge"
  );
}

function testMcpPublisherSupplyChain() {
  const workflow = readFileSync(
    join(__dirname, "..", ".github", "workflows", "publish-mcp-registry.yml"),
    "utf8"
  );

  assert.equal(
    workflow.includes("releases/latest"),
    false,
    "MCP publisher workflow must not execute an unpinned latest release"
  );
  assert.ok(
    workflow.includes("MCP_PUBLISHER_VERSION: v1.8.1"),
    "MCP publisher workflow must pin the reviewed publisher release"
  );
  assert.ok(
    workflow.includes("MCP_PUBLISHER_SHA256: a06c9096dcb9727c13555b6be26c7effa707b01f06a4c561ba7a3635443cf2cc"),
    "MCP publisher workflow must pin the Linux amd64 archive digest"
  );
  assert.ok(
    workflow.includes("cosign verify-blob") &&
      workflow.includes("--certificate-identity") &&
      workflow.includes("--certificate-oidc-issuer"),
    "MCP publisher workflow must verify the upstream Sigstore bundle and signer identity"
  );
  assert.ok(
    workflow.includes("sigstore/cosign-installer@6f9f17788090df1f26f669e9d70d6ae9567deba6"),
    "MCP publisher workflow must pin the cosign installer action"
  );
  assert.ok(
    workflow.includes("actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803"),
    "MCP publisher workflow must pin checkout to an immutable commit"
  );
  assert.ok(
    workflow.includes("actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38"),
    "MCP publisher workflow must pin setup-node to an immutable commit"
  );
  assert.ok(
    workflow.indexOf("cosign verify-blob") < workflow.indexOf("tar -xzf"),
    "MCP publisher archive must be verified before extraction"
  );
}

async function main() {
  const tests = [
    ["decide-single", testDecideSingleFixture],
    ["decide-multi-advisory-contract", testDecideMultiAdvisoryContract],
    ["decide-api-key", testDecideApiKeyFixture],
    ["decide-production-requires-trusted-edge", testDecideProductionRequiresTrustedEdge],
    ["decide-runtime", testDecideRuntimeFixture],
    ["decide-rulebook-v1", testDecideRulebookFixture],
    ["decide-rulebook-enforces-published-schema", testDecideRulebookEnforcesPublishedSchema],
    ["decide-rulebook-missing-input", testDecideRulebookMissingInput],
    ["decide-rulebook-attestation-signing", testDecideRulebookAttestationSigning],
    ["decide-rulebook-requires-signed-attestation", testDecideRulebookRequiresSignedAttestation],
    ["rulebook-attestation-key-history", testRulebookAttestationPublishesKeyHistory],
    ["rulebook-attestation-rejects-invalid-key-history", testRulebookAttestationRejectsInvalidKeyHistory],
    ["decide-rulebook-rejects-executable-operator", testDecideRulebookRejectsExecutableOperator],
    ["decide-rulebook-rejects-executable-payload-fields", testDecideRulebookRejectsExecutablePayloadFields],
    ["decide-rulebook-rejects-unsupported-binding-mode", testDecideRulebookRejectsUnsupportedBindingMode],
    ["decide-rulebook-rejects-binding-mode-shape-conflict", testDecideRulebookRejectsBindingModeShapeConflict],
    ["decide-rulebook-rejects-caller-supplied-decision-material", testDecideRulebookRejectsCallerSuppliedDecisionMaterial],
    ["decide-rulebook-rejects-caller-supplied-decision-material-in-inputs", testDecideRulebookRejectsCallerSuppliedDecisionMaterialInInputs],
    ["rulebook-core-rejects-unsupported-binding-mode", testRulebookCoreRejectsUnsupportedBindingMode],
    ["decide-trusted-adapter-v1", testDecideTrustedAdapterFixture],
    ["decide-decision-memo-readiness-adapter-v1", testDecideDecisionMemoReadinessAdapterFixture],
    ["decide-krafthaus-workflow-readiness-adapter-v1", testDecideKrafthausWorkflowReadinessAdapterFixture],
    ["trusted-adapter-version-locks", testTrustedAdapterVersionLocks],
    ["trusted-adapter-capability-audit", testTrustedAdapterCapabilityAudit],
    ["trusted-adapter-capability-runtime-enforcement", testTrustedAdapterCapabilityRuntimeEnforcement],
    ["trusted-adapter-cold-start-isolation", testTrustedAdapterColdStartIsolation],
    ["decide-trusted-adapter-manifest-drift", testDecideTrustedAdapterRejectsManifestDrift],
    ["decide-trusted-adapter-rejects-executable-payload-fields", testDecideTrustedAdapterRejectsExecutablePayloadFields],
    ["decide-trusted-adapter-rejects-executable-input-fields", testDecideTrustedAdapterRejectsExecutableInputFields],
    ["rulebook-v1-public-conformance-fixtures", testRulebookV1PublicConformanceFixtures],
    ["rulebook-v1-golden-replay-corpus", testRulebookV1GoldenReplayCorpus],
    ["krafthaus-workflow-binding-example", testKrafthausWorkflowBindingExample],
    ["rulebook-migration-dry-run-cli", testRulebookMigrationDryRunCli],
    ["rulebook-runtime-architecture-doc", testRulebookRuntimeArchitectureDoc],
    ["rulebook-runtime-manifest", testRulebookRuntimeManifest],
    ["mcp-publisher-supply-chain", testMcpPublisherSupplyChain],
    ["decide-gemini-disabled-by-default", testDecideGeminiDisabledByDefault],
    ["decide-gemini-disabled-preserves-deterministic-guards", testDecideGeminiDisabledPreservesDeterministicGuards],
    ["decide-gemini-disabled-runtime-lineage", testDecideGeminiDisabledRuntimeLineage],
    ["decide-gemini-paid-missing-key-fails-closed", testDecideGeminiPaidMissingKeyFailsClosed],
    ["decide-gemini-budget-missing-fails-closed", testDecideGeminiBudgetMissingFailsClosed],
    ["decide-gemini-budget-cap-fails-closed", testDecideGeminiBudgetCapFailsClosed],
    ["decide-gemini-paid-single-attempt", testDecideGeminiPaidSingleAttempt],
    ["decide-gemini-empty-text-single-attempt", testDecideGeminiEmptyTextSingleAttempt],
    ["decide-gemini-incomplete-finish-reason", testDecideGeminiIncompleteFinishReasonFailsClosed],
    ["decide-gemini-deadline", testDecideGeminiDeadline],
    ["decide-gemini-prompt-limit", testDecideGeminiPromptLimit],
    ["policy-v1-dispatch", testPolicyV1Fixture],
    ["policy-decision-record-material", testPolicyDecisionRecordMaterialFixture],
    ["refund-policy-rulebook-outcomes", testRefundPolicyRulebookOutcomes],
    ["refund-policy-rulebook-binds-evidence-identity", testRefundPolicyRulebookBindsEvidenceIdentity],
    ["refund-policy-rulebook-signs-attestation", testRefundPolicyRulebookSignsAttestation],
    ["refund-policy-rulebook-requires-signed-attestation", testRefundPolicyRulebookRequiresSignedAttestation],
    ["trial-policy-rulebook", testTrialPolicyRulebookFixture],
    ["trial-policy-rulebook-outcomes", testTrialPolicyRulebookOutcomes],
    ["trial-policy-rulebook-binds-evidence-identity", testTrialPolicyRulebookBindsEvidenceIdentity],
    ["trial-policy-rulebook-signs-attestation", testTrialPolicyRulebookSignsAttestation],
    ["trial-policy-rulebook-requires-signed-attestation", testTrialPolicyRulebookRequiresSignedAttestation],
    ["cancel-policy-rulebook", testCancelPolicyRulebookFixture],
    ["cancel-policy-rulebook-outcomes", testCancelPolicyRulebookOutcomes],
    ["cancel-policy-rulebook-binds-evidence-identity", testCancelPolicyRulebookBindsEvidenceIdentity],
    ["cancel-policy-rulebook-signs-attestation", testCancelPolicyRulebookSignsAttestation],
    ["cancel-policy-rulebook-requires-signed-attestation", testCancelPolicyRulebookRequiresSignedAttestation],
    ["return-policy-rulebook", testReturnPolicyRulebookFixture],
    ["return-policy-rulebook-outcomes", testReturnPolicyRulebookOutcomes],
    ["return-policy-rulebook-binds-evidence-identity", testReturnPolicyRulebookBindsEvidenceIdentity],
    ["return-policy-rulebook-signs-attestation", testReturnPolicyRulebookSignsAttestation],
    ["return-policy-rulebook-requires-signed-attestation", testReturnPolicyRulebookRequiresSignedAttestation],
    ["workflow-zendesk-dispatch", testWorkflowFixture],
    ["ucp-vendor-enum-consistency", testUcpVendorEnumConsistency],
  ];

  let passed = 0;
  for (const [name, fn] of tests) {
    await fn();
    passed += 1;
    console.log(`PASS ${name}`);
  }
  console.log(`Contract tests passed: ${passed}/${tests.length}`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
