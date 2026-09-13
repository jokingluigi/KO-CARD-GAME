import { and, asc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { cardSkinDefinitionsTable, cardsTable, db } from "@workspace/db";
import { getAuthenticatedUser } from "../lib/auth";

const router: IRouter = Router();

function requireAdmin(request: Request, response: Response) {
  if (request.authUser?.role === "ADMIN") return true;
  response.status(request.authUser ? 403 : 401).json({ message: request.authUser ? "관리자 권한이 필요합니다." : "로그인이 필요합니다." });
  return false;
}

router.use(async (request, response, next) => {
  try {
    request.authUser = (await getAuthenticatedUser(request)) ?? undefined;
    next();
  } catch (error) {
    next(error);
  }
});

function parseInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const text = (key: string) => typeof input[key] === "string" ? input[key].trim() : "";
  const cardDefinitionId = text("cardDefinitionId");
  const name = text("name");
  if (!cardDefinitionId || !name || name.length > 120) return null;
  return {
    cardDefinitionId,
    name,
    description: text("description"),
    imageAssetId: text("imageAssetId") || null,
    imageUrl: text("imageUrl") || null,
  };
}

router.get("/", async (request, response) => {
  if (!requireAdmin(request, response)) return;
  const [skins, cards] = await Promise.all([
    db.select({ skin: cardSkinDefinitionsTable, cardName: cardsTable.name })
      .from(cardSkinDefinitionsTable)
      .innerJoin(cardsTable, eq(cardsTable.id, cardSkinDefinitionsTable.cardDefinitionId))
      .orderBy(asc(cardSkinDefinitionsTable.name)),
    db.select({ id: cardsTable.id, name: cardsTable.name }).from(cardsTable).where(and(
      eq(cardsTable.status, "PUBLISHED"),
      eq(cardsTable.isToken, false),
      eq(cardsTable.isChampionToken, false),
    )).orderBy(asc(cardsTable.name)),
  ]);
  response.json({ skins: skins.map(({ skin, cardName }) => ({ ...skin, cardName })), cards });
});

router.post("/", async (request, response) => {
  if (!requireAdmin(request, response)) return;
  const input = parseInput(request.body);
  if (!input) { response.status(400).json({ message: "Skin 입력값을 확인해 주세요." }); return; }
  const [card] = await db.select({ id: cardsTable.id }).from(cardsTable).where(and(
    eq(cardsTable.id, input.cardDefinitionId),
    eq(cardsTable.status, "PUBLISHED"),
    eq(cardsTable.isToken, false),
    eq(cardsTable.isChampionToken, false),
  )).limit(1);
  if (!card) { response.status(422).json({ message: "공개된 일반 카드만 Skin을 연결할 수 있습니다." }); return; }
  const [skin] = await db.insert(cardSkinDefinitionsTable).values({
    id: randomUUID(), ...input, status: "DRAFT", version: 1,
  }).returning();
  response.status(201).json({ skin });
});

router.patch("/:id", async (request, response) => {
  if (!requireAdmin(request, response)) return;
  const input = parseInput(request.body);
  if (!input) { response.status(400).json({ message: "Skin 입력값을 확인해 주세요." }); return; }
  const [skin] = await db.update(cardSkinDefinitionsTable).set({
    ...input, version: sql`${cardSkinDefinitionsTable.version} + 1`, updatedAt: new Date(),
  }).where(eq(cardSkinDefinitionsTable.id, request.params.id)).returning();
  if (!skin) { response.status(404).json({ message: "Skin을 찾을 수 없습니다." }); return; }
  response.json({ skin });
});

router.post("/:id/status", async (request, response) => {
  if (!requireAdmin(request, response)) return;
  const status = request.body?.status;
  if (status !== "DRAFT" && status !== "PUBLISHED" && status !== "DISABLED") {
    response.status(400).json({ message: "Skin 상태를 확인해 주세요." });
    return;
  }
  const [skin] = await db.update(cardSkinDefinitionsTable).set({
    status, version: sql`${cardSkinDefinitionsTable.version} + 1`, updatedAt: new Date(),
  }).where(eq(cardSkinDefinitionsTable.id, request.params.id)).returning();
  if (!skin) { response.status(404).json({ message: "Skin을 찾을 수 없습니다." }); return; }
  response.json({ skin });
});

router.delete("/:id", async (request, response) => {
  if (!requireAdmin(request, response)) return;
  const [skin] = await db.delete(cardSkinDefinitionsTable).where(eq(cardSkinDefinitionsTable.id, request.params.id)).returning();
  if (!skin) { response.status(404).json({ message: "Skin을 찾을 수 없습니다." }); return; }
  response.status(204).end();
});

export default router;