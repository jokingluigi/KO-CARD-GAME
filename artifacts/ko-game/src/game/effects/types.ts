import type {
  Action, DamageSource, DynamicValue, EffectDuration, EffectScript, Keyword, Reference, StatName,
  StructuredTarget, StructuredQueuedEffect, StructuredAggregateStats, StructuredListener, CardDefinitionReference, StructuredEffectValues,
} from "@workspace/effect-registry";
import type { CardDefinition } from '../cards/types';

export type CardKeyword = Keyword;
export type RuntimeAction = Action | 'REMOVE_FROM_GAME' | 'CAPTURE' | 'RELEASE_CAPTURED' | 'REVEAL_CARD';
export type RuntimeTrigger =
   | 'GAME_START' | 'AFTER_MULLIGAN' | 'ENTER_FIELD' | 'LEAVE_FIELD' | 'SELF_RETIRE' | 'POSITION' | 'ACTIVE'
   | 'CARD_DRAWN' | 'HAND_WRESTLER_ADDED' | 'CARD_RETIRED' | 'CARD_SUMMONED' | 'CARD_ENTERED' | 'FIRST_ATTACKED' | 'SELF_ATTACK' | 'OTHER_ALLY_ATTACK' | 'ATTACK_SURVIVED' | 'SELF_DAMAGED' | 'STAT_CHANGED' | 'TECHNIQUE_CAST' | 'EXACT_ZERO_DAMAGE'
   | 'CARD_DESTROYED' | 'SOURCE_RETIRED_TARGET' | 'ANY_BEFORE_RETIRE' | 'BEFORE_ATTACK' | 'SELF_ENTERED' | 'SELF_RETURNED_TO_HAND' | 'ON_FUSION' | 'COUNTDOWN' | 'TURN_START' | 'TURN_END' | 'BEFORE_DAMAGE' | 'BEFORE_RETIRE';

export type { StructuredTarget, StructuredQueuedEffect, StructuredListener, CardDefinitionReference };
export type QueuedStructuredEffect = StructuredQueuedEffect;
export type AggregatedStatsResolver = StructuredAggregateStats;

export type CardEffect =
  | {
      type: 'SCRIPT';
      script: EffectScript;
    }
  | {
      type: 'GAIN_GOLD';
      amount: number;
    }
  | {
      type: 'DAMAGE_OPPONENT_CHAMPION';
      amount: number;
    }
  | {
      type: 'MODIFY_SELF_ATTACK';
      amount: number;
    }
  | {
      type: 'STRUCTURED';
      action: RuntimeAction;
      target?: StructuredTarget;
       values?: Omit<StructuredEffectValues, "leftEffects" | "rightEffects" | "definition" | "listener"> & {
         /** Serializable card definition supplied by the runtime card pool. */
         definition?: CardDefinition;
         purpleRainFollowup?: boolean;
         drainAttackFraction?: number;
         drainAttackAmount?: number;
         /** Explicit adjacent source copy; rounded up, never a catalog roll. */
         adjacentCopyFraction?: number;
         armorGain?: number;
         generatedKeywords?: CardKeyword[];
         buffFromReservedGold?: boolean;
         healToFull?: boolean;
         replacementLowerCostSummon?: boolean;
         summonBoardSlot?: number;
         additionalWrestlerAttack?: number;
         drawSourceFromDeck?: boolean;
         healthUntilOwnerTurnStart?: boolean;
         targetDefinitionIds?: string[];
         destroyOnLethal?: boolean;
         listener?: StructuredEffectValues["listener"] & {requiresActiveSource?: boolean; damageTarget?: 'PLAYER' | 'CARD'};
         targetAttackBelowSource?: boolean;
         /** Check the physical deck top before applying type filters. */
         topCardOnly?: boolean;
         preserveStats?: boolean;
         destinationOwner?: 'SELF' | 'ENEMY';
         /** Internal continuation of an already validated automatic area target. */
         resolvedAutomaticTarget?: boolean;
         leftEffects?: CardEffect[];
         rightEffects?: CardEffect[];
       };
       leftEffects?: CardEffect[];
       rightEffects?: CardEffect[];
     };

