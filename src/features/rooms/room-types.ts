import type { Match } from '@/features/scores/score-types';

export type RoomStatus = 'active' | 'closed';

export type RoomSeat =
  | 'team_one_player_one'
  | 'team_one_player_two'
  | 'team_two_player_one'
  | 'team_two_player_two';

export type Room = {
  code: string;
  created_at: string;
  host_user_id: string;
  id: string;
  match_id: string;
  status: RoomStatus;
  updated_at: string;
};

export type RoomMember = {
  display_name: string;
  id: string;
  joined_at: string;
  room_id: string;
  seat: RoomSeat | null;
  user_id: string;
};

export type RoomDetail = {
  match: Match;
  members: RoomMember[];
  room: Room;
};
