-- Bugs are work items with request_type 'Bug'; severity S1 Critical, S2 Major, S3 Minor, S4 Trivial
alter table items add column if not exists severity text;
