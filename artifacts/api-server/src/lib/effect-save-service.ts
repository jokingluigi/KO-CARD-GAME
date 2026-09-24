import { and, eq, sql } from "drizzle-orm";
import { cardsTable, championsTable, db } from "@workspace/db";
import {
  isChampionQuestRewardEffects,
  isEffectScriptConfig,
  isStructuredEffects,
} from "./structured-effects";

export type ChampionEffectSlot = "ABILITY" | "QUEST_REWARD" | "UPGRADED_ABILITY";

type SaveError = {
  ok: false;
  status: 404 | 409 | 422;
  message: string;
};

type SaveSuccess<T> = { ok: true; record: T };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function assertDevelopmentOnly(): void {
  if (process.env["NODE_ENV"] !== "development") {
    throw new Error("Effect-only saves are restricted to the Development environment.");
  }
}

function isValidCardEffectConfig(effectId: unknown, effectConfig: unknown): effectConfig is Record<string, unknown> {
  if (!isRecord(effectConfig)) return false;
  if (effectId === "STRUCTURED_EFFECTS_V1") return isStructuredEffects(effectConfig);
  if (effectId === "SCRIPT_V1") return isEffectScriptConfig(effectConfig);
  return effectId === null && Object.keys(effectConfig).length === 0;
}

function isValidChampionEffectConfig(slot: ChampionEffectSlot, effectConfig: unknown): boolean {
  if (effectConfig === null) return slot !== "ABILITY";
  if (!isRecord(effectConfig)) return false;
  if (slot === "QUEST_REWARD") {
    return isChampionQuestRewardEffects(effectConfig) || isEffectScriptConfig(effectConfig);
  }
  return isStructuredEffects(effectConfig) || isEffectScriptConfig(effectConfig);
}

function collectDefinitionIds(value: unknown, ids = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectDefinitionIds(item, ids);
    return ids;
  }
  if (!isRecord(value)) return ids;
  if (isRecord(value["definitionRef"]) && typeof value["definitionRef"]["id"] === "string") {
    ids.add(value["definitionRef"]["id"] as string);
  }
  for (const child of Object.values(value)) collectDefinitionIds(child, ids);
  return ids;
}

export async function validatePublishedEffectReferences(
  effectConfig: unknown,
  rootCardId?: string,
): Promise<string[]> {
  const cards = await db.select({
    id: cardsTable.id,
    name: cardsTable.name,
    status: cardsTable.status,
    effectConfig: cardsTable.effectConfig,
  }).from(cardsTable);
  const byId = new Map(cards.map((card) => [card.id, card]));
  const visited = new Set<string>();
  const errors: string[] = [];

  const visit = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    const card = byId.get(id);
    if (!card) {
      errors.push(`없는 참조 카드 ID: ${id}`);
      return;
    }
    if (card.status !== "PUBLISHED" && id !== rootCardId) {
      errors.push(`공개되지 않은 참조 카드: ${card.name} (${id})`);
      return;
    }
    for (const referencedId of collectDefinitionIds(card.effectConfig)) visit(referencedId);
  };

  for (const referencedId of collectDefinitionIds(effectConfig)) visit(referencedId);
  return [...new Set(errors)];
}

export async function saveCardEffectFields(input: {
  id: string;
  expectedVersion: number;
  effectId: unknown;
  effectConfig: unknown;
}): Promise<SaveSuccess<unknown> | SaveError> {
  assertDevelopmentOnly();
  if (!isValidCardEffectConfig(input.effectId, input.effectConfig)) {
    return { ok: false, status: 422, message: "카드 효과 형식을 확인해 주세요." };
  }

  const [existing] = await db.select({ version: cardsTable.version })
    .from(cardsTable)
    .where(eq(cardsTable.id, input.id))
    .limit(1);
  if (!existing) return { ok: false, status: 404, message: "카드를 찾을 수 없습니다." };
  if (existing.version !== input.expectedVersion) {
    return { ok: false, status: 409, message: "카드가 변경되었습니다. 최신 버전을 다시 불러와 주세요." };
  }

  const [card] = await db.update(cardsTable)
    .set({
      effectId: input.effectId as string | null,
      effectConfig: input.effectConfig,
      version: sql`${cardsTable.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(cardsTable.id, input.id), eq(cardsTable.version, input.expectedVersion)))
    .returning();
  if (!card) return { ok: false, status: 409, message: "카드가 변경되었습니다. 최신 버전을 다시 불러와 주세요." };
  return { ok: true, record: card };
}

export async function saveChampionEffectSlot(input: {
  id: string;
  expectedVersion: number;
  slot: ChampionEffectSlot;
  effectConfig: Record<string, unknown> | null;
}): Promise<SaveSuccess<unknown> | SaveError> {
  assertDevelopmentOnly();
  if (!isValidChampionEffectConfig(input.slot, input.effectConfig)) {
    return { ok: false, status: 422, message: "챔피언 효과 형식을 확인해 주세요." };
  }

  const [existing] = await db.select({ version: championsTable.version })
    .from(championsTable)
    .where(eq(championsTable.id, input.id))
    .limit(1);
  if (!existing) return { ok: false, status: 404, message: "챔피언을 찾을 수 없습니다." };
  if (existing.version !== input.expectedVersion) {
    return { ok: false, status: 409, message: "챔피언이 변경되었습니다. 최신 버전을 다시 불러와 주세요." };
  }

  const versionUpdate = {
    version: sql`${championsTable.version} + 1`,
    updatedAt: new Date(),
  };
  let champion: unknown;

  if (input.slot === "ABILITY") {
    if (!isRecord(input.effectConfig)) {
      return { ok: false, status: 422, message: "고유 능력 효과를 비워 둘 수 없습니다." };
    }
    [champion] = await db.update(championsTable)
      .set({ abilityEffects: input.effectConfig, ...versionUpdate })
      .where(and(eq(championsTable.id, input.id), eq(championsTable.version, input.expectedVersion)))
      .returning();
  } else if (input.slot === "QUEST_REWARD") {
    [champion] = await db.update(championsTable)
      .set({ questRewardEffects: input.effectConfig, ...versionUpdate })
      .where(and(eq(championsTable.id, input.id), eq(championsTable.version, input.expectedVersion)))
      .returning();
  } else {
    [champion] = await db.update(championsTable)
      .set({ upgradedAbilityEffects: input.effectConfig, ...versionUpdate })
      .where(and(eq(championsTable.id, input.id), eq(championsTable.version, input.expectedVersion)))
      .returning();
  }
  if (!champion) return { ok: false, status: 409, message: "챔피언이 변경되었습니다. 최신 버전을 다시 불러와 주세요." };
  return { ok: true, record: champion };
}