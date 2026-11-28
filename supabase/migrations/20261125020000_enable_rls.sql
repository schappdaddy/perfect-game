-- PerfectGame: lock the database to signed-in users only
-- DRAFT for review. Not applied. Apply only AFTER the sign-in screen is live
-- and you can sign in, or the app will show empty data.
--
-- What it does
--   1. Turns on row-level security (RLS) for all 38 public tables.
--   2. Adds one policy per table: signed-in users can read and write everything
--      (same as today for you). Anyone using only the public key gets nothing.
--   3. Stops the public key from calling the 3 database functions the app calls.
--   4. Pins search_path on the 7 functions (clears the 7 security warnings).
--
-- Required before applying: in Supabase, Authentication > Sign In / Providers,
-- turn OFF "Allow new users to sign up", so nobody else can make an account.

begin;

-- 1 + 2. RLS and signed-in-only policies
alter table public.statuses enable row level security;
create policy "signed_in_full_access" on public.statuses
  for all to authenticated using (true) with check (true);

alter table public.swimlanes enable row level security;
create policy "signed_in_full_access" on public.swimlanes
  for all to authenticated using (true) with check (true);

alter table public.teams enable row level security;
create policy "signed_in_full_access" on public.teams
  for all to authenticated using (true) with check (true);

alter table public.items enable row level security;
create policy "signed_in_full_access" on public.items
  for all to authenticated using (true) with check (true);

alter table public.custom_columns enable row level security;
create policy "signed_in_full_access" on public.custom_columns
  for all to authenticated using (true) with check (true);

alter table public.custom_column_values enable row level security;
create policy "signed_in_full_access" on public.custom_column_values
  for all to authenticated using (true) with check (true);

alter table public.scoring_sessions enable row level security;
create policy "signed_in_full_access" on public.scoring_sessions
  for all to authenticated using (true) with check (true);

alter table public.scores enable row level security;
create policy "signed_in_full_access" on public.scores
  for all to authenticated using (true) with check (true);

alter table public.roadmap_items enable row level security;
create policy "signed_in_full_access" on public.roadmap_items
  for all to authenticated using (true) with check (true);

alter table public.discussion_flags enable row level security;
create policy "signed_in_full_access" on public.discussion_flags
  for all to authenticated using (true) with check (true);

alter table public.projects enable row level security;
create policy "signed_in_full_access" on public.projects
  for all to authenticated using (true) with check (true);

alter table public.milestones enable row level security;
create policy "signed_in_full_access" on public.milestones
  for all to authenticated using (true) with check (true);

alter table public.project_updates enable row level security;
create policy "signed_in_full_access" on public.project_updates
  for all to authenticated using (true) with check (true);

alter table public.daily_notes enable row level security;
create policy "signed_in_full_access" on public.daily_notes
  for all to authenticated using (true) with check (true);

alter table public.tasks enable row level security;
create policy "signed_in_full_access" on public.tasks
  for all to authenticated using (true) with check (true);

alter table public.ccrs enable row level security;
create policy "signed_in_full_access" on public.ccrs
  for all to authenticated using (true) with check (true);

alter table public.ccr_items enable row level security;
create policy "signed_in_full_access" on public.ccr_items
  for all to authenticated using (true) with check (true);

alter table public.roles enable row level security;
create policy "signed_in_full_access" on public.roles
  for all to authenticated using (true) with check (true);

alter table public.people enable row level security;
create policy "signed_in_full_access" on public.people
  for all to authenticated using (true) with check (true);

alter table public.project_roles enable row level security;
create policy "signed_in_full_access" on public.project_roles
  for all to authenticated using (true) with check (true);

alter table public.item_assignments enable row level security;
create policy "signed_in_full_access" on public.item_assignments
  for all to authenticated using (true) with check (true);

alter table public.quarterly_budgets enable row level security;
create policy "signed_in_full_access" on public.quarterly_budgets
  for all to authenticated using (true) with check (true);

alter table public.sprints enable row level security;
create policy "signed_in_full_access" on public.sprints
  for all to authenticated using (true) with check (true);

alter table public.sprint_assignments enable row level security;
create policy "signed_in_full_access" on public.sprint_assignments
  for all to authenticated using (true) with check (true);

alter table public.sprint_config enable row level security;
create policy "signed_in_full_access" on public.sprint_config
  for all to authenticated using (true) with check (true);

alter table public.strategies enable row level security;
create policy "signed_in_full_access" on public.strategies
  for all to authenticated using (true) with check (true);

alter table public.tracks enable row level security;
create policy "signed_in_full_access" on public.tracks
  for all to authenticated using (true) with check (true);

alter table public.track_goals enable row level security;
create policy "signed_in_full_access" on public.track_goals
  for all to authenticated using (true) with check (true);

alter table public.project_dependencies enable row level security;
create policy "signed_in_full_access" on public.project_dependencies
  for all to authenticated using (true) with check (true);

alter table public.epics enable row level security;
create policy "signed_in_full_access" on public.epics
  for all to authenticated using (true) with check (true);

alter table public.work_dependencies enable row level security;
create policy "signed_in_full_access" on public.work_dependencies
  for all to authenticated using (true) with check (true);

alter table public.strategy_items enable row level security;
create policy "signed_in_full_access" on public.strategy_items
  for all to authenticated using (true) with check (true);

alter table public.strategy_roles enable row level security;
create policy "signed_in_full_access" on public.strategy_roles
  for all to authenticated using (true) with check (true);

alter table public.releases enable row level security;
create policy "signed_in_full_access" on public.releases
  for all to authenticated using (true) with check (true);

alter table public.milestone_types enable row level security;
create policy "signed_in_full_access" on public.milestone_types
  for all to authenticated using (true) with check (true);

alter table public.readiness_log enable row level security;
create policy "signed_in_full_access" on public.readiness_log
  for all to authenticated using (true) with check (true);

alter table public.intake_stages enable row level security;
create policy "signed_in_full_access" on public.intake_stages
  for all to authenticated using (true) with check (true);

alter table public.tags enable row level security;
create policy "signed_in_full_access" on public.tags
  for all to authenticated using (true) with check (true);

-- 3. Functions the app calls (rename_tag, delete_tag) or could call: signed-in only
revoke execute on function public.rename_tag(text, text) from public, anon;
revoke execute on function public.delete_tag(text) from public, anon;
revoke execute on function public.epic_release_from_stories(uuid) from public, anon;
grant execute on function public.rename_tag(text, text) to authenticated;
grant execute on function public.delete_tag(text) to authenticated;
grant execute on function public.epic_release_from_stories(uuid) to authenticated;

-- 4. Pin search_path (fixes "Function Search Path Mutable" warnings)
alter function public.rename_tag(text, text) set search_path = public;
alter function public.delete_tag(text) set search_path = public;
alter function public.epic_release_from_stories(uuid) set search_path = public;
alter function public.items_epic_release() set search_path = public;
alter function public.items_initiative_from_epic() set search_path = public;
alter function public.delete_strategy_items() set search_path = public;
alter function public.delete_work_dependencies() set search_path = public;

commit;

-- Undo (if the app breaks after applying): run
--   alter table public.<table> disable row level security;
-- for each table, or run supabase/rollback/20261125020000_enable_rls_rollback.sql.
