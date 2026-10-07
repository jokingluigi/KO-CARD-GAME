import { mergeZombie } from './zombie-token';
import { startCountdown } from '../cards/countdown';
import type { CardInstance } from '../cards/types';
import type { EnterFieldEvent, EntryCause, EventSubject } from '../events/types';
import type { GameState } from '../types/game-state';
import type { BoardSlot } from './board-position';
import { appendEffectContinuation, resolveCardEntryListeners, resolveSummonListeners, resolveTriggeredAbilities } from '../effects/effect-engine';
import { getActiveCardAbilities } from '../cards/granted-text';
import { canEnterTowerField, applyTowerEntryStats, towerContextAfterEntry, refreshTowerAuras } from '../tower/relics';

export function enterField(
  state: GameState,
  playerId: string,
  card: CardInstance,
  boardSlot: BoardSlot,
  source: EventSubject = {
    type: 'CARD',
    cardInstanceId: card.instanceId,
  },
  chosenTargetInstanceIds?: string[],
  entryCause: EntryCause = 'PLAY_FROM_HAND',
): GameState {
  const player = state.players.find((candidate) => candidate.id === playerId);

  if (!player) {
    throw new Error(`플레이어를 찾을 수 없습니다: ${playerId}`);
  }

  const merged = mergeZombie(state, playerId, card);
  if (merged) return merged;

  if (player.board[boardSlot] !== null) {
    throw new Error(`이미 사용 중인 보드 슬롯입니다: ${boardSlot}`);
  }
  if (!canEnterTowerField(state, playerId)) return state;

  const enteredCard: CardInstance = startCountdown({
    ...applyTowerEntryStats(state, playerId, card),
    boardSlot,
    enteredThisTurn: true,
    enteredOnTurn: state.turn,
    entryDefenseActive: true,
    attacksUsedThisTurn: 0,
  }, state.turn);
  const event: EnterFieldEvent = {
    type: 'ENTER_FIELD',
    cardDefinitionId: card.definitionId,
    playerId,
    cardInstanceId: card.instanceId,
    boardSlot,
    source,
    target: { type: 'CARD', cardInstanceId: card.instanceId },
    reason: 'ENTER_FIELD',
    entryCause,
  };

  const enteredState: GameState = refreshTowerAuras({
    ...state,
    ...(state.tower ? { tower: towerContextAfterEntry(state, playerId) } : {}),
    players: state.players.map((candidate) => {
      if (candidate.id !== playerId) {
        return candidate;
      }

      const board = [...candidate.board];
      board[boardSlot] = enteredCard;

      return {
        ...candidate,
        board: board as typeof candidate.board,
      };
    }),
    events: [...state.events, event],
    ...(state.tower?.playerId === playerId ? { tower: { ...towerContextAfterEntry(state, playerId)!, nextEntryBuffs: 0 } } : {}),
  });

  const afterEnter = entryCause === 'PLAY_FROM_HAND' || entryCause === 'CHAMPION_DEPLOY'
    ? resolveTriggeredAbilities(
      enteredState,
      playerId,
      enteredCard,
      'ENTER_FIELD',
      { boardSlot, chosenTargetInstanceIds },
    )
    : enteredState;
  const afterSelfEntry = resolveTriggeredAbilities(afterEnter, playerId, enteredCard, 'SELF_ENTERED', {boardSlot,chosenTargetInstanceIds});
  const afterEntryListeners = resolveCardEntryListeners(afterSelfEntry, playerId, enteredCard);
  const afterSummonListeners = entryCause === 'SUMMON'
    ? resolveSummonListeners(afterEntryListeners, playerId, enteredCard)
    : afterEntryListeners;
  // POSITION is deferred after ENTER_FIELD rather than installed as a child.
  if (afterSummonListeners.targetingState?.active) {
     const positionEffects = getActiveCardAbilities(enteredCard)
      .filter((ability) => ability.trigger === 'POSITION' && ability.boardSlots.includes(boardSlot))
      .flatMap((ability) => ability.effects);
      if (!positionEffects.length) return afterSummonListeners;
      return appendEffectContinuation(afterSummonListeners, {
      active: true, playerId, sourceInstanceId: enteredCard.instanceId, sourceCard: enteredCard,
      effects: positionEffects, effectIndex: 0, selectedTargetIds: [], lastTargetIds: [],
      validTargetIds: [], minTargets: 0, maxTargets: 0, mandatory: true, cancelable: false,
    });
  }
   return resolveTriggeredAbilities(
      afterSummonListeners,
    playerId,
    enteredCard,
    'POSITION',
    { boardSlot },
  );
}
