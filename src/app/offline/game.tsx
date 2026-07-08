import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { colors, spacing } from '@/constants/ui';
import { sortCardsForHandDisplay } from '@/features/game/card-display';
import { validatePlay } from '@/features/game/combination';
import type { TichuCard } from '@/features/game/game-types';
import {
  advanceOfflineBotTurn,
  applyOfflinePassing,
  createOfflineDeal,
  currentOfflineTrickPlays,
  currentOfflineWinningPlay,
  offlineCapturedPointTotal,
  offlineWonTrickCount,
  submitOfflinePass,
  submitOfflinePlay,
  visibleCardList,
  type OfflineDeal,
  type OfflineSeat,
  type PassDirection,
} from '@/features/offline/offline-game';

const suitLabels: Record<NonNullable<TichuCard['suit']>, string> = {
  jade: 'Jade',
  pagoda: 'Pagoda',
  star: 'Star',
  sword: 'Sword',
};
const suitSymbols: Record<NonNullable<TichuCard['suit']>, string> = {
  jade: '♣',
  pagoda: '♦',
  star: '♥',
  sword: '♠',
};

export default function OfflineBotGameScreen() {
  const [deal, setDeal] = useState<OfflineDeal>(() => createOfflineDeal());
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [activePassDirection, setActivePassDirection] = useState<PassDirection>('teammate');
  const [selectedPasses, setSelectedPasses] = useState<Record<PassDirection, string | null>>({
    left: null,
    right: null,
    teammate: null,
  });

  const handPoints = useMemo(() => deal.humanHand.reduce((sum, card) => sum + card.points, 0), [deal.humanHand]);
  const displayHand = useMemo(() => sortCardsForHandDisplay(deal.humanHand), [deal.humanHand]);
  const canPass = deal.status === 'dealt';
  const isFinished = deal.status === 'finished';
  const isPlaying = deal.status === 'playing';
  const isHumanTurn = isPlaying && deal.turnState?.currentSeat === deal.humanSeat;
  const mustLeadTrick = Boolean(isHumanTurn && !deal.turnState?.currentWinningSeat);
  const selectedPassCount = Object.values(selectedPasses).filter(Boolean).length;
  const selectedPlayCards = useMemo(
    () =>
      selectedCardIds
        .map((cardId) => deal.humanHand.find((card) => card.id === cardId))
        .filter((card): card is TichuCard => Boolean(card)),
    [deal.humanHand, selectedCardIds]
  );
  const currentWinningPlay = useMemo(() => currentOfflineWinningPlay(deal), [deal]);
  const currentTrickPlays = useMemo(() => currentOfflineTrickPlays(deal), [deal]);
  const playValidation = useMemo(
    () => validatePlay(selectedPlayCards, currentWinningPlay?.combo ?? null),
    [currentWinningPlay?.combo, selectedPlayCards]
  );

  useEffect(() => {
    if (!deal.turnState || deal.status !== 'playing' || deal.turnState.currentSeat === deal.humanSeat) {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      setDeal((currentDeal) => advanceOfflineBotTurn(currentDeal));
    }, 650);

    return () => clearTimeout(timeoutId);
  }, [deal.humanSeat, deal.status, deal.turnState]);

  function handleNewDeal() {
    setSelectedCardIds([]);
    setActivePassDirection('teammate');
    setSelectedPasses({ left: null, right: null, teammate: null });
    setDeal(createOfflineDeal());
  }

  function handleSelectCard(cardId: string) {
    if (canPass) {
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
      return;
    }

    if (isPlaying && !isHumanTurn) {
      return;
    }

    if (isFinished) {
      return;
    }

    setSelectedCardIds((current) =>
      current.includes(cardId) ? current.filter((selectedCardId) => selectedCardId !== cardId) : [...current, cardId]
    );
  }

  function handleSubmitPass() {
    if (!selectedPasses.left || !selectedPasses.right || !selectedPasses.teammate) {
      Alert.alert('Choose three cards', 'Pick one card for teammate, left, and right.');
      return;
    }

    setSelectedCardIds([]);
    setDeal(
      applyOfflinePassing(deal, {
        left: selectedPasses.left,
        right: selectedPasses.right,
        teammate: selectedPasses.teammate,
      })
    );
  }

  function handleSubmitPlay() {
    if (!playValidation.valid) {
      Alert.alert('Invalid play', playValidation.reason);
      return;
    }

    setDeal((currentDeal) => submitOfflinePlay(currentDeal, currentDeal.humanSeat, selectedPlayCards));
    setSelectedCardIds([]);
  }

  function handlePassTurn() {
    setDeal((currentDeal) => submitOfflinePass(currentDeal, currentDeal.humanSeat));
    setSelectedCardIds([]);
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Offline bots</Text>
        <Text style={styles.title}>Bot table</Text>
        <Text style={styles.subtitle}>Local-only prototype. Deal a hand and inspect the first bot-game table without touching Supabase.</Text>
      </View>

      <View style={styles.tablePanel}>
        <View style={styles.playerRow}>
          {deal.botPlayers.map((bot) => (
            <View key={bot.seat} style={styles.playerTile}>
              <Text style={styles.playerName}>{bot.name}</Text>
              <Text style={styles.playerMeta}>{bot.cardCount} cards</Text>
              <Text style={styles.playerMeta}>
                {offlineWonTrickCount(deal, bot.seat)} tricks - {offlineCapturedPointTotal(deal, bot.seat)} pts
              </Text>
              <Text style={styles.botCards}>{visibleCardList(deal.hands[bot.seat])}</Text>
            </View>
          ))}
        </View>

        <View style={styles.humanSeat}>
          <Text style={styles.humanPlayerName}>You</Text>
          <Text style={styles.humanPlayerMeta}>
            {deal.humanHand.length} cards - {handPoints} points
          </Text>
          <Text style={styles.humanPlayerMeta}>
            {offlineWonTrickCount(deal, deal.humanSeat)} tricks - {offlineCapturedPointTotal(deal, deal.humanSeat)} captured
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <View style={styles.action}>
          <Button label="New deal" onPress={handleNewDeal} />
        </View>
        <View style={styles.action}>
          <Button label="Dashboard" onPress={() => router.back()} variant="secondary" />
        </View>
      </View>

      {deal.botDiagnostics ? (
        <View style={styles.botDiagnosticsPanel}>
          <View style={styles.botDiagnosticsHeader}>
            <Text style={styles.botDiagnosticsTitle}>Bot diagnostics</Text>
            <Text style={styles.botDiagnosticsMeta}>
              Trick {deal.botDiagnostics.trickNumber} - {seatName(deal.botDiagnostics.seat)}
            </Text>
          </View>
          <Text style={styles.botDiagnosticsDecision}>
            {deal.botDiagnostics.decision === 'play'
              ? `Played ${deal.botDiagnostics.decisionLabel}`
              : deal.botDiagnostics.decisionLabel}
          </Text>
          <Text style={styles.botDiagnosticsReason}>{deal.botDiagnostics.reason}</Text>
          {deal.botDiagnostics.candidates.length > 0 ? (
            <View style={styles.botCandidateList}>
              {deal.botDiagnostics.candidates.map((candidate, index) => (
                <View key={`${candidate.label}-${index}`} style={styles.botCandidateRow}>
                  <Text style={styles.botCandidateRank}>#{index + 1}</Text>
                  <Text style={styles.botCandidateLabel}>{candidate.label}</Text>
                  <Text style={styles.botCandidateScore}>{candidate.score}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.botDiagnosticsReason}>No playable candidate survived validation.</Text>
          )}
        </View>
      ) : null}

      <View style={styles.statusPanel}>
        <Text style={styles.statusTitle}>
          {canPass ? 'Pass cards' : isFinished ? 'Hand complete' : `Trick ${deal.turnState?.trickNumber ?? 1}`}
        </Text>
        <Text style={styles.statusText}>
          {canPass
            ? 'Choose one card for your teammate, left opponent, and right opponent. Bots pass automatically.'
            : isFinished
              ? 'Three players are out. The hand score is ready.'
              : isHumanTurn
                ? 'Your turn. Select a legal play or pass if another player has led.'
                : `Waiting for ${seatName(deal.turnState?.currentSeat)}.`}
        </Text>
        {canPass ? (
          <>
            <View style={styles.passTargets}>
              {passDirections.map((item) => {
                const selectedCard = deal.humanHand.find((card) => card.id === selectedPasses[item.direction]);
                const isActive = activePassDirection === item.direction;

                return (
                  <Pressable
                    accessibilityRole="button"
                    key={item.direction}
                    onPress={() => setActivePassDirection(item.direction)}
                    style={({ pressed }) => [
                      styles.passTarget,
                      isActive && styles.activePassTarget,
                      pressed && styles.pressed,
                    ]}>
                    <Text style={[styles.passTargetLabel, isActive && styles.activePassTargetText]}>{item.label}</Text>
                    <Text style={[styles.passTargetCard, isActive && styles.activePassTargetText]}>
                      {selectedCard?.rank ?? selectedCard?.label ?? 'Pick card'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Button
              disabled={selectedPassCount !== 3}
              label={selectedPassCount === 3 ? 'Submit pass' : `Choose ${3 - selectedPassCount} more`}
              onPress={handleSubmitPass}
            />
          </>
        ) : isFinished ? (
          <>
            {deal.scoreSummary ? (
              <View style={styles.scoreSummary}>
                <View style={styles.scoreSummaryRow}>
                  <Text style={styles.scoreTeam}>You + Partner</Text>
                  <Text style={styles.scoreValue}>{deal.scoreSummary.teamOneScore}</Text>
                </View>
                <View style={styles.scoreSummaryRow}>
                  <Text style={styles.scoreTeam}>Bot Left + Bot Right</Text>
                  <Text style={styles.scoreValue}>{deal.scoreSummary.teamTwoScore}</Text>
                </View>
                {deal.scoreSummary.notes.map((note) => (
                  <Text key={note} style={styles.scoreNote}>
                    {note}
                  </Text>
                ))}
              </View>
            ) : null}
            <View style={styles.finishList}>
              {deal.finishOrder.map((seat, index) => (
                <View key={seat} style={styles.finishRow}>
                  <Text style={styles.finishPlace}>#{index + 1}</Text>
                  <Text style={styles.finishName}>{seatName(seat)}</Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <>
            <Text style={styles.statusText}>
              {currentWinningPlay
                ? `${seatName(currentWinningPlay.seat)} has ${currentWinningPlay.combo?.label ?? 'the current table'}.`
                : 'This trick has not been led yet.'}
            </Text>
            <View style={styles.playHistory}>
              {currentTrickPlays.length > 0 ? (
                currentTrickPlays.map((play) => (
                  <View key={play.id} style={styles.playRow}>
                    <Text style={styles.playSeat}>{seatName(play.seat)}</Text>
                    <Text style={styles.playCards}>
                      {play.action === 'pass' ? 'Pass' : `${play.combo?.label ?? 'Play'} - ${visibleCardList(play.cards)}`}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.statusText}>No cards on the table yet.</Text>
              )}
            </View>
            {isHumanTurn ? (
              <>
                <View style={styles.comboPreview}>
                  <Text style={styles.comboLabel}>{playValidation.valid ? playValidation.label : 'Invalid selection'}</Text>
                  <Text style={styles.comboMeta}>
                    {selectedCardIds.length === 0
                      ? 'Select cards from your hand.'
                      : playValidation.valid
                        ? 'Local validator says this can be played.'
                        : playValidation.reason}
                  </Text>
                </View>
                <View style={styles.turnActions}>
                  <View style={styles.turnAction}>
                    <Button
                      disabled={!playValidation.valid}
                      label={playValidation.valid ? `Play ${playValidation.count}` : 'Select legal play'}
                      onPress={handleSubmitPlay}
                    />
                  </View>
                  <View style={styles.turnAction}>
                    <Button
                      disabled={mustLeadTrick}
                      label={mustLeadTrick ? 'Lead required' : 'Pass'}
                      onPress={handlePassTurn}
                      variant="secondary"
                    />
                  </View>
                </View>
              </>
            ) : null}
          </>
        )}
      </View>

      <View style={styles.handHeader}>
        <Text style={styles.sectionTitle}>Your hand</Text>
        <Text style={styles.selectionText}>
          {canPass
            ? selectedPassCount > 0
              ? `${selectedPassCount}/3 to pass`
              : `Tap cards for ${activePassDirection}`
            : selectedCardIds.length > 0
              ? `${selectedCardIds.length} selected`
              : 'Tap cards to select'}
        </Text>
      </View>

      <View style={styles.cardGrid}>
        {displayHand.map((card) => (
          <CardTile
            card={card}
            isSelected={canPass ? Boolean(getSelectedPassLabel(selectedPasses, card.id)) : selectedCardIds.includes(card.id)}
            key={card.id}
            onPress={() => handleSelectCard(card.id)}
            selectionLabel={canPass ? getSelectedPassLabel(selectedPasses, card.id) : null}
            tapHint={canPass ? `Tap for ${activePassDirection}` : isHumanTurn ? 'Tap to play' : isFinished ? 'Hand complete' : 'Waiting'}
          />
        ))}
      </View>
    </Screen>
  );
}

const passDirections: { direction: PassDirection; label: string }[] = [
  { direction: 'teammate', label: 'Teammate' },
  { direction: 'left', label: 'Left' },
  { direction: 'right', label: 'Right' },
];

function seatName(seat?: OfflineSeat) {
  switch (seat) {
    case 'team_one_player_one':
      return 'You';
    case 'team_one_player_two':
      return 'Bot Partner';
    case 'team_two_player_one':
      return 'Bot Left';
    case 'team_two_player_two':
      return 'Bot Right';
    default:
      return 'Next player';
  }
}

function getSelectedPassLabel(selectedPasses: Record<PassDirection, string | null>, cardId: string) {
  const selectedDirection = passDirections.find((item) => selectedPasses[item.direction] === cardId);
  return selectedDirection ? `To ${selectedDirection.label}` : null;
}

function CardTile({
  card,
  isSelected,
  onPress,
  selectionLabel,
  tapHint,
}: {
  card: TichuCard;
  isSelected: boolean;
  onPress: () => void;
  selectionLabel: string | null;
  tapHint: string;
}) {
  const isSpecial = card.kind === 'special';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        isSpecial && styles.specialCard,
        isSelected && styles.selectedCard,
        pressed && styles.pressed,
      ]}>
      <View style={styles.cardTitleRow}>
        <Text style={styles.cardRank}>{card.rank ?? card.label}</Text>
        {card.suit ? (
          <Text style={[styles.suitIcon, isRedSuit(card.suit) && styles.redSuit]}>{suitSymbols[card.suit]}</Text>
        ) : null}
      </View>
      <Text style={styles.cardSuit}>{card.suit ? suitLabels[card.suit] : 'Special'}</Text>
      {card.points !== 0 ? <Text style={styles.cardPoints}>{card.points > 0 ? `+${card.points}` : card.points}</Text> : null}
      {selectionLabel ? <Text style={styles.passBadge}>{selectionLabel}</Text> : <Text style={styles.tapHint}>{tapHint}</Text>}
    </Pressable>
  );
}

function isRedSuit(suit: NonNullable<TichuCard['suit']>) {
  return suit === 'pagoda' || suit === 'star';
}

const styles = StyleSheet.create({
  activePassTarget: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  activePassTargetText: {
    color: colors.background,
  },
  action: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  botCards: {
    color: colors.placeholder,
    fontSize: 8,
    fontWeight: '700',
    lineHeight: 11,
    textAlign: 'center',
  },
  botCandidateLabel: {
    color: colors.text,
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  botCandidateList: {
    gap: spacing.sm,
  },
  botCandidateRank: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900',
    width: 28,
  },
  botCandidateRow: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  botCandidateScore: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '900',
    minWidth: 34,
    textAlign: 'right',
  },
  botDiagnosticsDecision: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 19,
  },
  botDiagnosticsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  botDiagnosticsMeta: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  botDiagnosticsPanel: {
    backgroundColor: '#F9FAFB',
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.sm,
    marginBottom: spacing.lg,
    padding: spacing.md,
  },
  botDiagnosticsReason: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  botDiagnosticsTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
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
  cardTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  finishList: {
    gap: spacing.sm,
  },
  finishName: {
    color: colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '900',
  },
  finishPlace: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '900',
    width: 36,
  },
  finishRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  handHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  header: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  humanSeat: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 8,
    gap: 4,
    padding: spacing.md,
  },
  humanPlayerMeta: {
    color: colors.accentSoft,
    fontSize: 13,
    fontWeight: '800',
  },
  humanPlayerName: {
    color: colors.background,
    fontSize: 15,
    fontWeight: '900',
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
  playerMeta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  playerName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  playerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  playerTile: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    minHeight: 110,
    padding: spacing.md,
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
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  scoreNote: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  scoreSummary: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  scoreSummaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scoreTeam: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '900',
  },
  scoreValue: {
    color: colors.accent,
    fontSize: 22,
    fontWeight: '900',
  },
  selectedCard: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  redSuit: {
    color: colors.danger,
  },
  selectionText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  specialCard: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D',
  },
  statusPanel: {
    backgroundColor: '#F8FBFF',
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.sm,
    marginBottom: spacing.lg,
    padding: spacing.lg,
  },
  statusText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  statusTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  suitIcon: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
  },
  tablePanel: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.md,
    marginBottom: spacing.lg,
    padding: spacing.md,
  },
  tapHint: {
    color: colors.placeholder,
    fontSize: 11,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 40,
  },
  turnAction: {
    flex: 1,
  },
  turnActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
});
