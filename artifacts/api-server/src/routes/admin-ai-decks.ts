import { and, asc, eq, inArray } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  aiDecksTable,
  cardsTable,
  championsTable,
  db,
} from "@workspace/db";
import { getAuthenticatedUser } from "../lib/auth";
import {
  AI_DECK_MAX_SIZE,
  AI_DECK_MIN_SIZE,
  listAIDecks,
  resolveAIDeck,
  validateAIDeckReferences,
} from "../lib/ai-deck-service";

const router: IRouter = Router();

router.use(async (request, response, next) => {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      response.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }
    if (user.role !== "ADMIN") {
      response.status(403).json({ message: "관리자 권한이 필요합니다." });
      return;
    }
    request.authUser = user;
    next();
  } catch (error) {
    next(error);
  }
});

function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readCardIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((id) => typeof id !== "string" || !id.trim())) return null;
  return value.map((id) => id.trim());
}

function readPayload(value: unknown): {
  name: string;
  description: string;
  championDefinitionId: string | null;
  cardDefinitionIds: string[];
  enabled: boolean;
  displayOrder: number;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const cardDefinitionIds = readCardIds(body.cardDefinitionIds);
  if (!cardDefinitionIds) return null;
  const displayOrder = typeof body.displayOrder === "number" && Number.isFinite(body.displayOrder)
    ? Math.trunc(body.displayOrder)
    : 0;
  return {
    name: readString(body.name),
    description: readString(body.description),
    championDefinitionId: typeof body.championDefinitionId === "string" && body.championDefinitionId.trim()
      ? body.championDefinitionId.trim()
      : null,
    cardDefinitionIds,
    enabled: readBoolean(body.enabled, false),
    displayOrder,
  };
}

async function validateForSave(payload: ReturnType<typeof readPayload>): Promise<string | null> {
  if (!payload) return "AI 덱 정보를 확인해 주세요.";
  if (!payload.name || Array.from(payload.name).length > 50) return "AI 덱 이름은 1~50자로 입력해 주세요.";
  if (payload.cardDefinitionIds.length < AI_DECK_MIN_SIZE || payload.cardDefinitionIds.length > AI_DECK_MAX_SIZE) {
    return `AI 덱 카드는 ${AI_DECK_MIN_SIZE}~${AI_DECK_MAX_SIZE}장이어야 합니다.`;
  }
  const validation = await validateAIDeckReferences(payload.championDefinitionId, payload.cardDefinitionIds);
  if (!validation.isValid) return validation.invalidReasons.join(" ");
  return null;
}

router.get("/", async (_request, response): Promise<void> => {
  response.json({ decks: await listAIDecks() });
});

router.get("/options", async (_request, response): Promise<void> => {
  const [cards, champions] = await Promise.all([
    db.select().from(cardsTable).orderBy(asc(cardsTable.cost), asc(cardsTable.name)),
    db.select().from(championsTable).orderBy(asc(championsTable.name)),
  ]);
  response.json({
    cards: cards.filter((card) => card.status !== "DISABLED"),
    champions: champions.filter((champion) => champion.status !== "DISABLED"),
    minCardCount: AI_DECK_MIN_SIZE,
    maxCardCount: AI_DECK_MAX_SIZE,
  });
});

router.post("/", async (request, response): Promise<void> => {
  const payload = readPayload(request.body);
  const error = await validateForSave(payload);
  if (error) {
    response.status(422).json({ message: error });
    return;
  }
  const [deck] = await db.insert(aiDecksTable).values({
    id: crypto.randomUUID(),
    ...payload!,
  }).returning();
  response.status(201).json({ deck: deck ? await resolveAIDeck(deck) : null });
});

router.patch("/:id", async (request, response): Promise<void> => {
  const id = request.params.id;
  const [existing] = await db.select().from(aiDecksTable).where(eq(aiDecksTable.id, id)).limit(1);
  if (!existing) {
    response.status(404).json({ message: "AI 덱을 찾을 수 없습니다." });
    return;
  }
  const payload = readPayload(request.body);
  const error = await validateForSave(payload);
  if (error) {
    response.status(422).json({ message: error });
    return;
  }
  const [deck] = await db.update(aiDecksTable).set({
    ...payload!,
    updatedAt: new Date(),
  }).where(eq(aiDecksTable.id, id)).returning();
  response.json({ deck: deck ? await resolveAIDeck(deck) : null });
});

router.post("/:id/duplicate", async (request, response): Promise<void> => {
  const [source] = await db.select().from(aiDecksTable).where(eq(aiDecksTable.id, request.params.id)).limit(1);
  if (!source) {
    response.status(404).json({ message: "AI 덱을 찾을 수 없습니다." });
    return;
  }
  const [deck] = await db.insert(aiDecksTable).values({
    id: crypto.randomUUID(),
    name: `${source.name} Copy`,
    description: source.description,
    championDefinitionId: source.championDefinitionId,
    cardDefinitionIds: source.cardDefinitionIds,
    enabled: false,
    displayOrder: source.displayOrder,
  }).returning();
  response.status(201).json({ deck: deck ? await resolveAIDeck(deck) : null });
});

router.post("/:id/status", async (request, response): Promise<void> => {
  const enabled = request.body && typeof request.body === "object" && typeof request.body.enabled === "boolean"
    ? request.body.enabled
    : null;
  if (enabled === null) {
    response.status(400).json({ message: "AI 덱 활성화 상태가 올바르지 않습니다." });
    return;
  }
  const [existing] = await db.select().from(aiDecksTable).where(eq(aiDecksTable.id, request.params.id)).limit(1);
  if (!existing) {
    response.status(404).json({ message: "AI 덱을 찾을 수 없습니다." });
    return;
  }
  const resolved = await resolveAIDeck(existing);
  if (enabled && !resolved.isValid) {
    response.status(422).json({ message: "유효하지 않은 AI 덱은 활성화할 수 없습니다.", invalidReasons: resolved.invalidReasons });
    return;
  }
  const [deck] = await db.update(aiDecksTable)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(aiDecksTable.id, existing.id))
    .returning();
  response.json({ deck: deck ? await resolveAIDeck(deck) : null });
});

router.delete("/:id", async (request, response): Promise<void> => {
  const [deleted] = await db.delete(aiDecksTable).where(eq(aiDecksTable.id, request.params.id)).returning({ id: aiDecksTable.id });
  if (!deleted) {
    response.status(404).json({ message: "AI 덱을 찾을 수 없습니다." });
    return;
  }
  response.status(204).send();
});

router.post("/:id/test", async (request, response): Promise<void> => {
  const [deck] = await db.select().from(aiDecksTable).where(eq(aiDecksTable.id, request.params.id)).limit(1);
  if (!deck) {
    response.status(404).json({ message: "AI 덱을 찾을 수 없습니다." });
    return;
  }
  const resolved = await resolveAIDeck(deck);
  if (!resolved.isValid) {
    response.status(422).json({ message: "유효하지 않은 AI 덱은 테스트할 수 없습니다.", invalidReasons: resolved.invalidReasons });
    return;
  }
  response.json({ deck: resolved });
});

export default router;
