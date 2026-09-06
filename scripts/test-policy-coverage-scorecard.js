#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPolicyVendorLifecycleReport } from "../lib/policy-vendor-lifecycle.js";

import {
  buildPolicyCoverageScorecard,
  validatePolicyVendorCandidateRegistry,
} from "../lib/policy-coverage-scorecard.js";

function buildFixture() {
  return {
    rulebooks: {
      refund: {
        vendors: {
          alpha: { decision_mode: "deterministic" },
          beta: { decision_mode: "review_only" },
        },
      },
      cancel: {
        vendors: {
          alpha: { decision_mode: "conditional" },
          beta: { decision_mode: "deterministic" },
        },
      },
      return: {
        vendors: {
          alpha: { decision_mode: "review_only" },
          beta: { decision_mode: "review_only" },
        },
      },
      trial: {
        vendors: {
          alpha: { offer_mode: "observed" },
          beta: { offer_mode: "observed" },
        },
      },
    },
    sourceMaps: {
      refund: {
        vendors: {
          alpha: { url: "https://alpha.example/refund", backup_urls: ["https://alpha.example/terms"] },
          beta: { url: "https://beta.example/terms" },
        },
      },
      cancel: {
        vendors: {
          alpha: { url: "https://alpha.example/terms" },
          beta: { url: "https://beta.example/terms" },
        },
      },
      return: { vendors: {} },
      trial: { vendors: {} },
    },
    candidateRegistry: {
      targets: {
        tracked_vendors: 200,
        admitted_vendors: 150,
        decision_ready_surfaces: 300,
      },
      candidates: {
        gamma: {
          display_name: "Gamma",
          cohort: "2026-07-b2b-saas-01",
          segment: "b2b_saas",
          demand_tier: 1,
          source_strategy: "structured_help_center_api",
          allowed_hosts: ["gamma.example"],
          policies: {
            refund: {
              monitor: "zendesk_api",
              policy_subject: "direct_vendor_customer_relationship",
              fetch_url: "https://gamma.example/refund.json",
              evidence_url: "https://gamma.example/refund",
              required_terms: ["refund"],
            },
            return: {
              monitor: "manual_review",
              review_status: "pending",
              reason: "Applicability requires human review.",
            },
          },
        },
      },
    },
    lifecycleReport: {
      totals: {
        lifecycle_counts: { monitored: 1, degraded: 1 },
        candidates_ready_for_review: 0,
      },
    },
    now: new Date("2026-07-30T12:00:00Z"),
  };
}

function testScorecardSeparatesTrackedFromAdmittedCoverage() {
  const scorecard = buildPolicyCoverageScorecard(buildFixture());

  assert.equal(scorecard.production.admitted_vendor_count, 2);
  assert.equal(scorecard.production.configured_policy_surface_count, 8);
  assert.equal(scorecard.production.decision_ready_surface_count, 3);
  assert.equal(scorecard.production.review_only_surface_count, 3);
  assert.equal(scorecard.production.observed_offer_surface_count, 2);
  assert.equal(scorecard.production.unique_primary_source_url_count, 3);
  assert.equal(scorecard.production.surfaces_with_backup_source_count, 1);
  assert.equal(scorecard.candidates.candidate_vendor_count, 1);
  assert.equal(scorecard.candidates.monitored_policy_surface_count, 1);
  assert.equal(scorecard.candidates.manual_review_surface_count, 1);
  assert.equal(scorecard.network.tracked_vendor_count, 3);
  assert.equal(scorecard.network.tracked_target_progress_percent, 1.5);
  assert.equal(scorecard.network.decision_ready_target_progress_percent, 1);
}

function testCandidateMetadataAndProductionIdsAreValidated() {
  const fixture = buildFixture();
  assert.deepEqual(
    validatePolicyVendorCandidateRegistry(fixture.candidateRegistry, new Set(["alpha", "beta"])),
    []
  );

  fixture.candidateRegistry.candidates.alpha = {
    display_name: "Duplicate Alpha",
    policies: {},
  };
  const errors = validatePolicyVendorCandidateRegistry(
    fixture.candidateRegistry,
    new Set(["alpha", "beta"])
  );
  assert.ok(errors.some((error) => error.includes("candidate_already_admitted:alpha")));
  assert.ok(errors.some((error) => error.includes("candidate_metadata_missing:alpha:cohort")));

  fixture.candidateRegistry.candidates.gamma.policies.refund.evidence_url = "https://outside.example/refund";
  fixture.candidateRegistry.candidates.gamma.policies.refund.policy_subject = "downstream_merchant_customer";
  const sourceErrors = validatePolicyVendorCandidateRegistry(
    fixture.candidateRegistry,
    new Set(["alpha", "beta"])
  );
  assert.ok(
    sourceErrors.some((error) => error.includes("candidate_evidence_url_host_not_allowed:gamma:refund"))
  );
  assert.ok(
    sourceErrors.some((error) => error.includes("candidate_policy_subject_invalid:gamma:refund"))
  );
}

testScorecardSeparatesTrackedFromAdmittedCoverage();
console.log("PASS coverage scorecard separates tracked, admitted, and decision-ready coverage");
testCandidateMetadataAndProductionIdsAreValidated();
console.log("PASS coverage scorecard validates candidate metadata and admitted-vendor overlap");
const checkedInRegistry = JSON.parse(readFileSync(new URL("../rules/policy-vendor-candidates.json", import.meta.url), "utf8"));
const checkedInScorecard = buildPolicyCoverageScorecard({ ...buildFixture(), candidateRegistry: checkedInRegistry });
assert.equal(checkedInScorecard.candidates.manual_review_surface_count, 7);
assert.equal(checkedInScorecard.production.admitted_vendor_count, 2);
const checkedInLifecycle = buildPolicyVendorLifecycleReport({ candidateRegistry: checkedInRegistry });
assert.equal(checkedInLifecycle.candidates.length, 7);
assert.equal(checkedInLifecycle.candidates.every(candidate => candidate.ready_for_review === false
  && candidate.blockers.includes("return:manual_policy_applicability_review_required")), true);
const invalidReviewRegistry = structuredClone(checkedInRegistry);
invalidReviewRegistry.candidates.skillshare.policies.return.review_status = "implicitly_approved";
assert.ok(validatePolicyVendorCandidateRegistry(invalidReviewRegistry).some(error => error.includes("candidate_manual_review_status_invalid")));
console.log("PASS actual candidate registry can report pending sign-off without admitting candidates or accepting unknown statuses");
console.log("Policy coverage scorecard tests passed: 3/3");
