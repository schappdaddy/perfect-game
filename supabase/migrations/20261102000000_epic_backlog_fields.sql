-- Epics carry the same backlog fields as stories, so the backlog filters apply to them too
alter table epics add column if not exists swimlane text;
alter table epics add column if not exists request_type text;
alter table epics add column if not exists region text;
alter table epics add column if not exists vendor text;
