
import { Router } from "express";
import { asc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, dailyQuestDefinitionsTable, questSeasonsTable, questPlatformSettingsTable, questAdminAuditTable } from "@workspace/db";
import { getAuthenticatedUser } from "../lib/auth";
import { validateDailyQuestInput } from "../lib/daily-quest-service";
import { validateRewardTarget, type RewardExecutor } from "../lib/reward-service";
import { QUEST_MODES, QUEST_OBJECTIVES, questDiagnostic, readPlatform, type QuestMode } from "../lib/quest-platform";
import type { GameEvent } from "@workspace/game-engine";
const router = Router();
router.use(async (req,res,next) => {
 try { req.authUser = (await getAuthenticatedUser(req)) ?? undefined;
 if (!req.authUser) {res.status(401).json({message:"로그인이 필요합니다."});return;}
 if (req.authUser.role !== "ADMIN") {res.status(403).json({message:"관리자 권한이 필요합니다."});return;}
 next(); } catch(e) {next(e);}
});
async function audit(tx: RewardExecutor, adminId: string, action: string, entityId: string, configuration: unknown) {
 await tx.insert(questAdminAuditTable).values({id:randomUUID(),adminId,action,entityId,configuration});
}
router.get("/",async (_req,res) => {
 const [definitions,seasons,settings,audits] = await Promise.all([
 db.select().from(dailyQuestDefinitionsTable).orderBy(asc(dailyQuestDefinitionsTable.createdAt)),
 db.select().from(questSeasonsTable), db.select().from(questPlatformSettingsTable),
 db.select().from(questAdminAuditTable).orderBy(sql`created_at DESC`).limit(50)]);
 res.json({definitions:definitions.map(d=>({...d,platform:readPlatform(d)})),seasons,settings:settings[0],audits,objectives:QUEST_OBJECTIVES,modes:QUEST_MODES});
});
router.put("/settings",async (req,res) => {
 const {dailyCount,timezone} = req.body ?? {};
 if (!Number.isSafeInteger(dailyCount) || dailyCount < 1 || dailyCount > 20 || typeof timezone !== "string") {res.status(400).json({message:"하루 퀘스트 수는 1~20개입니다."});return;}
 try {new Intl.DateTimeFormat("en",{timeZone:timezone});} catch {res.status(400).json({message:"올바른 시간대를 선택해 주세요."});return;}
 await db.transaction(async tx => {
 await tx.insert(questPlatformSettingsTable).values({id:"default",dailyCount,timezone}).onConflictDoUpdate({target:questPlatformSettingsTable.id,set:{dailyCount,timezone,updatedAt:new Date()}});
 await audit(tx,req.authUser!.id,"SETTINGS_UPDATED","default",{dailyCount,timezone});
 }); res.json({saved:true});
});
router.post("/seasons",async (req,res) => {
 const {name,startsAt,endsAt,status} = req.body ?? {};
 const start = new Date(startsAt),end = new Date(endsAt);
 if (typeof name !== "string" || !name.trim() || name.length > 120 || !Number.isFinite(+start) || !Number.isFinite(+end) || start >= end || !["ACTIVE","DISABLED","ARCHIVED"].includes(status)) {res.status(400).json({message:"시즌 이름·기간·상태를 확인해 주세요."});return;}
 const id = typeof req.body.id === "string" ? req.body.id : randomUUID();
 const season = await db.transaction(async tx=>{
 const [row] = await tx.insert(questSeasonsTable).values({id,name:name.trim(),startsAt:start,endsAt:end,status}).onConflictDoUpdate({target:questSeasonsTable.id,set:{name:name.trim(),startsAt:start,endsAt:end,status,updatedAt:new Date()}}).returning();
 await audit(tx,req.authUser!.id,"SEASON_SAVED",id,row);return row;
 });res.json({season});
});
router.post("/definitions", async (req,res) => {
 const input = validateDailyQuestInput(req.body);
 if (!input) {res.status(400).json({message:"이름·조건·목표량·모드·보상을 확인해 주세요."});return;}
 if (input.platform.questType === "SEASON") {
 const [season] = await db.select().from(questSeasonsTable).where(eq(questSeasonsTable.id,input.platform.seasonId!));
 if (!season) {res.status(400).json({message:"시즌을 선택해 주세요."});return;}
 }
 for (const reward of input.platform.rewards) if (!await validateRewardTarget(reward.rewardType,reward.rewardTargetId)) {res.status(400).json({message:"보상 카드 또는 팩을 확인해 주세요."});return;}
 const requestedId = typeof req.body.id === "string" ? req.body.id : null;
 const id = requestedId ?? randomUUID();
 const definition = await db.transaction(async tx=>{
 const [previous] = requestedId ? await tx.select().from(dailyQuestDefinitionsTable).where(eq(dailyQuestDefinitionsTable.id,id)).for("update") : [];
 if (requestedId && !previous) return null;
 input.platform.version = previous ? readPlatform(previous).version + 1 : 1;
 const [row] = previous ? await tx.update(dailyQuestDefinitionsTable).set({...input,updatedAt:new Date()}).where(eq(dailyQuestDefinitionsTable.id,id)).returning() : await tx.insert(dailyQuestDefinitionsTable).values({id,...input}).returning();
 await audit(tx,req.authUser!.id,previous ? "QUEST_UPDATED" : "QUEST_CREATED",id,row);
 return row;
 });
 if (!definition) {res.status(404).json({message:"퀘스트를 찾을 수 없습니다."});return;}
 res.json({definition});
});
router.post("/diagnostic",async (req,res) => {
 const {mode,objectiveType,cardType,rarity,result,amount} = req.body ?? {};
 if (!QUEST_MODES.includes(mode) || !QUEST_OBJECTIVES.includes(objectiveType) || !Number.isSafeInteger(amount) || amount < 1 || amount > 100000000) {res.status(400).json({message:"테스트 이벤트를 확인해 주세요."});return;}
 const event = {type: objectiveType === "WRESTLER_PLAYED" || objectiveType === "TECHNIQUE_PLAYED" ? "CARD_PLAYED" : objectiveType,
 playerId:"diagnostic-player",cardType,amount,
 reason:["PLAY_MATCH","WIN_MATCH","LOSS_MATCH"].includes(objectiveType) ? "QUEST_MATCH_FINISHED" : undefined} as GameEvent;
 const definitions = await db.select().from(dailyQuestDefinitionsTable);
 res.json({readOnly:true,results:definitions.map(d=>({id:d.id,title:d.title,
 ...(!d.enabled || readPlatform(d).archived ? {increment:0,reason:"비활성화 또는 보관됨"} : questDiagnostic(d,event,"diagnostic-player",mode as QuestMode,result ?? null,rarity ?? null))}))});
});
export default router;
