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
  // The analyzer keeps the human-facing WRESTLER_RETIRED condition for
  // compatibility; the event stream uses the canonical CARD_RETIRED event.
  const eventMatches = quest.trackedEvent === 'WRESTLER_RETIRED'
    ? event.type === 'CARD_RETIRED'
    : event.type === quest.trackedEvent;
  if (!eventMatches || (quest.cardType && event.cardType !== quest.cardType)) return false;
  if (quest.sourceActionType) {
    const sourceMatches = event.sourceContext?.sourceActionType === quest.sourceActionType &&
      event.sourceContext.sourcePlayerId === playerId &&
      (!quest.sourceActionType.startsWith('USE_CHAMPION_ABILITY') ||
        event.sourceContext.sourceChampionDefinitionId === championId);
    // A source-attributed Champion ability can retire either player's
    // wrestler. The retired card's owner remains the event playerId, but the
    // quest belongs to the Champion that caused the retirement.
    return sourceMatches;
  }
  return event.playerId === playerId;
}

function stableQuestEventIdentity(event: GameEvent): string | null {
  const rootSourceEventId = event.sourceContext?.rootSourceEventId;
  const causationId = event.sourceContext?.causationId;
  const targetCardInstanceId =
    event.cardInstanceId ??
    (event.target?.type === 'CARD' ? event.target.cardInstanceId : undefined) ??
    event.targetSnapshot?.cardInstanceId;
  if ((!rootSourceEventId && !causationId) || !targetCardInstanceId) return null;
  return JSON.stringify([
    rootSourceEventId ?? null,
    causationId ?? null,
    event.type,
    targetCardInstanceId,
  ]);
}

export function processChampionQuestEvents(
  previousState: GameState,
  nextState: GameState,
): GameState {
  const inputEventEnd = nextState.events.length;
  let resolvedState = nextState;

  for (const originalPlayer of nextState.players) {
    const previousCursor =
      previousState.championQuestEventCursorByPlayer?.[originalPlayer.id] ?? 0;
    const nextCursor =
      nextState.championQuestEventCursorByPlayer?.[originalPlayer.id] ?? 0;
    const eventCursor = Math.max(
      previousState.events.length,
      previousCursor,
      nextCursor,
    );
    const newEvents = nextState.events.slice(
      Math.min(eventCursor, inputEventEnd),
      inputEventEnd,
    );
    const processedIdentities = new Set([
      ...(previousState.championQuestProcessedEventIdentitiesByPlayer?.[originalPlayer.id] ?? []),
      ...(nextState.championQuestProcessedEventIdentitiesByPlayer?.[originalPlayer.id] ?? []),
    ]);
    const champion = originalPlayer.champion;
    const quest = champion?.quest;
    const progressEvents = champion && quest && !champion.questCompleted
      ? newEvents.filter((event) => {
          if (!matchesQuestEvent(event, quest, originalPlayer.id, champion.id)) return false;
          const identity = stableQuestEventIdentity(event);
          if (!identity) return true;
          if (processedIdentities.has(identity)) return false;
          processedIdentities.add(identity);
          return true;
        })
      : [];
    const cursorByPlayer = {
      ...(resolvedState.championQuestEventCursorByPlayer ?? {}),
      [originalPlayer.id]: Math.max(eventCursor, inputEventEnd),
    };
    const processedIdentitiesByPlayer = {
      ...(resolvedState.championQuestProcessedEventIdentitiesByPlayer ?? {}),
      ...(progressEvents.length
        ? { [originalPlayer.id]: [...processedIdentities] }
        : {}),
    };
    resolvedState = {
      ...resolvedState,
      championQuestEventCursorByPlayer: cursorByPlayer,
      championQuestProcessedEventIdentitiesByPlayer: processedIdentitiesByPlayer,
    };

    if (!champion || !quest || champion.questCompleted || progressEvents.length === 0) continue;

    const progressAmount = progressEvents.length * (quest.progressPerEvent ?? 1);
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