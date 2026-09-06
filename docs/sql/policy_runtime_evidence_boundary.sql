-- Additive release prerequisite. Apply only after explicit production approval.
-- Existing monitor writes use service_role; browser clients need no artifact access.
begin;
alter table public.policy_state_artifacts enable row level security;
revoke all on table public.policy_state_artifacts from public, anon, authenticated;
grant select, insert, update, delete on table public.policy_state_artifacts to service_role;

create or replace function public.read_policy_runtime_evidence()
returns setof public.policy_state_artifacts
language sql stable security invoker
set search_path = ''
as $$
  select a.* from public.policy_state_artifacts a
  where a.artifact_path = 'rules/policy-runtime-evidence.json'
    and (select c.relrowsecurity from pg_catalog.pg_class c
         where c.oid = 'public.policy_state_artifacts'::regclass)
    and not pg_catalog.has_table_privilege('anon', 'public.policy_state_artifacts', 'INSERT,UPDATE,DELETE,TRUNCATE')
    and not pg_catalog.has_table_privilege('authenticated', 'public.policy_state_artifacts', 'INSERT,UPDATE,DELETE,TRUNCATE');
$$;
revoke all on function public.read_policy_runtime_evidence() from public, anon, authenticated;
grant execute on function public.read_policy_runtime_evidence() to service_role;
commit;
