import { compute, getRulesVersion } from "../../../trial-compute.js";
import { createRateLimiter, getClientIp, sendRateLimitError, addRateLimitHeaders } from "../../../rate-limit.js";
import { persistLog } from "../../../log.js";
import { exposePolicyDecisionMaterial } from "../../../policy-decision-material.js";
import { loadPolicyEvidenceSnapshot } from "../../../policy-evidence-snapshot.js";

const rateLimiter = createRateLimiter(100, 60000);

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  if (payload !== null) {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(payload));
  } else {
    res.end();
  }
}

function rid() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (req.body && typeof req.body === "string") return JSON.parse(req.body);

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

export default async function handler(req, res) {
  const request_id = rid();
  const ua = req.headers["user-agent"] || "unknown";

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return json(res, 204, null);
  }

  const clientIp = getClientIp(req);
  const rateLimitResult = rateLimiter(clientIp);

  if (!rateLimitResult.allowed) {
    sendRateLimitError(res, rateLimitResult, request_id);
    await persistLog('trial_request', { request_id, event: 'rate_limit_exceeded', ip: clientIp, ua });
    return;
  }

  addRateLimitHeaders(res, rateLimitResult);

  try {
    if (req.method === "GET") {
      return json(res, 200, {
        ok: true,
        service: "trial.decide.fyi",
        request_id,
        message: "Use POST with JSON body.",
        endpoint: "/api/v1/trial/terms",
        rules_version: getRulesVersion(),
      });
    }

    if (req.method !== "POST") {
      return json(res, 405, {
        ok: false,
        request_id,
        error: "METHOD_NOT_ALLOWED",
        allowed: ["GET", "POST"],
      });
    }

    let body;
    try {
      body = await readJson(req);
    } catch (parseError) {
      return json(res, 400, {
        ok: false,
        request_id,
        error: "INVALID_JSON",
        message: "Request body must be valid JSON",
      });
    }

    const payload = compute(body, { requireCompleteContext: true, evidenceSnapshot: await loadPolicyEvidenceSnapshot() });

    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        request_id,
        method: req.method,
        path: req.url,
        vendor: body?.vendor ?? null,
        verdict: payload?.verdict ?? null,
        code: payload?.code ?? null,
        ua,
      })
    );
    json(res, 200, exposePolicyDecisionMaterial(req, payload));
    await persistLog('trial_request', {
      request_id,
      method: req.method,
      vendor: body?.vendor ?? null,
      region: body?.region ?? null,
      plan: body?.plan ?? null,
      verdict: payload?.verdict ?? null,
      code: payload?.code ?? null,
      ip: clientIp,
      ua,
    });
    return;
  } catch (e) {
    if (e?.code === "RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED") {
      return json(res, e.statusCode || 503, {
        ok: false,
        request_id,
        error: e.code,
        message: e.message,
        signature_status: e.signatureStatus,
        signature_error: e.signatureError,
      });
    }
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        request_id,
        error: String(e?.message || e),
        stack: e?.stack,
        ua,
      })
    );
    return json(res, 500, {
      ok: false,
      request_id,
      error: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred while processing your request",
    });
  }
}
