-- Milestone types you can add to, each with a colour (milestones.type stores the name)
create table if not exists milestone_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#B07CE0',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
insert into milestone_types (name,color,sort_order) values
 ('Milestone','#B07CE0',0),('Go-Live','#27AE60',1),('Deadline','#E74C3C',2),('Review','#5DADE2',3),
 ('Release','#C8973A',4),('Code Freeze','#8FA6BC',5),('UAT','#E07B2A',6),('Kickoff','#1ABC9C',7)
on conflict (name) do nothing;
