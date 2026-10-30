-- Epics are ranked alongside stories in the quarter planner's sustain backlog
alter table epics add column if not exists manual_rank integer;
