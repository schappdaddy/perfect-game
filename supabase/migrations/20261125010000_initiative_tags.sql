-- Tags on initiatives too; renaming / deleting a tag updates them as well
alter table projects add column if not exists tags text[] not null default '{}';
create index if not exists projects_tags_idx on projects using gin(tags);
create or replace function rename_tag(old_name text, new_name text) returns void language sql as $$
  update items set tags=array_replace(tags,old_name,new_name) where old_name=any(tags);
  update epics set tags=array_replace(tags,old_name,new_name) where old_name=any(tags);
  update projects set tags=array_replace(tags,old_name,new_name) where old_name=any(tags);
  update tags set name=new_name where name=old_name;
$$;
create or replace function delete_tag(tag_name text) returns void language sql as $$
  update items set tags=array_remove(tags,tag_name) where tag_name=any(tags);
  update epics set tags=array_remove(tags,tag_name) where tag_name=any(tags);
  update projects set tags=array_remove(tags,tag_name) where tag_name=any(tags);
  delete from tags where name=tag_name;
$$;
