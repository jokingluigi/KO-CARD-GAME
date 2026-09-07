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
      type: 'DAMAGE_OPPONENT_CHAMPION';
      amount: number;
    }
  | {
      type: 'MODIFY_SELF_ATTACK';
      amount: number;
    }
  | {
      type: 'STRUCTURED';
      action: 'BUFF' | 'DAMAGE' | 'HEAL' | 'SILENCE' | 'DESTROY' | 'ADD_GOLD' | 'ADD_NEXT_TURN_GOLD' | 'DRAW' | 'REDUCE_COST' | 'INCREASE_COST' | 'STUN' | 'ADD_KEYWORD' | 'REMOVE_KEYWORD';
      target?: {
        zone: 'BOARD' | 'HAND' | 'PLAYER' | 'CHARACTER';
        owner: 'SELF' | 'ENEMY' | 'ALL';
        cardType?: 'WRESTLER';
        selection: 'SELF' | 'PLAYER_CHOICE' | 'RANDOM' | 'SAME_TARGET' | 'ALL';
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