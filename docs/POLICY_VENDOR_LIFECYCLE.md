# Policy vendor lifecycle

The deterministic notaries and the source monitor have different jobs:

- Rulebooks answer supported requests from reviewed, versioned policy evidence.
- Monitoring detects source availability and possible policy changes.
- Monitoring never edits or promotes a rulebook. It can withhold usable evidence; Rulebook v1 then selects review instead of an automated policy outcome.

## Existing vendor states

The daily checker derives lifecycle state per vendor-policy pair:

- `monitored`: the latest source check is usable and its last successful fetch is current.
- `degraded`: the current source is blocked, failed, missing, or held by the quality gate.
- `expired`: the last successful fetch is older than the policy-specific freshness limit.
- `deprecated`: a reviewed configuration explicitly retires the vendor.

New policy API and MCP evaluations require validated runtime evidence. The server reads a checksum-validated, complete snapshot through the service-only database boundary. It never uses a checked-in file as a runtime fallback. Missing, expired, changed, corrupt or unavailable evidence selects `UNKNOWN` with `automation_safe: false` through Rulebook v1. A failed source fetch alone does not invalidate a still-current reviewed evidence window.

Freshness is per vendor-policy pair: 30 days for refund/cancel/return, 7 days for trial, at most 90 days since human verification and 72 hours since snapshot generation. The earliest deadline wins. The report's `runtime_enforcement_active` describes this code contract, not an independently verified production deployment. See [runtime evidence and rollout](POLICY_EVIDENCE_HARDENING.md).

## Candidate admission

Candidate vendors are defined in `rules/policy-vendor-candidates.json`. Their observations are stored in `rules/policy-vendor-candidate-state.json` and, when configured, in the same Supabase artifact store as the existing checker state.

Admission requires:

1. At least 56 distinct six-hour observations, representing 14 days of burn-in.
2. At least 99 percent successful structured-source fetches in the rolling window.
3. At least 95 percent content-hash stability after the minimum successful observation count.
4. No current failure and no consecutive failures above the configured limit.
5. A successful fetch within the policy-specific freshness window.
6. Human review confirms that each source governs the direct vendor-customer relationship. Merchant, student, viewer, or other downstream-customer operations pages are not valid evidence for the vendor's own subscription policy. Explicit not-applicable surfaces require the same review.
7. A separate reviewed rulebook change. Readiness never promotes a candidate automatically.

Manual reruns in the same six-hour slot replace that slot's observation instead of increasing the count.

## Current candidate pool

Skillshare, Vimeo, Typeform, Miro, monday.com, Thinkific, and ClickUp are monitored through official help-center article APIs. Every monitored source declares `policy_subject: direct_vendor_customer_relationship`; this declaration is validated, but it remains a human-reviewed applicability claim rather than an automated semantic inference. The [seven candidate research reviews](reviews/policy-candidate-applicability-20260906.md) are complete. Named maintainer sign-off is pending; Skillshare also needs product segmentation and Thinkific needs broader primary-policy evidence.

Manual applicability approval requires `review_owner`, `reviewed_by`, `reviewed_at_utc`, `review_scope`, `review_id`, HTTPS `evidence_urls` and a scoped not-applicable disposition. A flag alone is not sign-off. Future-dated or 90-day-old approvals do not satisfy admission.

Candidate vendors are part of the tracked network, not the supported-vendor contract. The coverage scorecard keeps three numbers separate:

- `tracked`: admitted production vendors plus isolated candidates under observation.
- `admitted`: reviewed vendors present in production rulebooks.
- `decision-ready`: production policy surfaces with deterministic or conditional decision modes.

## Generated evidence

Each daily run writes:

- `rules/policy-runtime-evidence.json`
- `rules/policy-vendor-lifecycle.json`
- `rules/policy-vendor-lifecycle.md`
- `rules/policy-vendor-candidate-state.json`
- `rules/policy-coverage-scorecard.json`
- `rules/policy-coverage-scorecard.md`

The lifecycle report identifies unreliable current vendor-policy pairs and candidates that have earned review. It does not remove vendors or rename public IDs. The separate runtime snapshot supplies freshness facts to the notary rulebooks; historical replay retains the original facts and verdict.