export type CardAbility =
  | {
      trigger: 'ENTER_FIELD';
      effects: CardEffect[];
      oncePerTurn?: boolean;
      condition?: AbilityCondition;
    }
  | {
      trigger: 'LEAVE_FIELD';
      effects: CardEffect[];
      oncePerTurn?: boolean;
      reasons?: Array<'RETIRE' | 'DESTROY' | 'REMOVE_FROM_GAME'>;
      condition?: AbilityCondition;
    }
  | {
       trigger: 'SELF_RETIRE';
       effects: CardEffect[];
      oncePerTurn?: boolean;
       condition?: AbilityCondition;
     }
   | {
      trigger: 'POSITION';
      boardSlots: Array<0 | 1 | 2 | 3>;
      effects: CardEffect[];
      oncePerTurn?: boolean;
      condition?: AbilityCondition;
    }
  | {
      trigger: 'ACTIVE';
      effects: CardEffect[];
      oncePerTurn?: boolean;
      condition?: AbilityCondition;
    }
   | {
          trigger: 'GAME_START' | 'AFTER_MULLIGAN' | 'CARD_DRAWN' | 'HAND_WRESTLER_ADDED' | 'CARD_RETIRED' | 'CARD_SUMMONED' | 'CARD_ENTERED' | 'FIRST_ATTACKED' | 'SELF_ATTACK' | 'OTHER_ALLY_ATTACK' | 'ATTACK_SURVIVED' | 'SELF_DAMAGED' | 'STAT_CHANGED' | 'TECHNIQUE_CAST' | 'EXACT_ZERO_DAMAGE' | 'CARD_DESTROYED' | 'SOURCE_RETIRED_TARGET' | 'ANY_BEFORE_RETIRE' | 'BEFORE_ATTACK' | 'SELF_ENTERED' | 'SELF_RETURNED_TO_HAND' | 'ON_FUSION' | 'COUNTDOWN' | 'TURN_START' | 'TURN_END' | 'BEFORE_DAMAGE' | 'BEFORE_RETIRE';
          /** Explicit implementation scope; no text interpretation at dispatch. */
          sourceZones?: Array<'HAND' | 'BOARD'>;
          eventOwner?: 'SELF' | 'ENEMY';
          incomingDamageLimitPerTurn?: number;
          retirementReplacementScope?: 'SOURCE_CAUSED_ENEMY';
          forbiddenKeywords?: CardKeyword[];
          cannotAttackChampionWhileEnemyBoardOccupied?: boolean;
          persistentFieldGrants?: { armorTag?: string; regenNameContains?: string };
          interceptOpponentTurnBonusGold?: boolean;
          stealOpponentBonusGold?: boolean;
      effects: CardEffect[];
      oncePerTurn?: boolean;
      condition?: AbilityCondition;
    }
  | {
      /** A reusable condition around any normal triggered ability. */
      trigger: 'ENTER_FIELD';
      effects: CardEffect[];
      oncePerTurn?: boolean;
      condition?: AbilityCondition;
    };

export type AbilityCondition =
  | { type: 'BASE_COST_GTE'; amount: number }
  | { type: 'SOURCE_ON_LEFT_SIDE' }
  | { type: 'SOURCE_ON_RIGHT_SIDE' }
  | { type: 'HAND_COUNT'; compare: 'GTE' | 'LTE' | 'EQ'; amount: number }
  | { type: 'BOARD_COUNT'; compare: 'GTE' | 'LTE' | 'EQ'; amount: number }
  | { type: 'HAS_TAG'; tag: string }
  | { type: 'BOARD_HAS_TAG'; tag: string; present?: boolean }
  | { type: 'SOURCE_IN_HAND' }
  | { type: 'FIRST_ATTACK_GAIN' }
  | { type: 'ATTACK_GAIN' }
  | { type: 'HEALTH_GAIN' }
  | { type: 'ACTUAL_DAMAGE' }
  | { type: 'OWNER_TURN' }
  | { type: 'OPPONENT_TURN' }
  | { type: 'PREVIOUS_OWN_TURN_BOTH_HEALED' }
  | { type: 'SOURCE_ATTACKED_CHAMPION_THIS_TURN' }
  | { type: 'WRESTLER_DESTROYED_THIS_TURN' };
