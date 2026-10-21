-- Dependencies between any two pieces of work: projects, epics or items (stories).
-- "blocked" can't start until "blocker" finishes. Drawn as arrows on both roadmaps.
-- Replaces project_dependencies (copied over below; the old table is left in place).

create table public.work_dependencies (
  id uuid primary key default gen_random_uuid(),
  blocker_type text not null check (blocker_type in ('project', 'epic', 'item')),
  blocker_id uuid not null,
  blocked_type text not null check (blocked_type in ('project', 'epic', 'item')),
  blocked_id uuid not null,
  created_at timestamptz not null default now(),
  unique (blocker_type, blocker_id, blocked_type, blocked_id),
  check (not (blocker_type = blocked_type and blocker_id = blocked_id))
);
create index on public.work_dependencies (blocker_type, blocker_id);
create index on public.work_dependencies (blocked_type, blocked_id);

insert into public.work_dependencies (blocker_type, blocker_id, blocked_type, blocked_id, created_at)
select 'project', depends_on_id, 'project', project_id, created_at from public.project_dependencies
on conflict do nothing;

-- The ids point at three different tables, so foreign keys can't clean up; triggers do.
create or replace function public.delete_work_dependencies() returns trigger
language plpgsql as $$
begin
  delete from public.work_dependencies
  where (blocker_type = tg_argv[0] and blocker_id = old.id)
     or (blocked_type = tg_argv[0] and blocked_id = old.id);
  return old;
end $$;

create trigger projects_delete_work_dependencies after delete on public.projects
  for each row execute function public.delete_work_dependencies('project');
create trigger epics_delete_work_dependencies after delete on public.epics
  for each row execute function public.delete_work_dependencies('epic');
create trigger items_delete_work_dependencies after delete on public.items
  for each row execute function public.delete_work_dependencies('item');
