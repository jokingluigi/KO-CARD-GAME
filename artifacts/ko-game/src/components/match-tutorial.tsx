import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';

export const MATCH_TUTORIAL_STEPS = [
 {title:'승리 조건',detail:'상대 챔피언의 체력을 0으로 만들면 승리합니다. 아래쪽이 내 필드, 위쪽이 상대 필드입니다.'},
 {title:'선수 카드 내기',detail:'손패에서 선수 카드를 고른 뒤 내 필드의 빈 구역을 누르거나, 카드를 빈 구역으로 드래그하세요. 비용만큼 골드를 사용합니다. 손패를 좌우로 밀면 다른 카드를 볼 수 있습니다.'},
 {title:'주문과 대상 선택',detail:'주문 카드를 고르고 ‘사용’을 누르거나 전장으로 드래그하세요. 대상 선택 중에는 선택 가능한 카드가 밝게 표시됩니다. 사용 확정 전 ‘선택 취소’는 골드와 카드를 소모하지 않습니다. 이미 효과가 진행된 뒤에는 취소할 수 없는 선택도 있습니다.'},
 {title:'공격과 카드 정보',detail:'내 선수를 고른 뒤 강조된 상대 선수나 챔피언을 누르세요. 상대에게 드래그해서 공격할 수도 있습니다. ⓘ 버튼으로 전체 설명을 보고, 설명의 밑줄 친 카드명·키워드를 눌러 자세히 확인하세요. PC에서는 ALT로 정보 모드를 전환할 수 있습니다.'},
 {title:'액티브는 총 1회',detail:'선수의 액티브는 필드에 있는 동안 총 1회만 사용합니다. 소환한 턴에는 사용할 수 없고, 다음 자기 턴부터 사용할 수 있습니다. 사용하면 ‘사용 완료’로 바뀌며 다음 턴이나 변신으로 다시 활성화되지 않습니다.'},
 {title:'턴과 횟수 제한',detail:'화면의 한 턴은 두 플레이어의 행동 턴을 묶어 표시합니다. ‘턴 종료’를 누르면 상대에게 행동권이 넘어갑니다. 좀비의 아군 리타이어 강화는 각 좀비마다 표시된 한 턴 전체에서 최대 2회입니다. 소환으로 받는 별도 버프와는 구분합니다.'},
 {title:'챔피언과 퀘스트',detail:'챔피언 고유능력의 비용과 퀘스트 조건을 확인하세요. 퀘스트는 실제로 확정된 전투 결과로 진행됩니다. 피해·회복·퇴장 결과가 궁금하면 전투 로그에서 확인할 수 있습니다.'},
 {title:'패드 조작',detail:'방향키 또는 스틱으로 이동, A/×로 선택, B/○로 취소, X/□로 카드 정보, START로 설정을 엽니다.'},
];
export function MatchTutorial({step,onStepChange,onClose}:{step:number;onStepChange:(step:number)=>void;onClose:()=>void}){
 const index=Math.max(0,Math.min(MATCH_TUTORIAL_STEPS.length-1,Number.isFinite(step)?Math.trunc(step):0));
 const current=MATCH_TUTORIAL_STEPS[index];
 return <Dialog open onOpenChange={open=>{if(!open)onClose();}}>
  <DialogContent aria-label="빠른 조작 안내" overlayClassName="!z-[220]" className="!z-[230] w-[calc(100vw-24px)] max-w-sm border-amber-700 bg-neutral-950 text-white">
   <p className="text-xs font-bold text-amber-300" role="status">KO CARD GAME · {index+1}/{MATCH_TUTORIAL_STEPS.length}</p>
   <DialogTitle>{current.title}</DialogTitle><DialogDescription className="min-h-20 text-sm leading-6 text-neutral-200">{current.detail}</DialogDescription>
   <nav aria-label="튜토리얼 단계" className="mt-3 flex gap-2">
    <button type="button" disabled={index===0} onClick={()=>onStepChange(index-1)} className="min-h-11 flex-1 rounded border border-neutral-600 px-3 py-2 text-sm disabled:opacity-40">이전</button>
    <button type="button" onClick={()=>index+1===MATCH_TUTORIAL_STEPS.length?onClose():onStepChange(index+1)} className="min-h-11 flex-1 rounded bg-amber-400 px-3 py-2 text-sm font-black text-black">{index+1===MATCH_TUTORIAL_STEPS.length?'완료':'다음'}</button>
   </nav>
  </DialogContent>
 </Dialog>;
}
