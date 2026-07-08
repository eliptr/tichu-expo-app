import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { LoadingScreen } from '@/components/loading-screen';
import { Screen } from '@/components/screen';
import { StateCard } from '@/components/state-card';
import { colors, spacing } from '@/constants/ui';
import { sortCardsForHandDisplay } from '@/features/game/card-display';
import { validatePlay } from '@/features/game/combination';
import {
  getGameState,
  getMyHand,
  getMyPass,
  getPassingStatus,
  getTurnState,
  listCurrentTrickPlays,
  submitRoomPass,
  submitRoomPlay,
  submitRoomTurnPass,
  subscribeToGame,
} from '@/features/game/game-service';
import type { GameHand, GamePass, GamePlay, GameState, GameTurnState, PassingStatus, TichuCard } from '@/features/game/game-types';

type PassDirection = 'left' | 'right' | 'teammate';

type SelectedPasses = Record<PassDirection, string | null>;

const suitLabels: Record<NonNullable<TichuCard['suit']>, string> = {
  jade: 'Jade',
  pagoda: 'Pagoda',
  star: 'Star',
  sword: 'Sword',
};

const seatLabels: Record<GameHand['seat'], string> = {
  team_one_player_one: 'Team 1 - Player 1',
  team_one_player_two: 'Team 1 - Player 2',
  team_two_player_one: 'Team 2 - Player 1',
  team_two_player_two: 'Team 2 - Player 2',
};

const passDirections: { direction: PassDirection; label: string }[] = [
  { direction: 'teammate', label: 'Teammate' },
  { direction: 'left', label: 'Left' },
  { direction: 'right', label: 'Right' },
];

