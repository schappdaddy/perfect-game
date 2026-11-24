-- Delivery teams, managed in Strategy settings. (An empty, unused teams table with id/name/
-- color/created_at already existed; this extends it.) Records refer to a team by name.
create table if not exists teams (id uuid primary key default gen_random_uuid(), name text not null, color text, created_at timestamptz not null default now());
alter table teams add column if not exists short text;
alter table teams add column if not exists status text not null default 'active'; -- 'active' | 'proposed'
alter table teams add column if not exists start_fy int;  -- a proposed team's first fiscal year
alter table teams add column if not exists notes text;
alter table teams add column if not exists sort_order int not null default 0;
alter table teams alter column color set default '#7A8FA6';
do $$ begin if not exists (select 1 from pg_constraint where conname='teams_name_key') then alter table teams add constraint teams_name_key unique(name); end if; end $$;
insert into teams(name,short,color,status,sort_order) values
 ('Consumer Experience','CX','#D9E2EC','active',0),
 ('Operational Efficiency','OE','#6FA6CB','active',1)
on conflict (name) do nothing;
