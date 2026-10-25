import {randomUUID} from 'node:crypto';
import {and,eq,isNull,sql} from 'drizzle-orm';
import {db,aiQuestMatchesTable,championsTable,usersTable} from '@workspace/db';
import {selectAIOpponentDeck} from '@workspace/game-engine';
import {listAIDecks} from './ai-deck-service';
import {completeAIMatchQuestProgress} from './ai-match-quest-service';
import {saveAIQuestStart} from './ai-quest-match-storage';
import {isTestAccountUser} from './test-account';

const active=sql`${aiQuestMatchesTable.usageStart}->'quickQueue'->>'active' = 'true'`;
const liveUsers=new Set<string>();
/** Only IDs here: never transfer full battle snapshots on lobby/presence updates. */
export async function activeQuickAI(userId:string) {
  const [row]=await db.select({id:aiQuestMatchesTable.id}).from(aiQuestMatchesTable)
    .where(and(eq(aiQuestMatchesTable.userId,userId),isNull(aiQuestMatchesTable.processedAt),active)).limit(1);
  if(row)liveUsers.add(userId);
  return row?.id??null;
}
export async function prepareQuickAI(userId:string,deckId:string) {
  const matchId='ai-'+randomUUID();
  const decks=(await listAIDecks({enabledOnly:true,context:'AI_DECK'})).filter(d=>d.champion?.status!=='DISABLED'&&d.cards.every(c=>c.status!=='DISABLED'));
  const ai=selectAIOpponentDeck(decks,matchId);
  if(!ai)throw new Error('사용 가능한 AI 상대가 없습니다.');
  const [user]=await db.select().from(usersTable).where(eq(usersTable.id,userId)).limit(1);
  if(!user)throw new Error('로그인이 필요합니다.');
  const identity={userId,deckId,aiDeckId:ai.id,matchId};
  const prepared=await completeAIMatchQuestProgress({...identity,isTestAccount:isTestAccountUser(user),outcome:'LOSS',actions:[],prepareOnly:true});
  const [champion]=await db.select().from(championsTable).where(eq(championsTable.id,prepared.state.players[0]!.champion!.id)).limit(1);
  const intro=(c:typeof champion|typeof ai.champion)=>({name:c?.name??'',imageUrl:c?.imageUrl??null,introLineOne:c?.introLineOne??null});
  await saveAIQuestStart(identity,prepared.state,prepared.difficulty,prepared.startingDeck,{active:true,opponentName:ai.name,selfChampion:intro(champion),opponentChampion:intro(ai.champion),intro:prepared.intro});
  liveUsers.add(userId);
  return matchId;
}
export async function readQuickAI(userId:string,matchId:string) {
  const [row]=await db.select().from(aiQuestMatchesTable).where(and(eq(aiQuestMatchesTable.id,matchId),eq(aiQuestMatchesTable.userId,userId))).limit(1);
  const metadata=row?.usageStart?.quickQueue as Record<string,unknown>|undefined;
  if(!row||!metadata||row.processedAt)return null;
  return {matchId:row.id,deckId:row.deckId,aiDeckId:row.aiDeckId,difficulty:row.difficulty,state:row.initialState,opponentName:metadata.opponentName,selfChampion:metadata.selfChampion,opponentChampion:metadata.opponentChampion,intro:metadata.intro};
}
export async function releaseQuickAI(userId:string,matchId?:string) {
  const rows=await db.update(aiQuestMatchesTable).set({usageStart:sql`jsonb_set(${aiQuestMatchesTable.usageStart}, '{quickQueue,active}', 'false'::jsonb)`})
    .where(and(eq(aiQuestMatchesTable.userId,userId),active,...(matchId?[eq(aiQuestMatchesTable.id,matchId)]:[]))).returning({id:aiQuestMatchesTable.id});
  if(rows.length)liveUsers.delete(userId);
}
export async function releaseDisconnectedQuickAI(userId:string) { if(liveUsers.has(userId))await releaseQuickAI(userId); }
