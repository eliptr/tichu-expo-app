import { supabase } from '@/lib/supabase';

import type { Match, MatchDetail, MatchSummary, Round, RoundInput } from './score-types';

type MatchRoom = {
  code: string;
  host_user_id: string;
  id: string;
  match_id: string;
};

function roundTotalForTeamOne(round: Round) {
  return round.team_one_points + round.team_one_tichu_bonus;
}

function roundTotalForTeamTwo(round: Round) {
  return round.team_two_points + round.team_two_tichu_bonus;
}

function summarizeMatch(match: Match, rounds: Round[], room?: MatchRoom | null): MatchSummary {
  return {
    ...match,
    room_code: room?.code ?? null,
    room_host_user_id: room?.host_user_id ?? null,
    room_id: room?.id ?? null,
    round_count: rounds.length,
    team_one_total: rounds.reduce((sum, round) => sum + roundTotalForTeamOne(round), 0),
    team_two_total: rounds.reduce((sum, round) => sum + roundTotalForTeamTwo(round), 0),
  };
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

export async function listMatchSummaries() {
  const { data, error } = await supabase
    .from('matches')
    .select('*, rounds(*)')
    .order('created_at', { ascending: false });

  if (error) {
    return { data: null, error };
  }

  const matchIds = (data ?? []).map((row) => row.id as string);
  const { data: rooms } =
    matchIds.length > 0
      ? await supabase.from('rooms').select('id, code, host_user_id, match_id').in('match_id', matchIds)
      : { data: [] };
  const roomsByMatchId = new Map((rooms as MatchRoom[]).map((room) => [room.match_id, room]));

  const summaries = (data ?? []).map((row) => {
    const rounds = ((row.rounds ?? []) as Round[]).sort((a, b) => a.round_number - b.round_number);
    const { rounds: _rounds, ...match } = row;
    return summarizeMatch(match as Match, rounds, roomsByMatchId.get((match as Match).id));
  });

  return { data: summaries, error: null };
}

export async function getMatchDetail(matchId: string) {
  const { data, error } = await supabase.from('matches').select('*, rounds(*)').eq('id', matchId).single();

  if (error) {
    return { data: null, error };
  }

  const { data: room } = await supabase
    .from('rooms')
    .select('id, code, host_user_id, match_id')
    .eq('match_id', matchId)
    .maybeSingle<MatchRoom>();
  const rounds = ((data.rounds ?? []) as Round[]).sort((a, b) => a.round_number - b.round_number);
  const { rounds: _rounds, ...match } = data;
  const detail: MatchDetail = {
    ...summarizeMatch(match as Match, rounds, room),
    rounds,
  };

  return { data: detail, error: null };
}

export async function createMatch(teamOneName: string, teamTwoName: string, targetScore: number) {
  const { error: userError, userId } = await getSignedInUserId();

  if (userError || !userId) {
    return { data: null, error: userError };
  }

  return supabase
    .from('matches')
    .insert({
      owner_id: userId,
      target_score: targetScore,
      team_one_name: teamOneName,
      team_two_name: teamTwoName,
    })
    .select()
    .single<Match>();
}

export async function addRound(matchId: string, input: RoundInput) {
  const { error: userError, userId } = await getSignedInUserId();

  if (userError || !userId) {
    return { data: null, error: userError };
  }

  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select('status')
    .eq('id', matchId)
    .single<Pick<Match, 'status'>>();

  if (matchError) {
    return { data: null, error: matchError };
  }

  if (match.status === 'completed') {
    return { data: null, error: new Error('Cannot add rounds to a completed match. Reopen it first.') };
  }

  const { count, error: countError } = await supabase
    .from('rounds')
    .select('id', { count: 'exact', head: true })
    .eq('match_id', matchId);

  if (countError) {
    return { data: null, error: countError };
  }

  return supabase
    .from('rounds')
    .insert({
      match_id: matchId,
      notes: input.notes || null,
      owner_id: userId,
      round_number: (count ?? 0) + 1,
      team_one_points: input.team_one_points,
      team_one_tichu_bonus: input.team_one_tichu_bonus,
      team_two_points: input.team_two_points,
      team_two_tichu_bonus: input.team_two_tichu_bonus,
    })
    .select()
    .single<Round>();
}

export async function updateMatchStatus(matchId: string, status: Match['status']) {
  return supabase.from('matches').update({ status }).eq('id', matchId).select().single<Match>();
}

export async function deleteMatch(matchId: string) {
  return supabase.from('matches').delete().eq('id', matchId);
}

export function subscribeToMatch(matchId: string, onChange: () => void) {
  const channel = supabase
    .channel(`match:${matchId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
      onChange
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'rounds', filter: `match_id=eq.${matchId}` },
      onChange
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
