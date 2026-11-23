-- Jira link on initiatives, epics, stories and bugs (items already have jira_key from the CSV import)
alter table projects add column if not exists jira_url text;
alter table epics add column if not exists jira_url text;
alter table items add column if not exists jira_url text;
