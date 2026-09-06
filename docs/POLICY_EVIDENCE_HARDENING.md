# Policy evidence hardening

Implementation baseline: completed and tested locally on 6 September 2026. The user subsequently authorized the staged release and permissions migration. Release completion requires the separate evidence listed below; this document alone is not a deployment attestation. Registry publication and vendor admission are not authorized by that release approval.

## Isolated implementation checkouts

All three use branch `codex/policy-evidence-hardening-20260906`. The canonical working copies and their unrelated work remain untouched.

- Engine: `/Users/jag1/CodexProjects/_worktrees/decide-policy-evidence-hardening-20260906`, base `3442bd267488af3415ed0cafbc152a146058861e`.
- Site bridge: `/Users/jag1/CodexProjects/_worktrees/decidesite-policy-evidence-hardening-20260906`, base `4b00c2e99b38cc98e59b2734a42fae397eede1e4`.
- Krafthaus: `/Users/jag1/CodexProjects/_worktrees/krafthaus-policy-evidence-hardening-20260906`, base `f3aab6062da12cc2dec24d662c5801564b25555b`.

## Runtime boundary

All four policy REST handlers and all MCP notary tools load the same complete 400-pair runtime snapshot. The monitor writes `rules/policy-runtime-evidence.json` into the existing artifact store. The runtime reads only `read_policy_runtime_evidence()`, never the old unrestricted table endpoint or a checked-in fallback.

The reader requires matching artifact path, producer, CI run/attempt/commit identity, full SHA-256 content checksum, timestamps, complete unique coverage, exact bundled source URLs, reviewed policy versions and human verification dates. This is privileged-origin and integrity validation, not a cryptographic signature from the monitor. Existing family `source_hash` values remain compatibility fingerprints; the new snapshot hash is full SHA-256.

Evidence expires at the earliest of:

- Last successful check plus 30 days for refunds, cancellations and returns, or 7 days for trials.
- Human verification plus 90 days.
- Snapshot generation plus 72 hours.

The exact deadline is expired. Future timestamps, missing state, pending candidates, quality failures, changed sources and crawler baseline resets withhold authority. A temporary fetch failure without a pending change can retain a still-valid prior check. Reset holds survive subsequent successful crawls until reviewed evidence is updated.

Only Rulebook v1 chooses the resulting verdict. Notary rulebooks are versioned `2026-09-06`; unusable evidence chooses `UNKNOWN`, `POLICY_EVIDENCE_NOT_CURRENT` and review. Every unknown/invalid compute result is explicitly unsafe to automate. Callers cannot inject a trusted snapshot or a past evaluation clock.

The evidence request and body read share a 1.5-second default deadline, capped at 3 seconds. Successful snapshots are cached for 60 seconds; unusable responses for 5 seconds. Requests re-evaluate expiry against their own server clock.

Monitoring restoration validates checksums and provenance before writing any file. A failed hydration stops the run instead of quietly generating evidence from an older fallback. The runtime snapshot is an output, never a hydrated baseline.

## Request and record binding

`policy_request_v1` freezes the normalized original policy parameters, including the distinction between omitted and supplied values, inside hashed Rulebook inputs. The response exposes those exact `policy_inputs` alongside its attestation.

The Decide site bridge checks policy identity and original request facts before issuing a Decision Record. Krafthaus's shared client checks request identity, input and attestation hashes, policy identity/version/hash, verdict/action/reason, source references, freshness, automation safety and exact same-origin record URLs. Responses older than five minutes cannot govern a new application action. The older refund client delegates to the same validator.

Transport authenticity still relies on the configured trusted Decide service over HTTPS. These consistency checks do not replace independently anchored signature verification. No production request-mixing incident was observed by this work.

Historical replay retains its original rulebook and input facts. The golden-corpus generator now preserves existing historical requests and refuses drift in their recorded outcomes.

## MCP contracts

Unknown refund and return eligibility remain nullable, rather than coercing uncertainty to false. Cancellation cadence is nullable when unnecessary. The lightweight validator handles union types, and an independent strict Ajv 2020-12 matrix checks 5,000 fresh/unavailable cases across all 100 vendors and four tools. Generated discovery schemas match the corrected tool contracts. Registry publication and the next MCP release version remain release tasks.

## Candidate reviews

