-- PRD and Design gates on initiatives, epics and stories/bugs: status (draft, review, approved,
-- na; null = not started) and a link, with every change kept in readiness_log for audit
alter table projects add column if not exists prd_status text, add column if not exists prd_link text, add column if not exists design_status text, add column if not exists design_link text;
alter table epics add column if not exists prd_status text, add column if not exists prd_link text, add column if not exists design_status text, add column if not exists design_link text;
alter table items add column if not exists prd_status text, add column if not exists prd_link text, add column if not exists design_status text, add column if not exists design_link text;
create table if not exists readiness_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('project','epic','item')),
  entity_id uuid not null,
  entity_name text,
  gate text not null check (gate in ('prd','design')),
  from_status text,
  to_status text,
  link text,
  by_name text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists readiness_log_entity on readiness_log (entity_type, entity_id, created_at desc);
