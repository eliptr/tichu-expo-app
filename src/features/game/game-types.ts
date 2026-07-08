import type { RoomSeat } from '@/features/rooms/room-types';

export type GameStatus = 'waiting' | 'dealt' | 'passing' | 'playing' | 'finished';

export type TichuCard = {
  id: string;
  kind: 'special' | 'standard';
  label: string;
  points: number;
  rank: string | null;
  sort_value: number;
  suit: 'jade' | 'pagoda' | 'star' | 'sword' | null;
};

export type GameState = {
  created_at: string;
  id: string;
  room_id: string;
  started_at: string | null;
  status: GameStatus;
  updated_at: string;
};

export type GameHand = {
  cards: TichuCard[];
  created_at: string;
  id: string;
  room_id: string;
  seat: RoomSeat;
  user_id: string;
};

export type GamePass = {
  created_at: string;
  id: string;
  room_id: string;
  seat: RoomSeat;
  to_left_card: TichuCard;
  to_right_card: TichuCard;
  to_teammate_card: TichuCard;
  updated_at: string;
  user_id: string;
};

export type PassingStatus = {
  has_submitted: boolean;
  submitted_count: number;
  total_count: number;
};

export type TichuCombination = {
  bomb_power?: number;
  count: number;
  is_bomb: boolean;
  label: string;
  rank: number;
  type:
    | 'consecutive_pairs'
    | 'dog'
    | 'four_bomb'
    | 'full_house'
    | 'pair'
    | 'single'
    | 'straight'
    | 'straight_flush_bomb'
    | 'triple';
  valid: true;
};

export type GameTurnState = {
  created_at: string;
  current_seat: RoomSeat;
  current_winning_seat: RoomSeat | null;
  id: string;
  pass_count: number;
  play_number: number;
  room_id: string;
  trick_number: number;
  updated_at: string;
};

export type GamePlay = {
  action: 'pass' | 'play';
  cards: TichuCard[];
  combo: TichuCombination | null;
  created_at: string;
  id: string;
  play_number: number;
  room_id: string;
  seat: RoomSeat;
  trick_number: number;
  user_id: string;
};
