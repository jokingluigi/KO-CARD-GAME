import {legacySkinId,syncLegacySkin} from "../lib/legacy-skin-cosmetics";
import {cosmeticsWriteLock} from "../lib/cosmetics";
import {
  aiCosmeticsAvailable,
  aiSkinCatalog,
  aiSkinSelectionError,
} from "../lib/ai-deck-cosmetics";
import { and, asc, eq, inArray } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  aiDecksTable,
  aiDeckCosmeticsTable,
  cardsTable,
  championsTable,
  cosmeticItemsTable,
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
  if (
    !Array.isArray(value) ||
    value.some((id) => typeof id !== "string" || !id.trim())
  )
    return null;
  return value.map((id) => id.trim());
}

function readPayload(value: unknown): {
  name: string;
  description: string;
  championDefinitionId: string | null;
  cardDefinitionIds: string[];
  difficulty: "NORMAL" | "HARD" | "BOSS";
  enabled: boolean;
  displayOrder: number;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const cardDefinitionIds = readCardIds(body.cardDefinitionIds);
  if (!cardDefinitionIds) return null;
  if (
    body.difficulty !== undefined &&
    (typeof body.difficulty !== "string" ||
      !["NORMAL", "HARD", "BOSS"].includes(body.difficulty))
  )
    return null;
  const displayOrder =
    typeof body.displayOrder === "number" && Number.isFinite(body.displayOrder)
      ? Math.trunc(body.displayOrder)
      : 0;
  return {
    name: readString(body.name),
    description: readString(body.description),
    championDefinitionId:
      typeof body.championDefinitionId === "string" &&
      body.championDefinitionId.trim()
        ? body.championDefinitionId.trim()
        : null,
    cardDefinitionIds,
    difficulty: (body.difficulty ?? "NORMAL") as "NORMAL" | "HARD" | "BOSS",
    enabled: readBoolean(body.enabled, false),
    displayOrder,
  };
}

async function validateForSave(
  payload: ReturnType<typeof readPayload>,
): Promise<string | null> {
  if (!payload) return "AI 덱 정보를 확인해 주세요.";
  if (!payload.name || Array.from(payload.name).length > 50)
    return "AI 덱 이름은 1~50자로 입력해 주세요.";
  if (
    payload.cardDefinitionIds.length < AI_DECK_MIN_SIZE ||
    payload.cardDefinitionIds.length > AI_DECK_MAX_SIZE
  ) {
    return `AI 덱 카드는 ${AI_DECK_MIN_SIZE}~${AI_DECK_MAX_SIZE}장이어야 합니다.`;
  }
  const validation = await validateAIDeckReferences(
    payload.championDefinitionId,
    payload.cardDefinitionIds,
  );
  if (!validation.isValid) return validation.invalidReasons.join(" ");
  return null;
}

router.get("/", async (_request, response): Promise<void> => {
  response.json({ decks: await listAIDecks() });
});

router.get("/options", async (_request, response): Promise<void> => {
  const [cards, champions] = await Promise.all([
    db
      .select()
      .from(cardsTable)
      .orderBy(asc(cardsTable.cost), asc(cardsTable.name)),
    db.select().from(championsTable).orderBy(asc(championsTable.name)),
  ]);
  response.json({
    cards: cards.filter((card) => card.status !== "DISABLED"),
    champions: champions.filter((champion) => champion.status !== "DISABLED"),
    cosmetics: await aiSkinCatalog(),
    aiCosmeticsAvailable: await aiCosmeticsAvailable(),
    minCardCount: AI_DECK_MIN_SIZE,
    maxCardCount: AI_DECK_MAX_SIZE,
  });
});

async function skinInput(
  body: Record<string, unknown>,
  existingId?: string,
  championId?: string | null,
  cardIds: string[] = [],
) {
  if (body.cosmeticIds === undefined) return undefined;
  if (
    !Array.isArray(body.cosmeticIds) ||
    body.cosmeticIds.some((id) => typeof id !== "string")
  )
    throw Object.assign(new Error("AI 스킨 선택을 확인해 주세요."), {
      status: 422,
    });
  if (!(await aiCosmeticsAvailable())) {
    if (body.cosmeticIds.length === 0) return undefined;
    throw Object.assign(
      new Error("AI 스킨 저장 테이블이 없습니다. 서버에 0055_ai_deck_cosmetics 마이그레이션을 적용해야 합니다."),
      { status: 503 },
    );
  }
  const error = aiSkinSelectionError(
    body.cosmeticIds,
    await aiSkinCatalog(),
    championId ?? null,
    cardIds,
  );
  if (error) throw Object.assign(new Error(error), { status: 422 });
  return body.cosmeticIds as string[];
}
async function saveSkins(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  deckId: string,
  ids: string[] | undefined,
) {
  if (ids === undefined) return;
  await tx.execute(cosmeticsWriteLock);
  for(const id of ids){const legacy=legacySkinId(id);if(legacy)await syncLegacySkin(legacy,tx);}
  const [deck]=await tx.select().from(aiDecksTable).where(eq(aiDecksTable.id,deckId)).limit(1);
  const items=ids.length?await tx.select().from(cosmeticItemsTable).where(inArray(cosmeticItemsTable.id,ids)):[];
  const error=aiSkinSelectionError(ids,items as import('@workspace/cosmetics').CosmeticItem[],deck?.championDefinitionId??null,deck?.cardDefinitionIds??[]);
  if(error)throw Object.assign(new Error(error),{status:422});
  await tx
    .delete(aiDeckCosmeticsTable)
    .where(eq(aiDeckCosmeticsTable.deckId, deckId));
  if (ids.length)
    await tx
      .insert(aiDeckCosmeticsTable)
      .values(ids.map((cosmeticId) => ({ deckId, cosmeticId })));
}
router.post("/", async (request, response): Promise<void> => {
  const payload = readPayload(request.body);
  const error = await validateForSave(payload);
  if (error) {
    response.status(422).json({ message: error });
    return;
  }
  const ids = await skinInput(
    request.body,
    undefined,
    payload!.championDefinitionId,
    payload!.cardDefinitionIds,
  );
  const deck = await db.transaction(async (tx) => {
    const [deck] = await tx
      .insert(aiDecksTable)
      .values({ id: crypto.randomUUID(), ...payload! })
      .returning();
    await saveSkins(tx, deck!.id, ids);
    return deck;
  });
  response.status(201).json({ deck: deck ? await resolveAIDeck(deck) : null });
});

