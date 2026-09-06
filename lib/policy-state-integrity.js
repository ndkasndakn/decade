import { createHash } from 'node:crypto';

// Validate the complete response before callers write any restored files.
export function validatePolicyStateArtifacts(rows, allowedPaths, now = new Date()) {
  if (!Array.isArray(rows)) throw new Error('POLICY_STATE_INTEGRITY_INVALID');
  const allowed = new Set(allowedPaths);
  const result = new Map();
  for (const row of rows) {
    if (!allowed.has(row?.artifact_path)) continue;
    const updated = Date.parse(row.updated_at_utc);
    if (result.has(row.artifact_path) || typeof row.content_text !== 'string'
      || Buffer.byteLength(row.content_text) > 10000000
      || createHash('sha256').update(row.content_text).digest('hex') !== row.content_sha256
      || row.source !== 'check-policies.js' || !/^\d+$/.test(row.run_id || '')
      || !/^[1-9]\d*$/.test(row.run_attempt || '') || !/^[a-f0-9]{40}$/.test(row.commit_sha || '')
      || !Number.isFinite(updated) || updated > new Date(now).getTime()) {
      throw new Error('POLICY_STATE_INTEGRITY_INVALID');
    }
    result.set(row.artifact_path, row.content_text);
  }
  return result;
}
