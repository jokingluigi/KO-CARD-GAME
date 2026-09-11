import type { ActionResult } from '../actions/types';
import { actionFailure, actionSuccess } from '../actions/types';
import type {
  ChampionAbility,
  ChampionEffect,
} from '../champions/types';
import type { GameState } from '../types/game-state';
import { processChampionQuestEvents } from '../champions/quests';
import { validateCurrentPlayer } from './turn-system';
import { findDirectDeployedChampion } from './direct-champion';
import type { CardInstance } from '../cards/types';
import { hasMandatoryPlayerChoice, resolvePendingEffects } from '../effects/effect-engine';
import { directDeployChampionToken, validateLinkedChampionToken } from './champion-token';

function applyChampionEffect(
  state: GameState,
  playerId: string,
  championId: string,
  effect: ChampionEffect,
): GameState {
  if (effect.type === 'STRUCTURED') return state;
  if (effect.type === 'DIRECT_DEPLOY_CHAMPION_TOKEN') {
    return directDeployChampionToken(
      state,
      playerId,
      championId,
      effect.cardDefinitionId,
    );
  }
  if (effect.type === 'GAIN_GOLD') {
    return {
      ...state,
      players: state.players.map((player) =>
        player.id === playerId
          ? { ...player, currentGold: player.currentGold + effect.amount }
          : player,
      ),
      events: [
        ...state.events,
        {
          type: 'GOLD_CHANGED',
          playerId,
          championId,
          source: { type: 'CHAMPION', championId },
          target: { type: 'PLAYER', playerId },
          reason: 'CHAMPION_ABILITY',
          amount: effect.amount,
        },
      ],
    };
  }

  return {
    ...state,
    players: state.players.map((player) => {
      if (player.id !== playerId || !player.champion) return player;
      const health = Math.min(
        player.maxHealth,
        player.health + effect.amount,
      );
      return {
        ...player,
        health,
        champion: { ...player.champion, health },
      };
    }),
  };
}

function currentAbility(
  state: GameState,
  playerId: string,
): ChampionAbility | null {
  const champion = state.players.find(
    (player) => player.id === playerId,
  )?.champion;
  if (!champion) return null;
  return champion.questCompleted && champion.upgradedAbility
    ? champion.upgradedAbility
    : champion.ability;
}

function currentAbilityCost(state: GameState, playerId: string): number | null {
  const player = state.players.find((candidate) => candidate.id === playerId);
  const ability = currentAbility(state, playerId);
  if (!player?.champion || !ability) return null;
  return ability.cost ?? player.champion.abilityCost;
}

export function canUseChampionAbility(
  state: GameState,
  playerId: string,
): boolean {
  const player = state.players.find((candidate) => candidate.id === playerId);
  const cost = currentAbilityCost(state, playerId);
  return Boolean(
    state.status === 'IN_PROGRESS' &&
      state.activePlayerId === playerId &&
      player?.champion &&
      cost !== null &&
      player.currentGold >= cost,
  );
}

export function useChampionAbility(
  state: GameState,
  playerId: string,
): ActionResult {
  if (state.targetingState?.active) {
    return actionFailure(state, 'TARGET_SELECTION_PENDING', '먼저 대상을 선택하세요.');
  }
  const turnFailure = validateCurrentPlayer(state, playerId);
  if (turnFailure) return turnFailure;
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player?.champion) {
    return actionFailure(
      state,
      'CHAMPION_NOT_SELECTED',
      '선택된 챔피언이 없습니다.',
    );
  }
  const ability = currentAbility(state, playerId);
  if (!ability) {
    return actionFailure(
      state,
      'CHAMPION_ABILITY_UNAVAILABLE',
      '사용할 수 있는 챔피언 능력이 없습니다.',
    );
  }
  const abilityCost = ability.cost ?? player.champion.abilityCost;
  if (player.currentGold < abilityCost) {
    return actionFailure(state, 'NOT_ENOUGH_GOLD', '골드가 부족합니다.');
  }
  const effectSource: CardInstance = {
    instanceId: `champion-${player.champion.id}`,
    definitionId: `champion-${player.champion.id}`,
    cardType: 'WRESTLER', currentCost: 0, currentAttack: 0, currentHealth: 1,
    maxHealth: 1, keywords: [], abilities: [], boardSlot: null, enteredThisTurn: false,
    attacksUsedThisTurn: 0, activeUsedThisTurn: false, isSilenced: false,
    isStunned: false, dodgeAvailable: false, isChampionToken: false,
    isDirectDeployedChampion: false, isSilenceImmune: false, isGenerated: true, isToken: false,
  };
  const structuredEffects = ability.effects.filter(
    (effect): effect is Extract<ChampionEffect, { type: 'STRUCTURED' }> => effect.type === 'STRUCTURED',
  );
  if (hasMandatoryPlayerChoice(state, playerId, effectSource, structuredEffects)) {
    return actionFailure(state, 'NO_VALID_TARGET', '선택 가능한 대상이 없습니다.');
  }
  const directDeployEffect = ability.effects.find(
    (effect) => effect.type === 'DIRECT_DEPLOY_CHAMPION_TOKEN',
  );
  const linkedDeployEffect = ability.effects.find(
    (effect) => effect.type === 'STRUCTURED' && effect.action === 'DEPLOY_CHAMPION_TOKEN',
  );
  if (linkedDeployEffect) {
    const tokenValidation = validateLinkedChampionToken(state, playerId);
    if (!tokenValidation.ok) {
      return actionFailure(state, tokenValidation.errorCode, tokenValidation.message);
    }
  }
  if (directDeployEffect) {
    if (findDirectDeployedChampion(state, playerId)) {
      return actionFailure(
        state,
        'DIRECT_CHAMPION_ALREADY_DEPLOYED',
        '챔피언이 이미 직접 출전했습니다.',
      );
    }
    if (player.board.every((card) => card !== null)) {
      return actionFailure(state, 'BOARD_FULL', '필드에 빈 자리가 없습니다.');
    }
  }

  const paidState: GameState = {
    ...state,
    players: state.players.map((candidate) =>
      candidate.id === playerId
        ? {
            ...candidate,
            currentGold:
              candidate.currentGold - abilityCost,
          }
        : candidate,
    ),
    events: [
      ...state.events,
      {
        type: 'GOLD_CHANGED',
        playerId,
        championId: player.champion.id,
        source: { type: 'PLAYER', playerId },
        target: { type: 'CHAMPION', championId: player.champion.id },
        reason: 'CHAMPION_ABILITY_COST',
          amount: -abilityCost,
      },
      {
        type: 'CHAMPION_ABILITY_USED',
        playerId,
        championId: player.champion.id,
        source: { type: 'CHAMPION', championId: player.champion.id },
        target: { type: 'PLAYER', playerId },
        reason: ability.id,
      },
    ],
  };

  const resolved = ability.effects.reduce(
    (nextState, effect) =>
      applyChampionEffect(
        nextState,
        playerId,
        player.champion!.id,
        effect,
      ),
    paidState,
  );
  const afterNonStructured = structuredEffects.length
    ? resolvePendingEffects({ ...resolved, targetingState: {
      active: true, playerId, sourceInstanceId: effectSource.instanceId, sourceCard: effectSource,
      effects: structuredEffects, effectIndex: 0, selectedTargetIds: [], lastTargetIds: [],
      validTargetIds: [], minTargets: 0, maxTargets: 0, mandatory: true, cancelable: false,
    } })
    : resolved;
  return actionSuccess(processChampionQuestEvents(state, afterNonStructured));
}
