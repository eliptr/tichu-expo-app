import { capturePosition, storePositionReport, type PositionReport } from '@/features/offline/position-reports';
import { FormTextInput } from '@/components/form-text-input';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Pressable, StyleSheet, Switch, Text, useWindowDimensions, View } from 'react-native';

import { loadOfflineSave, normalizeOfflineBotExperiments, saveOfflineGame } from '@/features/offline/offline-storage';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { colors, spacing } from '@/constants/ui';
import { sortCardsForHandDisplay } from '@/features/game/card-display';
import { validatePlay } from '@/features/game/combination';
import type { TichuCard } from '@/features/game/game-types';
import { chooseResponsiveOfflineBot } from '@/features/offline/offline-search';
import {
  advanceOfflineBotTurn,
  applyOfflinePassing,
  createOfflineDeal,
  currentOfflineTrickPlays,
  currentOfflineWinningPlay,
  generateOfflineLegalMoves,
  offlineWishRanks,
  submitOfflinePass,
  submitOfflinePlay,
  visibleCardList,
  type OfflineDeal,
  type OfflinePlay,
  type OfflineSeat,
  type PassDirection,
  type OfflineWishRank,
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
const searchFallbackText = {
  'outside-endgame': 'This turn was too early for search.',
  'forced-move': 'Search skipped because there was only one candidate.',
  'immediate-finish': 'Search skipped because the bot could go out now.',
  'no-sample': 'Search could not sample a possible deal in time.',
  'no-result': 'Search did not complete a simulation on this turn.',
  'incomplete-shortlist': 'Search could not finish a simulation for every candidate. The bot used its normal rules.',
};

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
  const [selectedWishRank, setSelectedWishRank] = useState<OfflineWishRank | null>(null);

  const [reportDraft, setReportDraft] = useState<PositionReport | null>(null);
  const [reportNote, setReportNote] = useState('');
  const [reportMessage, setReportMessage] = useState('');
  const [savingReport, setSavingReport] = useState(false);
  const lastBotPosition = useRef<OfflineDeal | null>(null);
  function reportPosition() {
    setReportNote(''); setReportMessage('');
    setReportDraft(capturePosition({ version: 1, deal, targetScore, matchScores, handNumber, scoredHandNumber, botDelay, showDiagnostics, botExperiments }, lastBotPosition.current));
  }
  async function saveReport() {
    if (!reportDraft || savingReport) return;
    setSavingReport(true);
    try {
      await storePositionReport({ ...reportDraft, note: reportNote.trim() });
      setReportDraft(null); setReportMessage('Position saved. Find it in Offline Home → Saved position reports.');
    } catch (error) { setReportMessage(error instanceof Error ? error.message : 'Could not save report. Try again.'); }
    finally { setSavingReport(false); }
  }
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [botDelay, setBotDelay] = useState(650);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [botExperiments, setBotExperiments] = useState(() => normalizeOfflineBotExperiments());
  useEffect(() => {
    let active = true;
    loadOfflineSave().then(save => {
      if (!active || !save) return;
      setDeal(save.deal); setTargetScore(save.targetScore); setMatchScores(save.matchScores);
      setHandNumber(save.handNumber); setScoredHandNumber(save.scoredHandNumber);
      setBotDelay(save.botDelay); setShowDiagnostics(save.showDiagnostics);
      setBotExperiments(normalizeOfflineBotExperiments(save.botExperiments));
    }).catch(() => { if (active) setStorageError('Could not restore your save. You can start a new game.'); })
      .finally(() => { if (active) setHydrated(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    saveOfflineGame({ version: 1, deal, targetScore, matchScores, handNumber, scoredHandNumber, botDelay, showDiagnostics, botExperiments })
      .catch(() => setStorageError('Local saving is unavailable. Keep this screen open to continue your game.'));
  }, [hydrated, deal, targetScore, matchScores, handNumber, scoredHandNumber, botDelay, showDiagnostics, botExperiments]);

  const displayHand = useMemo(() => sortCardsForHandDisplay(deal.humanHand), [deal.humanHand]);
  const latestSearch = deal.botDiagnostics?.search;
  const lastSearch = deal.lastBotSearch;
  const lastSearchBot = lastSearch && deal.botPlayers.find(bot => bot.seat === lastSearch.seat);
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
  const newestCurrentTrickPlays = useMemo(() => [...currentTrickPlays].reverse(), [currentTrickPlays]);
  const playValidation = useMemo(
    () => validatePlay(selectedPlayCards, currentWinningPlay?.combo ?? null),
    [currentWinningPlay?.combo, selectedPlayCards]
  );
  const selectedPlayHasMahJong = selectedPlayCards.some((card) => card.id === 'mah-jong');
  const needsWishRank = isHumanTurn && playValidation.valid && selectedPlayHasMahJong;
  const activeWishRank = deal.turnState?.wishRank ?? null;
  const humanCanSatisfyWish = useMemo(
    () =>
      Boolean(
        isHumanTurn &&
          activeWishRank &&
          generateOfflineLegalMoves(deal.humanHand, currentWinningPlay?.combo ?? null).some((move) =>
            move.cards.some((card) => card.rank === activeWishRank)
          )
      ),
    [activeWishRank, currentWinningPlay?.combo, deal.humanHand, isHumanTurn]
  );
  const selectedPlaySatisfiesWish = Boolean(
    activeWishRank && selectedPlayCards.some((card) => card.rank === activeWishRank)
  );
  const selectedPlayViolatesWish = Boolean(
    humanCanSatisfyWish && selectedPlayCards.length > 0 && !selectedPlaySatisfiesWish
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
    if (reportDraft || !hydrated || !targetScore || !deal.turnState || deal.status !== 'playing' || deal.turnState.currentSeat === deal.humanSeat) {
      return undefined;
    }

    const { currentSeat } = deal.turnState;
    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      const result = await chooseResponsiveOfflineBot(deal, currentSeat, botExperiments, controller.signal);
      if (!result || controller.signal.aborted) return;
      lastBotPosition.current = deal;
      setDeal(advanceOfflineBotTurn(deal, () => result));
    }, botDelay);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [reportDraft, hydrated, targetScore, botDelay, deal, botExperiments]);

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

  useEffect(() => {
    if (!selectedPlayHasMahJong && selectedWishRank) {
      setSelectedWishRank(null);
    }
  }, [selectedPlayHasMahJong, selectedWishRank]);

  function resetSelections() {
    lastBotPosition.current = null;
    setSelectedCardIds([]);
    setActivePassDirection('teammate');
    setSelectedPasses({ left: null, right: null, teammate: null });
    setSelectedWishRank(null);
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

    if (selectedPlayHasMahJong && !selectedWishRank) {
      Alert.alert('Choose a wish', 'Mah Jong must ask for a rank before you play it.');
      return;
    }

    try {
      setDeal(submitOfflinePlay(deal, deal.humanSeat, selectedPlayCards, selectedPlayHasMahJong ? selectedWishRank : null));
      setSelectedCardIds([]);
      setSelectedWishRank(null);
    } catch (error) {
      Alert.alert('Wish obligation', error instanceof Error ? error.message : 'That play is not allowed right now.');
    }
  }

  function handlePassTurn() {
    if (humanCanSatisfyWish) {
      Alert.alert('Wish obligation', `Mah Jong wish is active: play ${activeWishRank} if possible.`);
      return;
    }

    setDeal((currentDeal) => submitOfflinePass(currentDeal, currentDeal.humanSeat));
    setSelectedCardIds([]);
    setSelectedWishRank(null);
  }

  if (!hydrated) return <Screen><Text>Restoring local game...</Text></Screen>;

  if (reportDraft) return <Screen keyboardAware contentStyle={{ gap: spacing.md }}>
    <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text }}>Report this position</Text>
    <Text>Game paused. This report includes all hands, play history, scores and the latest bot diagnostics.</Text>
    <Text>{reportDraft.position.deal.botDiagnostics?.reason || 'No bot decision recorded yet.'}</Text>
    <FormTextInput label="What looked wrong? (optional)" accessibilityLabel="Report note" multiline maxLength={2000} value={reportNote} onChangeText={setReportNote} placeholder="Describe what you expected the bot to do" />
    {reportMessage ? <Text accessibilityRole="alert">{reportMessage}</Text> : null}
    <Button label="Save report locally" loading={savingReport} onPress={() => void saveReport()} />
    <Button label="Cancel and resume" disabled={savingReport} variant="secondary" onPress={() => { setReportDraft(null); setReportMessage(''); }} />
  </Screen>;

  if (!targetScore) {
    return (
      <Screen compact>
        {storageError ? <Text accessibilityRole="alert">{storageError}</Text> : null}
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
          <Button label="Offline Home" onPress={() => router.replace("/")} variant="secondary" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen compact>
        {storageError ? <Text accessibilityRole="alert">{storageError}</Text> : null}
      <Button label="Report this position" variant="secondary" onPress={reportPosition} />
      {reportMessage ? <Text accessibilityLiveRegion="polite">{reportMessage}</Text> : null}
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
            <Pressable accessibilityRole="button" onPress={() => router.replace("/")} style={({ pressed }) => [styles.compactAction, pressed && styles.pressed]}>
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
      <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
        <Button variant="secondary" label={`Bot pace: ${botDelay === 250 ? 'Fast' : botDelay === 650 ? 'Normal' : 'Slow'}`} onPress={() => setBotDelay(botDelay === 250 ? 650 : botDelay === 650 ? 1500 : 250)} />
        <View style={styles.botSwitchRow}>
          <Text style={styles.botDiagnosticsTitle}>Extra Phoenix protection</Text>
          <Switch accessibilityLabel="Extra Phoenix protection" disabled={!hydrated}
            value={botExperiments.extraPhoenixProtection}
            onValueChange={extraPhoenixProtection => setBotExperiments(settings => ({ ...settings, extraPhoenixProtection }))} />
        </View>
        <View style={styles.botSwitchRow}>
          <Text style={styles.botDiagnosticsTitle}>Exit protection</Text>
          <Switch accessibilityLabel="Exit protection" disabled={!hydrated}
            value={botExperiments.exitProtection === true}
            onValueChange={exitProtection => setBotExperiments(settings => ({ ...settings, exitProtection }))} />
        </View>
        <View style={styles.botSwitchRow}>
          <Text style={styles.botDiagnosticsTitle}>Endgame search</Text>
          <Switch accessibilityLabel="Endgame search" disabled={!hydrated}
            value={botExperiments.endgameSearch}
            onValueChange={endgameSearch => setBotExperiments(settings => ({ ...settings, endgameSearch }))} />
        </View>
        <Button variant="secondary" label={showDiagnostics ? 'Hide bot diagnostics' : 'Show bot diagnostics'} onPress={() => setShowDiagnostics(!showDiagnostics)} />
        {showDiagnostics && (botExperiments.endgameSearch || deal.botDiagnostics) ? <View style={styles.botDiagnosticsPanel}>
          {lastSearch && !latestSearch?.iterations ? (
            <Text style={styles.botDiagnosticsReason}>
              Last search · {lastSearchBot?.name ?? 'Bot'} ran {lastSearch.iterations} simulations on trick {lastSearch.trickNumber}.
            </Text>
          ) : null}
          {latestSearch?.fallback ? <Text style={styles.botDiagnosticsReason}>
            {searchFallbackText[latestSearch.fallback]} {latestSearch.iterations ? `(${latestSearch.iterations} simulations)` : ''}
          </Text> : null}
          {!deal.botDiagnostics && botExperiments.endgameSearch ? <Text style={styles.botDiagnosticsReason}>Search is enabled for late turns.</Text> : null}
          {deal.botDiagnostics ? <>
            <Text style={styles.botDiagnosticsTitle}>{deal.botDiagnostics.decisionLabel}</Text>
            <Text style={styles.botDiagnosticsReason}>{deal.botDiagnostics.reason}</Text>
            {deal.botDiagnostics.candidates.map((candidate, index) => <Text key={index}>{candidate.label}: {candidate.score.toFixed(2)}{candidate.visits ? ` (${candidate.visits} visits)` : ''}</Text>)}
          </> : null}
        </View> : null}
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

      </View>

      <View style={styles.statusPanel}>
        <Text style={styles.statusTitle}>
          {canPass ? 'Pass cards' : isFinished ? 'Hand complete' : `Trick ${deal.turnState?.trickNumber ?? 1}`}
        </Text>
        {canPass || isFinished ? (
          <Text style={styles.statusText}>
            {canPass
              ? 'Choose one card for your teammate, left opponent, and right opponent. Bots pass automatically.'
              : 'Three players are out. The hand score is ready.'}
          </Text>
        ) : null}
        {!canPass && !isFinished && deal.turnState?.wishRank ? (
          <Text style={styles.statusText}>Mah Jong wish: play {deal.turnState.wishRank} if possible.</Text>
        ) : null}
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
                    <Button label="Offline Home" onPress={() => router.replace("/")} variant="secondary" />
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
            {isHumanTurn && selectedCardIds.length > 0 ? (
              <Text style={styles.statusText}>
                {needsWishRank
                  ? 'Choose the rank you want before playing Mah Jong.'
                  : selectedPlayViolatesWish
                    ? `Mah Jong wish is active: play ${activeWishRank} if possible.`
                  : playValidation.valid
                    ? playValidation.label
                    : playValidation.reason}
              </Text>
            ) : null}
            <TrickTable plays={newestCurrentTrickPlays} />
            {needsWishRank ? (
              <View style={styles.wishPicker}>
                <Text style={styles.wishPickerTitle}>Mah Jong wish</Text>
                <View style={styles.wishRankGrid}>
                  {offlineWishRanks.map((rank) => {
                    const isSelected = selectedWishRank === rank;

                    return (
                      <Pressable
                        accessibilityRole="button"
                        key={rank}
                        onPress={() => setSelectedWishRank(rank)}
                        style={({ pressed }) => [
                          styles.wishRankOption,
                          isSelected && styles.selectedWishRankOption,
                          pressed && styles.pressed,
                        ]}>
                        <Text style={[styles.wishRankText, isSelected && styles.selectedWishRankText]}>{rank}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
            <View style={styles.turnActions}>
              <View style={styles.turnAction}>
                <Button
                  disabled={
                    !isHumanTurn ||
                    !playValidation.valid ||
                    selectedPlayViolatesWish ||
                    (selectedPlayHasMahJong && !selectedWishRank)
                  }
                  label={
                    selectedPlayViolatesWish
                      ? 'Wish'
                      : selectedPlayHasMahJong && !selectedWishRank
                        ? 'Wish'
                        : playValidation.valid
                          ? `Play ${playValidation.count}`
                          : 'Select'
                  }
                  onPress={handleSubmitPlay}
                />
              </View>
              <View style={styles.turnAction}>
                <Button
                  disabled={!isHumanTurn || mustLeadTrick || humanCanSatisfyWish}
                  label={humanCanSatisfyWish ? 'Wish' : 'Pass'}
                  onPress={handlePassTurn}
                  variant="secondary"
                />
              </View>
            </View>
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

function TrickTable({ plays }: { plays: OfflinePlay[] }) {
  return (
    <View style={styles.trickTable}>
      {plays.length > 0 ? (
        plays.map((play, index) => <TrickPlayPile index={index} key={play.id} play={play} playCount={plays.length} />)
      ) : null}
    </View>
  );
}

function TrickPlayPile({ index, play, playCount }: { index: number; play: OfflinePlay; playCount: number }) {
  const entrance = useRef(new Animated.Value(0)).current;
  const displayCards = useMemo(() => sortCardsForHandDisplay(play.cards), [play.cards]);

  useEffect(() => {
    Animated.spring(entrance, {
      damping: 13,
      mass: 0.7,
      stiffness: 180,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  const translateY = entrance.interpolate({
    inputRange: [0, 1],
    outputRange: [-14, 0],
  });
  const scale = entrance.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });

  return (
    <Animated.View
      style={[
        styles.trickPile,
        {
          opacity: entrance,
          top: 10 + index * 20,
          transform: [{ translateY }, { scale }],
          zIndex: playCount - index,
        },
      ]}>
      <Text style={styles.trickPileSeat}>{seatName(play.seat)}</Text>
      {play.action === 'pass' ? (
        <View style={styles.trickPassChip}>
          <Text style={styles.trickPassText}>Pass</Text>
        </View>
      ) : (
        <View style={styles.trickPlayContent}>
          <View style={styles.trickMiniCards}>
            {displayCards.map((card, cardIndex) => (
              <MiniPlayedCard card={card} index={cardIndex} key={card.id} />
            ))}
          </View>
          {play.wishRank ? (
            <View style={styles.trickWishChip}>
              <Text style={styles.trickWishText}>Wish {play.wishRank}</Text>
            </View>
          ) : null}
        </View>
      )}
    </Animated.View>
  );
}

function MiniPlayedCard({ card, index }: { card: TichuCard; index: number }) {
  const redSuit = card.suit ? isRedSuit(card.suit) : false;

  return (
    <View style={[styles.trickMiniCard, { transform: [{ rotate: `${(index % 5) * 3 - 6}deg` }] }]}>
      <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.trickMiniRank, redSuit && styles.redSuit]}>
        {card.rank ?? specialCardFaceLabel(card)}
      </Text>
      {card.suit ? <Text style={[styles.trickMiniSuit, redSuit && styles.redSuit]}>{suitSymbols[card.suit]}</Text> : null}
    </View>
  );
}

function specialCardFaceLabel(card: TichuCard) {
  switch (card.id) {
    case 'mah-jong':
      return '1';
    case 'phoenix':
      return 'P';
    case 'dragon':
      return 'D';
    default:
      return card.label.slice(0, 1);
  }
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
  botSwitchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    minHeight: 44,
    gap: spacing.sm,
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
  trickMiniCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderRadius: 8,
    borderWidth: 1,
    elevation: 2,
    height: 44,
    justifyContent: 'center',
    marginRight: -10,
    paddingVertical: 3,
    shadowColor: '#0F172A',
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    width: 30,
  },
  trickMiniCards: {
    flexDirection: 'row',
    paddingLeft: 3,
  },
  trickMiniRank: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 16,
  },
  trickMiniSuit: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 14,
  },
  trickPassChip: {
    backgroundColor: '#E2E8F0',
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  trickPassText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  trickPlayContent: {
    gap: 3,
  },
  trickPile: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    left: 10,
    maxWidth: '92%',
    position: 'absolute',
  },
  trickPileSeat: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 999,
    color: colors.muted,
    fontSize: 10,
    fontWeight: '900',
    minWidth: 58,
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 3,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  trickWishChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  trickWishText: {
    color: colors.accent,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  trickTable: {
    backgroundColor: '#DCFCE7',
    borderColor: '#A7F3D0',
    borderRadius: 8,
    borderWidth: 1,
    height: 122,
    overflow: 'hidden',
    position: 'relative',
  },
  trickTableEmpty: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
    padding: spacing.md,
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
  selectedWishRankOption: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  selectedWishRankText: {
    color: colors.background,
  },
  wishPicker: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.sm,
  },
  wishPickerTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  wishRankGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  wishRankOption: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 38,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  wishRankText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
});
