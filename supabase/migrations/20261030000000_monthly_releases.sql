-- Monthly releases: one row per month that has a date, or is marked as having no release
-- (e.g. code freeze). Initiatives (projects), epics and stories are tagged by month key.
create table if not exists releases (
  id uuid primary key default gen_random_uuid(),
  month text not null unique check (month ~ '^\d{4}-\d{2}$'),
  release_date date,
  no_release boolean not null default false,
  name text,
  notes text,
  created_at timestamptz not null default now()
);
alter table items add column if not exists release_month text;
alter table epics add column if not exists release_month text;
alter table projects add column if not exists release_month text;
-- Quarterly sustain initiatives (tech debt / OpEx buckets), e.g. 'FY27-Q4'
alter table projects add column if not exists sustain_quarter text;
