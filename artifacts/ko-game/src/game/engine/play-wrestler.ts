import { canPlayFusion, queueHandFusion } from './fusion';
import { getActiveCardKeywords } from '../cards/granted-text';
import { canPlayConditionalCard } from './keyword-rules';
import type { GameState } from '../types/game-state';
import type { ActionResult } from '../actions/types';
import { actionFailure, actionSuccess } from '../actions/types';
import type { CardInstanceId } from '../cards/types';
import type { BoardSlot } from './board-position';
import { isBoardFull } from './board-position';
import { enterField } from './enter-field';
import { validateCurrentPlayer } from './turn-system';
import { processChampionQuestEvents } from '../champions/quests';
import { resolveBoardListeners, resolveQueuedEffectsForPlayedWrestler, resolveRegisteredRuleListeners } from '../effects/effect-engine';
import { getActiveCardAbilities } from '../cards/granted-text';
import { canEnterTowerField, towerSummonCost } from '../tower/relics';

/** Costs reserved for a hand play are evaluated before payment, never on summons. */
export function wrestlerPlayCost(state: GameState, playerId: string, card: import('../cards/types').CardInstance): number {
  const free = state.pendingCardEffects?.some(pending => pending.playerId === playerId &&
    pending.trigger === 'NEXT_ALLY_WRESTLER_PLAYED' &&
    (pending.expiresAtTurn === undefined || pending.expiresAtTurn >= state.turn) &&
    pending.effect.target?.zone === 'HAND' && pending.effect.action === 'SET_STAT' &&
    pending.effect.values?.stat === 'COST' && pending.effect.values.amount === 0);
  return free ? 0 : towerSummonCost(state, playerId, card.currentCost);
}

export function playWrestlerFromHand(
  state: GameState,
  playerId: string,
  cardInstanceId: CardInstanceId,
  boardSlot: BoardSlot,
): ActionResult {
  if (state.targetingState?.active) {
    return actionFailure(state, 'TARGET_SELECTION_PENDING', '먼저 대상을 선택하세요.');
  }
  const turnFailure = validateCurrentPlayer(state, playerId);
  if (turnFailure) {
    return turnFailure;
  }

  const player = state.players.find((candidate) => candidate.id === playerId);

  if (!player) {
    return actionFailure(state, 'INVALID_PLAYER', '플레이어를 찾을 수 없습니다.');
  }

  const card = player.hand.find(
    (candidate) => candidate.instanceId === cardInstanceId,
  );

  if (!card || card.cardType === 'TECHNIQUE') {
    return actionFailure(
      state,
      'CARD_NOT_IN_HAND',
      '사용할 수 없는 카드입니다.',
    );
  }

  if (isBoardFull(player.board) || !canEnterTowerField(state, playerId)) {
    return actionFailure(state, 'BOARD_FULL', '필드에 빈 자리가 없습니다.');
  }

  if (player.board[boardSlot] !== null) {
    return actionFailure(
      state,
      'INVALID_SLOT',
      '해당 위치에는 소환할 수 없습니다.',
    );
  }

  if (!canPlayConditionalCard(state, playerId, card)) return actionFailure(state, 'NO_VALID_TARGET', '카드 사용 조건을 충족하지 않았습니다.');
  if (!canPlayFusion(state, playerId, card)) return actionFailure(state, "NO_VALID_TARGET", "합체할 다른 아군 선수가 필요합니다.");
  const payableCost = wrestlerPlayCost(state, playerId, card);
  if (player.currentGold < payableCost) {
    return actionFailure(state, 'NOT_ENOUGH_GOLD', '골드가 부족합니다.');
  }
  const enterEffects = getActiveCardAbilities(card)
    .filter((ability) => ability.trigger === 'ENTER_FIELD')
    .flatMap((ability) => ability.effects);
  const paidState: GameState = {
    ...state,
    players: state.players.map((candidate) =>
      candidate.id === playerId
        ? {
            ...candidate,
            currentGold: candidate.currentGold - payableCost,
            hand: candidate.hand.filter(
              (handCard) => handCard.instanceId !== cardInstanceId,
            ),
          }
        : candidate,
    ),
    events: [
      ...state.events,
      {
        type: 'CARD_PLAYED',
        playerId,
        cardInstanceId,
        cardType: card.cardType,
        source: { type: 'PLAYER', playerId },
        target: { type: 'CARD', cardInstanceId },
        reason: 'PLAY_FROM_HAND',
        tags: card.tags ? [...card.tags] : [],
      },
      {
        type: 'GOLD_CHANGED',
        playerId,
        source: { type: 'CARD', cardInstanceId },
        target: { type: 'PLAYER', playerId },
        reason: 'CARD_COST',
        amount: -payableCost,
      },
    ],
  };

  const enteredState = enterField(paidState, playerId, card, boardSlot, {
      type: 'PLAYER',
      playerId,
    }, undefined, 'PLAY_FROM_HAND');
  const queuedResolvedState = resolveQueuedEffectsForPlayedWrestler(enteredState, playerId, cardInstanceId);
  const resolvedState = resolveRegisteredRuleListeners(
    queuedResolvedState,
    'CARD_PLAYED',
    playerId,
    cardInstanceId,
    'WRESTLER',
  );
  const fusionState = getActiveCardKeywords(card).includes("FUSION") ? queueHandFusion(resolvedState, state, playerId, card) : resolvedState;
  if (fusionState === state) return actionSuccess(state);
  const completed = processChampionQuestEvents(state, fusionState);
  return actionSuccess(completed.targetingState?.active ? { ...completed, targetingState: { ...completed.targetingState, playRollback: state } } : completed);
}
