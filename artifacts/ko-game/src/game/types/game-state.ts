import type { CardInstance } from '../cards/types';
import type { CardDefinition } from '../cards/types';
import type { ChampionState } from '../champions/types';
import type { EntryCause, EventAttribution, GameEvent } from '../events/types';
import type { CardEffect, QueuedStructuredEffect } from '../effects/types';
import type { EffectScript, ScriptStep } from '@workspace/effect-registry';

export type Board = [
  CardInstance | null,
  CardInstance | null,
  CardInstance | null,
  CardInstance | null,
];

export interface PendingCardEffect {
  playerId: string;
  sourceInstanceId: string;
  trigger: 'NEXT_ALLY_WRESTLER_PLAYED' | 'NEXT_TECHNIQUE_PLAYED';
  effect: QueuedStructuredEffect;
  /** Event index at registration; the registering play must not consume itself. */
  registeredEventIndex?: number;
}

export interface PendingDelayedEffect {
  id: string;
  playerId: string;
  sourceInstanceId: string;
  /** Serializable source snapshot keeps delayed effects executable after the source leaves play. */
  sourceCard?: CardInstance;
  schedule: 'OWNER_NEXT_TURN_START' | 'OPPONENT_NEXT_TURN_START' | 'END_OF_CURRENT_TURN' | 'NEXT_MATCHING_EVENT' | 'N_MATCHING_EVENTS';
  dueTurn: number;
  remainingMatches?: number;
  eventTrigger?: 'CARD_PLAYED' | 'TECHNIQUE_PLAYED' | 'CARD_RETIRED' | 'DAMAGE_TAKEN';
  effect: QueuedStructuredEffect;
  followUpEffects?: QueuedStructuredEffect[];
}

export interface PendingRuleListener {
  id: string;
  playerId: string;
  sourceInstanceId: string;
  trigger: 'CARD_PLAYED' | 'TECHNIQUE_PLAYED' | 'CARD_RETIRED' | 'DAMAGE_TAKEN';
  owner?: 'SELF' | 'ENEMY';
  cardType?: 'WRESTLER' | 'TECHNIQUE';
  uses?: number;
  registeredEventIndex: number;
  effect: QueuedStructuredEffect;
}

export interface PlayerState {
  id: string;
  health: number;
  maxHealth: number;
  currentGold: number;
  personalTurn: number;
  nextTurnGoldBonus: number;
  deck: CardInstance[];
  hand: CardInstance[];
  board: Board;
  graveyard: CardInstance[];
  removedFromGame: CardInstance[];
  fatigueCount: number;
  /** Champion abilities can be used once during each player's turn. */
  championAbilityUsedThisTurn?: boolean;
  champion: ChampionState | null;
}

export interface GameState {
  gameId: string;
  /** Seed used by deterministic random effect resolution. */
  randomSeed?: number;
  /** Published definitions available to random generation effects. */
  cardPool?: CardDefinition[];
  backgroundId: string | null;
  bgmId: string | null;
  /** The most recent completed champion controls the persistent quest music base. */
  latestQuestCompletedChampionId: string | null;
  turn: number;
  activePlayerId: string | null;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'FINISHED';
  winnerId: string | null;
  loserId: string | null;
  players: PlayerState[];
  events: GameEvent[];
  pendingCardEffects: PendingCardEffect[];
  pendingDelayedEffects: PendingDelayedEffect[];
  pendingRuleListeners: PendingRuleListener[];
  /** Ephemeral, serializable interception markers consumed by the current resolution. */
  preventedDamageTargetIds?: string[];
  preventedRetireTargetIds?: string[];
  consumedRuleKeys?: string[];
  /** Effect resolution is deliberately part of game state, not UI state. */
  targetingState?: {
    active: true;
    playerId: string;
    sourceInstanceId: string;
    /** Snapshot permits champion abilities (which have no board card source). */
    sourceCard?: CardInstance;
    effects: CardEffect[];
    effectIndex: number;
    selectedTargetIds: string[];
    lastTargetIds: string[];
     /** Values produced by a previous structured effect in this resolution frame. */
     lastAggregatedStats?: {
       attack: number;
       health: number;
     };
    /** Prevents one multi-step resolution from retriggering a STAT_CHANGED listener per stat. */
    statChangedCardIds?: string[];
    validTargetIds: string[];
    minTargets: number;
    maxTargets: number;
    mandatory: boolean;
    cancelable: boolean;
    markActiveUsed?: boolean;
    /** Trigger context is carried in state so chained resolutions remain deterministic. */
    triggerContext?: {
      playedFromHand?: boolean;
      baseCost?: number;
      attackerInstanceId?: string;
      damagedTargetInstanceId?: string;
      attackDelta?: number;
      healthDelta?: number;
      healthBefore?: number;
      healthAfter?: number;
      sourceContext?: EventAttribution;
      entryCause?: EntryCause;
    };
    /** Parent resolution frame. A child trigger always resolves before this. */
    continuation?: GameState['targetingState'];
    /** Serializable SCRIPT_V1 program counter and registers while PLAYER_CHOICE is pending. */
    scriptContinuation?: {
      selectedResultId: string;
      remainingSteps: ScriptStep[];
      registers: Record<string, { ids: string[] } | { slots: number[] } | { value: number }>;
      script: EffectScript;
    };
  };
  /** Resolution-local snapshot used by chained retirement/stat effects. */
  lastAggregatedStats?: { attack: number; health: number };
}