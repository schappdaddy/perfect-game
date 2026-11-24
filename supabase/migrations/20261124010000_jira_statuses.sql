-- Statuses now match Jira (work space only; the home space keeps its own).
-- Stories, bugs and epics
update items set status=case status
  when 'New' then 'Backlog' when 'Need Requirements' then 'Backlog' when 'Under Review' then 'Backlog'
  when 'Awaiting Vendor Deliverable' then 'Backlog' when 'Accepted' then 'Ready'
  when 'Testing' then 'In Test' when 'Ready for Deployment' then 'Ready to Release' when 'Will Not Implement' then 'Killed'
  else status end
where coalesce(space,'work')='work';
update epics set status=case status
  when 'New' then 'Backlog' when 'Need Requirements' then 'Backlog' when 'Under Review' then 'Backlog'
  when 'Awaiting Vendor Deliverable' then 'Backlog' when 'Accepted' then 'Ready'
  when 'Testing' then 'In Progress' when 'Ready for Deployment' then 'Ready to Release' when 'Will Not Implement' then 'Killed'
  else status end
where coalesce(space,'work')='work';
-- Initiatives
update projects set status=case status
  when 'Queued' then 'Backlog' when 'Planning' then 'Ready' when 'Testing' then 'Ready for Acceptance'
  when 'On Hold' then 'Blocked' when 'Complete' then 'Done' when 'Cancelled' then 'Killed'
  else status end
where coalesce(space,'work')='work';
