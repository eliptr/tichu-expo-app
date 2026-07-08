import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

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
  submitOfflinePass,
  submitOfflinePlay,
  visibleCardList,
  type OfflineDeal,
  type OfflineSeat,
  type PassDirection,
} from '@/features/offline/offline-game';

type MatchTargetScore = 500 | 1000 | 2000;
type MatchScores = {
  teamOne: number;
  teamTwo: number;
};
type MatchWinner = 'team_one' | 'team_two';

const suitSymbols: Record<NonNullable<TichuCard['suit']>, string> = {
  jade: '♣',
  pagoda: '♦',
  star: '♥',
  sword: '♠',
};

const matchTargetScores: MatchTargetScore[] = [500, 1000, 2000];
const emptyMatchScores: MatchScores = { teamOne: 0, teamTwo: 0 };
const handCardOverlap = 8;
const handGridLeftPadding = 10;
const handGridColumns = 7;

export default function OfflineBotGameScreen() {
  const { width } = useWindowDimensions();
  const [deal, setDeal] = useState<OfflineDeal>(() => createOfflineDeal());
  const [targetScore, setTargetScore] = useState<MatchTargetScore | null>(null);
  const [matchScores, setMatchScores] = useState<MatchScores>(emptyMatchScores);
  const [handNumber, setHandNumber] = useState(1);
  const [scoredHandNumber, setScoredHandNumber] = useState(0);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [activePassDirection, setActivePassDirection] = useState<PassDirection>('teammate');
  const [selectedPasses, setSelectedPasses] = useState<Record<PassDirection, string | null>>({
    left: null,
    right: null,
    teammate: null,
  });

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
  const matchWinner = useMemo(() => getMatchWinner(matchScores, targetScore), [matchScores, targetScore]);
  const handCardWidth = useMemo(() => {
    const screenPadding = spacing.md * 2;
    const availableWidth = width - screenPadding - handGridLeftPadding;
    const overlappedWidth = (availableWidth + handCardOverlap * (handGridColumns - 1)) / handGridColumns;

    return Math.min(64, Math.max(46, overlappedWidth));
  }, [width]);
  const handCardStyle = useMemo(
    () => ({
      height: handCardWidth * 1.42,
      marginRight: -handCardOverlap,
      width: handCardWidth,
    }),
    [handCardWidth]
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

  useEffect(() => {
    if (!targetScore || deal.status !== 'finished' || !deal.scoreSummary || scoredHandNumber === handNumber) {
      return;
    }

    const scoreSummary = deal.scoreSummary;

    setMatchScores((current) => ({
      teamOne: current.teamOne + scoreSummary.teamOneScore,
      teamTwo: current.teamTwo + scoreSummary.teamTwoScore,
    }));
    setScoredHandNumber(handNumber);
  }, [deal.scoreSummary, deal.status, handNumber, scoredHandNumber, targetScore]);

  function resetSelections() {
    setSelectedCardIds([]);
    setActivePassDirection('teammate');
    setSelectedPasses({ left: null, right: null, teammate: null });
  }

  function handleStartMatch(selectedTargetScore: MatchTargetScore) {
    resetSelections();
    setTargetScore(selectedTargetScore);
    setMatchScores(emptyMatchScores);
    setHandNumber(1);
    setScoredHandNumber(0);
    setDeal(createOfflineDeal());
  }

  function handleNextHand() {
    if (matchWinner) {
      return;
    }

    resetSelections();
    setHandNumber((current) => current + 1);
    setDeal(createOfflineDeal());
  }

  function handleNewMatch() {
    resetSelections();
    setTargetScore(null);
    setMatchScores(emptyMatchScores);
    setHandNumber(1);
    setScoredHandNumber(0);
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

  if (!targetScore) {
    return (
      <Screen compact>
        <View style={styles.matchStartPanel}>
          <Text style={styles.matchStartTitle}>Choose match length</Text>
          <View style={styles.targetOptions}>
            {matchTargetScores.map((score) => (
              <Pressable
                accessibilityRole="button"
                key={score}
                onPress={() => handleStartMatch(score)}
                style={({ pressed }) => [styles.targetOption, pressed && styles.pressed]}>
                <Text style={styles.targetOptionValue}>{score}</Text>
                <Text style={styles.targetOptionLabel}>points</Text>
              </Pressable>
            ))}
          </View>
          <Button label="Dashboard" onPress={() => router.back()} variant="secondary" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen compact>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Offline bots</Text>
      </View>
      <View style={styles.matchScorePanel}>
        <View style={styles.matchScoreHeader}>
          <Text style={styles.matchScoreTitle}>Hand {handNumber}</Text>
          <View style={styles.matchScoreHeaderActions}>
            <Text style={styles.matchScoreTarget}>To {targetScore}</Text>
            <Pressable accessibilityRole="button" onPress={handleNewMatch} style={({ pressed }) => [styles.compactAction, pressed && styles.pressed]}>
              <Text style={styles.compactActionText}>New</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.compactAction, pressed && styles.pressed]}>
              <Text style={styles.compactActionText}>Exit</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.matchScoreRows}>
          <View style={[styles.matchScoreTeam, matchWinner === 'team_one' && styles.matchWinnerTeam]}>
            <Text style={styles.matchScoreName}>You</Text>
            <Text style={styles.matchScoreValue}>{matchScores.teamOne}</Text>
          </View>
          <Text style={styles.matchScoreDivider}>-</Text>
          <View style={[styles.matchScoreTeam, matchWinner === 'team_two' && styles.matchWinnerTeam]}>
            <Text style={styles.matchScoreName}>Bots</Text>
            <Text style={styles.matchScoreValue}>{matchScores.teamTwo}</Text>
          </View>
        </View>
      </View>
      <View style={styles.tablePanel}>
        <View style={styles.playerRow}>
          {deal.botPlayers.map((bot) => (
            <View key={bot.seat} style={styles.playerTile}>
              <Text style={styles.playerName}>{bot.name}</Text>
              <Text style={styles.playerMeta}>{bot.cardCount} cards</Text>
              <Text style={styles.botCards}>{visibleCardList(deal.hands[bot.seat])}</Text>
            </View>
          ))}
        </View>

        <View style={styles.humanSeat}>
          <Text style={styles.humanPlayerName}>You</Text>
          <Text style={styles.humanPlayerMeta}>{deal.humanHand.length} cards</Text>
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
            {matchWinner ? (
              <View style={styles.matchCompletePanel}>
                <Text style={styles.matchCompleteTitle}>{matchWinner === 'team_one' ? 'You win the match' : 'Bots win the match'}</Text>
                <View style={styles.turnActions}>
                  <View style={styles.turnAction}>
                    <Button label="New match" onPress={handleNewMatch} />
                  </View>
                  <View style={styles.turnAction}>
                    <Button label="Dashboard" onPress={() => router.back()} variant="secondary" />
                  </View>
                </View>
              </View>
            ) : (
              <Button
                disabled={scoredHandNumber !== handNumber}
                label={scoredHandNumber === handNumber ? 'Next hand' : 'Saving score'}
                onPress={handleNextHand}
              />
            )}
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
                  {selectedCardIds.length > 0 ? (
                    <Text style={styles.comboMeta}>{playValidation.valid ? 'Ready to play.' : playValidation.reason}</Text>
                  ) : null}
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

      <Text style={styles.sectionTitle}>Your hand</Text>

      <View style={styles.cardGrid}>
        {displayHand.map((card) => (
          <CardTile
            card={card}
            cardStyle={handCardStyle}
            isSelected={canPass ? Boolean(getSelectedPassLabel(selectedPasses, card.id)) : selectedCardIds.includes(card.id)}
            key={card.id}
            onPress={() => handleSelectCard(card.id)}
            selectionLabel={canPass ? getSelectedPassLabel(selectedPasses, card.id) : null}
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

function getMatchWinner(scores: MatchScores, targetScore: MatchTargetScore | null): MatchWinner | null {
  if (!targetScore) {
    return null;
  }

  const teamOneReached = scores.teamOne >= targetScore;
  const teamTwoReached = scores.teamTwo >= targetScore;

  if (teamOneReached && teamTwoReached) {
    return scores.teamOne >= scores.teamTwo ? 'team_one' : 'team_two';
  }

  if (teamOneReached) {
    return 'team_one';
  }

  if (teamTwoReached) {
    return 'team_two';
  }

  return null;
}

function CardTile({
  card,
  cardStyle,
  isSelected,
  onPress,
  selectionLabel,
}: {
  card: TichuCard;
  cardStyle: { height: number; marginRight: number; width: number };
  isSelected: boolean;
  onPress: () => void;
  selectionLabel: string | null;
}) {
  const isSpecial = card.kind === 'special';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        cardStyle,
        isSpecial && styles.specialCard,
        isSelected && styles.selectedCard,
        pressed && styles.pressed,
      ]}>
      <View style={styles.cardTitleRow}>
        <Text adjustsFontSizeToFit numberOfLines={2} style={styles.cardRank}>
          {card.rank ?? card.label}
        </Text>
        {card.suit ? (
          <Text style={[styles.suitIcon, isRedSuit(card.suit) && styles.redSuit]}>{suitSymbols[card.suit]}</Text>
        ) : null}
      </View>
      {selectionLabel ? <Text style={styles.passBadge}>{selectionLabel}</Text> : null}
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
  compactAction: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  compactActionText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  matchCompletePanel: {
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.md,
  },
  matchCompleteTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  matchScoreHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  matchScoreHeaderActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 5,
  },
  matchScoreName: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  matchScorePanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 5,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  matchScoreRows: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  matchScoreDivider: {
    color: colors.placeholder,
    fontSize: 14,
    fontWeight: '900',
  },
  matchScoreTarget: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  matchScoreTeam: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 0,
    flexDirection: 'row',
    flex: 1,
    gap: 5,
    justifyContent: 'center',
    paddingVertical: 1,
  },
  matchScoreTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  matchScoreValue: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '900',
  },
  matchStartPanel: {
    gap: spacing.lg,
    paddingTop: spacing.xl,
  },
  matchStartTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  matchWinnerTeam: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
    borderWidth: 1,
  },
  targetOption: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 2,
    padding: spacing.md,
  },
  targetOptionLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  targetOptions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  targetOptionValue: {
    color: colors.accent,
    fontSize: 22,
    fontWeight: '900',
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
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 8,
    borderWidth: 1,
    elevation: 4,
    gap: 0,
    justifyContent: 'flex-start',
    marginBottom: 5,
    paddingHorizontal: 7,
    paddingVertical: 7,
    shadowColor: '#0F172A',
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 5,
  },
  cardGrid: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginRight: handCardOverlap,
    paddingLeft: handGridLeftPadding,
    rowGap: 0,
  },
  cardRank: {
    color: colors.text,
    fontSize: 31,
    fontWeight: '700',
    lineHeight: 31,
    textAlign: 'left',
  },
  cardTitleRow: {
    alignItems: 'flex-start',
    gap: 2,
    width: '100%',
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
  humanSeat: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 8,
    gap: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  humanPlayerMeta: {
    color: colors.accentSoft,
    fontSize: 11,
    fontWeight: '800',
  },
  humanPlayerName: {
    color: colors.background,
    fontSize: 13,
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
  header: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  passBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    color: colors.accent,
    fontSize: 8,
    fontWeight: '900',
    marginTop: 1,
    overflow: 'hidden',
    paddingHorizontal: 3,
    paddingVertical: 1,
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
    fontSize: 11,
    fontWeight: '800',
  },
  playerName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  playerRow: {
    flexDirection: 'row',
    gap: 6,
  },
  playerTile: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    gap: 1,
    minHeight: 58,
    paddingHorizontal: 6,
    paddingVertical: 5,
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
    fontSize: 17,
    fontWeight: '900',
    marginBottom: spacing.sm,
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
    backgroundColor: '#EFF6FF',
    borderColor: colors.accent,
    borderWidth: 2,
    elevation: 7,
    shadowOpacity: 0.22,
    transform: [{ translateY: -3 }],
  },
  redSuit: {
    color: colors.danger,
  },
  specialCard: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FBBF24',
  },
  statusPanel: {
    backgroundColor: '#F8FBFF',
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.sm,
    marginBottom: spacing.md,
    padding: spacing.md,
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
    fontSize: 29,
    fontWeight: '900',
    lineHeight: 29,
  },
  tablePanel: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    marginBottom: spacing.sm,
    padding: 6,
  },
  turnAction: {
    flex: 1,
  },
  turnActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
});