export default function RoomHandScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [hand, setHand] = useState<GameHand | null>(null);
  const [myPass, setMyPass] = useState<GamePass | null>(null);
  const [passingStatus, setPassingStatus] = useState<PassingStatus | null>(null);
  const [turnState, setTurnState] = useState<GameTurnState | null>(null);
  const [trickPlays, setTrickPlays] = useState<GamePlay[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState('CONNECTING');
  const [activePassDirection, setActivePassDirection] = useState<PassDirection>('teammate');
  const [selectedPasses, setSelectedPasses] = useState<SelectedPasses>({
    left: null,
    right: null,
    teammate: null,
  });
  const [selectedPlayCardIds, setSelectedPlayCardIds] = useState<string[]>([]);
  const [submittingPass, setSubmittingPass] = useState(false);
  const [submittingTurnAction, setSubmittingTurnAction] = useState(false);
  const hasLoadedRef = useRef(false);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cards = useMemo(() => sortCardsForHandDisplay(hand?.cards ?? []), [hand?.cards]);

  const pointTotal = useMemo(() => cards.reduce((sum, card) => sum + card.points, 0), [cards]);
  const canPass = gameState?.status === 'dealt' || gameState?.status === 'passing';
  const hasSubmittedPass = Boolean(myPass || passingStatus?.has_submitted);
  const isPlaying = gameState?.status === 'playing';
  const isMyTurn = Boolean(isPlaying && hand && turnState?.current_seat === hand.seat);
  const mustLeadTrick = Boolean(isMyTurn && !turnState?.current_winning_seat);
  const selectedCount = Object.values(selectedPasses).filter(Boolean).length;
  const selectedPlayCards = useMemo(
    () =>
      selectedPlayCardIds
        .map((cardId) => cards.find((card) => card.id === cardId))
        .filter((card): card is TichuCard => Boolean(card)),
    [cards, selectedPlayCardIds]
  );
  const currentWinningPlay = useMemo(() => {
    if (!turnState?.current_winning_seat) {
      return null;
    }

    return [...trickPlays]
      .reverse()
      .find((play) => play.action === 'play' && play.seat === turnState.current_winning_seat) ?? null;
  }, [trickPlays, turnState?.current_winning_seat]);
  const playValidation = useMemo(
    () => validatePlay(selectedPlayCards, currentWinningPlay?.combo ?? null),
    [currentWinningPlay?.combo, selectedPlayCards]
  );

  const loadHand = useCallback(async (options?: { blocking?: boolean }) => {
    if (!roomId) {
      setError('Missing room id.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const shouldBlock = options?.blocking ?? !hasLoadedRef.current;

    if (shouldBlock) {
      setLoading(true);
      setError(null);
    } else {
      setRefreshing(true);
    }

    const finishRefresh = () => {
      if (shouldBlock) {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    };

    const failRefresh = (message: string) => {
      if (shouldBlock) {
        setError(message);
      } else {
        console.warn(message);
      }

      finishRefresh();
    };

    const { data: loadedGameState, error: gameError } = await getGameState(roomId);
    const { data: loadedHand, error: handError } = await getMyHand(roomId);
    const { data: loadedPass, error: passError } = await getMyPass(roomId);
    const { data: loadedPassingStatus, error: passingStatusError } = await getPassingStatus(roomId);
    let loadedTurnState: GameTurnState | null = null;
    let loadedTrickPlays: GamePlay[] = [];

    if (gameError) {
      failRefresh(gameError.message);
      return;
    }

    if (handError) {
      failRefresh(handError.message);
      return;
    }

    if (passError) {
      failRefresh(passError.message);
      return;
    }

    if (passingStatusError) {
      failRefresh(passingStatusError.message);
      return;
    }

    if (loadedGameState?.status === 'playing') {
      const { data: turnData, error: turnError } = await getTurnState(roomId);

      if (turnError) {
        failRefresh(turnError.message);
        return;
      }

      loadedTurnState = turnData;

      if (loadedTurnState) {
        const { data: playsData, error: playsError } = await listCurrentTrickPlays(roomId, loadedTurnState.trick_number);

        if (playsError) {
          failRefresh(playsError.message);
          return;
        }

        loadedTrickPlays = playsData ?? [];
      }
    }

    if (loadedGameState?.status !== 'playing' || loadedTurnState?.current_seat !== loadedHand?.seat) {
      setSelectedPlayCardIds([]);
    }

    setGameState(loadedGameState);
    setHand(loadedHand);
    setMyPass(loadedPass);
    setPassingStatus(loadedPassingStatus);
    setTurnState(loadedTurnState);
    setTrickPlays(loadedTrickPlays);
    hasLoadedRef.current = true;
    finishRefresh();
  }, [roomId]);

  useEffect(() => {
    if (!myPass) {
      return;
    }

    setSelectedPasses({
      left: myPass.to_left_card.id,
      right: myPass.to_right_card.id,
      teammate: myPass.to_teammate_card.id,
    });
  }, [myPass]);

  function handleSelectCard(cardId: string) {
    if (isPlaying) {
      if (!isMyTurn || submittingTurnAction) {
        return;
      }

      setSelectedPlayCardIds((current) =>
        current.includes(cardId) ? current.filter((selectedCardId) => selectedCardId !== cardId) : [...current, cardId]
      );
      return;
    }

    if (!canPass || hasSubmittedPass || submittingPass) {
      return;
    }

    setSelectedPasses((current) => {
      const withoutCard = {
        left: current.left === cardId ? null : current.left,
        right: current.right === cardId ? null : current.right,
        teammate: current.teammate === cardId ? null : current.teammate,
      };

      return {
        ...withoutCard,
        [activePassDirection]: current[activePassDirection] === cardId ? null : cardId,
      };
    });
  }

  async function handleSubmitPass() {
    if (!roomId || !selectedPasses.left || !selectedPasses.right || !selectedPasses.teammate) {
      Alert.alert('Choose three cards', 'Pick one card for teammate, left, and right.');
      return;
    }

    setSubmittingPass(true);
    const { error: submitError } = await submitRoomPass({
      leftCardId: selectedPasses.left,
      rightCardId: selectedPasses.right,
      roomId,
      teammateCardId: selectedPasses.teammate,
    });
    setSubmittingPass(false);

    if (submitError) {
      Alert.alert('Could not submit pass', submitError.message);
      return;
    }

    await loadHand({ blocking: false });
  }

  async function handleSubmitPlay() {
    if (!roomId) {
      return;
    }

    if (!playValidation.valid) {
      Alert.alert('Invalid play', playValidation.reason);
      return;
    }

    setSubmittingTurnAction(true);
    const { error: playError } = await submitRoomPlay(roomId, selectedPlayCardIds);
    setSubmittingTurnAction(false);

    if (playError) {
      Alert.alert('Could not play cards', playError.message);
      return;
    }

    setSelectedPlayCardIds([]);
    await loadHand({ blocking: false });
  }

  async function handlePassTurn() {
    if (!roomId) {
      return;
    }

    setSubmittingTurnAction(true);
    const { error: passTurnError } = await submitRoomTurnPass(roomId);
    setSubmittingTurnAction(false);

    if (passTurnError) {
      Alert.alert('Could not pass', passTurnError.message);
      return;
    }

    setSelectedPlayCardIds([]);
    await loadHand({ blocking: false });
  }

  useFocusEffect(
    useCallback(() => {
      void loadHand({ blocking: !hasLoadedRef.current });
    }, [loadHand])
  );

  useEffect(() => {
    if (!roomId) {
      return undefined;
    }

    const unsubscribe = subscribeToGame(
      roomId,
      () => {
        if (refreshTimeoutRef.current) {
          clearTimeout(refreshTimeoutRef.current);
        }

        refreshTimeoutRef.current = setTimeout(() => {
          refreshTimeoutRef.current = null;
          void loadHand({ blocking: false });
        }, 180);
      },
      setRealtimeStatus
    );

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }

      unsubscribe();
    };
  }, [loadHand, roomId]);

  if (loading && !hand) {
    return <LoadingScreen message="Loading hand" />;
  }

  if (error) {
    return (
      <Screen>
        <StateCard
          title="Hand could not load"
          body={error}
          action={<Button label="Back to room" onPress={() => router.back()} variant="secondary" />}
        />
      </Screen>
    );
  }

  if (!gameState || !hand) {
    return (
      <Screen>
        <StateCard
          title="No hand yet"
          body="The game has not been dealt, or you need to claim a seat before the host deals."
          action={<Button label="Back to room" onPress={() => router.back()} variant="secondary" />}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Private hand</Text>
        <Text style={styles.title}>{seatLabels[hand.seat]}</Text>
        <View style={styles.headerMeta}>
          <Text style={styles.statusBadge}>{gameState.status}</Text>
          <Text style={styles.liveStatus}>{realtimeStatus === 'SUBSCRIBED' ? 'Live connected' : 'Connecting live updates'}</Text>
          {refreshing ? <Text style={styles.syncBadge}>Syncing</Text> : null}
        </View>
        <Text style={styles.subtitle}>
          {cards.length} cards - {pointTotal} hand points
        </Text>
      </View>

      {canPass ? (
        <View style={styles.passPanel}>
          <Text style={styles.passTitle}>{hasSubmittedPass ? 'Pass submitted' : 'Choose 3 cards to pass'}</Text>
          <Text style={styles.passMeta}>
            {passingStatus
              ? `${passingStatus.submitted_count}/${passingStatus.total_count} players submitted`
              : 'Waiting for passing status'}
          </Text>
          <View style={styles.passTargets}>
            {passDirections.map((item) => {
              const selectedCard = cards.find((card) => card.id === selectedPasses[item.direction]);
              const isActive = activePassDirection === item.direction;

              return (
                <Pressable
                  accessibilityRole="button"
                  disabled={hasSubmittedPass}
                  key={item.direction}
                  onPress={() => setActivePassDirection(item.direction)}
                  style={({ pressed }) => [
                    styles.passTarget,
                    isActive && styles.activePassTarget,
                    hasSubmittedPass && styles.disabledTarget,
                    pressed && !hasSubmittedPass && styles.pressed,
                  ]}>
                  <Text style={[styles.passTargetLabel, isActive && styles.activePassTargetText]}>{item.label}</Text>
                  <Text style={[styles.passTargetCard, isActive && styles.activePassTargetText]}>
                    {selectedCard?.rank ?? selectedCard?.label ?? 'Pick card'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {!hasSubmittedPass ? (
            <Button
              disabled={selectedCount !== 3}
              label={selectedCount === 3 ? 'Submit pass' : `Choose ${3 - selectedCount} more`}
              loading={submittingPass}
              onPress={() => void handleSubmitPass()}
            />
          ) : (
            <Text style={styles.waitingText}>Waiting for the other players. Your choices are locked for this prototype.</Text>
          )}
        </View>
      ) : gameState.status === 'playing' ? (
        <View style={styles.trickPanel}>
          <Text style={styles.passTitle}>Trick {turnState?.trick_number ?? 1}</Text>
          <Text style={styles.passMeta}>
            {isMyTurn ? 'Your turn.' : `Waiting for ${seatLabels[turnState?.current_seat ?? 'team_one_player_one']}.`}
          </Text>
          <Text style={styles.passMeta}>
            {turnState?.current_winning_seat
              ? `${seatLabels[turnState.current_winning_seat]} has ${currentWinningPlay?.combo?.label ?? 'the current table'}.`
              : 'Lead this trick with any cards for now.'}
          </Text>

          <View style={styles.playHistory}>
            {trickPlays.length > 0 ? (
              trickPlays.map((play) => (
                <View key={play.id} style={styles.playRow}>
                  <Text style={styles.playSeat}>{seatLabels[play.seat]}</Text>
                  <Text style={styles.playCards}>
                    {play.action === 'pass' ? 'Pass' : `${play.combo?.label ?? 'Play'} - ${cardListLabel(play.cards)}`}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.waitingText}>No cards on the table yet.</Text>
            )}
          </View>

          {isMyTurn ? (
            <>
              <View style={styles.comboPreview}>
                <Text style={styles.comboLabel}>{playValidation.valid ? playValidation.label : 'Invalid selection'}</Text>
                <Text style={styles.comboMeta}>
                  {selectedPlayCardIds.length === 0
                    ? 'Select cards from your hand.'
                    : playValidation.valid
                      ? 'Server will verify this before playing.'
                      : playValidation.reason}
                </Text>
              </View>
              <View style={styles.turnActions}>
                <View style={styles.turnAction}>
                  <Button
                    disabled={!playValidation.valid}
                    label={playValidation.valid ? `Play ${playValidation.count}` : 'Select legal play'}
                    loading={submittingTurnAction}
                    onPress={() => void handleSubmitPlay()}
                  />
                </View>
                <View style={styles.turnAction}>
                  <Button
                    disabled={mustLeadTrick}
                    label={mustLeadTrick ? 'Lead required' : 'Pass'}
                    onPress={() => void handlePassTurn()}
                    variant="secondary"
                  />
                </View>
              </View>
            </>
          ) : null}
        </View>
      ) : null}

      <View style={styles.cardGrid}>
        {cards.map((card) => (
          <CardTile
            card={card}
            disabled={isPlaying ? !isMyTurn : !canPass || hasSubmittedPass}
            key={card.id}
            onPress={() => handleSelectCard(card.id)}
            selectionLabel={getCardSelectionLabel({
              cardId: card.id,
              isPlaying,
              selectedPasses,
              selectedPlayCardIds,
            })}
            tapHint={isPlaying ? 'Tap to play' : `Tap for ${activePassDirection}`}
          />
        ))}
      </View>

      <View style={styles.footer}>
        <Button label="Back to room" onPress={() => router.back()} variant="secondary" />
      </View>
    </Screen>
  );
}

function getSelectedDirection(selectedPasses: SelectedPasses, cardId: string) {
  return passDirections.find((item) => selectedPasses[item.direction] === cardId)?.direction ?? null;
}

function getCardSelectionLabel({
  cardId,
  isPlaying,
  selectedPasses,
  selectedPlayCardIds,
}: {
  cardId: string;
  isPlaying: boolean;
  selectedPasses: SelectedPasses;
  selectedPlayCardIds: string[];
}) {
  if (isPlaying) {
    return selectedPlayCardIds.includes(cardId) ? 'Selected' : null;
  }

  const selectedDirection = getSelectedDirection(selectedPasses, cardId);
  const selectedLabel = passDirections.find((item) => item.direction === selectedDirection)?.label;
  return selectedLabel ? `To ${selectedLabel}` : null;
}

function cardListLabel(cards: TichuCard[]) {
  return cards.map((card) => card.rank ?? card.label).join(', ');
}

function CardTile({
  card,
  disabled,
  onPress,
  selectionLabel,
  tapHint,
}: {
  card: TichuCard;
  disabled: boolean;
  onPress: () => void;
  selectionLabel: string | null;
  tapHint: string;
}) {
  const isSpecial = card.kind === 'special';
  const isSelected = Boolean(selectionLabel);

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        isSpecial && styles.specialCard,
        isSelected && styles.selectedCard,
        pressed && !disabled && styles.pressedCard,
      ]}>
      <Text style={styles.cardRank}>{card.rank ?? card.label}</Text>
      <Text style={styles.cardSuit}>{card.suit ? suitLabels[card.suit] : 'Special'}</Text>
      {card.points !== 0 ? <Text style={styles.cardPoints}>{card.points > 0 ? `+${card.points}` : card.points}</Text> : null}
      {selectionLabel ? <Text style={styles.passBadge}>{selectionLabel}</Text> : !disabled ? <Text style={styles.tapHint}>{tapHint}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: '31%',
    gap: 4,
    minHeight: 96,
    padding: spacing.md,
  },
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cardPoints: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '900',
  },
  cardRank: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  cardSuit: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  activePassTarget: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  activePassTargetText: {
    color: colors.background,
  },
  disabledTarget: {
    opacity: 0.78,
  },
  comboLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  comboMeta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  comboPreview: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: spacing.md,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  footer: {
    marginTop: spacing.lg,
  },
  header: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  headerMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
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
  passBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    color: colors.accent,
    fontSize: 11,
    fontWeight: '900',
    marginTop: spacing.sm,
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  passMeta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  passPanel: {
    backgroundColor: '#F8FBFF',
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.md,
    marginBottom: spacing.lg,
    padding: spacing.lg,
  },
  passTarget: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    minHeight: 74,
    padding: spacing.md,
  },
  passTargetCard: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  passTargetLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  passTargets: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  passTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  playCards: {
    color: colors.text,
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    textAlign: 'right',
  },
  playHistory: {
    gap: spacing.sm,
  },
  playRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  playSeat: {
    color: colors.muted,
    flex: 1,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  pressed: {
    opacity: 0.82,
  },
  pressedCard: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },
  selectedCard: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  specialCard: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D',
  },
  statusBadge: {
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    color: colors.accent,
    fontSize: 12,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    textTransform: 'uppercase',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
  },
  syncBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: 999,
    color: '#92400E',
    fontSize: 12,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  tapHint: {
    color: colors.placeholder,
    fontSize: 11,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  trickPanel: {
    backgroundColor: '#F8FBFF',
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.md,
    marginBottom: spacing.lg,
    padding: spacing.lg,
  },
  turnAction: {
    flex: 1,
  },
  turnActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  waitingText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
});
