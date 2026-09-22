import type { GameState } from '../types/game-state';
import type { ActionResult } from '../actions/types';
import { actionFailure, actionSuccess } from '../actions/types';
import type { CardInstanceId } from '../cards/types';
import type { BoardSlot } from './board-position';
import { isBoardFull } from './board-position';
import { enterField } from './enter-field';
import { validateCurrentPlayer } from './turn-system';
import { processChampionQuestEvents } from '../champions/quests';
import { hasMandatoryPlayerChoice, resolveBoardListeners, resolveQueuedEffectsForPlayedWrestler, resolveRegisteredRuleListeners } from '../effects/effect-engine';

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

  if (!card) {
    return actionFailure(
      state,
      'CARD_NOT_IN_HAND',
      '사용할 수 없는 카드입니다.',
    );
  }

  if (isBoardFull(player.board)) {
    return actionFailure(state, 'BOARD_FULL', '필드에 빈 자리가 없습니다.');
  }

  if (player.board[boardSlot] !== null) {
    return actionFailure(
      state,
      'INVALID_SLOT',
      '해당 위치에는 소환할 수 없습니다.',
    );
  }

  if (player.currentGold < card.currentCost) {
    return actionFailure(state, 'NOT_ENOUGH_GOLD', '골드가 부족합니다.');
  }
  // Preflight against the post-entry board so SELF/other-ally effects see the
  // wrestler being played, while leaving hand, gold and board untouched on failure.
  const stagedCard = { ...card, boardSlot, enteredThisTurn: true, attacksUsedThisTurn: 0 };
  const stagedState: GameState = {
    ...state,
    players: state.players.map((candidate) => candidate.id === playerId
      ? { ...candidate, board: candidate.board.map((entry, index) => index === boardSlot ? stagedCard : entry) as typeof candidate.board }
      : candidate),
  };
  const enteringEffects = card.abilities
    .filter((ability) => ability.trigger === 'ENTER_FIELD')
    .flatMap((ability) => ability.effects);
  if (hasMandatoryPlayerChoice(stagedState, playerId, stagedCard, enteringEffects)) {
    return actionFailure(state, 'NO_VALID_TARGET', '선택 가능한 대상이 없습니다.');
  }

  const paidState: GameState = {
    ...state,
    players: state.players.map((candidate) =>
      candidate.id === playerId
        ? {
            ...candidate,
            currentGold: candidate.currentGold - card.currentCost,
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
        amount: -card.currentCost,
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
  return actionSuccess(processChampionQuestEvents(state, resolvedState));
}