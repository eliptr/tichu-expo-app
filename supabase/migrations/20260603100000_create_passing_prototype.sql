create table if not exists public.game_passes (
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
  to_teammate_card jsonb not null,
  to_left_card jsonb not null,
  to_right_card jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  unique (room_id, user_id),
  unique (room_id, seat)
);

create index if not exists game_passes_room_id_idx on public.game_passes(room_id);
create index if not exists game_passes_user_id_idx on public.game_passes(user_id);

drop trigger if exists set_game_passes_updated_at on public.game_passes;
create trigger set_game_passes_updated_at
before update on public.game_passes
for each row execute function public.set_updated_at();

alter table public.game_passes enable row level security;

drop policy if exists "Users can read only their own passes" on public.game_passes;
create policy "Users can read only their own passes"
on public.game_passes
for select
to authenticated
using (
  user_id = (select auth.uid())
  and public.is_room_member(room_id, (select auth.uid()))
);

create or replace function public.tichu_teammate_seat(seat_input text)
returns text
language sql
immutable
as $$
  select case seat_input
    when 'team_one_player_one' then 'team_one_player_two'
    when 'team_one_player_two' then 'team_one_player_one'
    when 'team_two_player_one' then 'team_two_player_two'
    when 'team_two_player_two' then 'team_two_player_one'
  end;
$$;

create or replace function public.tichu_left_seat(seat_input text)
returns text
language sql
immutable
as $$
  select case seat_input
    when 'team_one_player_one' then 'team_two_player_one'
    when 'team_two_player_one' then 'team_one_player_two'
    when 'team_one_player_two' then 'team_two_player_two'
    when 'team_two_player_two' then 'team_one_player_one'
  end;
$$;

create or replace function public.tichu_right_seat(seat_input text)
returns text
language sql
immutable
as $$
  select case seat_input
    when 'team_one_player_one' then 'team_two_player_two'
    when 'team_two_player_two' then 'team_one_player_two'
    when 'team_one_player_two' then 'team_two_player_one'
    when 'team_two_player_one' then 'team_one_player_one'
  end;
$$;

create or replace function public.get_room_passing_status(room_uuid uuid)
returns table (
  submitted_count integer,
  total_count integer,
  has_submitted boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_room_member(room_uuid, auth.uid()) then
    raise exception 'Room not found.';
  end if;

  return query
  select
    (select count(*)::integer from public.game_passes where room_id = room_uuid) as submitted_count,
    (select count(*)::integer from public.game_hands where room_id = room_uuid) as total_count,
    exists (
      select 1
      from public.game_passes
      where room_id = room_uuid
      and user_id = auth.uid()
    ) as has_submitted;
end;
$$;

create or replace function public.submit_room_pass(
  room_uuid uuid,
  teammate_card_id text,
  left_card_id text,
  right_card_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_game_state public.game_states%rowtype;
  current_hand public.game_hands%rowtype;
  teammate_card jsonb;
  left_card jsonb;
  right_card jsonb;
  submitted_count integer;
  hand_count integer;
begin
  select * into current_game_state
  from public.game_states
  where room_id = room_uuid;

  if current_game_state.id is null then
    raise exception 'Game has not started.';
  end if;

  if current_game_state.status not in ('dealt', 'passing') then
    raise exception 'Cards can only be passed before play starts.';
  end if;

  select * into current_hand
  from public.game_hands
  where room_id = room_uuid
  and user_id = auth.uid();

  if current_hand.id is null then
    raise exception 'You do not have a hand in this room.';
  end if;

  if teammate_card_id = left_card_id or teammate_card_id = right_card_id or left_card_id = right_card_id then
    raise exception 'Choose three different cards.';
  end if;

  select card into teammate_card
  from jsonb_array_elements(current_hand.cards) as card
  where card->>'id' = teammate_card_id;

  select card into left_card
  from jsonb_array_elements(current_hand.cards) as card
  where card->>'id' = left_card_id;

  select card into right_card
  from jsonb_array_elements(current_hand.cards) as card
  where card->>'id' = right_card_id;

  if teammate_card is null or left_card is null or right_card is null then
    raise exception 'One or more selected cards are not in your hand.';
  end if;

  insert into public.game_passes (
    room_id,
    user_id,
    seat,
    to_teammate_card,
    to_left_card,
    to_right_card
  )
  values (
    room_uuid,
    auth.uid(),
    current_hand.seat,
    teammate_card,
    left_card,
    right_card
  )
  on conflict (room_id, user_id) do update
  set
    seat = excluded.seat,
    to_teammate_card = excluded.to_teammate_card,
    to_left_card = excluded.to_left_card,
    to_right_card = excluded.to_right_card;

  update public.game_states
  set status = 'passing'
  where room_id = room_uuid
  and status = 'dealt';

  select count(*)::integer into submitted_count
  from public.game_passes
  where room_id = room_uuid;

  select count(*)::integer into hand_count
  from public.game_hands
  where room_id = room_uuid;

  if submitted_count = 4 and hand_count = 4 then
    with outgoing_cards as (
      select
        room_id,
        seat as from_seat,
        public.tichu_teammate_seat(seat) as to_seat,
        to_teammate_card as card
      from public.game_passes
      where room_id = room_uuid
      union all
      select
        room_id,
        seat as from_seat,
        public.tichu_left_seat(seat) as to_seat,
        to_left_card as card
      from public.game_passes
      where room_id = room_uuid
      union all
      select
        room_id,
        seat as from_seat,
        public.tichu_right_seat(seat) as to_seat,
        to_right_card as card
      from public.game_passes
      where room_id = room_uuid
    ),
    hand_cards_after_removal as (
      select
        game_hands.id as hand_id,
        game_hands.seat,
        coalesce(jsonb_agg(card order by (card->>'sort_value')::integer) filter (where card is not null), '[]'::jsonb) as kept_cards
      from public.game_hands
      left join lateral jsonb_array_elements(game_hands.cards) as card on true
      where game_hands.room_id = room_uuid
      and not exists (
        select 1
        from public.game_passes
        where game_passes.room_id = room_uuid
        and game_passes.seat = game_hands.seat
        and (
          game_passes.to_teammate_card->>'id' = card->>'id'
          or game_passes.to_left_card->>'id' = card->>'id'
          or game_passes.to_right_card->>'id' = card->>'id'
        )
      )
      group by game_hands.id, game_hands.seat
    ),
    received_cards as (
      select
        to_seat as seat,
        jsonb_agg(card order by (card->>'sort_value')::integer) as cards
      from outgoing_cards
      group by to_seat
    )
    update public.game_hands
    set cards = hand_cards_after_removal.kept_cards || coalesce(received_cards.cards, '[]'::jsonb)
    from hand_cards_after_removal
    left join received_cards
      on received_cards.seat = hand_cards_after_removal.seat
    where game_hands.id = hand_cards_after_removal.hand_id;

    update public.game_states
    set status = 'playing'
    where room_id = room_uuid;
  end if;
end;
$$;

grant execute on function public.get_room_passing_status(uuid) to authenticated;
grant execute on function public.submit_room_pass(uuid, text, text, text) to authenticated;

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

  delete from public.game_passes where room_id = room_uuid;
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
    and tablename = 'game_passes'
  ) then
    alter publication supabase_realtime add table public.game_passes;
  end if;
end;
$$;
