import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPolicyVendorLifecycleReport } from '../lib/policy-vendor-lifecycle.js';
const registry = JSON.parse(readFileSync(new URL('../rules/policy-vendor-candidates.json', import.meta.url)));
const packet = JSON.parse(readFileSync(new URL('../docs/reviews/policy-candidate-applicability-20260906.json', import.meta.url)));
assert.equal(packet.reviews.length, Object.keys(registry.candidates).length);
assert.equal(new Set(packet.reviews.map(review => review.vendor)).size, packet.reviews.length);
for (const review of packet.reviews) {
  const slot = registry.candidates[review.vendor].policies.return;
  assert.equal(slot.review_id, review.review_id);
  assert.equal(slot.review_scope, review.scope);
  assert.equal(slot.review_disposition, review.recommendation);
  assert.deepEqual(slot.evidence_urls, review.source_urls);
  assert.equal(review.research_status, 'complete');
  if (!review.human_approval) assert.notEqual(slot.review_status, 'approved');
}
const report = buildPolicyVendorLifecycleReport({ rows: [], candidateRegistry: registry, candidateState: {}, now: new Date('2026-09-06T12:00:00Z') });
assert.equal(report.automatic_candidate_promotion, false);
assert.ok(report.candidates.every(candidate => !candidate.ready_for_review));
console.log('PASS: seven reviewed candidates have matching scope/evidence records and cannot auto-admit');
