import type { GameEvent } from '../events/types';
import type { GameState } from '../types/game-state';
import type { ChampionQuest } from './types';
import { tryDirectDeployChampionToken } from '../engine/champion-token';
import type { CardInstance } from '../cards/types';
import { applyEffect, resolvePendingEffects } from '../effects/effect-engine';

function matchesQuestEvent(
  event: GameEvent,
  quest: Pick<ChampionQuest, 'trackedEvent' | 'cardType' | 'sourceActionType'>,
  playerId: string,
  championId: string,
): boolean {
  if (event.playerId !== playerId) return false;
  // The analyzer keeps the human-facing WRESTLER_RETIRED condition for
  // compatibility; the event stream uses the canonical CARD_RETIRED event.
  const eventMatches = quest.trackedEvent === 'WRESTLER_RETIRED'
    ? event.type === 'CARD_RETIRED'
    : event.type === quest.trackedEvent;
  if (!eventMatches || (quest.cardType && event.cardType !== quest.cardType)) return false;
  if (quest.sourceActionType) {
    return event.sourceContext?.sourceActionType === quest.sourceActionType &&
      event.sourceContext.sourcePlayerId === playerId &&
      (!quest.sourceActionType.startsWith('USE_CHAMPION_ABILITY') ||
        event.sourceContext.sourceChampionDefinitionId === championId);
  }
  return true;
}

export function processChampionQuestEvents(
  previousState: GameState,
  nextState: GameState,
): GameState {
  const newEvents = nextState.events.slice(previousState.events.length);
  let resolvedState = nextState;

  for (const originalPlayer of nextState.players) {
    const champion = originalPlayer.champion;
    const quest = champion?.quest;
    if (!champion || !quest || champion.questCompleted) continue;

    const progress = newEvents.filter(
      (event) =>
        matchesQuestEvent(event, quest, originalPlayer.id, champion.id),
    ).length;
    if (progress === 0) continue;

    const progressAmount = progress * (quest.progressPerEvent ?? 1);
    const questProgress = Math.min(
      champion.questProgress + progressAmount,
      quest.requiredProgress,
    );
    const questCompleted = questProgress >= quest.requiredProgress;
    const rewardGold =
      questCompleted && quest.reward.type === 'GAIN_GOLD'
        ? quest.reward.amount
        : 0;
    const questEvents: GameEvent[] = [
      {
        type: 'CHAMPION_QUEST_PROGRESS',
        playerId: originalPlayer.id,
        championId: champion.id,
        source: { type: 'SYSTEM' },
        target: { type: 'CHAMPION', championId: champion.id },
        reason: quest.id,
        amount: progressAmount,
      },
    ];
    if (questCompleted) {
      questEvents.push({
        type: 'CHAMPION_QUEST_COMPLETED',
        playerId: originalPlayer.id,
        championId: champion.id,
        source: { type: 'SYSTEM' },
        target: { type: 'CHAMPION', championId: champion.id },
        reason: quest.reward.type,
      });
      if (rewardGold > 0) {
        questEvents.push({
          type: 'GOLD_CHANGED',
          playerId: originalPlayer.id,
          championId: champion.id,
          source: { type: 'CHAMPION', championId: champion.id },
          target: { type: 'PLAYER', playerId: originalPlayer.id },
          reason: 'CHAMPION_QUEST_REWARD',
          amount: rewardGold,
        });
      }
    }

    resolvedState = {
      ...resolvedState,
      players: resolvedState.players.map((player) =>
        player.id === originalPlayer.id && player.champion
          ? {
              ...player,
              currentGold: player.currentGold + rewardGold,
              champion: {
                ...player.champion,
                questProgress,
                questCompleted,
              },
            }
          : player,
      ),
      events: [...resolvedState.events, ...questEvents],
      latestQuestCompletedChampionId: questCompleted
        ? champion.id
        : resolvedState.latestQuestCompletedChampionId,
    };
    if (questCompleted && quest.reward.type === 'DIRECT_DEPLOY_CHAMPION_TOKEN') {
      resolvedState = tryDirectDeployChampionToken(
        resolvedState,
        originalPlayer.id,
        champion.id,
        quest.reward.cardDefinitionId,
        'CHAMPION_QUEST_REWARD',
      );
    }
    const rewardEffects =
      questCompleted && quest.reward.type === 'UPGRADE_ABILITY'
        ? quest.reward.effects ?? []
        : questCompleted && quest.reward.type === 'STRUCTURED'
          ? quest.reward.effects
          : [];
    if (rewardEffects.length) {
      const sourceCard: CardInstance = {
        instanceId: `champion-${champion.id}-quest-reward`,
        definitionId: `champion-${champion.id}`,
        cardType: 'WRESTLER',
        currentCost: 0,
        baseCost: 0,
        baseAttack: 0,
        baseHealth: 1,
        currentAttack: 0,
        currentHealth: 1,
        maxHealth: 1,
        boardSlot: null,
        enteredThisTurn: false,
        attacksUsedThisTurn: 0,
        isGenerated: true,
        isToken: false,
        isChampionToken: false,
        keywords: [],
        abilities: [],
        isSilenced: false,
        isSilenceImmune: false,
        dodgeAvailable: false,
        dodgeCharges: 0,
        isStunned: false,
        activeUsedThisTurn: false,
        isDirectDeployedChampion: false,
      };
      const scriptRewards = rewardEffects.filter(
        (effect): effect is Extract<typeof effect, { type: 'SCRIPT' }> => effect.type === 'SCRIPT',
      );
      resolvedState = scriptRewards.reduce(
        (nextState, effect) => applyEffect(nextState, originalPlayer.id, sourceCard, effect),
        resolvedState,
      );
      const structuredRewards = rewardEffects.filter(
        (effect): effect is Extract<typeof effect, { type: 'STRUCTURED' }> => effect.type === 'STRUCTURED',
      );
      if (structuredRewards.length) resolvedState = resolvePendingEffects({
        ...resolvedState,
        targetingState: {
          active: true,
          playerId: originalPlayer.id,
          sourceInstanceId: sourceCard.instanceId,
          sourceCard,
          effects: structuredRewards,
          effectIndex: 0,
          selectedTargetIds: [],
          lastTargetIds: [],
          validTargetIds: [],
          minTargets: 0,
          maxTargets: 0,
          mandatory: true,
          cancelable: false,
        },
      });
    }
  }

  return resolvedState;
}