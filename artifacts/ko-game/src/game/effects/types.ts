import type {
  Action, DamageSource, Keyword, RandomScope, Reference, TargetOwner, TargetSelection, TargetZone,
} from "@workspace/effect-registry";
import type { CardDefinition } from '../cards/types';

export type CardKeyword = Keyword;
export type RuntimeAction = Action | 'REMOVE_FROM_GAME' | 'CAPTURE' | 'RELEASE_CAPTURED';
export type RuntimeTrigger =
  | 'ENTER_FIELD' | 'LEAVE_FIELD' | 'POSITION' | 'ACTIVE'
  | 'CARD_DRAWN' | 'SELF_ATTACK' | 'OTHER_ALLY_ATTACK' | 'TECHNIQUE_CAST' | 'EXACT_ZERO_DAMAGE'
  | 'TURN_START' | 'TURN_END';

export type StructuredTarget = {
  /** Legacy single-zone shape retained for stored effects. */
  zone?: TargetZone;
  /** Multi-zone card scope, e.g. HAND + DECK + BOARD. */
  zones?: TargetZone[];
  owner: TargetOwner;
  cardType?: 'WRESTLER' | 'TECHNIQUE';
  filter?: { isGenerated?: boolean; minCost?: number };
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
    keyword?: CardKeyword;
    damageSource?: DamageSource;
    reference?: Reference;
    referenceStat?: 'CURRENT_ATTACK' | 'CURRENT_HEALTH';
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
          attack?: number; health?: number; attackMultiplier?: number; healthMultiplier?: number; amount?: number; keyword?: CardKeyword; damageSource?: DamageSource; reference?: Reference; referenceStat?: 'CURRENT_ATTACK' | 'CURRENT_HEALTH';
         queuedTrigger?: 'NEXT_ALLY_WRESTLER_PLAYED';
         queuedEffect?: QueuedStructuredEffect;
        /** Serializable card definition supplied by the structured DSL. */
        definition?: CardDefinition;
         /** Optional data reference resolved from the runtime card pool. */
         definitionRef?: CardDefinitionReference;
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
      trigger: 'CARD_DRAWN' | 'SELF_ATTACK' | 'OTHER_ALLY_ATTACK' | 'TECHNIQUE_CAST' | 'EXACT_ZERO_DAMAGE' | 'TURN_START' | 'TURN_END';
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
  | { type: 'HAS_MATCHING_TAG_PLAYED_THIS_TURN' }
  | { type: 'BASE_COST_GTE'; amount: number }
  | { type: 'SOURCE_ON_LEFT_SIDE' }
  | { type: 'SOURCE_ON_RIGHT_SIDE' }
  | { type: 'HAND_COUNT'; compare: 'GTE' | 'LTE' | 'EQ'; amount: number }
  | { type: 'BOARD_COUNT'; compare: 'GTE' | 'LTE' | 'EQ'; amount: number }
  | { type: 'HAS_TAG'; tag: string };