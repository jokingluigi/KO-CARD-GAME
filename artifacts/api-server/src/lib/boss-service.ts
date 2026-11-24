import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { aiQuestMatchesTable, bossClearsTable, bossesTable, championsTable, db, type BossRecord } from "@workspace/db";
import { applyBossStart, DEFAULT_AI_DIFFICULTY, type BossDialogueLine, type BossPhase, type GameState } from "@workspace/game-engine";
import { listAIDecks } from "./ai-deck-service";
import { buildAIMatchStart, replayAIMatch } from "./ai-match-quest-service";
import { saveAIQuestStart } from "./ai-quest-match-storage";
import { grantReward } from "./reward-service";

export const BOSS_STATUSES = ["DRAFT", "PUBLISHED"] as const;
const SPEAKERS = ["BOSS", "PLAYER", "NARRATOR"] as const;
const LINE_EFFECTS = ["SHAKE", "FLASH"] as const;

const int = (value: unknown, fallback: number, min: number, max: number) => {
  const number = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.min(max, Math.max(min, number));
};
const text = (value: unknown, max = 500) => (typeof value === "string" ? value.slice(0, max) : "");
const ids = (value: unknown) => (Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && Boolean(id.trim())).slice(0, 10) : []);

export function cleanDialogue(value: unknown): BossDialogueLine[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 40).flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const line = raw as Record<string, unknown>;
    const speaker = SPEAKERS.includes(line.speaker as never) ? (line.speaker as BossDialogueLine["speaker"]) : "BOSS";
    const effect = LINE_EFFECTS.includes(line.effect as never) ? (line.effect as BossDialogueLine["effect"]) : null;
    return [{ speaker, expression: text(line.expression, 40) || null, text: text(line.text, 300), effect }];
  });
}

export function cleanPhases(value: unknown): BossPhase[] {
  const phases = (Array.isArray(value) ? value : []).slice(0, 6).flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const phase = raw as Record<string, unknown>;
    return [{
      name: text(phase.name, 40) || `${index + 1}페이즈`,
      health: int(phase.health, 30, 1, 999),
      portraitUrl: text(phase.portraitUrl, 1000) || null,
      addToHand: ids(phase.addToHand),
      addToDeck: ids(phase.addToDeck),
      clearBoard: phase.clearBoard === true,
      goldPerTurn: int(phase.goldPerTurn, 0, 0, 10),
      dialogue: cleanDialogue(phase.dialogue),
    }];
  });
  return phases.length ? phases : [{ name: "1페이즈", health: 30, portraitUrl: null, addToHand: [], addToDeck: [], clearBoard: false, goldPerTurn: 0, dialogue: [] }];
}

/** 관리자가 보낸 값을 안전한 저장 값으로 바꾼다. 보내지 않은 칸은 건드리지 않는다. */
export function cleanBossPatch(body: Record<string, unknown>): Partial<BossRecord> {
  const patch: Partial<BossRecord> = {};
  if ("name" in body) patch.name = text(body.name, 60).trim() || "이름 없는 보스";
  if ("subtitle" in body) patch.subtitle = text(body.subtitle, 80);
  if ("description" in body) patch.description = text(body.description, 500);
  if ("imageUrl" in body) patch.imageUrl = text(body.imageUrl, 1000) || null;
  if ("status" in body) patch.status = BOSS_STATUSES.includes(body.status as never) ? (body.status as string) : "DRAFT";
  if ("stageOrder" in body) patch.stageOrder = int(body.stageOrder, 1, 1, 999);
  if ("aiDeckId" in body) patch.aiDeckId = typeof body.aiDeckId === "string" && body.aiDeckId ? body.aiDeckId : null;
  if ("firstClearReward" in body) patch.firstClearReward = int(body.firstClearReward, 300, 0, 100000);
  if ("playerHealthBonus" in body) patch.playerHealthBonus = int(body.playerHealthBonus, 0, 0, 100);
  if ("phases" in body) patch.phases = cleanPhases(body.phases);
  if ("introDialogue" in body) patch.introDialogue = cleanDialogue(body.introDialogue);
  if ("clearDialogue" in body) patch.clearDialogue = cleanDialogue(body.clearDialogue);
  return patch;
}

export async function listAllBosses() {
  return db.select().from(bossesTable).orderBy(asc(bossesTable.stageOrder), asc(bossesTable.createdAt));
}

