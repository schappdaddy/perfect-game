-- Planning sets when work is done (plan_quarter, e.g. 'FY27-Q3') and when it ships
-- (release_month); it no longer moves work into a quarter initiative. Quarterly Tech Debt
-- initiatives hold only tech debt with no other initiative.
alter table items add column if not exists plan_quarter text;
alter table epics add column if not exists plan_quarter text;

-- Work already planned: its quarter plan's quarter
update items i set plan_quarter = p.sustain_quarter
from projects p where p.sustain_quarter is not null and i.parent_project = p.name and i.plan_quarter is null;
update epics e set plan_quarter = p.sustain_quarter
from projects p where p.sustain_quarter is not null and e.project_id = p.id and e.plan_quarter is null;
-- Work with a release but no quarter: the release's quarter (FY runs April to March)
update items set plan_quarter = 'FY' || right((split_part(release_month,'-',1)::int + case when split_part(release_month,'-',2)::int >= 4 then 1 else 0 end)::text, 2)
  || '-Q' || (case when split_part(release_month,'-',2)::int >= 4 then (split_part(release_month,'-',2)::int - 4) / 3 + 1 else 4 end)
where release_month is not null and plan_quarter is null;
update epics set plan_quarter = 'FY' || right((split_part(release_month,'-',1)::int + case when split_part(release_month,'-',2)::int >= 4 then 1 else 0 end)::text, 2)
  || '-Q' || (case when split_part(release_month,'-',2)::int >= 4 then (split_part(release_month,'-',2)::int - 4) / 3 + 1 else 4 end)
where release_month is not null and plan_quarter is null;

-- The quarterly initiatives are Tech Debt again: "FY27 Q3 Tech Debt (CX)"
update items i set parent_project = replace(p.name, ' Plan (', ' Tech Debt (')
from projects p where p.sustain_quarter is not null and p.name like '% Plan (%' and i.parent_project = p.name;
update projects set name = replace(name, ' Plan (', ' Tech Debt ('),
  description = 'Tech debt for ' || coalesce(team,'the team') || ', ' || split_part(name,' Plan',1) || '. Planned for the quarter, deployed in monthly releases.'
where sustain_quarter is not null and name like '% Plan (%';
