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
  selected_rank integer;
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
      select public.tichu_card_rank(selected_card.card) into selected_rank
      from jsonb_array_elements(cards_input) as selected_card(card)
      limit 1;

      return jsonb_build_object(
        'valid', true,
        'type', 'single',
        'count', 1,
        'rank', selected_rank,
        'is_bomb', false,
        'label', 'Single ' || case when selected_rank = 1 then 'Mah Jong' when selected_rank = 15 then 'Dragon' else selected_rank::text end
      );
    end if;

    return jsonb_build_object('valid', false, 'reason', 'Special cards can only be played as singles in this prototype.');
  end if;

  with expanded as (
    select
      public.tichu_card_rank(selected_card.card) as card_rank_value,
      selected_card.card->>'suit' as card_suit_value
    from jsonb_array_elements(cards_input) as selected_card(card)
  ),
  rank_groups as (
    select expanded.card_rank_value, count(*)::integer as group_size
    from expanded
    group by expanded.card_rank_value
  )
  select
    count(distinct expanded.card_rank_value)::integer,
    max(expanded.card_rank_value),
    min(expanded.card_rank_value),
    count(distinct expanded.card_suit_value)::integer,
    (select count(*)::integer from rank_groups where rank_groups.group_size = 2),
    (select count(*)::integer from rank_groups where rank_groups.group_size = 3),
    (select max(rank_groups.card_rank_value) from rank_groups where rank_groups.group_size = 3),
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

grant execute on function public.tichu_analyze_cards(jsonb) to authenticated;
