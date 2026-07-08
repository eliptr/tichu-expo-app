alter table public.game_plays
add column if not exists combo jsonb;

create or replace function public.tichu_card_rank(card jsonb)
returns integer
language sql
immutable
as $$
  select case
    when card->>'id' = 'mah-jong' then 1
    when card->>'id' = 'dragon' then 15
    when card->>'rank' = 'J' then 11
    when card->>'rank' = 'Q' then 12
    when card->>'rank' = 'K' then 13
    when card->>'rank' = 'A' then 14
    when card->>'rank' ~ '^[0-9]+$' then (card->>'rank')::integer
    else null
  end;
$$;

create or replace function public.tichu_analyze_cards(cards_input jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  card_count integer;
  distinct_rank_count integer;
  max_rank integer;
  min_rank integer;
  pair_group_count integer;
  rank_group_count integer;
  rank_value integer;
  same_suit_count integer;
  special_count integer;
  straight_is_valid boolean;
  triple_group_count integer;
  triple_rank integer;
  unsupported_special_count integer;
begin
  select count(*)::integer into card_count
  from jsonb_array_elements(cards_input) as selected_card(card);

  if card_count = 0 then
    return jsonb_build_object('valid', false, 'reason', 'Choose at least one card.');
  end if;

  select count(*)::integer into unsupported_special_count
  from jsonb_array_elements(cards_input) as selected_card(card)
  where selected_card.card->>'id' in ('dog', 'phoenix');

  if unsupported_special_count > 0 then
    return jsonb_build_object('valid', false, 'reason', 'Dog and Phoenix special rules are not supported yet.');
  end if;

  select count(*)::integer into special_count
  from jsonb_array_elements(cards_input) as selected_card(card)
  where selected_card.card->>'kind' = 'special';

  if special_count > 0 then
    if card_count = 1 then
      select public.tichu_card_rank(selected_card.card) into rank_value
      from jsonb_array_elements(cards_input) as selected_card(card)
      limit 1;

      return jsonb_build_object(
        'valid', true,
        'type', 'single',
        'count', 1,
        'rank', rank_value,
        'is_bomb', false,
        'label', 'Single ' || case when rank_value = 1 then 'Mah Jong' when rank_value = 15 then 'Dragon' else rank_value::text end
      );
    end if;

    return jsonb_build_object('valid', false, 'reason', 'Special cards can only be played as singles in this prototype.');
  end if;

  with expanded as (
    select
      public.tichu_card_rank(selected_card.card) as rank_value,
      selected_card.card->>'suit' as suit_value
    from jsonb_array_elements(cards_input) as selected_card(card)
  ),
  rank_groups as (
    select rank_value, count(*)::integer as group_size
    from expanded
    group by rank_value
  )
  select
    count(distinct expanded.rank_value)::integer,
    max(expanded.rank_value),
    min(expanded.rank_value),
    count(distinct expanded.suit_value)::integer,
    (select count(*)::integer from rank_groups where group_size = 2),
    (select count(*)::integer from rank_groups where group_size = 3),
    (select max(rank_value) from rank_groups where group_size = 3),
    (select count(*)::integer from rank_groups)
  into
    distinct_rank_count,
    max_rank,
    min_rank,
    same_suit_count,
    pair_group_count,
    triple_group_count,
    triple_rank,
    rank_group_count
  from expanded;

  straight_is_valid := card_count >= 5 and distinct_rank_count = card_count and max_rank - min_rank + 1 = card_count;

  if card_count = 4 and distinct_rank_count = 1 then
    return jsonb_build_object(
      'valid', true,
      'type', 'four_bomb',
      'count', 4,
      'rank', max_rank,
      'is_bomb', true,
      'bomb_power', 1,
      'label', 'Bomb: four ' || max_rank
    );
  end if;

  if straight_is_valid and same_suit_count = 1 then
    return jsonb_build_object(
      'valid', true,
      'type', 'straight_flush_bomb',
      'count', card_count,
      'rank', max_rank,
      'is_bomb', true,
      'bomb_power', 2,
      'label', 'Bomb: straight flush to ' || max_rank
    );
  end if;

  if card_count = 1 then
    return jsonb_build_object('valid', true, 'type', 'single', 'count', 1, 'rank', max_rank, 'is_bomb', false, 'label', 'Single ' || max_rank);
  end if;

  if card_count = 2 and distinct_rank_count = 1 then
    return jsonb_build_object('valid', true, 'type', 'pair', 'count', 2, 'rank', max_rank, 'is_bomb', false, 'label', 'Pair ' || max_rank);
  end if;

  if card_count = 3 and distinct_rank_count = 1 then
    return jsonb_build_object('valid', true, 'type', 'triple', 'count', 3, 'rank', max_rank, 'is_bomb', false, 'label', 'Triple ' || max_rank);
  end if;

  if card_count = 5 and triple_group_count = 1 and pair_group_count = 1 then
    return jsonb_build_object('valid', true, 'type', 'full_house', 'count', 5, 'rank', triple_rank, 'is_bomb', false, 'label', 'Full house ' || triple_rank);
  end if;

  if straight_is_valid then
    return jsonb_build_object('valid', true, 'type', 'straight', 'count', card_count, 'rank', max_rank, 'is_bomb', false, 'label', 'Straight to ' || max_rank);
  end if;

  if card_count >= 4
    and card_count % 2 = 0
    and pair_group_count = card_count / 2
    and rank_group_count = card_count / 2
    and max_rank - min_rank + 1 = card_count / 2 then
    return jsonb_build_object('valid', true, 'type', 'consecutive_pairs', 'count', card_count, 'rank', max_rank, 'is_bomb', false, 'label', 'Consecutive pairs to ' || max_rank);
  end if;

  return jsonb_build_object('valid', false, 'reason', 'Those cards are not a supported Tichu combination.');
end;
$$;

create or replace function public.tichu_combo_beats(new_combo jsonb, current_combo jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  current_is_bomb boolean;
  new_is_bomb boolean;
begin
  if current_combo is null then
    return true;
  end if;

  new_is_bomb := coalesce((new_combo->>'is_bomb')::boolean, false);
  current_is_bomb := coalesce((current_combo->>'is_bomb')::boolean, false);

  if new_is_bomb and not current_is_bomb then
    return true;
  end if;

  if current_is_bomb then
    if not new_is_bomb then
      return false;
    end if;

    if (new_combo->>'bomb_power')::integer <> (current_combo->>'bomb_power')::integer then
      return (new_combo->>'bomb_power')::integer > (current_combo->>'bomb_power')::integer;
    end if;

    if (new_combo->>'count')::integer <> (current_combo->>'count')::integer then
      return (new_combo->>'count')::integer > (current_combo->>'count')::integer;
    end if;

    return (new_combo->>'rank')::integer > (current_combo->>'rank')::integer;
  end if;

  return new_combo->>'type' = current_combo->>'type'
    and (new_combo->>'count')::integer = (current_combo->>'count')::integer
    and (new_combo->>'rank')::integer > (current_combo->>'rank')::integer;
end;
$$;

create or replace function public.submit_room_play(room_uuid uuid, card_ids text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_combo jsonb;
  current_game_state public.game_states%rowtype;
  current_hand public.game_hands%rowtype;
  current_turn public.game_turn_states%rowtype;
  new_combo jsonb;
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

  new_combo := public.tichu_analyze_cards(selected_cards);

  if not coalesce((new_combo->>'valid')::boolean, false) then
    raise exception '%', coalesce(new_combo->>'reason', 'Invalid card combination.');
  end if;

  if current_turn.current_winning_seat is not null then
    select coalesce(combo, public.tichu_analyze_cards(cards)) into current_combo
    from public.game_plays
    where room_id = room_uuid
    and trick_number = current_turn.trick_number
    and seat = current_turn.current_winning_seat
    and action = 'play'
    order by play_number desc
    limit 1;

    if not public.tichu_combo_beats(new_combo, current_combo) then
      raise exception 'That play does not beat the current table.';
    end if;
  end if;

  insert into public.game_plays (
    room_id,
    user_id,
    seat,
    trick_number,
    play_number,
    action,
    cards,
    combo
  )
  values (
    room_uuid,
    auth.uid(),
    current_hand.seat,
    current_turn.trick_number,
    current_turn.play_number,
    'play',
    selected_cards,
    new_combo
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

grant execute on function public.tichu_card_rank(jsonb) to authenticated;
grant execute on function public.tichu_analyze_cards(jsonb) to authenticated;
grant execute on function public.tichu_combo_beats(jsonb, jsonb) to authenticated;
grant execute on function public.submit_room_play(uuid, text[]) to authenticated;
