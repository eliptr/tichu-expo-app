export type MatchStatus = 'active' | 'completed';

export type Match = {
  created_at: string;
  id: string;
  owner_id: string;
  room_id?: string | null;
  status: MatchStatus;
  target_score: number;
  team_one_name: string;
  team_two_name: string;
  updated_at: string;
};

export type Round = {
  created_at: string;
  id: string;
  match_id: string;
  notes: string | null;
  owner_id: string;
  round_number: number;
  team_one_points: number;
  team_one_tichu_bonus: number;
  team_two_points: number;
  team_two_tichu_bonus: number;
};

export type RoundInput = {
  notes?: string | null;
  team_one_points: number;
  team_one_tichu_bonus: number;
  team_two_points: number;
  team_two_tichu_bonus: number;
};

export type MatchSummary = Match & {
  room_code?: string | null;
  room_host_user_id?: string | null;
  room_id?: string | null;
  round_count: number;
  team_one_total: number;
  team_two_total: number;
};

export type MatchDetail = MatchSummary & {
  rounds: Round[];
};
