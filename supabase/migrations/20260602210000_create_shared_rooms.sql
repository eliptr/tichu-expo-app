create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_user_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid not null unique references public.matches(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint rooms_code_format check (code ~ '^[A-Z0-9]{6}$')
);

create table if not exists public.room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  seat text check (
    seat in (
      'team_one_player_one',
      'team_one_player_two',
      'team_two_player_one',
      'team_two_player_two'
    )
  ),
  joined_at timestamp with time zone default now() not null,
  unique (room_id, user_id),
  unique (room_id, seat)
);

create index if not exists rooms_code_idx on public.rooms(code);
create index if not exists room_members_room_id_idx on public.room_members(room_id);
create index if not exists rooms_match_id_idx on public.rooms(match_id);

drop trigger if exists set_rooms_updated_at on public.rooms;
create trigger set_rooms_updated_at
before update on public.rooms
for each row execute function public.set_updated_at();

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;

create or replace function public.is_room_member(room_uuid uuid, user_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.room_members
    where room_id = room_uuid
    and user_id = user_uuid
  );
$$;

create or replace function public.is_match_room_member(match_uuid uuid, user_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.rooms
    where match_id = match_uuid
    and public.is_room_member(id, user_uuid)
  );
$$;

create or replace function public.join_room_by_code(room_code_input text, display_name_input text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_room_id uuid;
  clean_display_name text;
begin
  clean_display_name := nullif(trim(display_name_input), '');

  if clean_display_name is null then
    raise exception 'Display name is required.';
  end if;

  select id into target_room_id
  from public.rooms
  where code = upper(trim(room_code_input))
  and status = 'active';

  if target_room_id is null then
    raise exception 'Room not found.';
  end if;

  insert into public.room_members (room_id, user_id, display_name)
  values (target_room_id, auth.uid(), clean_display_name)
  on conflict (room_id, user_id) do update
  set display_name = excluded.display_name;

  return target_room_id;
end;
$$;

grant execute on function public.join_room_by_code(text, text) to authenticated;

drop policy if exists "Room members can read rooms" on public.rooms;
create policy "Room members can read rooms"
on public.rooms
for select
to authenticated
using (host_user_id = (select auth.uid()) or public.is_room_member(id, (select auth.uid())));

drop policy if exists "Users can create hosted rooms" on public.rooms;
create policy "Users can create hosted rooms"
on public.rooms
for insert
to authenticated
with check (host_user_id = (select auth.uid()));

drop policy if exists "Room hosts can update rooms" on public.rooms;
create policy "Room hosts can update rooms"
on public.rooms
for update
to authenticated
using (host_user_id = (select auth.uid()))
with check (host_user_id = (select auth.uid()));

drop policy if exists "Room hosts can delete rooms" on public.rooms;
create policy "Room hosts can delete rooms"
on public.rooms
for delete
to authenticated
using (host_user_id = (select auth.uid()));

drop policy if exists "Room members can read memberships" on public.room_members;
create policy "Room members can read memberships"
on public.room_members
for select
to authenticated
using (user_id = (select auth.uid()) or public.is_room_member(room_id, (select auth.uid())));

drop policy if exists "Users can join rooms as themselves" on public.room_members;
create policy "Users can join rooms as themselves"
on public.room_members
for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "Users can update their own room membership" on public.room_members;
create policy "Users can update their own room membership"
on public.room_members
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "Users can leave their own room membership" on public.room_members;
create policy "Users can leave their own room membership"
on public.room_members
for delete
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users can read their own matches" on public.matches;
create policy "Users can read their own matches"
on public.matches
for select
to authenticated
using (
  (select auth.uid()) = owner_id
  or public.is_match_room_member(id, (select auth.uid()))
);

drop policy if exists "Users can update their own matches" on public.matches;
create policy "Users can update their own matches"
on public.matches
for update
to authenticated
using (
  (select auth.uid()) = owner_id
  or public.is_match_room_member(id, (select auth.uid()))
)
with check (
  (select auth.uid()) = owner_id
  or public.is_match_room_member(id, (select auth.uid()))
);

drop policy if exists "Users can delete their own matches" on public.matches;
create policy "Users can delete their own matches"
on public.matches
for delete
to authenticated
using (
  (select auth.uid()) = owner_id
  or public.is_match_room_member(id, (select auth.uid()))
);

drop policy if exists "Users can read their own rounds" on public.rounds;
create policy "Users can read their own rounds"
on public.rounds
for select
to authenticated
using (
  (select auth.uid()) = owner_id
  or public.is_match_room_member(match_id, (select auth.uid()))
);

drop policy if exists "Users can insert their own rounds" on public.rounds;
create policy "Users can insert their own rounds"
on public.rounds
for insert
to authenticated
with check (
  (select auth.uid()) = owner_id
  and (
    exists (
      select 1 from public.matches
      where matches.id = rounds.match_id
      and matches.owner_id = (select auth.uid())
    )
    or public.is_match_room_member(match_id, (select auth.uid()))
  )
);

drop policy if exists "Users can update their own rounds" on public.rounds;
create policy "Users can update their own rounds"
on public.rounds
for update
to authenticated
using (
  (select auth.uid()) = owner_id
  or public.is_match_room_member(match_id, (select auth.uid()))
)
with check (
  (select auth.uid()) = owner_id
  or public.is_match_room_member(match_id, (select auth.uid()))
);

drop policy if exists "Users can delete their own rounds" on public.rounds;
create policy "Users can delete their own rounds"
on public.rounds
for delete
to authenticated
using (
  (select auth.uid()) = owner_id
  or public.is_match_room_member(match_id, (select auth.uid()))
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = 'room_members'
  ) then
    alter publication supabase_realtime add table public.room_members;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = 'matches'
  ) then
    alter publication supabase_realtime add table public.matches;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = 'rounds'
  ) then
    alter publication supabase_realtime add table public.rounds;
  end if;
end;
$$;
