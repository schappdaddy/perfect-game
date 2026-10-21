-- Epics become first-class backlog entries next to stories: they carry priority, status,
-- dates, effort, team and work type, and an epic can sit in the backlog before it has a
-- project. Stories stay in items and point at their epic through items.epic_id.

alter table public.epics
  alter column project_id drop not null,
  alter column status set default 'New',
  add column priority text not null default 'P3',
  add column start_date date,
  add column end_date date,
  add column effort text,
  add column team text,
  add column work_type text check (work_type in ('new', 'sustain'));

update public.epics set status = 'New' where status = 'Open';
