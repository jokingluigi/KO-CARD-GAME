import { draftBaseline } from '../cards/draft-mutation';
import type { ActionResult } from '../actions/types';
import { actionFailure, actionSuccess } from '../actions/types';
import type { CardInstanceId } from '../cards/types';
import { getActiveAbility, hasMandatoryPlayerChoice, resolveActiveAbility } from '../effects/effect-engine';
import type { GameState } from '../types/game-state';
import { validateCurrentPlayer } from './turn-system';
import { processChampionQuestEvents } from '../champions/quests';
import { refreshTowerAuras } from '../tower/relics';
import { removeGrantedCardText } from '../cards/granted-text';

function updateBoardCard(
  state: GameState,
  cardInstanceId: CardInstanceId,
  update: (card: NonNullable<GameState['players'][number]['board'][number]>) =>
    NonNullable<GameState['players'][number]['board'][number]>,
): GameState {
  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      board: player.board.map((card) =>
        card?.instanceId === cardInstanceId ? update(card) : card,
      ) as typeof player.board,
    })),
  };
}

export function silenceCard(
  state: GameState,
  cardInstanceId: CardInstanceId,
): GameState {
  const aura = state.tower?.auraStats?.[cardInstanceId];
  return refreshTowerAuras(updateBoardCard(state, cardInstanceId, (card) => {
    if (card.isSilenceImmune) return card;
    const definition = state.cardPool?.find(item => item.id === card.definitionId);
    const draft = card.draftMutation ? draftBaseline(card, definition) : undefined;
    const attack = (card.awakening?.baseAttack ?? draft?.attack ?? definition?.attack ?? card.baseAttack ?? card.currentAttack) + (aura?.attack ?? 0);
    const maxHealth = (card.awakening?.baseHealth ?? draft?.health ?? definition?.health ?? card.baseHealth ?? card.maxHealth) + (aura?.health ?? 0);
    return {
      ...removeGrantedCardText(card),
      grantedTags: undefined,
      isSilenced: true,
      currentAttack: Math.max(0, attack),
      maxHealth: Math.max(1, maxHealth),
      currentHealth: Math.min(card.currentHealth, Math.max(1, maxHealth)),
      temporaryStatModifiers: [],
      temporaryKeywordGrants: [],
      statHistory: [],
      keywords: [],
      dodgeAvailable: false,
      dodgeCharges: 0,
      countdownRemaining: undefined,
      countdownResolved: undefined,
      countdownLastTickTurn: undefined,
    };
  }));
}

export function setCardStunned(
  state: GameState,
  cardInstanceId: CardInstanceId,
  isStunned: boolean,
): GameState {
  return updateBoardCard(state, cardInstanceId, (card) => ({
    ...card,
    isStunned,
  }));
}

export function useActiveAbility(
  state: GameState,
  playerId: string,
  cardInstanceId: CardInstanceId,
): ActionResult {
  if (state.targetingState?.active) return actionFailure(state, 'TARGET_SELECTION_PENDING', '먼저 대상을 선택하세요.');
  const turnFailure = validateCurrentPlayer(state, playerId);
  if (turnFailure) return turnFailure;

  const player = state.players.find((candidate) => candidate.id === playerId);
  const card = player?.board.find(
    (candidate) => candidate?.instanceId === cardInstanceId,
  );

  if (!card || !getActiveAbility(card)) {
    return actionFailure(
      state,
      'ACTIVE_NOT_AVAILABLE',
      '사용할 수 있는 액티브 능력이 없습니다.',
    );
  }
  if (card.activeUsedThisTurn) {
    return actionFailure(
      state,
      'ACTIVE_ALREADY_USED',
      '이번 턴에는 이미 액티브 능력을 사용했습니다.',
    );
  }
  if (card.enteredThisTurn || card.enteredOnTurn === state.turn) {
    return actionFailure(state, 'SUMMONED_THIS_TURN', '등장한 턴에는 액티브 능력을 사용할 수 없습니다. 다음 자기 턴부터 사용할 수 있습니다.');
  }

  const active = getActiveAbility(card)!;
  if (hasMandatoryPlayerChoice(state, playerId, card, active.effects)) {
    return actionFailure(state, 'NO_VALID_TARGET', '선택 가능한 대상이 없습니다.');
  }
  const resolved = resolveActiveAbility(state, playerId, card);
  return actionSuccess(
    processChampionQuestEvents(
      state,
      resolved,
    ),
  );
}

export function canUseActiveAbility(
  state: GameState,
  playerId: string,
  cardInstanceId: CardInstanceId,
): boolean {
  if (
    state.status !== 'IN_PROGRESS' ||
    state.activePlayerId !== playerId
  ) {
    return false;
  }
  const player = state.players.find((candidate) => candidate.id === playerId);
  const card = player?.board.find(
    (candidate) => candidate?.instanceId === cardInstanceId,
  );
  return Boolean(
    card &&
      !card.enteredThisTurn && card.enteredOnTurn !== state.turn &&
      !card.activeUsedThisTurn &&
      getActiveAbility(card),
  );
}
