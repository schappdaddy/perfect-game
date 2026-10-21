-- Capacity split: "new" project work vs "sustain" work (tech debt, system stabilization
-- and enhancements to existing things). Strategies already hold the sustain share (bau_pct).
-- Additive: projects default to new; items default to following their project (null).

alter table public.projects
  add column work_type text not null default 'new' check (work_type in ('new', 'sustain'));

alter table public.items
  add column work_type text check (work_type in ('new', 'sustain'));

-- Starting point: projects already marked ongoing BAU, or budgeted as Support, are sustain work
update public.projects set work_type = 'sustain' where planning_state = 'bau' or budget_type = 'support';
