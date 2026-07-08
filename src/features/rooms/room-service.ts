import { supabase } from '@/lib/supabase';

import { createMatch } from '@/features/scores/score-service';

import type { Room, RoomDetail, RoomMember, RoomSeat } from './room-types';

function createRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

async function getSignedInUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    return { error, userId: null };
  }

  if (!user) {
    return { error: new Error('No signed-in user found.'), userId: null };
  }

  return { error: null, userId: user.id };
}

export async function createRoomWithMatch({
  displayName,
  targetScore,
  teamOneName,
  teamTwoName,
}: {
  displayName: string;
  targetScore: number;
  teamOneName: string;
  teamTwoName: string;
}) {
  const { error: userError, userId } = await getSignedInUserId();

  if (userError || !userId) {
    return { data: null, error: userError };
  }

  const { data: match, error: matchError } = await createMatch(teamOneName, teamTwoName, targetScore);

  if (matchError || !match) {
    return { data: null, error: matchError };
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .insert({
        code: createRoomCode(),
        host_user_id: userId,
        match_id: match.id,
      })
      .select()
      .single<Room>();

    if (roomError) {
      if (roomError.message.toLowerCase().includes('duplicate')) {
        continue;
      }

      return { data: null, error: roomError };
    }

    const { error: memberError } = await supabase.from('room_members').insert({
      display_name: displayName,
      room_id: room.id,
      seat: 'team_one_player_one',
      user_id: userId,
    });

    if (memberError) {
      return { data: null, error: memberError };
    }

    return { data: room, error: null };
  }

  return { data: null, error: new Error('Could not generate a unique room code. Try again.') };
}

export async function joinRoomByCode(code: string, displayName: string) {
  const { data, error } = await supabase.rpc('join_room_by_code', {
    display_name_input: displayName,
    room_code_input: code.trim().toUpperCase(),
  });

  return { data: data as string | null, error };
}

export async function getRoomDetail(roomId: string) {
  const { data: room, error: roomError } = await supabase.from('rooms').select('*').eq('id', roomId).single<Room>();

  if (roomError) {
    return { data: null, error: roomError };
  }

  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select('*')
    .eq('id', room.match_id)
    .single<RoomDetail['match']>();

  if (matchError) {
    return { data: null, error: matchError };
  }

  const { data: members, error: membersError } = await supabase
    .from('room_members')
    .select('*')
    .eq('room_id', roomId)
    .order('joined_at', { ascending: true });

  if (membersError) {
    return { data: null, error: membersError };
  }

  return {
    data: {
      match,
      members: (members ?? []) as RoomMember[],
      room,
    },
    error: null,
  };
}

export async function claimRoomSeat(roomId: string, seat: RoomSeat | null) {
  const { error: userError, userId } = await getSignedInUserId();

  if (userError || !userId) {
    return { data: null, error: userError };
  }

  return supabase
    .from('room_members')
    .update({ seat })
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .select()
    .single<RoomMember>();
}

export async function leaveRoom(roomId: string) {
  const { error: userError, userId } = await getSignedInUserId();

  if (userError || !userId) {
    return { data: null, error: userError };
  }

  return supabase.from('room_members').delete().eq('room_id', roomId).eq('user_id', userId);
}

export function deleteRoom(roomId: string) {
  return supabase.from('rooms').delete().eq('id', roomId);
}

export function subscribeToRoom(roomId: string, onChange: () => void, onStatus?: (status: string) => void) {
  const channel = supabase
    .channel(`room:${roomId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` },
      onChange
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, onChange)
    .subscribe((status) => {
      onStatus?.(status);
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}
