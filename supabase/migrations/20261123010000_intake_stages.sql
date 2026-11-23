-- Intake process: your own stages (created in the UI) and each initiative's current stage.
-- Changes are logged in readiness_log with gate 'intake'.
create table if not exists intake_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#5DADE2',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table projects add column if not exists intake_stage_id uuid references intake_stages(id) on delete set null;
