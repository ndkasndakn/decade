#!/usr/bin/env node

import assert from "node:assert/strict";

import {
  buildPolicyVendorLifecycleReport,
  evaluateMonitoredVendorPolicy,
} from "../lib/policy-vendor-lifecycle.js";

function testCurrentDegradedAndExpiredPoliciesStayDistinct() {
  const now = new Date("2026-07-30T12:00:00Z");
  const current = evaluateMonitoredVendorPolicy({
    policy: "refund",
    vendor: "healthy",
    status: "unchanged",
    last_successful_fetch_utc: "2026-07-30T06:00:00Z",
  }, { now });
  const degraded = evaluateMonitoredVendorPolicy({
    policy: "refund",
    vendor: "blocked",
    status: "fetch_blocked",
    last_successful_fetch_utc: "2026-07-29T06:00:00Z",
  }, { now });
  const expired = evaluateMonitoredVendorPolicy({
    policy: "trial",
    vendor: "stale",
    status: "fetch_failed",
    last_successful_fetch_utc: "2026-07-01T06:00:00Z",
  }, { now });

  assert.equal(current.lifecycle, "monitored");
  assert.equal(degraded.lifecycle, "degraded");
  assert.equal(expired.lifecycle, "expired");
  assert.equal(expired.lifecycle_reason, "source_freshness_expired");
}

function successObservation(slot) {
  return { slot, status: "success" };
}

function testCandidateNeedsBurnInAndHumanApplicabilityReview() {
  const observations = Array.from({ length: 56 }, (_, index) => successObservation(`slot-${index}`));
  const registry = {
    admission: {
      minimum_observations: 56,
      minimum_success_rate: 0.99,
      max_consecutive_failures: 0,
      freshness_days_by_policy: { refund: 30, return: 30 },
    },
    candidates: {
      candidate_vendor: {
        display_name: "Candidate Vendor",
        policies: {
          refund: { monitor: "zendesk_api" },
          return: { monitor: "manual_review", review_status: "pending" },
        },
      },
    },
  };
  const state = {
    candidates: {
      candidate_vendor: {
        policies: {
          refund: {
            observations,
            consecutive_failures: 0,
            last_status: "success",
            last_successful_fetch_utc: "2026-07-30T06:00:00Z",
          },
        },
      },
    },
  };
  const report = buildPolicyVendorLifecycleReport({
    rows: [],
    candidateRegistry: registry,
    candidateState: state,
    now: new Date("2026-07-30T12:00:00Z"),
  });

  assert.equal(report.candidates[0].policies.find((policy) => policy.policy === "refund").lifecycle, "ready_for_review");
  assert.equal(report.candidates[0].ready_for_review, false);
  assert.match(report.candidates[0].blockers.join(" "), /manual_policy_applicability_review_required/);
  assert.equal(report.automatic_candidate_promotion, false);

  registry.candidates.candidate_vendor.policies.return.review_status = "approved";
  const incompleteSignoff = buildPolicyVendorLifecycleReport({ rows: [], candidateRegistry: registry, candidateState: state,
    now: new Date("2026-07-30T12:00:00Z") });
  assert.equal(incompleteSignoff.candidates[0].ready_for_review, false, "An approval flag without review ownership and evidence is not sign-off");
  Object.assign(registry.candidates.candidate_vendor.policies.return, {
    review_owner: "test-policy-maintainer", reviewed_by: "test-policy-maintainer", reviewed_at_utc: "2026-07-30T10:00:00Z",
    review_scope: "Direct subscription only", review_disposition: "not_applicable_to_scoped_subscription",
    review_id: "test-review", evidence_urls: ["https://vendor.example/subscription-terms"],
  });
  const approvedReport = buildPolicyVendorLifecycleReport({
    rows: [],
    candidateRegistry: registry,
    candidateState: state,
    now: new Date("2026-07-30T12:00:00Z"),
  });
  assert.equal(approvedReport.candidates[0].ready_for_review, true);
  assert.equal(approvedReport.candidates[0].lifecycle, "ready_for_review");
}

function testUnstableCandidateEvidenceCannotGraduate() {
  const registry = {
    admission: {
      minimum_observations: 3,
      minimum_success_rate: 0.99,
      minimum_hash_stability_rate: 0.95,
      max_consecutive_failures: 0,
      freshness_days_by_policy: { refund: 30 },
    },
    candidates: {
      volatile_vendor: {
        display_name: "Volatile Vendor",
        policies: {
          refund: { monitor: "official_document" },
        },
      },
    },
  };
  const state = {
    candidates: {
      volatile_vendor: {
        policies: {
          refund: {
            observations: [
              { slot: "slot-1", status: "success", content_hash: "hash-a" },
              { slot: "slot-2", status: "success", content_hash: "hash-b" },
              { slot: "slot-3", status: "success", content_hash: "hash-c" },
            ],
            consecutive_failures: 0,
            last_status: "success",
            last_successful_fetch_utc: "2026-07-30T06:00:00Z",
            hash_stability_rate: 0,
          },
        },
      },
    },
  };
  const report = buildPolicyVendorLifecycleReport({
    rows: [],
    candidateRegistry: registry,
    candidateState: state,
    now: new Date("2026-07-30T12:00:00Z"),
  });
  const policy = report.candidates[0].policies[0];

  assert.equal(policy.ready_for_review, false);
  assert.equal(policy.lifecycle, "candidate_degraded");
  assert.match(policy.blocker, /hash_stability_below_threshold/);
}

testCurrentDegradedAndExpiredPoliciesStayDistinct();
console.log("PASS policy vendor lifecycle separates current, degraded, and expired sources");
testCandidateNeedsBurnInAndHumanApplicabilityReview();
console.log("PASS policy vendor lifecycle requires burn-in and human applicability review");
testUnstableCandidateEvidenceCannotGraduate();
console.log("PASS unstable candidate evidence cannot graduate from burn-in");
console.log("Policy vendor lifecycle tests passed: 3/3");
