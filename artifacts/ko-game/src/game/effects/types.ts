import type {
  Action, DamageSource, DynamicValue, EffectDuration, EffectScript, Keyword, Reference, StatName,
  StructuredTarget, StructuredQueuedEffect, StructuredAggregateStats, StructuredListener, CardDefinitionReference, StructuredEffectValues,
} from "@workspace/effect-registry";
import type { CardDefinition } from '../cards/types';

export type CardKeyword = Keyword;
export type RuntimeAction = Action | 'REMOVE_FROM_GAME' | 'CAPTURE' | 'RELEASE_CAPTURED';
export type RuntimeTrigger =
   | 'GAME_START' | 'ENTER_FIELD' | 'LEAVE_FIELD' | 'SELF_RETIRE' | 'POSITION' | 'ACTIVE'
   | 'CARD_DRAWN' | 'CARD_RETIRED' | 'CARD_SUMMONED' | 'CARD_ENTERED' | 'FIRST_ATTACKED' | 'SELF_ATTACK' | 'OTHER_ALLY_ATTACK' | 'ATTACK_SURVIVED' | 'SELF_DAMAGED' | 'STAT_CHANGED' | 'TECHNIQUE_CAST' | 'EXACT_ZERO_DAMAGE'
   | 'TURN_START' | 'TURN_END' | 'BEFORE_DAMAGE' | 'BEFORE_RETIRE';

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
       values?: Omit<StructuredEffectValues, "leftEffects" | "rightEffects"> & {
         /** Serializable card definition supplied by the runtime card pool. */
         definition?: CardDefinition;
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
      condition?: AbilityCondition;
    }
  | {
      trigger: 'LEAVE_FIELD';
      effects: CardEffect[];
      reasons?: Array<'RETIRE' | 'DESTROY' | 'REMOVE_FROM_GAME'>;
      condition?: AbilityCondition;
    }
  | {
       trigger: 'SELF_RETIRE';
       effects: CardEffect[];
       condition?: AbilityCondition;
     }
   | {
      trigger: 'POSITION';
      boardSlots: Array<0 | 1 | 2 | 3>;
      effects: CardEffect[];
      condition?: AbilityCondition;
    }
  | {
      trigger: 'ACTIVE';
      effects: CardEffect[];
      condition?: AbilityCondition;
    }
   | {
          trigger: 'GAME_START' | 'CARD_DRAWN' | 'CARD_RETIRED' | 'CARD_SUMMONED' | 'CARD_ENTERED' | 'FIRST_ATTACKED' | 'SELF_ATTACK' | 'OTHER_ALLY_ATTACK' | 'ATTACK_SURVIVED' | 'SELF_DAMAGED' | 'STAT_CHANGED' | 'TECHNIQUE_CAST' | 'EXACT_ZERO_DAMAGE' | 'TURN_START' | 'TURN_END' | 'BEFORE_DAMAGE' | 'BEFORE_RETIRE';
      effects: CardEffect[];
      condition?: AbilityCondition;
    }
  | {
      /** A reusable condition around any normal triggered ability. */
      trigger: 'ENTER_FIELD';
      effects: CardEffect[];
      condition?: AbilityCondition;
    };

export type AbilityCondition =
  | { type: 'BASE_COST_GTE'; amount: number }
  | { type: 'SOURCE_ON_LEFT_SIDE' }
  | { type: 'SOURCE_ON_RIGHT_SIDE' }
  | { type: 'HAND_COUNT'; compare: 'GTE' | 'LTE' | 'EQ'; amount: number }
  | { type: 'BOARD_COUNT'; compare: 'GTE' | 'LTE' | 'EQ'; amount: number }
  | { type: 'HAS_TAG'; tag: string }
  | { type: 'FIRST_ATTACK_GAIN' };