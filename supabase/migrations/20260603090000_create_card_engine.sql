create table if not exists public.game_states (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null unique references public.rooms(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting', 'dealt', 'passing', 'playing', 'finished')),
  started_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.game_hands (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seat text not null check (
    seat in (
      'team_one_player_one',
      'team_one_player_two',
      'team_two_player_one',
      'team_two_player_two'
    )
  ),
  cards jsonb not null,
  created_at timestamp with time zone default now() not null,
  unique (room_id, user_id),
  unique (room_id, seat)
);

create index if not exists game_states_room_id_idx on public.game_states(room_id);
create index if not exists game_hands_room_id_idx on public.game_hands(room_id);
create index if not exists game_hands_user_id_idx on public.game_hands(user_id);

drop trigger if exists set_game_states_updated_at on public.game_states;
create trigger set_game_states_updated_at
before update on public.game_states
for each row execute function public.set_updated_at();

alter table public.game_states enable row level security;
alter table public.game_hands enable row level security;

drop policy if exists "Room members can read game states" on public.game_states;
create policy "Room members can read game states"
on public.game_states
for select
to authenticated
using (public.is_room_member(room_id, (select auth.uid())));

drop policy if exists "Room hosts can update game states" on public.game_states;
create policy "Room hosts can update game states"
on public.game_states
for update
to authenticated
using (
  exists (
    select 1
    from public.rooms
    where rooms.id = game_states.room_id
    and rooms.host_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.rooms
    where rooms.id = game_states.room_id
    and rooms.host_user_id = (select auth.uid())
  )
);

drop policy if exists "Users can read only their own hands" on public.game_hands;
create policy "Users can read only their own hands"
on public.game_hands
for select
to authenticated
using (
  user_id = (select auth.uid())
  and public.is_room_member(room_id, (select auth.uid()))
);

create or replace function public.start_room_game(room_uuid uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_game_state_id uuid;
  seated_member_count integer;
  target_room public.rooms%rowtype;
begin
  select * into target_room
  from public.rooms
  where id = room_uuid
  and status = 'active';

  if target_room.id is null then
    raise exception 'Room not found.';
  end if;

  if target_room.host_user_id <> auth.uid() then
    raise exception 'Only the room host can start the game.';
  end if;

  select count(*) into seated_member_count
  from public.room_members
  where room_id = room_uuid
  and seat is not null;

  if seated_member_count <> 4 then
    raise exception 'All four seats must be claimed before starting.';
  end if;

  delete from public.game_hands where room_id = room_uuid;
  delete from public.game_states where room_id = room_uuid;

  insert into public.game_states (room_id, status, started_at)
  values (room_uuid, 'dealt', now())
  returning id into new_game_state_id;

  with standard_cards as (
    select jsonb_build_object(
      'id', suit || '-' || rank_label,
      'kind', 'standard',
      'suit', suit,
      'rank', rank_label,
      'label', rank_label || ' of ' || initcap(suit),
      'points', case when rank_label = '5' then 5 when rank_label = '10' then 10 when rank_label = 'K' then 10 else 0 end,
      'sort_value', suit_order * 100 + rank_order
    ) as card
    from unnest(array['jade', 'sword', 'pagoda', 'star']) with ordinality as suits(suit, suit_order)
    cross join unnest(array['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']) with ordinality as ranks(rank_label, rank_order)
  ),
  special_cards as (
    select *
    from (values
      (jsonb_build_object('id', 'mah-jong', 'kind', 'special', 'suit', null, 'rank', null, 'label', 'Mah Jong', 'points', 0, 'sort_value', 1)),
      (jsonb_build_object('id', 'dog', 'kind', 'special', 'suit', null, 'rank', null, 'label', 'Dog', 'points', 0, 'sort_value', 2)),
      (jsonb_build_object('id', 'phoenix', 'kind', 'special', 'suit', null, 'rank', null, 'label', 'Phoenix', 'points', -25, 'sort_value', 3)),
      (jsonb_build_object('id', 'dragon', 'kind', 'special', 'suit', null, 'rank', null, 'label', 'Dragon', 'points', 25, 'sort_value', 4))
    ) as specials(card)
  ),
  shuffled_cards as (
    select card, row_number() over (order by random()) as card_number
    from (
      select card from standard_cards
      union all
      select card from special_cards
    ) deck
  ),
  dealt_cards as (
    select
      case
        when card_number <= 14 then 'team_one_player_one'
        when card_number <= 28 then 'team_one_player_two'
        when card_number <= 42 then 'team_two_player_one'
        else 'team_two_player_two'
      end as seat,
      jsonb_agg(card order by card_number) as cards
    from shuffled_cards
    group by 1
  )
  insert into public.game_hands (room_id, user_id, seat, cards)
  select room_uuid, room_members.user_id, dealt_cards.seat, dealt_cards.cards
  from dealt_cards
  join public.room_members
    on room_members.room_id = room_uuid
   and room_members.seat = dealt_cards.seat;

  return new_game_state_id;
end;
$$;

grant execute on function public.start_room_game(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = 'game_states'
  ) then
    alter publication supabase_realtime add table public.game_states;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = 'game_hands'
  ) then
    alter publication supabase_realtime add table public.game_hands;
  end if;
end;
$$;
