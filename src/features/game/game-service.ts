import { supabase } from '@/lib/supabase';

import type { GameHand, GamePass, GamePlay, GameState, GameTurnState, PassingStatus } from './game-types';

export async function startRoomGame(roomId: string) {
  const { data, error } = await supabase.rpc('start_room_game', {
    room_uuid: roomId,
  });

  return { data: data as string | null, error };
}

export function getGameState(roomId: string) {
  return supabase.from('game_states').select('*').eq('room_id', roomId).maybeSingle<GameState>();
}

export function getMyHand(roomId: string) {
  return supabase.from('game_hands').select('*').eq('room_id', roomId).maybeSingle<GameHand>();
}

export function getMyPass(roomId: string) {
  return supabase.from('game_passes').select('*').eq('room_id', roomId).maybeSingle<GamePass>();
}

export async function getTurnState(roomId: string) {
  const { error: ensureError } = await supabase.rpc('ensure_room_turn_state', {
    room_uuid: roomId,
  });

  if (ensureError) {
    return { data: null, error: ensureError };
  }

  return supabase.from('game_turn_states').select('*').eq('room_id', roomId).maybeSingle<GameTurnState>();
}

export function listCurrentTrickPlays(roomId: string, trickNumber: number) {
  return supabase
    .from('game_plays')
    .select('*')
    .eq('room_id', roomId)
    .eq('trick_number', trickNumber)
    .order('play_number', { ascending: true })
    .returns<GamePlay[]>();
}

export async function getPassingStatus(roomId: string) {
  const { data, error } = await supabase.rpc('get_room_passing_status', {
    room_uuid: roomId,
  });

  return { data: (data?.[0] ?? null) as PassingStatus | null, error };
}

export function submitRoomPass({
  leftCardId,
  rightCardId,
  roomId,
  teammateCardId,
}: {
  leftCardId: string;
  rightCardId: string;
  roomId: string;
  teammateCardId: string;
}) {
  return supabase.rpc('submit_room_pass', {
    left_card_id: leftCardId,
    right_card_id: rightCardId,
    room_uuid: roomId,
    teammate_card_id: teammateCardId,
  });
}

export function submitRoomPlay(roomId: string, cardIds: string[]) {
  return supabase.rpc('submit_room_play', {
    card_ids: cardIds,
    room_uuid: roomId,
  });
}

export function submitRoomTurnPass(roomId: string) {
  return supabase.rpc('submit_room_turn_pass', {
    room_uuid: roomId,
  });
}

export function subscribeToGame(roomId: string, onChange: () => void, onStatus?: (status: string) => void) {
  const channelName = `game:${roomId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'game_states', filter: `room_id=eq.${roomId}` },
      onChange
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'game_hands', filter: `room_id=eq.${roomId}` },
      onChange
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'game_passes', filter: `room_id=eq.${roomId}` },
      onChange
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'game_turn_states', filter: `room_id=eq.${roomId}` },
      onChange
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'game_plays', filter: `room_id=eq.${roomId}` },
      onChange
    )
    .subscribe((status) => {
      onStatus?.(status);
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}
