import { readPlatform, validatePlatform, questDiagnostic, cardRarity, QUEST_OBJECTIVES, type QuestMode } from "./quest-platform";
import { and, asc, eq, sql } from "drizzle-orm";
import { randomUUID, createHash } from "node:crypto";
import {
  dailyQuestAssignmentsTable,
  dailyQuestDefinitionsTable,
  dailyQuestProgressEventsTable, questSeasonsTable, questPlatformSettingsTable,
  db,
  type DailyQuestAssignmentRecord,
} from "@workspace/db";
import {
  validateQuestCondition,
  QUEST_CONDITION_SCHEMA_VERSION,
  type GameEvent,
  type GameState,
} from "@workspace/game-engine";
import { grantReward, type RewardExecutor } from "./reward-service";

export const DAILY_TIME_ZONE = process.env["KO_DAILY_TIMEZONE"]?.trim() || "Asia/Seoul";
export const DAILY_QUEST_OBJECTIVES = [
  "PLAY_MATCH",
  "WIN_MATCH",
  "CARD_PLAYED",
  "TECHNIQUE_PLAYED",
  "ATTACK_DECLARED",
  "DAMAGE_DEALT",
] as const;
export type DailyQuestObjective = (typeof DAILY_QUEST_OBJECTIVES)[number];
export const DAILY_QUEST_STATUSES = ["ASSIGNED", "IN_PROGRESS", "COMPLETED", "CLAIMED"] as const;
type QuestConfigRecord = { schemaVersion?: string; condition?: unknown };

function eventCardMetadata(state: GameState, event: GameEvent) {
  if (event.tags) return { cardMetadataAvailable: true as const, cardTags: event.tags };
  const instanceId = event.cardInstanceId ?? event.sourceSnapshot?.cardInstanceId ?? event.targetSnapshot?.cardInstanceId;
  if (!instanceId || !state.cardPool) return { cardMetadataAvailable: false as const };
  const instance = state.players.flatMap((player) => [
    ...player.deck, ...player.hand, ...player.board.filter(Boolean), ...player.graveyard, ...player.removedFromGame,
  ]).find((card) => card?.instanceId === instanceId);
  const definitionId = event.cardDefinitionId ?? instance?.definitionId;
  const definition = definitionId ? state.cardPool.find((card) => card.id === definitionId) : undefined;
  if (!definition) return { cardMetadataAvailable: false as const };
  return { cardMetadataAvailable: true as const, cardTags: definition.tags ?? [] };
}

export function isDailyQuestClaimable(status: string, progress: number, targetValue: number): boolean {
  return status === "COMPLETED" && progress >= targetValue;
}

export function dailyDate(now = new Date(), timezone = DAILY_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}


export function selectDailyQuestDefinitions<T>(definitions:T[],userId:string,assignmentDate:string,count=3):T[] {
 return definitions.map((item,index)=>{
  const id = (item as {id?:string})?.id ?? String(index);
  const hash = createHash("sha256").update(userId+":"+assignmentDate+":"+id).digest().readUInt32BE(0);
  const weight=((item as {platform?:unknown}).platform as {weight?:number}|null)?.weight??100;
  return {item,score:-Math.log(((hash>>>0)+1)/4294967297)/weight};
 }).sort((a,b)=>a.score-b.score).slice(0,count).map(x=>x.item);
}
export function objectiveIncrement(
  objectiveType: string,
  event: GameEvent,
  playerId: string,
  cardType: string | null,
): number {
  if (event.playerId !== playerId) return 0;
  if (objectiveType === "CARD_PLAYED") {
    return event.type === "CARD_PLAYED" && (!cardType || event.cardType === cardType) ? 1 : 0;
  }
  if (objectiveType === "TECHNIQUE_PLAYED") {
    return event.type === "CARD_PLAYED" && event.cardType === "TECHNIQUE" ? 1 : 0;
  }
  if (objectiveType === "ATTACK_DECLARED") return event.type === "ATTACK_DECLARED" ? 1 : 0;
  if (objectiveType === "DAMAGE_DEALT") return event.type === "DAMAGE_DEALT" && Number.isSafeInteger(event.amount) && event.amount! > 0 ? event.amount! : 0;
  return 0;
}

