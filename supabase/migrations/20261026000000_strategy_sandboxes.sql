-- Strategies become sandboxes. Each strategy keeps its own placement of projects and epics
-- (track, dates, planning state) and its own dependencies, so changing one strategy never
-- touches another or the main roadmap. "Promote" copies a strategy onto the main roadmap
-- (the projects' and epics' own dates). projects.track_id is no longer read.

create table public.strategy_items (
  id uuid primary key default gen_random_uuid(),
  strategy_id uuid not null references public.strategies(id) on delete cascade,
  item_type text not null check (item_type in ('project', 'epic')),
  item_id uuid not null,
  track_id uuid references public.tracks(id) on delete set null,
  start_date date,
  end_date date,
  planning_state text check (planning_state in ('planned', 'proposed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (strategy_id, item_type, item_id)
);
create index on public.strategy_items (item_type, item_id);

alter table public.strategies add column promoted_at timestamptz;

-- Dependencies: strategy_id null = the main roadmap; otherwise they belong to that strategy
alter table public.work_dependencies add column strategy_id uuid references public.strategies(id) on delete cascade;
alter table public.work_dependencies drop constraint work_dependencies_blocker_type_blocker_id_blocked_type_bloc_key;
alter table public.work_dependencies add constraint work_dependencies_unique
  unique nulls not distinct (strategy_id, blocker_type, blocker_id, blocked_type, blocked_id);

-- Remove a deleted project's or epic's placements, alongside its dependency lines
create or replace function public.delete_strategy_items() returns trigger
language plpgsql as $$
begin
  delete from public.strategy_items where item_type = tg_argv[0] and item_id = old.id;
  return old;
end $$;
create trigger projects_delete_strategy_items after delete on public.projects
  for each row execute function public.delete_strategy_items('project');
create trigger epics_delete_strategy_items after delete on public.epics
  for each row execute function public.delete_strategy_items('epic');

-- Seed: each project already on a track keeps that placement in the track's strategy
insert into public.strategy_items (strategy_id, item_type, item_id, track_id, start_date, end_date, planning_state)
select t.strategy_id, 'project', p.id, p.track_id, p.start_date, p.end_date,
       case when p.planning_state = 'proposed' then 'proposed' else 'planned' end
from public.projects p join public.tracks t on t.id = p.track_id
on conflict (strategy_id, item_type, item_id) do update
  set track_id = excluded.track_id, start_date = excluded.start_date, end_date = excluded.end_date,
      planning_state = excluded.planning_state, updated_at = now();

-- Seed: every strategy starts with its own copy of the existing project/epic dependencies
insert into public.work_dependencies (strategy_id, blocker_type, blocker_id, blocked_type, blocked_id)
select s.id, d.blocker_type, d.blocker_id, d.blocked_type, d.blocked_id
from public.work_dependencies d cross join public.strategies s
where d.strategy_id is null and d.blocker_type <> 'item' and d.blocked_type <> 'item'
on conflict do nothing;
