import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validatePolicyStateArtifacts } from '../lib/policy-state-integrity.js';
const content = '{"vendors":{}}';
const row = { artifact_path: 'rules/policy-hashes.json', content_text: content,
  content_sha256: createHash('sha256').update(content).digest('hex'), source: 'check-policies.js',
  run_id: '1', run_attempt: '1', commit_sha: 'a'.repeat(40), updated_at_utc: '2026-09-06T00:00:00Z' };
const validate = rows => validatePolicyStateArtifacts(rows, [row.artifact_path], new Date('2026-09-06T12:00:00Z'));
assert.equal(validate([row]).get(row.artifact_path), content);
for (const bad of [{ ...row, content_text: content + ' ' }, { ...row, source: 'other' },
  { ...row, updated_at_utc: '2099-01-01T00:00:00Z' }, { ...row, commit_sha: '' }]) {
  assert.throws(() => validate([bad]), /POLICY_STATE_INTEGRITY_INVALID/);
}
assert.throws(() => validate([row, row]), /POLICY_STATE_INTEGRITY_INVALID/);
console.log('PASS: monitoring state rejects corruption, duplicate artifacts and invalid provenance before hydration');