export async function createBoss(body: Record<string, unknown>) {
  const [last] = await db.select({ order: sql<number>`coalesce(max(${bossesTable.stageOrder}),0)` }).from(bossesTable);
  const values = {
    id: "boss-" + randomUUID(),
    name: "새 보스",
    stageOrder: Number(last?.order ?? 0) + 1,
    phases: cleanPhases([]),
    ...cleanBossPatch(body),
  } as typeof bossesTable.$inferInsert;
  const [created] = await db.insert(bossesTable).values(values).returning();
  return created!;
}

export async function updateBoss(id: string, body: Record<string, unknown>) {
  const [updated] = await db.update(bossesTable).set({ ...cleanBossPatch(body), updatedAt: new Date() }).where(eq(bossesTable.id, id)).returning();
  return updated ?? null;
}

export async function deleteBoss(id: string) {
  const rows = await db.delete(bossesTable).where(eq(bossesTable.id, id)).returning({ id: bossesTable.id });
  return rows.length > 0;
}

/** 공개된 보스 목록 + 내 클리어 여부 + 잠금(앞 스테이지를 깨야 열림). */
export async function listBossesForUser(userId: string) {
  const [bosses, clears] = await Promise.all([
    db.select().from(bossesTable).where(eq(bossesTable.status, "PUBLISHED")).orderBy(asc(bossesTable.stageOrder), asc(bossesTable.createdAt)),
    db.select().from(bossClearsTable).where(eq(bossClearsTable.userId, userId)),
  ]);
  const cleared = new Map(clears.map((clear) => [clear.bossId, clear]));
  let previousCleared = true;
  return bosses.map((boss, index) => {
    const clear = cleared.get(boss.id);
    const locked = index > 0 && !previousCleared;
    previousCleared = Boolean(clear);
    const phases = cleanPhases(boss.phases);
    return {
      id: boss.id, name: boss.name, subtitle: boss.subtitle, description: boss.description, imageUrl: boss.imageUrl,
      stageOrder: boss.stageOrder, firstClearReward: boss.firstClearReward, phaseCount: phases.length,
      cleared: Boolean(clear), clearCount: clear?.clearCount ?? 0, locked,
    };
  });
}

type BossMatchMeta = { bossId: string; test: boolean; completed?: boolean };

/** 보스전 시작: 서버가 시작 상태를 만들고 저장한다 (결과 검증용). */
export async function startBossMatch(input: { userId: string; isTestAccount: boolean; isAdmin: boolean; bossId: string; deckId: string; startPhase?: number }) {
  const [boss] = await db.select().from(bossesTable).where(eq(bossesTable.id, input.bossId)).limit(1);
  if (!boss || (boss.status !== "PUBLISHED" && !input.isAdmin)) throw new Error("이 보스를 찾을 수 없습니다.");
  const test = input.isAdmin && (boss.status !== "PUBLISHED" || (input.startPhase ?? 0) > 0);
  if (!input.isAdmin) {
    const list = await listBossesForUser(input.userId);
    if (list.find((entry) => entry.id === boss.id)?.locked) throw new Error("앞 스테이지 보스를 먼저 쓰러뜨려야 해요.");
  }
  if (!boss.aiDeckId) throw new Error("이 보스에 덱이 아직 정해지지 않았어요.");
  const aiDeck = (await listAIDecks({ context: "AI_DECK" })).find((deck) => deck.id === boss.aiDeckId);
  if (!aiDeck?.championDefinitionId || !aiDeck.cardDefinitionIds.length || !aiDeck.isValid) throw new Error("보스 덱을 사용할 수 없어요. 관리자 화면에서 보스 덱을 확인해 주세요.");
  const allPhases = cleanPhases(boss.phases);
  const phases = allPhases.slice(Math.min(allPhases.length - 1, Math.max(0, input.startPhase ?? 0)));
  const extra = phases.flatMap((phase) => [...(phase.addToHand ?? []), ...(phase.addToDeck ?? [])]);
  const matchId = "ai-" + randomUUID();
  const { startedState, userDeck } = await buildAIMatchStart({ userId: input.userId, isTestAccount: input.isTestAccount, deckId: input.deckId, matchId, prepareOnly: true }, aiDeck, extra);
  const state = applyBossStart(startedState, { bossId: boss.id, name: boss.name, phases, playerHealthBonus: boss.playerHealthBonus });
  const identity = { userId: input.userId, deckId: input.deckId, aiDeckId: aiDeck.id, matchId };
  await saveAIQuestStart(identity, state, DEFAULT_AI_DIFFICULTY, [...userDeck.cardDefinitionIds]);
  const meta: BossMatchMeta = { bossId: boss.id, test };
  await db.update(aiQuestMatchesTable)
    .set({ usageStart: sql`coalesce(${aiQuestMatchesTable.usageStart}, '{}'::jsonb) || jsonb_build_object('boss', ${JSON.stringify(meta)}::jsonb)` })
    .where(eq(aiQuestMatchesTable.id, matchId));
  const [selfChampion] = await db.select().from(championsTable).where(eq(championsTable.id, state.players[0]!.champion!.id)).limit(1);
  return {
    matchId, deckId: input.deckId, aiDeckId: aiDeck.id, difficulty: DEFAULT_AI_DIFFICULTY, state, test,
    opponentName: boss.name, opponentCosmetics: aiDeck.cosmetics,
    selfChampion: { name: selfChampion?.name ?? "", imageUrl: selfChampion?.imageUrl ?? null },
    opponentChampion: { name: aiDeck.champion?.name ?? boss.name, imageUrl: boss.imageUrl ?? aiDeck.champion?.imageUrl ?? null },
    boss: { id: boss.id, name: boss.name, subtitle: boss.subtitle, imageUrl: boss.imageUrl, introDialogue: cleanDialogue(boss.introDialogue), clearDialogue: cleanDialogue(boss.clearDialogue), firstClearReward: boss.firstClearReward },
  };
}

