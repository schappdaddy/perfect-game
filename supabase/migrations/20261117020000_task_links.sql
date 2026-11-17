-- Tasks can link to a backlog item, and remember the day's note they were written in
alter table tasks add column if not exists item_id uuid, add column if not exists note_date date;