export async function ensureDailyQuestAssignments(
  userId: string,
  assignmentDate = dailyDate(),
  executor: RewardExecutor = db,
): Promise<DailyQuestAssignmentRecord[]> {
  const existing = await executor.select().from(dailyQuestAssignmentsTable)
    .where(and(
      eq(dailyQuestAssignmentsTable.userId, userId),
      eq(dailyQuestAssignmentsTable.assignmentDate, assignmentDate),
    ))
    .orderBy(asc(dailyQuestAssignmentsTable.slot));
  const [settings] = await executor.select().from(questPlatformSettingsTable).where(eq(questPlatformSettingsTable.id, "default"));
  const availableSlots = Array.from({length: settings?.dailyCount ?? 3}, (_, i) => i).filter(slot => !existing.some(assignment => assignment.slot === slot));
  if (!availableSlots.length) return existing;

  const definitions = await executor.select().from(dailyQuestDefinitionsTable)
    .where(eq(dailyQuestDefinitionsTable.enabled, true))
    .orderBy(asc(dailyQuestDefinitionsTable.createdAt), asc(dailyQuestDefinitionsTable.id));
  const selected = selectDailyQuestDefinitions(definitions.filter(definition => { const p = readPlatform(definition); return p.questType === "DAILY" && !p.archived && (!p.activationAt || Date.parse(p.activationAt) <= Date.now()) && !existing.some(assignment => assignment.definitionId === definition.id); }), userId, assignmentDate, availableSlots.length).slice(0, availableSlots.length);
  if (selected.length > 0) {
    await executor.insert(dailyQuestAssignmentsTable)
      .values(selected.map((definition, slot) => {
        const config = definition as typeof definition & QuestConfigRecord;
        return {
        id: randomUUID(),
        userId,
        definitionId: definition.id,
        assignmentDate,
        slot: availableSlots[slot]!,
        title: definition.title,
        description: definition.description,
        objectiveType: definition.objectiveType,
        cardType: definition.cardType,
        targetValue: definition.targetValue,
        rewardType: definition.rewardType,
        rewardAmount: definition.rewardAmount,
        rewardTargetId: definition.rewardTargetId,
        schemaVersion: config.schemaVersion ?? "QUEST_CONDITION_V1",
        condition: config.condition ?? null,
        platform: readPlatform(definition),
      };
      }))
      .onConflictDoNothing();
  }
  return executor.select().from(dailyQuestAssignmentsTable)
    .where(and(
      eq(dailyQuestAssignmentsTable.userId, userId),
      eq(dailyQuestAssignmentsTable.assignmentDate, assignmentDate),
    ))
    .orderBy(asc(dailyQuestAssignmentsTable.slot));
}


