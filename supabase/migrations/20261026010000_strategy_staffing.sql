-- Per-strategy staffing. A strategy can give a project its own team and roster (named people
-- or generic roles × headcount × allocation %), priced the same way as the Budget tab.
-- Until a strategy touches a project's roster it uses the project's own (project_roles);
-- roster_custom marks the point where the strategy took its own copy. Promoting copies the
-- strategy's team and roster onto the project.

alter table public.strategy_items
  add column team text,
  add column roster_custom boolean not null default false;

create table public.strategy_roles (
  id uuid primary key default gen_random_uuid(),
  strategy_id uuid not null references public.strategies(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  role_id uuid references public.roles(id) on delete set null,
  person_id uuid references public.people(id) on delete set null,
  headcount numeric not null default 1,
  allocation_pct numeric not null default 100,
  created_at timestamptz not null default now()
);
create index on public.strategy_roles (strategy_id, project_id);
