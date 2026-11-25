-- Free-form tags on stories, bugs and epics (e.g. "Japan"), created from the UI and used to filter
create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#5DADE2',
  created_at timestamptz not null default now()
);
alter table items add column if not exists tags text[] not null default '{}';
alter table epics add column if not exists tags text[] not null default '{}';
create index if not exists items_tags_idx on items using gin(tags);
create index if not exists epics_tags_idx on epics using gin(tags);
-- Rename / delete a tag everywhere it's used
create or replace function rename_tag(old_name text, new_name text) returns void language sql as $$
  update items set tags=array_replace(tags,old_name,new_name) where old_name=any(tags);
  update epics set tags=array_replace(tags,old_name,new_name) where old_name=any(tags);
  update tags set name=new_name where name=old_name;
$$;
create or replace function delete_tag(tag_name text) returns void language sql as $$
  update items set tags=array_remove(tags,tag_name) where tag_name=any(tags);
  update epics set tags=array_remove(tags,tag_name) where tag_name=any(tags);
  delete from tags where name=tag_name;
$$;
