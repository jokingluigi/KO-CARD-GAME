import {and,eq,sql} from 'drizzle-orm';
import {db,dailyQuestAssignmentsTable,rewardSettingsTable,rewardGrantsTable,type DailyQuestAssignmentRecord} from '@workspace/db';
import {dailyDate,questSettings} from './daily-quest-service';
import {readPlatform} from './quest-platform';
import {grantReward,isRewardType,type RewardExecutor} from './reward-service';
export const DAILY_COMPLETION_BONUS_KEY='DAILY_QUEST_COMPLETION_BONUS';
export const DAILY_COMPLETION_TARGET=3;
export type DailyCompletionReward={enabled:boolean;rewardType:string;rewardAmount:number;rewardTargetId:string|null};
export const DEFAULT_DAILY_COMPLETION_REWARD:DailyCompletionReward={enabled:false,rewardType:'CURRENCY',rewardAmount:200,rewardTargetId:null};
export function validateDailyCompletionReward(value:unknown):DailyCompletionReward|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const v=value as Record<string,unknown>;
 if(typeof v.enabled!=='boolean'||!isRewardType(v.rewardType)||!Number.isSafeInteger(v.rewardAmount)||Number(v.rewardAmount)<1||Number(v.rewardAmount)>100000000)return null;
 if(v.rewardType==='CHAMPION'&&v.rewardAmount!==1)return null;
 if(v.rewardType==='CURRENCY' ? v.rewardTargetId!=null&&v.rewardTargetId!=='' : typeof v.rewardTargetId!=='string'||!v.rewardTargetId.trim())return null;
 return {enabled:v.enabled,rewardType:v.rewardType,rewardAmount:Number(v.rewardAmount),rewardTargetId:v.rewardType==='CURRENCY'?null:String(v.rewardTargetId).trim()};
}
export async function dailyCompletionReward(executor:RewardExecutor=db):Promise<DailyCompletionReward>{
 const [setting]=await executor.select().from(rewardSettingsTable).where(eq(rewardSettingsTable.key,DAILY_COMPLETION_BONUS_KEY)).limit(1);
 return setting?{enabled:setting.enabled,rewardType:setting.rewardType,rewardAmount:setting.amount,rewardTargetId:setting.rewardTargetId}:DEFAULT_DAILY_COMPLETION_REWARD;
}
export function completedDailyQuestCount(assignments:DailyQuestAssignmentRecord[],date:string){
 return new Set(assignments.filter(a=>a.assignmentDate===date&&readPlatform(a).questType==='DAILY'&&['COMPLETED','CLAIMED'].includes(a.status)&&a.progress>=a.targetValue).map(a=>a.definitionId)).size;
}
export async function dailyCompletionBonus(userId:string,assignments:DailyQuestAssignmentRecord[],date:string,executor:RewardExecutor=db){
 const [configuration,grants]=await Promise.all([
  dailyCompletionReward(executor),
  executor.select().from(rewardGrantsTable).where(and(eq(rewardGrantsTable.userId,userId),eq(rewardGrantsTable.sourceType,DAILY_COMPLETION_BONUS_KEY),eq(rewardGrantsTable.sourceId,date))).limit(1),
 ]);
 const grant=grants[0],progress=Math.min(DAILY_COMPLETION_TARGET,completedDailyQuestCount(assignments,date));
 return {date,targetValue:DAILY_COMPLETION_TARGET,progress,...configuration,
  ...(grant?{rewardType:grant.rewardType,rewardAmount:grant.amount,rewardTargetId:grant.rewardTargetId}:{}),
  status:grant?'CLAIMED' as const:!configuration.enabled?'DISABLED' as const:progress>=DAILY_COMPLETION_TARGET?'COMPLETED' as const:'IN_PROGRESS' as const,
  claimedAt:grant?.createdAt.toISOString()??null};
}
export async function claimDailyCompletionBonus(userId:string,database:Pick<typeof db,'transaction'>=db,now=new Date()){
 return database.transaction(async tx=>{
  // Same account lock as verified quest progression. Source ID excludes reward type:
  // changing a configured reward must never create a second claim on the same day.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"quest:"+userId}))`);
  const settings=await questSettings(tx),date=dailyDate(now,settings.timezone);
  const assignments=await tx.select().from(dailyQuestAssignmentsTable).where(and(eq(dailyQuestAssignmentsTable.userId,userId),eq(dailyQuestAssignmentsTable.assignmentDate,date)));
  const bonus=await dailyCompletionBonus(userId,assignments,date,tx);
  if(bonus.status==='CLAIMED')return {bonus,reward:null,alreadyClaimed:true};
  if(!bonus.enabled)throw new Error('일일 퀘스트 3개 완료 보상이 비활성화되어 있습니다.');
  if(bonus.progress<DAILY_COMPLETION_TARGET)throw new Error('오늘 일일 퀘스트 3개를 완료해야 합니다.');
  const reward=await grantReward({userId,sourceType:DAILY_COMPLETION_BONUS_KEY,sourceId:date,rewardType:bonus.rewardType,amount:bonus.rewardAmount,rewardTargetId:bonus.rewardTargetId,metadata:{date,timezone:settings.timezone,required:DAILY_COMPLETION_TARGET}},tx);
  return {bonus:{...bonus,status:'CLAIMED' as const,claimedAt:now.toISOString()},reward,alreadyClaimed:!reward.granted};
 });
}
