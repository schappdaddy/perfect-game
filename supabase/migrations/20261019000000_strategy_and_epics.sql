-- Strategy layer (strategy → tracks → yearly goals), project dependencies, and epics
-- between projects and items. Additive only: existing rows and queries are unaffected.

create table public.strategies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  start_fy int not null,            -- first fiscal year shown (FY runs Apr–Mar, FY27 = Apr 2026–Mar 2027)
  end_fy int not null,
  bau_pct numeric not null default 30,                 -- capacity reserved for ongoing/BAU work
  freeze_months int[] not null default '{10,11,12}',   -- calendar months under code freeze
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  check (end_fy >= start_fy)
);

create table public.tracks (
  id uuid primary key default gen_random_uuid(),
  strategy_id uuid not null references public.strategies(id) on delete cascade,
  name text not null,
  description text,
  color text not null default '#E07B2A',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.track_goals (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks(id) on delete cascade,
  fy int not null,
  goal text not null,
  created_at timestamptz not null default now(),
  unique (track_id, fy)
);

alter table public.projects
  add column track_id uuid references public.tracks(id) on delete set null,
  add column planning_state text not null default 'planned'
    check (planning_state in ('planned', 'proposed', 'bau'));

create table public.project_dependencies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,     -- this project…
  depends_on_id uuid not null references public.projects(id) on delete cascade,  -- …can't start until this one ends
  created_at timestamptz not null default now(),
  unique (project_id, depends_on_id),
  check (project_id <> depends_on_id)
);

create table public.epics (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'Open',
  sort_order int not null default 0,
  space text not null default 'work',
  created_at timestamptz not null default now()
);

alter table public.items
  add column epic_id uuid references public.epics(id) on delete set null;

create index on public.tracks (strategy_id);
create index on public.track_goals (track_id);
create index on public.project_dependencies (depends_on_id);
create index on public.epics (project_id);
create index on public.items (epic_id);