router.patch("/:id", async (request, response): Promise<void> => {
  const id = request.params.id;
  const [existing] = await db
    .select()
    .from(aiDecksTable)
    .where(eq(aiDecksTable.id, id))
    .limit(1);
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
  const existingSelection = (await resolveAIDeck(existing)).cosmeticIds ?? [];
  const ids = await skinInput(
    {
      ...request.body,
      cosmeticIds: request.body.cosmeticIds ?? existingSelection,
    },
    existing.id,
    payload!.championDefinitionId,
    payload!.cardDefinitionIds,
  );
  const deck = await db.transaction(async (tx) => {
    const [deck] = await tx
      .update(aiDecksTable)
      .set({
        ...payload!,
        difficulty:
          request.body.difficulty === undefined
            ? existing.difficulty
            : payload!.difficulty,
        updatedAt: new Date(),
      })
      .where(eq(aiDecksTable.id, id))
      .returning();
    await saveSkins(tx, id, ids);
    return deck;
  });
  response.json({ deck: deck ? await resolveAIDeck(deck) : null });
});

router.post("/:id/duplicate", async (request, response): Promise<void> => {
  const [source] = await db
    .select()
    .from(aiDecksTable)
    .where(eq(aiDecksTable.id, request.params.id))
    .limit(1);
  if (!source) {
    response.status(404).json({ message: "AI 덱을 찾을 수 없습니다." });
    return;
  }
  const selected = (await aiCosmeticsAvailable())
    ? (await resolveAIDeck(source)).cosmeticIds
    : undefined;
  const deck = await db.transaction(async (tx) => {
    const [deck] = await tx
      .insert(aiDecksTable)
      .values({
        id: crypto.randomUUID(),
        name: `${source.name} Copy`,
        description: source.description,
        championDefinitionId: source.championDefinitionId,
        cardDefinitionIds: source.cardDefinitionIds,
        difficulty: source.difficulty,
        enabled: false,
        displayOrder: source.displayOrder,
      })
      .returning();
    await saveSkins(tx, deck!.id, selected);
    return deck;
  });
  response.status(201).json({ deck: deck ? await resolveAIDeck(deck) : null });
});

router.post("/:id/status", async (request, response): Promise<void> => {
  const enabled =
    request.body &&
    typeof request.body === "object" &&
    typeof request.body.enabled === "boolean"
      ? request.body.enabled
      : null;
  if (enabled === null) {
    response
      .status(400)
      .json({ message: "AI 덱 활성화 상태가 올바르지 않습니다." });
    return;
  }
  const [existing] = await db
    .select()
    .from(aiDecksTable)
    .where(eq(aiDecksTable.id, request.params.id))
    .limit(1);
  if (!existing) {
    response.status(404).json({ message: "AI 덱을 찾을 수 없습니다." });
    return;
  }
  const resolved = await resolveAIDeck(existing);
  if (enabled && !resolved.isValid) {
    response
      .status(422)
      .json({
        message: "유효하지 않은 AI 덱은 활성화할 수 없습니다.",
        invalidReasons: resolved.invalidReasons,
      });
    return;
  }
  const [deck] = await db
    .update(aiDecksTable)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(aiDecksTable.id, existing.id))
    .returning();
  response.json({ deck: deck ? await resolveAIDeck(deck) : null });
});

router.delete("/:id", async (request, response): Promise<void> => {
  const [deleted] = await db
    .delete(aiDecksTable)
    .where(eq(aiDecksTable.id, request.params.id))
    .returning({ id: aiDecksTable.id });
  if (!deleted) {
    response.status(404).json({ message: "AI 덱을 찾을 수 없습니다." });
    return;
  }
  response.status(204).send();
});

router.post("/:id/test", async (request, response): Promise<void> => {
  const [deck] = await db
    .select()
    .from(aiDecksTable)
    .where(eq(aiDecksTable.id, request.params.id))
    .limit(1);
  if (!deck) {
    response.status(404).json({ message: "AI 덱을 찾을 수 없습니다." });
    return;
  }
  const resolved = await resolveAIDeck(deck);
  if (!resolved.isValid) {
    response
      .status(422)
      .json({
        message: "유효하지 않은 AI 덱은 테스트할 수 없습니다.",
        invalidReasons: resolved.invalidReasons,
      });
    return;
  }
  response.json({ deck: resolved });
});

router.use(
  (
    error: Error & { status?: number },
    _request: import("express").Request,
    response: import("express").Response,
    next: import("express").NextFunction,
  ) => {
    if (error.status) {
      response.status(error.status).json({ message: error.message });
      return;
    }
    next(error);
  },
);
export default router;
