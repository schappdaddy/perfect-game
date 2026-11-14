-- Work types: New, Sustain and SaaS deliverable
alter table projects drop constraint if exists projects_work_type_check;
alter table projects add constraint projects_work_type_check check (work_type = any (array['new','sustain','saas']));
alter table items drop constraint if exists items_work_type_check;
alter table items add constraint items_work_type_check check (work_type = any (array['new','sustain','saas']));
alter table epics drop constraint if exists epics_work_type_check;
alter table epics add constraint epics_work_type_check check (work_type = any (array['new','sustain','saas']));

-- Request types are now Enhancement and Tech Debt. Items outside an initiative took their work
-- type from the request type (Strategic Initiative and Business Request meant New), so pin
-- that before converting.
update items set work_type = 'new'
where work_type is null and request_type in ('Strategic Initiative','Business Request')
  and (parent_project is null or parent_project not in (select name from projects));
update items set request_type = 'Tech Debt' where request_type in ('Bug','Testing');
update items set request_type = 'Enhancement' where request_type in ('Strategic Initiative','Business Request');
update epics set request_type = 'Tech Debt' where request_type in ('Bug','Testing');
update epics set request_type = 'Enhancement' where request_type in ('Strategic Initiative','Business Request');

-- Quarterly tech debt initiatives become general quarter plans: "FY27 Q3 Plan (CX)"
update items i set parent_project = replace(p.name, ' Tech Debt (', ' Plan (')
from projects p where p.sustain_quarter is not null and p.name like '% Tech Debt (%' and i.parent_project = p.name;
update projects set name = replace(name, ' Tech Debt (', ' Plan ('),
  description = 'Work planned for ' || coalesce(team,'the team') || ' in ' || split_part(name,' Tech Debt',1) || ', deployed in monthly releases.'
where sustain_quarter is not null and name like '% Tech Debt (%';
