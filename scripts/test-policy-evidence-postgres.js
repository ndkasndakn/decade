import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { join } from 'node:path';

// Isolated, Unix-socket-only database. Never reads production connection settings.
const dir = mkdtempSync('/tmp/decide-evidence-pg-');
const data = join(dir, 'data');
const psql = sql => execFileSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-At', '-h', dir, '-p', '55491', '-U', userInfo().username, '-d', 'postgres'],
  { input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
let started = false;
try {
  execFileSync('initdb', ['-D', data, '--auth=trust', '--no-locale'], { stdio: 'pipe' });
  execFileSync('pg_ctl', ['-D', data, '-l', join(dir, 'postgres.log'), '-o', `-h '' -k ${dir} -p 55491`, '-w', 'start'], { stdio: 'pipe' });
  started = true;
  psql('create role anon; create role authenticated; create role service_role bypassrls;');
  psql(readFileSync(new URL('../docs/sql/policy_supabase.sql', import.meta.url), 'utf8'));
  psql("grant all on public.policy_state_artifacts to public, anon, authenticated; insert into public.policy_state_artifacts (artifact_path,content_text,content_sha256) values ('rules/policy-runtime-evidence.json','{}','test');");
  const migration = readFileSync(new URL('../docs/sql/policy_runtime_evidence_boundary.sql', import.meta.url), 'utf8');
  psql(migration); psql(migration);
  assert.equal(psql('set role service_role; select count(*) from public.read_policy_runtime_evidence();').split('\n').at(-1), '1');
  for (const role of ['anon', 'authenticated']) {
    for (const statement of ['select * from public.read_policy_runtime_evidence()', "update public.policy_state_artifacts set content_text='forged'", 'select * from public.policy_state_artifacts']) {
      assert.throws(() => psql(`set role ${role}; ${statement};`), /permission denied/);
    }
  }
  psql('grant update on public.policy_state_artifacts to authenticated;');
  assert.equal(psql('set role service_role; select count(*) from public.read_policy_runtime_evidence();').split('\n').at(-1), '0', 'permissions drift must disable the runtime reader');
  psql(migration);
  psql('alter table public.policy_state_artifacts disable row level security;');
  assert.equal(psql('set role service_role; select count(*) from public.read_policy_runtime_evidence();').split('\n').at(-1), '0', 'disabled RLS must disable the runtime reader');
  console.log('PASS: real PostgreSQL verifies idempotent migration, service-only reads, public denial and permissions-drift fail-closed behavior');
} finally {
  if (started) execFileSync('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'pipe' });
  console.log(`Stopped isolated test database. Retained test artifacts: ${dir}`);
}