See the [seven source-backed reviews](reviews/policy-candidate-applicability-20260906.md) and their JSON companion. Five have a scoped subscription-only not-applicable recommendation. Skillshare requires product segmentation; Thinkific requires broader billing evidence. No vendor is admitted, no human approval is asserted and no named owner is invented.

## Local verification

- Strict MCP matrix: 5,000 cases.
- Engine contract suite: 70/70.
- Monitoring suite: 51/51.
- Historical migration replay: 7/7, zero drift; historical files unchanged.
- Policy feed: 3/3; alerts API: 9/9; coverage: 2/2; review: 2/2; freshness: 2/2.
- Lifecycle: 3/3; candidate monitor: 4/4; seven-review consistency check.
- MCP lifecycle, individual and consolidated tools, schemas, metadata, distribution and source-mirror checks.
- Local HTTP MCP smoke uses real handlers with a test-only evidence store and no external calls.
- Real PostgreSQL 17.10: migration is repeatable, public reads/writes/function execution are denied, service-only reads work, and public write grants or disabled RLS stop the reader.
- Site Decision Record contract suite and original-request substitution regressions; MCP/runtime and OpenAPI/SDK checks; explicit authoritative engine-manifest synchronization check.
- Krafthaus support/credit regressions, application-runtime regression and substitutions for every declared request field.
- Cross-repository test runs the real engine, site record builder and Krafthaus client for all four policies, with both current and missing evidence.

The original audit artifact now gives review for the unsafe Canva, DashPass and MasterClass cancellation cases. Enforcement is per policy: MyFitnessPal cancellation can remain current while its trial evidence is expired.

The initial broad engine run failed because its fixtures lacked the newly required trusted evidence. Test-only evidence was added, then the complete suite passed. The initial HTTP check had no local server; the isolated HTTP harness subsequently passed the unchanged check script.

The extra Krafthaus application-runtime check initially lacked its locked SDK dependency in the fresh worktree. Installing the existing lockfile resolved it, and all eight assertions passed. A final credit-gate rerun first used an incorrect script name; the actual `customer-operations-credit-gate-regression.js` then passed all eight assertions. These were local verification setup errors, not production failures.

## Production release gates

Do not treat local tests as deployment or independent security sign-off.

1. Obtain commit/push/release and production migration approval. Review the three isolated worktree diffs and preserve all unrelated canonical WIP.
2. Verify the exact Supabase project, existing grants/RLS and trusted CI artifact provenance. The checked-in old SQL does not establish that production was protected. If historical state cannot be trusted, hold policy automation and review/re-establish a known baseline; do not silently rebaseline it into authority.
3. Apply `docs/sql/policy_runtime_evidence_boundary.sql` only after approval. It restricts the artifact table and exposes a service-only reader that also detects permissions drift. It does not modify policy events or daily alerts.
4. Run the updated trusted monitor and verify a complete, recent, checksum-matching snapshot through the new reader. Confirm runtime and monitor have the correct server-only configuration. Missing migration, missing state or missing configuration deliberately means review, not an old permissive fallback.
5. Release the engine first, then the site bridge, then Krafthaus. The stricter bridge/client intentionally reject older responses without request-bound material. Keep policy automation held if the sequence cannot complete safely.
6. Verify exact SHAs, CI, provider deployment identity and public behavior separately. Check a current supported request, the actual expired/review cases, proof/replay identity and an application-level review path. Do not mutate production evidence to simulate failures.
7. Version and publish MCP metadata only with separate registry-publication authorization. Recheck listed schemas against the live tool list.

The local implementation phase performed no database migration, live monitoring run, registry publication, commit, push or deployment. The subsequently approved release is a separate phase and must record each of those outcomes explicitly.

## Reproduction

Run in the engine checkout:

```sh
npm ci --ignore-scripts
npm run test:policy-evidence
npm run test:policy-mcp-contracts
npm run test:policy-mcp-http
npm run test:policy-evidence-postgres
npm run test:policy-candidate-reviews
npm run test:contract
npm run smoke
npm run rulebook:migration-dry-run -- --json
```

The cross-repository test takes explicit site and Krafthaus checkout paths:

```sh
node scripts/test-policy-workspace-integration.js /absolute/site/checkout /absolute/krafthaus/checkout
```

PostgreSQL testing requires `initdb`, `pg_ctl` and `psql`. It creates a dedicated Unix-socket-only database, stops only that database and retains its task-created files. This run retained `/tmp/decide-evidence-pg-HuPnSw`.
