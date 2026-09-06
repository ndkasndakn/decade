# decide.fyi Decision API

> Deterministic Decision API engine powering workflow applications, stable MCP notary remotes, decision memo packets, and execution gates

[![Version](https://img.shields.io/badge/version-1.3.1-blue.svg)](https://decide.fyi)
[![MCP](https://img.shields.io/badge/MCP-compatible-green.svg)](https://modelcontextprotocol.io)
[![Vendors](https://img.shields.io/badge/vendors-100-orange.svg)](https://decide.fyi)

**Positioning:** Decide is the API engine and compatibility surface. Krafthaus workflow apps, Policy MCP Notaries, decision memo packets, and execution gates are application surfaces that reuse the same verdict, request ID, and evidence contract.

## Gate agent tool calls before execution

Use Decide to evaluate an agent-proposed action against a deterministic rulebook
before the tool receives authority to change state. The caller gets a replayable
Decision Record and routes `yes`, `no`, or `review` while retaining control of
credentials and execution.

[See the AI agent action gate guide](https://www.decide.fyi/use-cases/ai-agent-action-gate?source=github_readme)

## Production Determinism Boundary

Binding production verdicts should use a versioned declarative rulebook:

Runtime architecture: see [`docs/RULEBOOK_RUNTIME_ARCHITECTURE.md`](docs/RULEBOOK_RUNTIME_ARCHITECTURE.md).
Machine-readable schema: [`https://api.decide.fyi/schemas/rulebook-v1.schema.json`](https://api.decide.fyi/schemas/rulebook-v1.schema.json).
Active runtime manifest: [`https://api.decide.fyi/manifests/rulebook-runtime-v1.json`](https://api.decide.fyi/manifests/rulebook-runtime-v1.json).
Downstream application binding: [`decide_application_binding_v1`](docs/APPLICATION_BINDING_V1.md).

The production core is `hybrid_declarative_rulebook_with_trusted_adapters`:
direct declarative rulebooks are supported, registered first-party trusted
adapters may supply bounded facts, and customer executable rulebooks are
rejected. In both supported binding modes, Rulebook v1 remains the only binding
verdict selector.

```json
{
  "mode": "rulebook",
  "rulebook": {
    "schema_version": "rulebook_v1",
    "rulebook_id": "pricing_exception",
    "version": "2026-06-11",
    "input_schema": {
      "required": ["discount_percent"],
      "properties": {
        "discount_percent": { "type": "number" }
      }
    },
    "rules": [
      {
        "rule_id": "approve_standard_discount",
        "priority": 50,
        "condition": {
          "field": "discount_percent",
          "operator": "lte",
          "value": 15
        },
        "outcome": {
          "decision": "yes",
          "verdict": "APPROVE",
          "action": "approve_discount",
          "reason_code": "WITHIN_STANDARD_LIMIT"
        }
      }
    ],
    "default_outcome": {
      "decision": "review",
      "verdict": "REVIEW",
      "action": "route_to_owner",
      "reason_code": "NO_RULE_MATCHED"
    }
  },
  "context": {
    "inputs": {
      "discount_percent": 10
    }
  }
}
```

`mode: "rulebook"` does not call an LLM. It validates the request rulebook
against the published JSON Schema, hashes the rulebook, evaluates bounded
conditions, and returns `yes`, `no`, or `review` alongside the application
verdict, action, reason code, matched rule, and `evaluator_version`. Responses
also include `rulebook_contract` with the enforced schema URL/hash,
`runtime_binding` with the direct or trusted-adapter binding mode, `input_hash`,
a SHA-256 hash of the canonical inputs or adapter facts consumed by the
declarative evaluator, plus a `rulebook_attestation_v1` bundle hash over the
deterministic execution tuple.
Production deployments can sign that bundle hash with a
`rulebook_attestation_signature_v1` Ed25519 envelope; verification keys are
published at `/.well-known/rulebook-attestation-keys.json`. Set
`DECIDE_RULEBOOK_ATTESTATION_SIGNATURE_REQUIRED=true` in production to fail
closed instead of returning unsigned Rulebook decisions. Publish retired public
verification keys with `DECIDE_RULEBOOK_ATTESTATION_KEY_HISTORY_JSON` so older
Decision Records remain verifiable after rotation.

Rulebook requests cannot preload Decide-generated Decision Record material.
Fields such as `runtime_binding`, `trusted_adapter`, `adapter_facts`,
`rulebook_attestation`, `application_verdict`, and `action` are response-only at
the request body, `context.inputs`, and adapter-facts boundaries; attempts return
`RULEBOOK_OUTPUT_MATERIAL_FORBIDDEN`.

Legacy `single`, `multi`, and `runtime` requests remain available for
AI-assisted exploration, but they are not binding production verdicts. Those
responses include `decision_contract` with `authority: "advisory_only"` and
`production_verdict: false`, plus `production_binding_required: true` and the
supported production binding modes; callers that need deterministic execution
must use `mode: "rulebook"` and capture `rulebook_contract`, `runtime_binding`,
and the Rulebook attestation material.

At the public Decision Record boundary, successful evaluations are registered
as immutable tenant-scoped snapshots. Historical replay restores the original
canonical input and stored rulebook snapshot rather than trusting a caller
override or the current application deployment.

Rulebook v1 also supports registered first-party trusted adapters for bounded
fact normalization. Adapter requests pin an exact semantic version and manifest
hash; responses attest the bundled implementation source hash plus canonical
input/output hashes and the enforced execution contract. Each invocation runs
once in an empty-environment worker with hard time/resource limits and denied
common ambient capabilities. The declarative rulebook remains the only binding
verdict selector. See [`docs/TRUSTED_ADAPTERS_V1.md`](docs/TRUSTED_ADAPTERS_V1.md).

The current reference applications prove both production patterns: Solana
Execution Gate, Decision Memo Readiness Gate, and Krafthaus Workflow Readiness Binding
use trusted adapters before Rulebook v1, while the Refund, Trial, Cancel, and
Return Policy MCP notaries supply normalized facts directly to Rulebook v1 and
expose the signed rulebook result through their stable REST and MCP surfaces.

Before evaluator, adapter, or rulebook changes ship, run the local historical
replay gate:

```bash
npm run rulebook:migration-dry-run -- --json
```

Use `--candidate-rulebook`, `--candidate-adapter`, and
`--candidate-evaluator-version` to compare proposed migrations against the
golden replay corpus before production routing changes.

For release gates, prefer a `rulebook_migration_v1` manifest so candidate
artifacts, expected drift, and approval status are reviewed together:

```bash
npm run rulebook:migration-dry-run -- --migration path/to/migration.json --json
```

The manifest schema is published at
`https://api.decide.fyi/schemas/rulebook-migration-v1.schema.json`, and the dry
run validates manifests against that closed schema before replay.

After production routing or runtime-contract changes ship, run the production
runtime smoke:

```bash
npm run smoke:rulebook-runtime
```

This hits `https://api.decide.fyi` from outside the runtime and always verifies
the published `hybrid_declarative_rulebook_with_trusted_adapters` manifest,
closed Rulebook v1 schema, attestation key endpoint, and protected Decision API
edge. Supply `DECIDE_RULEBOOK_RUNTIME_SMOKE_API_KEY` to also exercise live
declarative evaluation, rejection behavior, and advisory-only legacy metadata.
GitHub Actions runs the public boundary checks as the scheduled/manual
**Rulebook Runtime Production Smoke** workflow and runs the authenticated checks
when its optional smoke credential is configured.

The legacy `single`, `multi`, and `runtime` modes are AI-assisted surfaces.
They are not the production determinism boundary for loosely defined business
judgment.

Architecture:

- [Ecosystem constitution](docs/ECOSYSTEM_CONSTITUTION.md)
- [Application binding contract](docs/APPLICATION_BINDING_V1.md)
- [Rulebook v1 contract](docs/RULEBOOK_V1.md)
- [Rulebook compatibility policy](docs/RULEBOOK_COMPATIBILITY_POLICY.md)
- [Rulebook migration examples](docs/RULEBOOK_MIGRATION_EXAMPLES.md)
- [Rulebook migration manifest](docs/RULEBOOK_MIGRATION_MANIFEST_V1.md)

## JavaScript SDK and CLI

The public [`@decide-fyi/sdk`](https://www.npmjs.com/package/@decide-fyi/sdk)
client covers Decision API calls, Decision Record and Decision Packet
verification, Rulebook conformance, replay, execution receipts, and outcome
reporting.

```sh
npm install @decide-fyi/sdk
```

The canonical package source is [`sdk/`](sdk/), licensed under Apache-2.0.
Package release requirements and source mapping are documented in
[`sdk/SOURCE_PROVENANCE.md`](sdk/SOURCE_PROVENANCE.md).

## One-Click Install

[![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.png)](cursor://anysphere.cursor-deeplink/mcp/install?name=decide-policy-notaries&config=eyJ1cmwiOiJodHRwczovL3BvbGljeS5kZWNpZGUuZnlpL2FwaS9tY3AifQ==) [![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=decide-policy-notaries&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fpolicy.decide.fyi%2Fapi%2Fmcp%22%7D) [![Add to Claude](https://fastmcp.me/badges/claude_dark.svg)](#connect-via-mcp-claude-desktop--windsurf--other-clients) [![Add to ChatGPT](https://fastmcp.me/badges/chatgpt_dark.svg)](#connect-via-mcp-claude-desktop--windsurf--other-clients) [![Add to Codex](https://fastmcp.me/badges/codex_dark.svg)](#connect-via-mcp-claude-desktop--windsurf--other-clients) [![Add to Gemini](https://fastmcp.me/badges/gemini_dark.svg)](#connect-via-mcp-claude-desktop--windsurf--other-clients)

> Buttons install the canonical four-tool **Decide Policy Notaries** server. Existing specialist endpoints remain supported for compatibility.

## Stable MCP Remotes

| Server | Domain | Tool | Verdicts |
|--------|--------|------|----------|
| **Policy Notaries** | [policy.decide.fyi](https://policy.decide.fyi) | All 4 tools below | Policy-specific verdicts |
| **Refund Notary** | [refund.decide.fyi](https://refund.decide.fyi) | `refund_eligibility` | ALLOWED / DENIED / UNKNOWN |
| **Cancel Notary** | [cancel.decide.fyi](https://cancel.decide.fyi) | `cancellation_penalty` | FREE_CANCEL / PENALTY / LOCKED / UNKNOWN |
| **Return Notary** | [return.decide.fyi](https://return.decide.fyi) | `return_eligibility` | RETURNABLE / EXPIRED / NON_RETURNABLE / UNKNOWN |
| **Trial Notary** | [trial.decide.fyi](https://trial.decide.fyi) | `trial_terms` | TRIAL_AVAILABLE / NO_TRIAL / UNKNOWN |

All servers: 100 vendor identifiers, US region, individual plans, stateless, no auth, 100 req/min. Results fail closed to `UNKNOWN` when the available facts cannot support an automated verdict.

## Quick Start

### Connect via MCP (Claude Desktop / Windsurf / other clients)

```json
{
  "mcpServers": {
    "decide-policy-notaries": { "url": "https://policy.decide.fyi/api/mcp" }
  }
}
```

#### Specialist compatibility configuration

Existing installations can keep using the specialist remotes. They expose the
same tool names and response contracts as the canonical suite:

```json
{
  "mcpServers": {
    "refund-decide": { "url": "https://refund.decide.fyi/api/mcp" },
    "cancel-decide": { "url": "https://cancel.decide.fyi/api/mcp" },
    "return-decide": { "url": "https://return.decide.fyi/api/mcp" },
    "trial-decide": { "url": "https://trial.decide.fyi/api/mcp" }
  }
}
```

### REST API

```bash
# Refund eligibility
curl -X POST https://refund.decide.fyi/api/v1/refund/eligibility \
  -H "Content-Type: application/json" \
  -d '{"vendor":"adobe","days_since_purchase":12,"region":"US","plan":"individual","qualifying_conditions_met":true}'

# Cancellation penalty
curl -X POST https://cancel.decide.fyi/api/v1/cancel/penalty \
  -H "Content-Type: application/json" \
  -d '{"vendor":"adobe","region":"US","plan":"individual","billing_cadence":"annual"}'

# Return eligibility
curl -X POST https://return.decide.fyi/api/v1/return/eligibility \
  -H "Content-Type: application/json" \
  -d '{"vendor":"adobe","days_since_purchase":12,"region":"US","plan":"individual","qualifying_conditions_met":true}'

# Trial terms
curl -X POST https://trial.decide.fyi/api/v1/trial/terms \
  -H "Content-Type: application/json" \
  -d '{"vendor":"adobe","region":"US","plan":"individual","offer_confirmed":true,"observed_trial_days":7,"observed_card_required":true,"observed_auto_converts":true}'
```

Only set evidence fields from facts you have actually verified. A time window alone is not proof that source-specific conditions are satisfied. Approval-dependent policies stay `UNKNOWN` even when a caller sets `qualifying_conditions_met`; trial results require a live offer observation.

### Local Dev Checks

Start local dev server:

```bash
npx vercel dev
```

In a separate terminal:

```bash
# Handler-level smoke checks (no running server required)
npm run smoke

# MCP endpoint checks (requires a running server)
npm run mcp:check

# Self-contained local MCP check; starts/stops vercel dev on localhost:3000
npm run mcp:check:local

# End-to-end workflow fixture (example -> result)
npm run workflow:test

# Production customer-key verification after provisioning a key
DECIDE_SMOKE_API_KEY='<customer-key>' npm run smoke:customer-key
```

---

## Protected Zendesk Reference Workflow

The Zendesk routes are protected reference adapters. They return an advisory
classification, a policy result, and a recommended Zendesk action shape, but
they do **not** write to Zendesk, authorize execution, or create a binding
production Decision Record. Every response sets
`workflow_contract.execution_allowed: false`.

For the production architecture, including the Rulebook v1 action boundary and
Decision Record that must precede a downstream side effect, see
[`docs/POLICY_MCP_SUPPORT_WORKFLOW.md`](docs/POLICY_MCP_SUPPORT_WORKFLOW.md).

**Endpoints**

- `POST https://refund.decide.fyi/api/v1/workflows/zendesk/refund`
- `POST https://cancel.decide.fyi/api/v1/workflows/zendesk/cancel`
- `POST https://return.decide.fyi/api/v1/workflows/zendesk/return`
- `POST https://trial.decide.fyi/api/v1/workflows/zendesk/trial`

### Request

```json
{
  "ticket_id": "ZD-9001",
  "workflow_type": "refund",
  "question": "Should this Adobe annual plan refund request proceed under policy?",
  "vendor": "adobe",
  "region": "US",
  "plan": "individual",
  "days_since_purchase": 5,
  "qualifying_conditions_met": true
}
```

Production workflow requests require a server-to-server Bearer token:

```bash
curl -sS -X POST https://refund.decide.fyi/api/v1/workflows/zendesk/refund \
  -H "Authorization: Bearer $WORKFLOW_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d @workflow-request.json
```

For `refund` and `return`, include `days_since_purchase` and source-specific condition evidence when requested. Cancellation may require `billing_cadence`. Trial automation requires `offer_confirmed` plus the observed duration, card requirement, and auto-conversion status. The workflow escalates instead of approving when required context is absent.

### Test-only fixture mode

`decision_override` exists only for explicit local and CI tests with both
`NODE_ENV=test` and `WORKFLOW_TEST_MODE=1`. It is rejected by deployed routes
and must never be used as an integration mechanism.

```json
{
  "decision_override": "yes"
}
```

### Response (example)

```json
{
  "ok": true,
  "flow": "zendesk_refund_v1",
  "ticket_id": "ZD-9001",
  "decision": { "c": "yes", "request_id": "req_123" },
  "policy": { "verdict": "ALLOWED", "code": "WITHIN_WINDOW" },
  "workflow_contract": { "production_verdict": false, "execution_allowed": false },
  "action": {
    "type": "approve_refund",
    "execution_allowed": false,
    "zendesk_tags": ["decide", "decide_yes", "refund_allowed"]
  }
}
```

---

## Refund Notary

**Endpoint:** `POST https://refund.decide.fyi/api/v1/refund/eligibility`
**MCP Tool:** `refund_eligibility`

Evaluates a refund only when the versioned rule and supplied source-specific facts support automation.

**Input:** `vendor`, `days_since_purchase`, `region`, `plan`, and conditionally `qualifying_conditions_met`

```json
{"refundable":true,"verdict":"ALLOWED","code":"WITHIN_WINDOW","message":"Refund is allowed. Purchase is 12 day(s) old, within 14 day window.","vendor":"adobe","window_days":14,"qualifying_conditions_met":true,"automation_safe":true}
```

**Codes:** `WITHIN_WINDOW`, `OUTSIDE_WINDOW`, `NO_REFUNDS`, `MISSING_REQUIRED_CONTEXT`, `UNSUPPORTED_VENDOR`

## Cancel Notary

**Endpoint:** `POST https://cancel.decide.fyi/api/v1/cancel/penalty`
**MCP Tool:** `cancellation_penalty`

Checks cancellation penalties — early termination fees, contract locks, or free cancellation.

**Input:** `vendor`, `region`, `plan`, and conditionally `billing_cadence`

```json
{"verdict":"PENALTY","code":"EARLY_TERMINATION_FEE","message":"adobe charges an early termination fee: 50% of remaining months on annual plan.","vendor":"adobe","policy":"etf","billing_cadence":"annual","automation_safe":true}
```

**Codes:** `NO_PENALTY`, `EARLY_TERMINATION_FEE`, `CONTRACT_LOCKED`, `MISSING_REQUIRED_CONTEXT`, `UNSUPPORTED_VENDOR`

## Return Notary

**Endpoint:** `POST https://return.decide.fyi/api/v1/return/eligibility`
**MCP Tool:** `return_eligibility`

Evaluates whether a subscription purchase can be reversed when the versioned rule and supplied source-specific facts support automation.

**Input:** `vendor`, `days_since_purchase`, `region`, `plan`, and conditionally `qualifying_conditions_met`

```json
{"returnable":true,"verdict":"RETURNABLE","code":"FULL_RETURN","message":"Return is available. Purchase is 5 day(s) old, within 14-day window.","vendor":"adobe","return_type":"full_refund","method":"self_service","qualifying_conditions_met":true,"automation_safe":true}
```

**Codes:** `FULL_RETURN`, `PRORATED_RETURN`, `CREDIT_RETURN`, `OUTSIDE_WINDOW`, `NO_RETURNS`, `MISSING_REQUIRED_CONTEXT`, `UNSUPPORTED_VENDOR`

## Trial Notary

**Endpoint:** `POST https://trial.decide.fyi/api/v1/trial/terms`
**MCP Tool:** `trial_terms`

Evaluates availability and terms from a live offer observation. It does not publish static trial availability.

**Input:** `vendor`, `region`, `plan`, `offer_confirmed`; when confirmed, also `observed_trial_days`, `observed_card_required`, `observed_auto_converts`

```json
{"verdict":"TRIAL_AVAILABLE","code":"AUTO_CONVERTS","message":"A live 7-day adobe trial offer was confirmed. Credit card required. Auto-converts to paid plan.","vendor":"adobe","trial_days":7,"card_required":true,"auto_converts":true,"offer_confirmed":true,"automation_safe":true}
```

**Codes:** `AUTO_CONVERTS`, `NO_AUTO_CONVERT`, `TRIAL_NOT_AVAILABLE`, `MISSING_REQUIRED_CONTEXT`, `UNSUPPORTED_VENDOR`

---

## Supported Vendor Registry (100)

The versioned JSON registries are the canonical vendor catalog. A compact Markdown
table is intentionally not duplicated here because policy windows, channels, and
approval branches can change independently. Contract tests require the same 100
identifiers in every rule and source registry.

| Family | Rules | Official-source registry | Automation classification |
|--------|-------|--------------------------|---------------------------|
| Refund | [`v1_us_individual.json`](rules/v1_us_individual.json) | [`policy-sources.json`](rules/policy-sources.json) | `deterministic`, `conditional`, `review_only` |
| Cancellation | [`v1_us_individual_cancel.json`](rules/v1_us_individual_cancel.json) | [`cancel-policy-sources.json`](rules/cancel-policy-sources.json) | `deterministic`, `conditional`, `review_only` |
| Return/reversal | [`v1_us_individual_return.json`](rules/v1_us_individual_return.json) | [`return-policy-sources.json`](rules/return-policy-sources.json) | `deterministic`, `conditional`, `review_only` |
| Trial | [`v1_us_individual_trial.json`](rules/v1_us_individual_trial.json) | [`trial-policy-sources.json`](rules/trial-policy-sources.json) | `observed` live-offer mode |

- `deterministic`: the standard policy is categorical for the supported US individual-plan scope.
- `conditional`: automation requires an explicit caller assertion that the source-specific conditions were verified.
- `review_only`: the policy depends on approval, channel, commitment, exceptions, or source language that is not categorical enough to automate.
- `observed`: the current account or promotion must expose a live offer before trial terms can be returned.

**Scope:** US region, individual plans only.

## Data Freshness

Each policy family has versioned rules and source metadata for 100 vendor identifiers.
The source tracker monitors official vendor documentation and terms of service;
it does not automatically promote page text into a verdict.

- **Six-hour source checks** — The `Daily Policy Check` workflow runs every six hours across refund, cancellation, return, and trial sources. Material signals enter a human review queue.
- **Human-verification freshness**: `npm run audit:policy-freshness` reports reviewed-source age independently from tracker uptime. New policy evaluations also require [current, request-bound evidence](docs/POLICY_EVIDENCE_HARDENING.md); missing or stale evidence routes to review.
- **Policy source URLs tracked** — Each policy family has its own sources file in `rules/` linking to official policy pages.
- **Compliance export** — `GET /api/compliance-export` returns a CSV snapshot of tracked sources, hashes, and pending candidate changes (`?format=json` for machine-readable output).
- **Versioned rules** — Each rules file includes a `rules_version` field for staleness detection.

## Architecture

- **Stateless verdict runtime** — Policy calls do not create sessions or mutate policy rules
- **Deterministic** — Same input always produces same output
- **Versioned Rules** — Rules files include version for tracking changes
- **Scheduled Monitoring** — GitHub Action checks all vendor policy pages every six hours
- **Serverless** — Runs on Vercel serverless functions
- **Zero Dependencies** — Core compute logic has no external dependencies
- **Hostname Routing** — Vercel middleware routes subdomains to correct MCP endpoints

## Limitations

- **US Only** — Currently only supports US region
- **Individual Plans Only** — Business/enterprise plans not yet supported
- **Calendar Days** — Windows are based on calendar days, not business days
- **Fail-closed branches** — Approval-dependent, channel-dependent, ambiguous, or incomplete cases return `UNKNOWN` for review
- **Live trial evidence** — Trial availability and terms must be observed for the account or promotion being evaluated

## Changelog

### v1.3.1 (2026-07-16)

**Changed:**
- Policy Notaries now use explicit `deterministic`, `conditional`, `review_only`, and live-offer modes; incomplete or approval-dependent requests fail closed.
- Monitoring timestamps no longer mutate policy lineage hashes, and golden replay generation rejects incomplete decisions.
- Canonical MCP metadata now describes the fail-closed contract and observed trial evidence fields.

### v1.3.0 (2026-07-15)

**Added:**
- Canonical `policy.decide.fyi/api/mcp` server exposing all four Policy Notary tools through one connection.
- Generated Official Registry metadata and Smithery server-card metadata sourced from the live tool definitions.

**Changed:**
- One-click install links now install the four-tool Policy Notaries server.
- Specialist Refund, Cancel, Return, and Trial MCP URLs remain stable compatibility surfaces.

### Unreleased

**Added:**
- `GET /api/compliance-export` endpoint for policy monitoring evidence export (CSV default, JSON via `?format=json`).
- Smoke test coverage for compliance export JSON and CSV paths.
- Private `report:mcp-adoption` operator report that separates remote-server discovery, probes, and completed Policy Notaries evaluations.
- Token-gated Console adoption snapshot with declared MCP client attribution, conservative follow-on inference, and aggregate-only output.
- Service-only Policy Notaries guide funnel that keeps connection intent, public REST proof, MCP evaluation, and Krafthaus workflow handoff metrics distinct.

**Changed:**
- Landing pages now position Decide as the Decision API engine and frame Policy MCP Notaries as one reference application.
- Zendesk reference routes require server-to-server authentication in production, fail closed when unconfigured, and mark all returned action shapes as non-executing.

### v1.2.1 (2026-02-08)

**Changed:**
- Subdomain homepage now shows the relevant notary card (refund/cancel/return/trial).
- Version metadata is consistent across `server.json`, MCP `initialize`, and `/.well-known/*`.

### v1.2.0 (2026-02-02)

**Added:**
- Cancel Notary MCP (cancel.decide.fyi) — cancellation penalty checker
- Return Notary MCP (return.decide.fyi) — return eligibility checker
- Trial Notary MCP (trial.decide.fyi) — free trial terms checker
- Hostname-based middleware routing for all subdomains
- Policy source files and daily checking for cancel, return, and trial policies
- Systems/Agents mode framing on landing page
- MCP catalog with cards for all 4 servers

**Fixed:**
- Daily policy checker: added `contents:write` permission and fixed shell logic
- Removed dead Cloudflare email-decode scripts causing 404s

### v1.1.0 (2026-02-01)

**Added:**
- Expanded from 64 to 100 supported vendors
- Daily policy-check GitHub Action (cron at 08:00 UTC)
- Policy source URLs tracked in `rules/policy-sources.json`
- MCP vendor `enum` in inputSchema for agent discoverability

**Fixed:**
- `ERR_IMPORT_ATTRIBUTE_MISSING` crash on Vercel (Node 22 import attributes)

### v1.0.0 (2026-01-15)

**Added:**
- Initial release with REST API and MCP server
- Support for 9 vendors

## Public Policy APIs And Protected Decision API

All 4 policy servers are free to use. No authentication. No API keys.

`/api/decide` requires a trusted proxy or API credential in production. Local and preview deployments can opt into the same boundary with `DECIDE_API_AUTH_REQUIRED=1`; configuring `DECIDE_API_KEY` or `DECIDE_PROXY_SHARED_TOKEN` also enables it.

If you run `decide` behind the `decidesite` proxy with dynamic customer keys, also set:

- `DECIDE_PROXY_SHARED_TOKEN`: shared secret required in `x-decide-proxy-token` header for trusted proxy calls.
- `DECIDE_API_KEY`: optional direct backend credential for trusted server-side callers.
- `DECIDE_GEMINI_MODE`: defaults to `disabled`. In this hard-zero state, legacy advisory `single`, `multi`, and `runtime` requests return `DECIDE_AI_DISABLED_ZERO_COST` without reading an API key or making a provider request. Rulebook v1 remains available and never uses Gemini.
- `DECIDE_GEMINI_MODE=paid`: explicit nonzero-cost opt-in for advisory modes. This mode also requires a restricted server-side `GEMINI_API_KEY`. `DECIDE_GEMINI_MODEL` may only be `gemini-3.1-flash-lite`; changing models requires a reviewed code release rather than an environment-only switch.
- `DECIDE_GEMINI_BUDGET_KV_REST_API_URL` and `DECIDE_GEMINI_BUDGET_KV_REST_API_TOKEN`: dedicated Redis-compatible REST store for the atomic provider-attempt guard. Paid advisory fails closed before Gemini if this store is absent or unavailable. The legacy `DECIDE_KV_REST_API_*`/`KV_REST_API_*` names are compatibility fallbacks; dedicated credentials are preferred.
- Compiled provider-attempt ceilings are 10/day, 100/month, 500 lifetime, and one concurrent request. `DECIDE_GEMINI_DAILY_CALL_CAP`, `DECIDE_GEMINI_MONTHLY_CALL_CAP`, and `DECIDE_GEMINI_LIFETIME_CALL_CAP` may only lower those ceilings.
- `DECIDE_GEMINI_TIMEOUT_MS`: the single paid-mode provider deadline (defaults to and cannot exceed 8 seconds).
- `DECIDE_GEMINI_MAX_PROMPT_CHARS`: the pre-fetch advisory prompt cap (defaults to and cannot exceed 4,096 characters; it may be lowered to 256).

Paid mode makes exactly one provider attempt and never falls back to another model. Gemini 3.1 Flash-Lite uses the provider's one-candidate default, lowest supported `minimal` thinking level, and default temperature; output is capped at 8 tokens for `single`, 128 for `multi`, and 512 for `runtime`. Keep the Gemini Google Cloud project unlinked from billing for a provider-side zero-dollar boundary; the application counters limit calls but do not prove a currency amount.

General `/api/decide` rate limit: 20 requests/minute per IP per serverless instance. This is an abuse control, not the Gemini cost boundary; the durable provider-attempt guard applies even when a trusted proxy bypasses the general limiter.

For first-customer handoff and keyed production verification, see [`docs/FIRST_CUSTOMER_RUNBOOK.md`](docs/FIRST_CUSTOMER_RUNBOOK.md).

### Policy Fetch Hook (for policy checker browser-hook lane)

Use `POST /api/policy-fetch-hook` as a fetch adapter for the daily checker when direct fetches are blocked.

Request body:

```json
{
  "url": "https://example.com/policy",
  "vendor": "example_vendor",
  "policy_type": "refund",
  "timeout_ms": 18000
}
```

Auth:
- `Authorization: Bearer <POLICY_CHECK_BROWSER_HOOK_TOKEN>` or `x-hook-token: <token>`

Server env:
- `POLICY_CHECK_BROWSER_HOOK_TOKEN` (required for endpoint auth)
- `POLICY_FETCH_CLOUDFLARE_ACCOUNT_ID` and `POLICY_FETCH_CLOUDFLARE_API_TOKEN` (optional; enables Cloudflare Browser Run first, using a token limited to Browser Rendering Write)
- `POLICY_FETCH_CLOUDFLARE_CACHE_TTL_SECONDS` (optional; defaults to 21600 seconds to reuse renders across policy types)
- `POLICY_FETCH_BROWSERLESS_TOKEN` (optional secondary browser provider)
- `POLICY_FETCH_BROWSERLESS_CONTENT_URL` (optional override; default `https://production-sfo.browserless.io/content`)
- `POLICY_FETCH_ALLOWED_HOSTS` (optional comma-separated host allowlist)

Checker (GitHub Actions, repo `decide`):
- Secret `POLICY_CHECK_BROWSER_HOOK_URL` = deployed endpoint URL (canonical: `https://api.decide.fyi/api/policy-fetch-hook`)
- Secret `POLICY_CHECK_BROWSER_HOOK_TOKEN` = same token as runtime env
- Variable `POLICY_CHECK_FETCH_LANES_DEFAULT` = `direct,zendesk_api,mirror,browser_hook`
- Optional variable `POLICY_CHECK_BROWSER_HOOK_MIN_INTERVAL_MS` controls spacing between browser-hook requests (default `10500`, suitable for Cloudflare Browser Rendering Free limits).

Questions? [support@decide.fyi](mailto:support@decide.fyi) or [@decidefyi on X](https://x.com/decidefyi)

## Links

- **Website:** [https://decide.fyi](https://decide.fyi)
- **Policy alerts:** [https://www.decide.fyi/resources/policy-alerts](https://www.decide.fyi/resources/policy-alerts)
- **Refund:** [https://refund.decide.fyi](https://refund.decide.fyi)
- **Cancel:** [https://cancel.decide.fyi](https://cancel.decide.fyi)
- **Return:** [https://return.decide.fyi](https://return.decide.fyi)
- **Trial:** [https://trial.decide.fyi](https://trial.decide.fyi)
- **X/Twitter:** [@decidefyi](https://x.com/decidefyi)
- **MCP Spec:** [https://modelcontextprotocol.io](https://modelcontextprotocol.io)

---

Decide is the API engine. Applications prove the primitive.
