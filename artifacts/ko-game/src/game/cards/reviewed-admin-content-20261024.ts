import type {CardAbility} from '../effects/types';
import type {PublishedCardRecord} from './published-cards';

/** Exact administrator balance revision; older/future authored text is preserved. */
export function reviewedOctober24Abilities(card: PublishedCardRecord): CardAbility[] | null {
 if(card.id !== 'ba3107e0-99ad-45af-a651-12c44926c261' || card.effectId ||
    card.text.replace(/\s+/gu,'') !== '퇴장:아군 선수 카드와 아군 챔피언의 체력을 2 증가시킵니다.'.replace(/\s+/gu,'')) return null;
 return [{trigger:'LEAVE_FIELD',effects:[
  {type:'STRUCTURED',action:'BUFF',target:{zone:'BOARD',owner:'SELF',cardType:'WRESTLER',selection:'ALL',count:4},values:{attack:0,health:2}},
  {type:'STRUCTURED',action:'BUFF',target:{zone:'PLAYER',owner:'SELF',selection:'SELF',count:1},values:{attack:0,health:2}},
 ]}];
}
