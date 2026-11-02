import { cardRecordToDefinition } from '../../game/cards/published-cards';
import { championRecordToDefinition } from '../../game/champions/published-champions';
import { tutorialCatalog, LESSONS, lessonUnavailable } from './lesson-engine';
type CatalogData={cards:Parameters<typeof cardRecordToDefinition>[0][];champions:Parameters<typeof championRecordToDefinition>[0][]};
function convert(data:CatalogData){if(!Array.isArray(data.cards)||!Array.isArray(data.champions))throw Error('연습 데이터 형식을 확인하지 못했어요.');return tutorialCatalog(data.cards.filter(c=>c.status==='PUBLISHED').map(cardRecordToDefinition),data.champions.filter(c=>c.status==='PUBLISHED').map(championRecordToDefinition));}
/** The pinned catalog contains existing published cards, isolated from account inventory and live rules. */
export async function fetchTutorialCatalog(signal:AbortSignal){
 const root=import.meta.env.BASE_URL.replace(/\/$/,'');
 try{
  const liveSignal=AbortSignal.any([signal,AbortSignal.timeout(3500)]);
  const [a,b]=await Promise.all([fetch(root+'/api/cards',{signal:liveSignal}),fetch(root+'/api/champions',{signal:liveSignal})]);
  if(!a.ok||!b.ok)throw Error('catalog');const [cards,champions]=await Promise.all([a.json(),b.json()]);const catalog=convert({cards:cards.cards,champions:champions.champions});
  if(LESSONS.every(l=>!lessonUnavailable(catalog,l.id)))return {...catalog,practiceSource:'LIVE' as const};
 }catch(error){if(signal.aborted)throw error;}
 const response=await fetch(root+'/tutorial-catalog.json',{signal});if(!response.ok)throw Error('검증된 연습 데이터를 불러오지 못했어요.');
 const catalog=convert(await response.json());if(LESSONS.some(l=>lessonUnavailable(catalog,l.id)))throw Error('연습 데이터 검증에 실패했어요.');
 return {...catalog,practiceSource:'PINNED' as const};
}
