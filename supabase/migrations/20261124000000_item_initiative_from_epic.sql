-- A story or bug in an epic belongs to the epic's initiative: when it's saved with an epic
-- and no initiative, take the epic's initiative.
create or replace function items_initiative_from_epic() returns trigger language plpgsql as $$
begin
  if new.epic_id is not null and new.parent_project is null then
    select p.name into new.parent_project from epics e join projects p on p.id=e.project_id where e.id=new.epic_id;
  end if;
  return new;
end $$;
drop trigger if exists items_initiative_from_epic on items;
create trigger items_initiative_from_epic before insert or update of epic_id, parent_project on items
  for each row execute function items_initiative_from_epic();

-- Backfill: stories and bugs with an epic but no initiative
update items i set parent_project=p.name
from epics e join projects p on p.id=e.project_id
where i.epic_id=e.id and i.parent_project is null;