/** 보스전 결과: 저장된 시작 상태로 다시 재현해서 진짜 이겼는지 확인한 뒤 첫 클리어 보상을 준다. */
export async function completeBossMatch(input: { userId: string; matchId: string; actions: unknown[] }) {
  const [row] = await db.select().from(aiQuestMatchesTable)
    .where(and(eq(aiQuestMatchesTable.id, input.matchId), eq(aiQuestMatchesTable.userId, input.userId))).limit(1);
  const meta = (row?.usageStart as Record<string, unknown> | null)?.boss as BossMatchMeta | undefined;
  if (!row || !meta) throw new Error("보스전 기록을 찾을 수 없어요.");
  const initial = JSON.parse(JSON.stringify(row.initialState)) as GameState;
  const [user, ai] = initial.players;
  if (!user || !ai) throw new Error("경기 참가자 정보가 없어요.");
  const final = replayAIMatch(initial, input.actions, user.id, ai.id, DEFAULT_AI_DIFFICULTY);
  const cleared = final.winnerId === user.id;
  if (!cleared || meta.test) return { cleared, firstClear: false, reward: null, test: meta.test };
  return db.transaction(async (tx) => {
    const marked = await tx.update(aiQuestMatchesTable)
      .set({ usageStart: sql`jsonb_set(${aiQuestMatchesTable.usageStart}, '{boss,completed}', 'true'::jsonb)` })
      .where(and(eq(aiQuestMatchesTable.id, input.matchId), sql`(${aiQuestMatchesTable.usageStart}->'boss'->>'completed') IS DISTINCT FROM 'true'`))
      .returning({ id: aiQuestMatchesTable.id });
    const [boss] = await tx.select().from(bossesTable).where(eq(bossesTable.id, meta.bossId)).limit(1);
    if (!marked.length) {
      const [clear] = await tx.select().from(bossClearsTable).where(and(eq(bossClearsTable.userId, input.userId), eq(bossClearsTable.bossId, meta.bossId))).limit(1);
      return { cleared: true, firstClear: clear?.clearCount === 1, reward: null, test: false };
    }
    const inserted = await tx.insert(bossClearsTable).values({ userId: input.userId, bossId: meta.bossId })
      .onConflictDoUpdate({ target: [bossClearsTable.userId, bossClearsTable.bossId], set: { clearCount: sql`${bossClearsTable.clearCount} + 1`, lastClearedAt: new Date() } })
      .returning({ clearCount: bossClearsTable.clearCount });
    const firstClear = inserted[0]?.clearCount === 1;
    const amount = boss?.firstClearReward ?? 0;
    const reward = firstClear && amount > 0
      ? await grantReward({ userId: input.userId, sourceType: "BOSS_FIRST_CLEAR", sourceId: meta.bossId, rewardType: "CURRENCY", amount, metadata: { matchId: input.matchId } }, tx)
      : null;
    return { cleared: true, firstClear, reward: reward ? { amount: reward.amount } : null, test: false };
  });
}
