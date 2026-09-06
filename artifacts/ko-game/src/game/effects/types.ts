export type CardKeyword =
  | 'RUSH'
  | 'SURPRISE'
  | 'TAUNT'
  | 'DODGE'
  | 'MULTI_STRIKE';

export type CardEffect =
  | {
      type: 'GAIN_GOLD';
      amount: number;
    }
  | {
      type: 'MODIFY_SELF_ATTACK';
      amount: number;
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