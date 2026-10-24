import type {PublishedChampionRecord} from './published-champions';

/** Approved goal changes whose stored prose still contained the old number. */
const questWording:Record<string,{required:number;before:string;after:string}>={
 '5e4a5a52-ef2c-4e1a-9b76-a4edc9f79e2c':{required:15,before:'이번 게임에서 아군 선수가 총 10회 리타이어하세요. DESTROY는 포함하지 않습니다.',after:'이번 게임에서 아군 선수가 총 15회 리타이어하세요. DESTROY는 포함하지 않습니다.'},
 '3cbb09c4-f8ac-4668-9378-5c01bfa9474b':{required:10,before:'선수 카드를 8번 생성한다.(손패,덱,필드)',after:'선수 카드를 10번 생성한다.(손패,덱,필드)'},
 'bcffab96-f61f-497e-b60b-de5a869837d3':{required:5,before:'자신의 고유 능력으로 선수 카드를 7번 리타이어 시킵니다.',after:'자신의 고유 능력으로 선수 카드를 5번 리타이어 시킵니다.'},
 '0db142af-750e-4929-a464-5daf1bc75452':{required:10,before:'이번 게임에서 내 카드 또는 챔피언 효과로 내 챔피언 또는 아군 선수가 피해를 총 8회 받으세요. 상대 효과와 전투 피해는 제외합니다.',after:'이번 게임에서 내 카드 또는 챔피언 효과로 내 챔피언 또는 아군 선수가 피해를 총 10회 받으세요. 상대 효과와 전투 피해는 제외합니다.'},
};
export function reviewedOctober24Champion(record:PublishedChampionRecord):PublishedChampionRecord{
 const wording=questWording[record.id];
 return wording && record.questProgressRequired===wording.required && record.questCondition?.required===wording.required && record.questText===wording.before
  ? {...record,questText:wording.after}:record;
}
