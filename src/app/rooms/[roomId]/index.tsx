import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { LoadingScreen } from '@/components/loading-screen';
import { Screen } from '@/components/screen';
import { StateCard } from '@/components/state-card';
import { colors, spacing } from '@/constants/ui';
import { useAuth } from '@/features/auth/auth-context';
import { getGameState, startRoomGame, subscribeToGame } from '@/features/game/game-service';
import type { GameState } from '@/features/game/game-types';
import { claimRoomSeat, deleteRoom, getRoomDetail, leaveRoom, subscribeToRoom } from '@/features/rooms/room-service';
import type { RoomDetail, RoomMember, RoomSeat } from '@/features/rooms/room-types';

const seats: { label: string; seat: RoomSeat; team: 'one' | 'two' }[] = [
  { label: 'Team 1 - Player 1', seat: 'team_one_player_one', team: 'one' },
  { label: 'Team 1 - Player 2', seat: 'team_one_player_two', team: 'one' },
  { label: 'Team 2 - Player 1', seat: 'team_two_player_one', team: 'two' },
  { label: 'Team 2 - Player 2', seat: 'team_two_player_two', team: 'two' },
];

export default function RoomLobbyScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { user } = useAuth();
  const [detail, setDetail] = useState<RoomDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [claimingSeat, setClaimingSeat] = useState<RoomSeat | null>(null);
  const [startingGame, setStartingGame] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState('CONNECTING');

  const currentMember = useMemo(
    () => detail?.members.find((member) => member.user_id === user?.id) ?? null,
    [detail?.members, user?.id]
  );
  const isHost = detail?.room.host_user_id === user?.id;

  const loadRoom = useCallback(async () => {
    if (!roomId) {
      setError('Missing room id.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const { data, error: roomError } = await getRoomDetail(roomId);
    const { data: loadedGameState, error: gameError } = await getGameState(roomId);
    setLoading(false);

    if (roomError) {
      setError(roomError.message);
      return;
    }

    if (gameError) {
      setError(gameError.message);
      return;
    }

    setDetail(data);
    setGameState(loadedGameState);
  }, [roomId]);

  async function handleClaimSeat(seat: RoomSeat) {
    setClaimingSeat(seat);
    const { error: seatError } = await claimRoomSeat(roomId, currentMember?.seat === seat ? null : seat);
    setClaimingSeat(null);

    if (seatError) {
      Alert.alert('Could not claim seat', seatError.message);
      return;
    }

    await loadRoom();
  }

  async function handleCopyCode() {
    if (!detail) {
      return;
    }

    await Clipboard.setStringAsync(detail.room.code);
    Alert.alert('Copied', 'Room code copied.');
  }

  async function handleStartGame() {
    if (!detail) {
      return;
    }

    const seatedMembers = detail.members.filter((member) => member.seat);

    if (seatedMembers.length !== 4) {
      Alert.alert('Room is not ready', 'All four seats need a player before dealing cards.');
      return;
    }

    setStartingGame(true);
    const { error: startError } = await startRoomGame(detail.room.id);
    setStartingGame(false);

    if (startError) {
      Alert.alert('Could not start game', startError.message);
      return;
    }

    await loadRoom();
  }

  function handleLeaveRoom() {
    if (!detail || isHost) {
      return;
    }

    Alert.alert('Leave room?', 'You can rejoin later with the room code.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => void confirmLeaveRoom(),
      },
    ]);
  }

  function handleDeleteRoom() {
    if (!detail || !isHost) {
      return;
    }

    Alert.alert('Delete room?', 'This permanently deletes the room, shared match, and all rounds.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void confirmDeleteRoom(),
      },
    ]);
  }

  async function confirmLeaveRoom() {
    if (!roomId) {
      return;
    }

    const { error: leaveError } = await leaveRoom(roomId);

    if (leaveError) {
      Alert.alert('Could not leave room', leaveError.message);
      return;
    }

    router.replace('/tabs/home');
  }

  async function confirmDeleteRoom() {
    if (!roomId) {
      return;
    }

    const { error: deleteError } = await deleteRoom(roomId);

    if (deleteError) {
      Alert.alert('Could not delete room', deleteError.message);
      return;
    }

    router.replace('/tabs/home');
  }

  useFocusEffect(
    useCallback(() => {
      void loadRoom();
    }, [loadRoom])
  );

  useEffect(() => {
    if (!roomId) {
      return undefined;
    }

    return subscribeToRoom(
      roomId,
      () => {
        void loadRoom();
      },
      setRealtimeStatus
    );
  }, [loadRoom, roomId]);

  useEffect(() => {
    if (!roomId) {
      return undefined;
    }

    return subscribeToGame(roomId, () => {
      void loadRoom();
    });
  }, [loadRoom, roomId]);

  if (loading) {
    return <LoadingScreen message="Loading room" />;
  }

  if (error || !detail) {
    return (
      <Screen>
        <StateCard
          title="Room could not load"
          body={error ?? 'No room found.'}
          action={<Button label="Back to matches" onPress={() => router.replace('/tabs/home')} variant="secondary" />}
        />
      </Screen>
    );
  }

  const teamOneMembers = detail.members.filter((member) => member.seat?.startsWith('team_one'));
  const teamTwoMembers = detail.members.filter((member) => member.seat?.startsWith('team_two'));
  const seatedMemberCount = detail.members.filter((member) => member.seat).length;
  const isSeated = Boolean(currentMember?.seat);
  const canStartGame = isHost && seatedMemberCount === 4;

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Room code</Text>
        <Text selectable style={styles.code}>
          {detail.room.code}
        </Text>
        <View style={styles.headerMeta}>
          <Text style={styles.liveStatus}>{realtimeStatus === 'SUBSCRIBED' ? 'Live connected' : 'Connecting live updates'}</Text>
          {isHost ? <Text style={styles.hostBadge}>Host</Text> : null}
        </View>
        <Text style={styles.subtitle}>
          {detail.members.length} member{detail.members.length === 1 ? '' : 's'} in this room.
        </Text>
        <View style={styles.headerActions}>
          <View style={styles.headerAction}>
            <Button label="Copy code" onPress={handleCopyCode} variant="secondary" />
          </View>
          {isHost ? (
            <View style={styles.headerAction}>
              <Button label="Delete room" onPress={handleDeleteRoom} variant="secondary" />
            </View>
          ) : null}
          {!isHost ? (
            <View style={styles.headerAction}>
              <Button label="Leave room" onPress={handleLeaveRoom} variant="secondary" />
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.scoreCard}>
        <Text style={styles.matchTitle}>
          {detail.match.team_one_name} vs {detail.match.team_two_name}
        </Text>
        <Text style={styles.scoreMeta}>Shared scorer - first to {detail.match.target_score}</Text>
        <Button
          label="Open shared scorer"
          onPress={() =>
            router.push({
              pathname: '/matches/[matchId]',
              params: { matchId: detail.match.id },
            })
          }
        />
      </View>

      <View style={styles.gameCard}>
        <View style={styles.gameHeader}>
          <View style={styles.gameHeaderCopy}>
            <Text style={styles.matchTitle}>Card game prototype</Text>
            <Text style={styles.scoreMeta}>
              {gameState
                ? `Game ${gameState.status}. Your hand is private.`
                : `${seatedMemberCount}/4 seats claimed before the host can deal.`}
            </Text>
          </View>
          {gameState ? <Text style={styles.gameBadge}>{gameState.status}</Text> : null}
        </View>
        {gameState ? (
          <Button
            disabled={!isSeated}
            label={isSeated ? 'View my hand' : 'Claim a seat to view hand'}
            onPress={() => router.push(`/rooms/${detail.room.id}/hand` as Href)}
            variant="secondary"
          />
        ) : isHost ? (
          <Button
            disabled={!canStartGame}
            label={canStartGame ? 'Start game and deal' : 'Waiting for 4 seats'}
            loading={startingGame}
            onPress={() => void handleStartGame()}
          />
        ) : (
          <Text style={styles.waitingText}>The host can deal once all four seats are claimed.</Text>
        )}
      </View>

      <View style={styles.teams}>
        <TeamCard members={teamOneMembers} name={detail.match.team_one_name} />
        <TeamCard members={teamTwoMembers} name={detail.match.team_two_name} />
      </View>

      <View style={styles.seats}>
        <Text style={styles.sectionTitle}>Seats</Text>
        {seats.map((seatConfig) => {
          const member = detail.members.find((roomMember) => roomMember.seat === seatConfig.seat);
          const isMine = currentMember?.seat === seatConfig.seat;

          return (
            <Pressable
              accessibilityRole="button"
              disabled={Boolean(member && !isMine) || claimingSeat === seatConfig.seat}
              key={seatConfig.seat}
              onPress={() => void handleClaimSeat(seatConfig.seat)}
              style={({ pressed }) => [
                styles.seat,
                isMine && styles.mySeat,
                Boolean(member && !isMine) && styles.takenSeat,
                pressed && styles.pressed,
              ]}>
              <Text style={[styles.seatLabel, isMine && styles.mySeatText]}>{seatConfig.label}</Text>
              <Text style={[styles.seatName, isMine && styles.mySeatText]}>{member?.display_name ?? 'Open'}</Text>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

function TeamCard({ members, name }: { members: RoomMember[]; name: string }) {
  return (
    <View style={styles.teamCard}>
      <Text style={styles.teamName}>{name}</Text>
      <Text style={styles.teamMembers}>
        {members.length > 0 ? members.map((member) => member.display_name).join(' + ') : 'No seats claimed'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  code: {
    color: colors.text,
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: 0,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  gameBadge: {
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    color: colors.accent,
    fontSize: 12,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    textTransform: 'uppercase',
  },
  gameCard: {
    backgroundColor: '#F8FBFF',
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.md,
    marginBottom: spacing.lg,
    padding: spacing.lg,
  },
  gameHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  gameHeaderCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  header: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  headerAction: {
    flex: 1,
  },
  headerMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  hostBadge: {
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    color: colors.accent,
    fontSize: 12,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  liveStatus: {
    backgroundColor: '#DCFCE7',
    borderRadius: 999,
    color: '#15803D',
    fontSize: 12,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  matchTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  mySeat: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  mySeatText: {
    color: colors.background,
  },
  pressed: {
    opacity: 0.78,
  },
  scoreCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.md,
    marginBottom: spacing.lg,
    padding: spacing.lg,
  },
  scoreMeta: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  seats: {
    gap: spacing.sm,
  },
  seat: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: spacing.md,
  },
  seatLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  seatName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
  },
  takenSeat: {
    opacity: 0.7,
  },
  teamCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  teamMembers: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  teamName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  teams: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  waitingText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
});
