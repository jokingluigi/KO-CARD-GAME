import type {CardAbility} from '../effects/types';
import type {PublishedCardRecord} from './published-cards';
const briganda='등장:자신의 필드에 있는 수배 키워드가 있는 선수 카드만큼 다음 턴에 추가 골드를 얻습니다.\n이 카드가 필드에 있는 동안 상대방이 언제든 기본 골드를 제외한 추가 골드를 얻을때마다 그걸 무효화하고 다음 턴에 자신이 그만큼 추가 골드를 얻습니다.\n턴 종료:다음턴에 얻는 추가 1 골드 당 이 카드에게 +1/+1을 부여합니다.';
export function reviewedOctober21Abilities(card:PublishedCardRecord):CardAbility[]|null {
 const same=(text:string)=>card.text.replace(/\s+/gu,'')===text.replace(/\s+/gu,'');
 if(card.id==='3d11ff5a-f21c-4e89-9c68-fc7bb8f2a6b9'&&same(briganda))return [
  {trigger:'ENTER_FIELD',effects:[{type:'STRUCTURED',action:'ADD_NEXT_TURN_GOLD',values:{amountReference:'BOARD_WANTED_COUNT'}}]},
  {trigger:'SELF_ENTERED',effects:[],stealOpponentBonusGold:true},
  {trigger:'TURN_END',effects:[{type:'STRUCTURED',action:'BUFF',target:{zone:'BOARD',owner:'SELF',selection:'SELF',count:1},values:{buffFromReservedGold:true}}]},
 ];
 if(card.id==='a2ab5577-0072-4425-a117-fd6f7df05d00'&&same('턴 종료:다음 턴에 자신과 상대 둘 다 골드를 추가로 1 더 받습니다.'))return [
  {trigger:'TURN_END',effects:[{type:'STRUCTURED',action:'ADD_NEXT_TURN_GOLD',target:{zone:'PLAYER',owner:'ALL',selection:'ALL',count:2},values:{amount:1}}]},
 ];
 return null;
}
