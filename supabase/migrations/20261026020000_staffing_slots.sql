-- Standard staffing slots on a strategy roster: every project needs a Developer, a QA and a
-- Product Owner. Extra people have no slot. Allocation is no longer entered by hand: a
-- person's time is split evenly across the projects they're on at the same time.
alter table public.strategy_roles
  add column slot text check (slot in ('dev', 'qa', 'po'));
