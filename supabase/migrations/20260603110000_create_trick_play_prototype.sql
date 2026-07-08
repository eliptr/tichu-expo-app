create table if not exists public.game_turn_states (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null unique references public.rooms(id) on delete cascade,
  current_seat text not null check (
    current_seat in (
      'team_one_player_one',
      'team_one_player_two',
      'team_two_player_one',
      'team_two_player_two'
    )
  ),
  current_winning_seat text check (
    current_winning_seat in (
      'team_one_player_one',
      'team_one_player_two',
      'team_two_player_one',
      'team_two_player_two'
    )
  ),
  pass_count integer not null default 0,
  play_number integer not null default 1,
  trick_number integer not null default 1,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.game_plays (
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
  trick_number integer not null,
  play_number integer not null,
  action text not null check (action in ('play', 'pass')),
  cards jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default now() not null
);

create index if not exists game_turn_states_room_id_idx on public.game_turn_states(room_id);
create index if not exists game_plays_room_id_idx on public.game_plays(room_id);
create index if not exists game_plays_room_trick_idx on public.game_plays(room_id, trick_number, play_number);

drop trigger if exists set_game_turn_states_updated_at on public.game_turn_states;
create trigger set_game_turn_states_updated_at
before update on public.game_turn_states
for each row execute function public.set_updated_at();

alter table public.game_turn_states enable row level security;
alter table public.game_plays enable row level security;

drop policy if exists "Room members can read turn states" on public.game_turn_states;
create policy "Room members can read turn states"
on public.game_turn_states
for select
to authenticated
using (public.is_room_member(room_id, (select auth.uid())));

drop policy if exists "Room members can read trick plays" on public.game_plays;
create policy "Room members can read trick plays"
on public.game_plays
for select
to authenticated
using (public.is_room_member(room_id, (select auth.uid())));

create or replace function public.ensure_room_turn_state(room_uuid uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_turn_state_id uuid;
  mah_jong_seat text;
  target_status text;
begin
  if not public.is_room_member(room_uuid, auth.uid()) then
    raise exception 'Room not found.';
  end if;

  select status into target_status
  from public.game_states
  where room_id = room_uuid;

  if target_status <> 'playing' then
    return null;
  end if;

  select id into existing_turn_state_id
  from public.game_turn_states
  where room_id = room_uuid;

  if existing_turn_state_id is not null then
    return existing_turn_state_id;
  end if;

  select seat into mah_jong_seat
  from public.game_hands
  where room_id = room_uuid
  and exists (
    select 1
    from jsonb_array_elements(cards) as hand_card(card)
    where hand_card.card->>'id' = 'mah-jong'
  )
  limit 1;

  insert into public.game_turn_states (room_id, current_seat)
  values (room_uuid, coalesce(mah_jong_seat, 'team_one_player_one'))
  on conflict (room_id) do nothing
  returning id into existing_turn_state_id;

  if existing_turn_state_id is null then
    select id into existing_turn_state_id
    from public.game_turn_states
    where room_id = room_uuid;
  end if;

  return existing_turn_state_id;
end;
$$;

create or replace function public.submit_room_play(room_uuid uuid, card_ids text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_game_state public.game_states%rowtype;
  current_hand public.game_hands%rowtype;
  current_turn public.game_turn_states%rowtype;
  next_seat text;
  selected_cards jsonb;
  selected_count integer;
  requested_count integer;
begin
  perform public.ensure_room_turn_state(room_uuid);

  select * into current_game_state
  from public.game_states
  where room_id = room_uuid;

  if current_game_state.id is null or current_game_state.status <> 'playing' then
    raise exception 'Trick play is not active.';
  end if;

  select * into current_hand
  from public.game_hands
  where room_id = room_uuid
  and user_id = auth.uid()
  for update;

  if current_hand.id is null then
    raise exception 'You do not have a hand in this room.';
  end if;

  select * into current_turn
  from public.game_turn_states
  where room_id = room_uuid
  for update;

  if current_turn.current_seat <> current_hand.seat then
    raise exception 'It is not your turn.';
  end if;

  select count(distinct card_id)::integer into requested_count
  from unnest(card_ids) as requested(card_id);

  if requested_count is null or requested_count < 1 then
    raise exception 'Choose at least one card to play.';
  end if;

  select
    coalesce(jsonb_agg(card order by array_position(card_ids, card->>'id')), '[]'::jsonb),
    count(*)::integer
  into selected_cards, selected_count
  from jsonb_array_elements(current_hand.cards) as hand_card(card)
  where hand_card.card->>'id' = any(card_ids);

  if selected_count <> requested_count then
    raise exception 'One or more selected cards are not in your hand.';
  end if;

  insert into public.game_plays (
    room_id,
    user_id,
    seat,
    trick_number,
    play_number,
    action,
    cards
  )
  values (
    room_uuid,
    auth.uid(),
    current_hand.seat,
    current_turn.trick_number,
    current_turn.play_number,
    'play',
    selected_cards
  );

  update public.game_hands
  set cards = (
    select coalesce(jsonb_agg(card order by (card->>'sort_value')::integer), '[]'::jsonb)
    from jsonb_array_elements(current_hand.cards) as hand_card(card)
    where not (hand_card.card->>'id' = any(card_ids))
  )
  where id = current_hand.id;

  next_seat := public.tichu_left_seat(current_hand.seat);

  update public.game_turn_states
  set
    current_seat = next_seat,
    current_winning_seat = current_hand.seat,
    pass_count = 0,
    play_number = current_turn.play_number + 1
  where id = current_turn.id;
end;
$$;

create or replace function public.submit_room_turn_pass(room_uuid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_game_state public.game_states%rowtype;
  current_hand public.game_hands%rowtype;
  current_turn public.game_turn_states%rowtype;
  next_seat text;
  next_pass_count integer;
begin
  perform public.ensure_room_turn_state(room_uuid);

  select * into current_game_state
  from public.game_states
  where room_id = room_uuid;

  if current_game_state.id is null or current_game_state.status <> 'playing' then
    raise exception 'Trick play is not active.';
  end if;

  select * into current_hand
  from public.game_hands
  where room_id = room_uuid
  and user_id = auth.uid();

  if current_hand.id is null then
    raise exception 'You do not have a hand in this room.';
  end if;

  select * into current_turn
  from public.game_turn_states
  where room_id = room_uuid
  for update;

  if current_turn.current_seat <> current_hand.seat then
    raise exception 'It is not your turn.';
  end if;

  if current_turn.current_winning_seat is null then
    raise exception 'You must lead the trick with a play.';
  end if;

  insert into public.game_plays (
    room_id,
    user_id,
    seat,
    trick_number,
    play_number,
    action,
    cards
  )
  values (
    room_uuid,
    auth.uid(),
    current_hand.seat,
    current_turn.trick_number,
    current_turn.play_number,
    'pass',
    '[]'::jsonb
  );

  next_pass_count := current_turn.pass_count + 1;

  if next_pass_count >= 3 then
    update public.game_turn_states
    set
      current_seat = current_turn.current_winning_seat,
      current_winning_seat = null,
      pass_count = 0,
      trick_number = current_turn.trick_number + 1,
      play_number = 1
    where id = current_turn.id;
  else
    next_seat := public.tichu_left_seat(current_hand.seat);

    update public.game_turn_states
    set
      current_seat = next_seat,
      pass_count = next_pass_count,
      play_number = current_turn.play_number + 1
    where id = current_turn.id;
  end if;
end;
$$;

grant execute on function public.ensure_room_turn_state(uuid) to authenticated;
grant execute on function public.submit_room_play(uuid, text[]) to authenticated;
grant execute on function public.submit_room_turn_pass(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = 'game_turn_states'
  ) then
    alter publication supabase_realtime add table public.game_turn_states;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = 'game_plays'
  ) then
    alter publication supabase_realtime add table public.game_plays;
  end if;
end;
$$;
