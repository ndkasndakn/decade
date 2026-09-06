import { createRateLimiter, getClientIp, addRateLimitHeaders } from "./rate-limit.js";
import { persistLog } from "./log.js";
import { validateJsonSchema } from "./json-schema-lite.js";
import { buildMcpTelemetryEvent, persistMcpTelemetryEvent } from "./mcp-telemetry.js";

const SERVER_PROTOCOLS = [
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
];
const DEFAULT_BROWSER_ORIGINS = new Set([
  "https://chatgpt.com",
  "https://claude.ai",
  "https://smithery.ai",
  "https://www.smithery.ai",
]);

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
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

function ok(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function err(id, code, message, data) {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

function defaultIsError(payload) {
  return payload?.verdict === "UNKNOWN" && payload?.code !== "NON_US_REGION" && payload?.code !== "NON_INDIVIDUAL_PLAN";
}

function getAllowedBrowserOrigins() {
  return new Set(
    String(process.env.MCP_ALLOWED_ORIGINS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
}

function isAllowedBrowserOrigin(rawOrigin) {
  if (!rawOrigin) return true;

  let parsed;
  try {
    parsed = new URL(String(rawOrigin));
  } catch {
    return false;
  }

  const host = parsed.hostname.toLowerCase();
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  if (isLocal) return parsed.protocol === "http:" || parsed.protocol === "https:";
  if (parsed.protocol !== "https:") return false;
  if (host === "decide.fyi" || host.endsWith(".decide.fyi")) return true;
  if (DEFAULT_BROWSER_ORIGINS.has(parsed.origin)) return true;
  return getAllowedBrowserOrigins().has(parsed.origin);
}

export function createMcpHandler(config) {
  const {
    compute,
    tool,
    tools,
    documentationUrl,
    serverInfo,
    instructions,
    logPrefix = "MCP Request",
    logEventName = "mcp_request",
    formatTextMessage,
    rateLimitRequests = 100,
    rateLimitWindowMs = 60000,
  } = config;

  const toolConfigs = Array.isArray(tools)
    ? tools
    : [{ compute, tool, formatTextMessage }];
  const listedTools = toolConfigs.map((entry) => entry.tool);
  const toolConfigsByName = new Map(
    toolConfigs.map((entry) => [entry.tool.name, entry])
  );

  const rateLimiter = createRateLimiter(rateLimitRequests, rateLimitWindowMs);

  return async function mcpHandler(req, res) {
    const startedAt = Date.now();
    const origin = String(req.headers?.origin || "").trim();
    const requestedProtocol = String(req.headers?.["mcp-protocol-version"] || "").trim();
    if (origin && isAllowedBrowserOrigin(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, MCP-Protocol-Version");
    res.setHeader("MCP-Protocol-Version", SERVER_PROTOCOLS[0]);
    res.setHeader("Vary", "Origin");

    if (!isAllowedBrowserOrigin(origin)) {
      return send(res, 403, err(null, -32000, "Origin not allowed", {
        code: "ORIGIN_NOT_ALLOWED",
      }));
    }

    if (requestedProtocol && !SERVER_PROTOCOLS.includes(requestedProtocol)) {
      return send(res, 400, err(null, -32000, "Unsupported protocol version", {
        code: "UNSUPPORTED_PROTOCOL_VERSION",
        supported: SERVER_PROTOCOLS,
      }));
    }

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method === "GET") {
      res.setHeader("Allow", "POST, OPTIONS");
      return send(res, 405, {
        ok: false,
        error: "METHOD_NOT_ALLOWED",
        message: "This stateless MCP endpoint does not expose an SSE stream. Use POST for JSON-RPC requests.",
        documentation: documentationUrl,
        allowed: ["POST", "OPTIONS"],
      });
    }

    const clientIp = getClientIp(req);
    const recordTelemetry = (method, details = {}) => {
      const event = buildMcpTelemetryEvent({
        headers: req.headers || {},
        clientIp,
        salt: process.env.MCP_TELEMETRY_SALT || "",
        surface: logEventName,
        method,
        latencyMs: Date.now() - startedAt,
        internalProbeToken: process.env.MCP_INTERNAL_PROBE_TOKEN || "",
        ...details,
      });
      console.log(`[${logPrefix}]`, JSON.stringify(event));
      const targets = [
        ["structured_log", persistLog(logEventName, event)],
        ["supabase", persistMcpTelemetryEvent(event)],
      ];
      return Promise.allSettled(targets.map(([, promise]) => promise)).then((results) => {
        results.forEach((result, index) => {
          if (result.status !== "rejected") return;
          console.warn(`[${logPrefix} Persistence]`, JSON.stringify({
            target: targets[index][0],
            method: event.method,
            tool: event.tool,
            error: String(result.reason?.message || result.reason || "unknown_error"),
          }));
        });
        return results;
      });
    };
    const rateLimitResult = rateLimiter(clientIp);

    if (!rateLimitResult.allowed) {
      res.setHeader("X-RateLimit-Limit", String(rateLimitResult.limit));
      res.setHeader("X-RateLimit-Remaining", String(rateLimitResult.remaining));
      res.setHeader("X-RateLimit-Reset", String(rateLimitResult.reset));
      res.setHeader("Retry-After", String(rateLimitResult.retryAfter));
      void recordTelemetry("unknown", { result: "rate_limited", code: "RATE_LIMIT_EXCEEDED" });
      return send(res, 429, err(null, -32000, "Rate limit exceeded", {
        retry_after: rateLimitResult.retryAfter,
        message: `Too many requests. Try again in ${rateLimitResult.retryAfter} seconds.`,
      }));
    }

    addRateLimitHeaders(res, rateLimitResult);

    try {
      if (req.method !== "POST") {
        return send(res, 405, { ok: false, error: "METHOD_NOT_ALLOWED", allowed: ["POST"] });
      }

      let msg;
      try {
        msg = await readJson(req);
      } catch {
        return send(res, 200, err(null, -32700, "Parse error", { message: "Invalid JSON" }));
      }

      if (!msg || typeof msg !== "object" || Array.isArray(msg) || msg.jsonrpc !== "2.0") {
        return send(res, 200, err(msg?.id ?? null, -32600, "Invalid Request", {
          message: "jsonrpc must be exactly '2.0'",
        }));
      }

      const { id = null, method, params } = msg || {};

      if (!method) {
        void recordTelemetry("unknown", { result: "invalid_request", code: "METHOD_REQUIRED" });
        return send(res, 200, err(id, -32600, "Invalid Request", { message: "method field is required" }));
      }

      if (method === "initialize") {
        const requested = params?.protocolVersion;
        const chosen = SERVER_PROTOCOLS.includes(requested) ? requested : SERVER_PROTOCOLS[0];

        void recordTelemetry(method, {
          result: "success",
          clientName: params?.clientInfo?.name,
        });
        return send(
          res,
          200,
          ok(id, {
            protocolVersion: chosen,
            capabilities: {
              tools: { listChanged: false },
            },
            serverInfo,
            instructions,
          })
        );
      }

      if (method === "notifications/initialized") {
        void recordTelemetry(method, { result: "success" });
        res.statusCode = 202;
        res.end();
        return;
      }

      if (method === "ping") {
        void recordTelemetry(method, { result: "success" });
        return send(res, 200, ok(id, {}));
      }

      if (method === "tools/list") {
        void recordTelemetry(method, { result: "success" });
        return send(res, 200, ok(id, { tools: listedTools }));
      }

      if (method === "tools/call") {
        const name = params?.name;
        const args = params?.arguments || {};
        const selectedTool = toolConfigsByName.get(name);
        if (!selectedTool) {
          void recordTelemetry(method, { tool: name, result: "invalid_params", code: "UNKNOWN_TOOL" });
          return send(res, 200, err(id, -32602, "Invalid params", { message: `Unknown tool: ${name}` }));
        }

        const validation = validateJsonSchema(args, selectedTool.tool.inputSchema);
        if (!validation.valid) {
          void recordTelemetry(method, { tool: name, result: "invalid_params", code: "SCHEMA_VALIDATION_FAILED" });
          return send(res, 200, err(id, -32602, "Invalid params", {
            message: validation.errors.join("; "),
            errors: validation.errors,
          }));
        }

        const payload = await selectedTool.compute(args);
        const textMessage = selectedTool.formatTextMessage(payload, args);
        const isError = defaultIsError(payload);

        await recordTelemetry(method, {
          tool: name,
          result: isError ? "review_required" : "success",
          verdict: payload?.verdict,
          code: payload?.code,
        });
        return send(
          res,
          200,
          ok(id, {
            content: [{ type: "text", text: textMessage }],
            structuredContent: payload,
            isError,
          })
        );
      }

      void recordTelemetry(method, { result: "method_not_found", code: "METHOD_NOT_FOUND" });
      return send(res, 200, err(id, -32601, "Method not found", { method }));
    } catch (error) {
      void recordTelemetry("unknown", { result: "internal_error", code: "INTERNAL_ERROR" });
      return send(res, 200, err(null, -32603, "Internal error", { message: String(error?.message || error) }));
    }
  };
}