export async function processMatchEventsForDailyQuests(
 userId: string, playerId: string, matchId: string, state: GameState, eventStart: number,
 executor: RewardExecutor, assignmentDate?: string, mode: QuestMode = "AI",
): Promise<void> {
 const transactional = executor as RewardExecutor & {execute?: typeof db.execute};
 if (transactional.execute) await transactional.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"quest:"+userId}))`);
 const settings = await questSettings(executor);
 const date = assignmentDate ?? dailyDate(new Date(), settings.timezone);
 const assignments = [...await ensureDailyQuestAssignments(userId,date,executor), ...await ensureSeasonQuestAssignments(userId,executor)];
 const definitions = await executor.select().from(dailyQuestDefinitionsTable);
 const outcome = state.status === "FINISHED" ? (state.winnerId === playerId ? "WIN" : "LOSS") : null;
 for (const assignment of assignments) {
  const definition = definitions.find(d=>d.id===assignment.definitionId);
  if (!definition?.enabled || readPlatform(definition).archived || ["CLAIMED","COMPLETED"].includes(assignment.status)) continue;
  // Result-filtered events are evaluated only at settlement, including all earlier events.
  const first = readPlatform(assignment).result !== "ANY" ? 0 : eventStart;
  const events = state.events.slice(first).map((event,offset)=>({event,key:"EVENT:"+(first+offset)}));
  if (state.status === "FINISHED" && assignment.schemaVersion !== QUEST_CONDITION_SCHEMA_VERSION) events.push({event:{type:"TURN_ENDED",playerId,reason:"QUEST_MATCH_FINISHED"},key:"FINISHED"});
  for (const {event,key} of events) {
   const metadata=eventCardMetadata(state,event);
   const enriched=metadata.cardMetadataAvailable ? {...event,tags:metadata.cardTags} : event;
   const increment=questDiagnostic(assignment,enriched,playerId,mode,outcome,cardRarity(state,event)).increment;
   if (!Number.isSafeInteger(increment) || increment <= 0) continue;
   const [record] = await executor.insert(dailyQuestProgressEventsTable).values({id:randomUUID(),assignmentId:assignment.id,occurrenceKey:assignment.id+":"+matchId+":"+key,increment}).onConflictDoNothing({target:dailyQuestProgressEventsTable.occurrenceKey}).returning({id:dailyQuestProgressEventsTable.id});
   if (!record) continue;
   await executor.update(dailyQuestAssignmentsTable).set({
    progress: sql`LEAST(${dailyQuestAssignmentsTable.progress} + ${increment}, ${dailyQuestAssignmentsTable.targetValue})`,
    status: sql`CASE WHEN ${dailyQuestAssignmentsTable.progress} + ${increment} >= ${dailyQuestAssignmentsTable.targetValue} THEN 'COMPLETED' ELSE 'IN_PROGRESS' END`,
   }).where(and(eq(dailyQuestAssignmentsTable.id,assignment.id),sql`${dailyQuestAssignmentsTable.status} NOT IN ('CLAIMED','COMPLETED')`));
  }
 }
}
export async function claimDailyQuest(userId: string, assignmentId: string, database: Pick<typeof db,"transaction"> = db) {
 return database.transaction(async tx=>{
 const [assignment] = await tx.select().from(dailyQuestAssignmentsTable).where(and(eq(dailyQuestAssignmentsTable.id,assignmentId),eq(dailyQuestAssignmentsTable.userId,userId))).limit(1).for("update");
 if (!assignment) throw new Error("퀘스트를 찾을 수 없습니다.");
 if (assignment.status === "CLAIMED") return {assignment,reward:null,rewards:[],alreadyClaimed:true};
 if (!isDailyQuestClaimable(assignment.status,assignment.progress,assignment.targetValue)) throw new Error("완료된 퀘스트만 보상을 받을 수 있습니다.");
 const rewards=[];
 for (const [index,item] of readPlatform(assignment).rewards.entries()) rewards.push(await grantReward({
 userId,sourceType:"DAILY_QUEST_CLAIM",sourceId:assignment.id+(index===0 ? "" : ":reward:"+index),
 rewardType:item.rewardType,amount:item.rewardAmount,rewardTargetId:item.rewardTargetId,
 metadata:{assignmentDate:assignment.assignmentDate,definitionId:assignment.definitionId,version:readPlatform(assignment).version},
 },tx));
 const [claimed] = await tx.update(dailyQuestAssignmentsTable).set({status:"CLAIMED",claimedAt:new Date()}).where(eq(dailyQuestAssignmentsTable.id,assignment.id)).returning();
 return {assignment:claimed!,reward:rewards[0]??null,rewards,alreadyClaimed:false};
 });
}
export function publicDailyQuest(assignment: DailyQuestAssignmentRecord) {
 const {userId,assignedAt,...snapshot}=assignment;
 return {...snapshot,platform:readPlatform(assignment)};
}
export function isDailyQuestObjective(value: unknown): value is DailyQuestObjective {
 return typeof value === "string" && QUEST_OBJECTIVES.includes(value);
}
export function validateDailyQuestInput(value: unknown) {
 if (!value || typeof value !== "object" || Array.isArray(value)) return null;
 const input=value as Record<string,unknown>, platform=validatePlatform(input);
 if (!platform) return null;
 const title=typeof input.title==="string" ? input.title.trim() : "";
 const description=typeof input.description==="string" ? input.description.trim() : "";
 const objectiveType=input.objectiveType, targetValue=input.targetValue;
 const cardType=input.cardType==="WRESTLER" || input.cardType==="TECHNIQUE" ? input.cardType : null;
 const condition=input.condition==null ? null : validateQuestCondition(input.condition);
 const schemaVersion=condition ? QUEST_CONDITION_SCHEMA_VERSION : "QUEST_CONDITION_V1";
 if (!title || title.length>120 || description.length>2000 || !isDailyQuestObjective(objectiveType) ||
 typeof targetValue!=="number" || !Number.isSafeInteger(targetValue) || targetValue<1 || targetValue>100000000 ||
 (input.condition!=null && !condition) || (condition && condition.required!==targetValue) || (input.schemaVersion!=null && input.schemaVersion!==schemaVersion)) return null;
 const reward=platform.rewards[0]!;
 return {title,description,objectiveType,cardType,targetValue,...reward,enabled:input.enabled!==false,schemaVersion,condition,platform};
}
/** One account lock serializes concurrent late-season assignment creation. */
export async function ensureSeasonQuestAssignments(userId: string, executor: RewardExecutor = db, now=new Date()) {
 const seasons=await executor.select().from(questSeasonsTable);
 const definitions=await executor.select().from(dailyQuestDefinitionsTable).orderBy(asc(dailyQuestDefinitionsTable.id));
 const assignments: DailyQuestAssignmentRecord[]=[];
 for (const season of seasons.filter(s=>s.status==="ACTIVE" && s.startsAt<=now && now<s.endsAt)) {
  const period="SEASON:"+season.id;
  const existing=await executor.select().from(dailyQuestAssignmentsTable).where(and(eq(dailyQuestAssignmentsTable.userId,userId),eq(dailyQuestAssignmentsTable.assignmentDate,period)));
  let slot=Math.max(-1,...existing.map(a=>a.slot))+1;
  for (const d of definitions.filter(d=>{const p=readPlatform(d);return d.enabled && !p.archived && p.questType==="SEASON" && p.seasonId===season.id && (!p.activationAt || new Date(p.activationAt)<=now) && !existing.some(a=>a.definitionId===d.id);})) {
   const {id,createdAt,updatedAt,enabled,...snapshot}=d;
   await executor.insert(dailyQuestAssignmentsTable).values({...snapshot,id:randomUUID(),userId,definitionId:id,assignmentDate:period,slot:slot++,platform:readPlatform(d)}).onConflictDoNothing();
  }
  assignments.push(...await executor.select().from(dailyQuestAssignmentsTable).where(and(eq(dailyQuestAssignmentsTable.userId,userId),eq(dailyQuestAssignmentsTable.assignmentDate,period))).orderBy(asc(dailyQuestAssignmentsTable.slot)));
 }
 return assignments;
}
export async function questSettings(executor: RewardExecutor = db) {
 const [settings]=await executor.select().from(questPlatformSettingsTable).where(eq(questPlatformSettingsTable.id,"default"));
 return settings??{dailyCount:3,timezone:"Asia/Seoul"};
}
export async function ensureAllQuestAssignments(userId: string, database= db) {
 return database.transaction(async tx=>{
 await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"quest:"+userId}))`);
 const settings=await questSettings(tx);
 return [...await ensureDailyQuestAssignments(userId,dailyDate(new Date(),settings.timezone),tx),...await ensureSeasonQuestAssignments(userId,tx)];
 });
}
