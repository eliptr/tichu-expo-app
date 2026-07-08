create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  team_one_name text not null default 'Team 1',
  team_two_name text not null default 'Team 2',
  target_score integer not null default 1000,
  status text not null default 'active' check (status in ('active', 'completed')),
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.rounds (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  round_number integer not null,
  team_one_points integer not null default 0,
  team_two_points integer not null default 0,
  team_one_tichu_bonus integer not null default 0,
  team_two_tichu_bonus integer not null default 0,
  notes text,
  created_at timestamp with time zone default now() not null,
  unique (match_id, round_number)
);

create index if not exists matches_owner_created_at_idx on public.matches(owner_id, created_at desc);
create index if not exists rounds_match_round_number_idx on public.rounds(match_id, round_number);

drop trigger if exists set_matches_updated_at on public.matches;
create trigger set_matches_updated_at
before update on public.matches
for each row execute function public.set_updated_at();

alter table public.matches enable row level security;
alter table public.rounds enable row level security;

drop policy if exists "Users can read their own matches" on public.matches;
create policy "Users can read their own matches"
on public.matches
for select
to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Users can insert their own matches" on public.matches;
create policy "Users can insert their own matches"
on public.matches
for insert
to authenticated
with check ((select auth.uid()) = owner_id);

drop policy if exists "Users can update their own matches" on public.matches;
create policy "Users can update their own matches"
on public.matches
for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "Users can delete their own matches" on public.matches;
create policy "Users can delete their own matches"
on public.matches
for delete
to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Users can read their own rounds" on public.rounds;
create policy "Users can read their own rounds"
on public.rounds
for select
to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Users can insert their own rounds" on public.rounds;
create policy "Users can insert their own rounds"
on public.rounds
for insert
to authenticated
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.matches
    where matches.id = rounds.match_id
    and matches.owner_id = (select auth.uid())
  )
);

drop policy if exists "Users can update their own rounds" on public.rounds;
create policy "Users can update their own rounds"
on public.rounds
for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "Users can delete their own rounds" on public.rounds;
create policy "Users can delete their own rounds"
on public.rounds
for delete
to authenticated
using ((select auth.uid()) = owner_id);
