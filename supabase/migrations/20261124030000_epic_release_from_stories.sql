-- An epic ships when its last story ships: its release follows the latest release among its
-- stories (killed / won't-do stories don't count). Epics whose stories have no release keep theirs.
create or replace function epic_release_from_stories(eid uuid) returns void language sql as $$
  update epics e set release_month=s.m
  from (select max(release_month) m from items
        where epic_id=eid and release_month is not null
          and coalesce(status,'') not in ('Killed','Will Not Implement','Won''t Do')) s
  where e.id=eid and s.m is not null and e.release_month is distinct from s.m;
$$;
create or replace function items_epic_release() returns trigger language plpgsql as $$
begin
  if tg_op in ('UPDATE','DELETE') and old.epic_id is not null then perform epic_release_from_stories(old.epic_id); end if;
  if tg_op in ('INSERT','UPDATE') and new.epic_id is not null and (tg_op='INSERT' or new.epic_id is distinct from old.epic_id or new.release_month is distinct from old.release_month or new.status is distinct from old.status) then
    perform epic_release_from_stories(new.epic_id);
  end if;
  return null;
end $$;
drop trigger if exists items_epic_release on items;
create trigger items_epic_release after insert or update of epic_id, release_month, status or delete on items
  for each row execute function items_epic_release();
-- Bring existing epics in step
select epic_release_from_stories(id) from epics;
