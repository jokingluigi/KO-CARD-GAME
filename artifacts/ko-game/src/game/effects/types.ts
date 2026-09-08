import type {
  Action, Keyword, TargetOwner, TargetSelection, TargetZone,
} from "@workspace/effect-registry";

export type CardKeyword = Keyword;

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
      action: Action;
      target?: {
        zone: TargetZone;
        owner: TargetOwner;
        cardType?: 'WRESTLER';
        selection: TargetSelection;
        count: number;
        minTargets?: number;
        maxTargets?: number;
        optionalTarget?: boolean;
      };
      values?: { attack?: number; health?: number; amount?: number; keyword?: CardKeyword };
    };

export type CardAbility =
  | {
      trigger: 'ENTER_FIELD';
      effects: CardEffect[];
    }
  | {
      trigger: 'LEAVE_FIELD';
      effects: CardEffect[];
      reasons?: Array<'RETIRE' | 'DESTROY' | 'REMOVE_FROM_GAME'>;
    }
  | {
      trigger: 'POSITION';
      boardSlots: Array<0 | 1 | 2 | 3>;
      effects: CardEffect[];
    }
  | {
      trigger: 'ACTIVE';
      effects: CardEffect[];
    };