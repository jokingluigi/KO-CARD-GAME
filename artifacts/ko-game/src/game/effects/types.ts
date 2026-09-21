import type {
  Action, DamageSource, DynamicValue, EffectDuration, Keyword, RandomScope, Reference, StatName, TargetOwner, TargetSelection, TargetZone,
} from "@workspace/effect-registry";
import type { CardDefinition } from '../cards/types';
import type { CardTagFilter } from '../cards/tags';

export type CardKeyword = Keyword;
export type RuntimeAction = Action | 'REMOVE_FROM_GAME' | 'CAPTURE' | 'RELEASE_CAPTURED';
export type RuntimeTrigger =
   | 'ENTER_FIELD' | 'LEAVE_FIELD' | 'POSITION' | 'ACTIVE'
   | 'CARD_DRAWN' | 'CARD_RETIRED' | 'CARD_SUMMONED' | 'FIRST_ATTACKED' | 'SELF_ATTACK' | 'OTHER_ALLY_ATTACK' | 'ATTACK_SURVIVED' | 'STAT_CHANGED' | 'TECHNIQUE_CAST' | 'EXACT_ZERO_DAMAGE'
  | 'TURN_START' | 'TURN_END';

export type StructuredTarget = {
  /** Legacy single-zone shape retained for stored effects. */
  zone?: TargetZone;
  /** Multi-zone card scope, e.g. HAND + DECK + BOARD. */
  zones?: TargetZone[];
  owner: TargetOwner;
  cardType?: 'WRESTLER' | 'TECHNIQUE';
  filter?: CardTagFilter & { isGenerated?: boolean; minCost?: number; maxCost?: number; isToken?: boolean; isChampionToken?: boolean; excludeSource?: boolean };
  selection: TargetSelection;
  count: number;
  randomScope?: RandomScope;
  minTargets?: number;
  maxTargets?: number;
  optionalTarget?: boolean;
};

export type QueuedStructuredEffect = {
  action: RuntimeAction;
  target?: StructuredTarget;
  values?: {
    attack?: number;
    health?: number;
    attackMultiplier?: number;
    healthMultiplier?: number;
    amount?: number;
    stat?: StatName;
    duration?: EffectDuration;
    keyword?: CardKeyword;
    damageSource?: DamageSource;
    reference?: Reference;
    referenceStat?: 'CURRENT_ATTACK' | 'CURRENT_HEALTH';
    amountReference?: DynamicValue;
    minimum?: number;
    generatedModifiers?: { cost?: number; attack?: number; health?: number; copySourceStats?: boolean; copyTargetStats?: boolean };
    deckPosition?: 'TOP' | 'BOTTOM';
  };
};

export type AggregatedStatsResolver = {
  source: 'LAST_DESTROYED_TARGETS';
  attack: 'CURRENT_ATTACK_SUM';
  health: 'CURRENT_HEALTH_SUM';
};

export type CardDefinitionReference = {
  id?: string;
  name?: string;
};

export type CardEffect =
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
      values?: {
           attack?: number; health?: number; attackMultiplier?: number; healthMultiplier?: number; amount?: number; stat?: StatName; duration?: EffectDuration; keyword?: CardKeyword; damageSource?: DamageSource; reference?: Reference; referenceStat?: 'CURRENT_ATTACK' | 'CURRENT_HEALTH'; amountReference?: DynamicValue; minimum?: number; temporaryCost?: boolean; conditionalBuff?: { healthEquals: number; attack: number; health: number }; generatedModifiers?: { cost?: number; attack?: number; health?: number; copySourceStats?: boolean; copyTargetStats?: boolean }; deckPosition?: 'TOP' | 'BOTTOM';
          queuedTrigger?: 'NEXT_ALLY_WRESTLER_PLAYED';
         queuedEffect?: QueuedStructuredEffect;
        /** Serializable card definition supplied by the structured DSL. */
        definition?: CardDefinition;
         /** Optional data reference resolved from the runtime card pool. */
         definitionRef?: CardDefinitionReference;
          count?: number;
          destination?: 'HAND' | 'DECK' | 'DECK_TOP';
         aggregateStats?: AggregatedStatsResolver;
        leftEffects?: CardEffect[];
        rightEffects?: CardEffect[];
      };
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
      trigger: 'CARD_DRAWN' | 'CARD_RETIRED' | 'CARD_SUMMONED' | 'FIRST_ATTACKED' | 'SELF_ATTACK' | 'OTHER_ALLY_ATTACK' | 'ATTACK_SURVIVED' | 'STAT_CHANGED' | 'TECHNIQUE_CAST' | 'EXACT_ZERO_DAMAGE' | 'TURN_START' | 'TURN_END';
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