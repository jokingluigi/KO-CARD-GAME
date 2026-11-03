import {getPackDetails} from './pack-details';
import {and,eq,isNull,sql} from 'drizzle-orm';
import {db,usersTable,championsTable,packDefinitionsTable,rewardGrantsTable,rewardSettingsTable,type PackDefinitionRecord} from '@workspace/db';
import {LESSONS,type LessonId} from '@workspace/game-engine';
import {grantReward,type RewardExecutor} from './reward-service';
export const TUTORIAL_CHAMPION_PACK_ID='tutorial-v1-guaranteed-champion';
export const LESSON_SOURCE='TUTORIAL_LESSON_V1',ALL_SOURCE='TUTORIAL_ALL_V1';
export function guaranteedChampionPack(p:PackDefinitionRecord){return p.championRate>0&&p.normalRate===0&&p.epicRate===0&&p.legendaryRate===0&&p.skinChance===0&&p.emoteRate===0&&p.championPool.length>0;}
export async function tutorialPackConfig(executor:RewardExecutor=db){
 const [packs,settings]=await Promise.all([
  executor.select().from(packDefinitionsTable).where(and(eq(packDefinitionsTable.status,'PUBLISHED'),isNull(packDefinitionsTable.deletedAt))),
  executor.select().from(rewardSettingsTable),
 ]);
 const normalSetting=settings.find(s=>s.key==='TUTORIAL_LESSON_PACK'),champSetting=settings.find(s=>s.key==='TUTORIAL_ALL_PACK');
 const normalCandidates=packs.filter(p=>/^(노멀|노말|일반|normal)(카드|card)?(팩|pack)$/i.test(p.name.replace(/[\s_-]/g,''))&&p.normalRate>0);
 const champCandidates=packs.filter(guaranteedChampionPack);
 let normal=normalSetting?packs.find(p=>p.id===normalSetting.rewardTargetId&&normalSetting.enabled&&p.normalRate>0):normalCandidates.length===1?normalCandidates[0]:undefined;
 let champion=champSetting?packs.find(p=>p.id===champSetting.rewardTargetId&&champSetting.enabled&&guaranteedChampionPack(p)):packs.find(p=>p.id===TUTORIAL_CHAMPION_PACK_ID&&guaranteedChampionPack(p))??(champCandidates.length===1?champCandidates[0]:undefined);
 // A new tutorial-only pack is materialized on the authorized claim/save path,
 // never by GET/startup and never by editing an existing shop pack.
 let provisionChampion=false;
 if(!champSetting&&!champion){
  const [existing]=await executor.select().from(packDefinitionsTable).where(eq(packDefinitionsTable.id,TUTORIAL_CHAMPION_PACK_ID)).limit(1);
  if(!existing){
   const published=await executor.select({id:championsTable.id}).from(championsTable).where(eq(championsTable.status,'PUBLISHED'));
   if(published.length){
    const now=new Date();provisionChampion=true;
    champion={id:TUTORIAL_CHAMPION_PACK_ID,name:'튜토리얼 확정 챔피언팩',description:'튜토리얼 전체 항목 최초 완료 보상. 공개된 챔피언 한 명을 확정 획득합니다.',imageAssetId:null,imageUrl:null,cardsPerPack:1,starterRewardQuantity:0,normalRate:0,epicRate:0,legendaryRate:0,championRate:100,emoteRate:0,skinChance:0,normalCardPool:[],epicCardPool:[],legendaryCardPool:[],championPool:published.map(c=>c.id),skinPool:[],emotePool:[],status:'PUBLISHED',version:1,deletedAt:null,createdAt:now,updatedAt:now};
   }
  }
 }

 if(normal&&!(await getPackDetails(normal,executor)).valid)normal=undefined;
 if(champion&&!(await getPackDetails(champion,executor)).valid)champion=undefined;
 return {normal,champion,packs:provisionChampion&&champion?[...packs,champion]:packs,provisionChampion};
}
export async function ensureTutorialChampionPack(pack:PackDefinitionRecord,executor:RewardExecutor){
 await executor.insert(packDefinitionsTable).values(pack).onConflictDoNothing({target:packDefinitionsTable.id});
 const [actual]=await executor.select().from(packDefinitionsTable).where(eq(packDefinitionsTable.id,pack.id)).limit(1);
 if(!actual||actual.status!=='PUBLISHED'||actual.deletedAt||!guaranteedChampionPack(actual)||!(await getPackDetails(actual,executor)).valid)throw Error('튜토리얼 확정 팩 설정을 확인해 주세요.');
}
export async function tutorialRewardStatus(userId:string,executor:RewardExecutor=db){
 const [config,grants]=await Promise.all([tutorialPackConfig(executor),executor.select().from(rewardGrantsTable).where(and(eq(rewardGrantsTable.userId,userId),sql`${rewardGrantsTable.sourceType} IN (${LESSON_SOURCE},${ALL_SOURCE})`))]);
 return {ready:Boolean(config.normal&&config.champion),normalPack:config.normal?{id:config.normal.id,name:config.normal.name}:null,championPack:config.champion?{id:config.champion.id,name:config.champion.name}:null,lessonQuantity:3,allQuantity:1,lessons:LESSONS.map(l=>({id:l.id,title:l.title,claimed:grants.some(g=>g.sourceType===LESSON_SOURCE&&g.sourceId===l.id)})),allClaimed:grants.some(g=>g.sourceType===ALL_SOURCE),message:config.normal&&config.champion?null:'보상 팩을 준비하고 있어요. 완료 기록을 보관한 뒤 보상 다시 확인으로 받을 수 있어요.'};
}
export async function claimTutorialReward(userId:string,lessonId:LessonId){
 return db.transaction(async tx=>{
  await tx.execute(sql`SELECT id FROM users WHERE id=${userId} FOR UPDATE`);
  const config=await tutorialPackConfig(tx);
  if(!config.normal||!config.champion)throw Error('튜토리얼 보상 팩 설정이 필요해요. 완료 기록을 보관했으니 설정 후 다시 확인해 주세요.');
  const lesson=await grantReward({userId,sourceType:LESSON_SOURCE,sourceId:lessonId,rewardType:'PACK',amount:3,rewardTargetId:config.normal.id,metadata:{tutorialVersion:1,lessonId}},tx);
  const completed=await tx.select().from(rewardGrantsTable).where(and(eq(rewardGrantsTable.userId,userId),eq(rewardGrantsTable.sourceType,LESSON_SOURCE)));
  const allComplete=LESSONS.every(l=>completed.some(g=>g.sourceId===l.id));
  if(allComplete&&config.provisionChampion)await ensureTutorialChampionPack(config.champion,tx);
  const all=allComplete?await grantReward({userId,sourceType:ALL_SOURCE,sourceId:'all',rewardType:'PACK',amount:1,rewardTargetId:config.champion.id,metadata:{tutorialVersion:1}},tx):null;
  return {lesson,all,status:await tutorialRewardStatus(userId,tx)};
 });
}
