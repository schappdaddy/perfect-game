-- Initiatives are planned into a quarter (when they're worked) apart from their go-live release
alter table projects add column if not exists plan_quarter text;
