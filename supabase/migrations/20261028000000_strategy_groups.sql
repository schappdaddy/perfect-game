-- Projects in a strategy can share a group name: work that runs at the same time
alter table strategy_items add column if not exists group_name text;
