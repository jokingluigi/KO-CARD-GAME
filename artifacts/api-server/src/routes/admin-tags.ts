import { Router, type IRouter } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import { cardsTable, cardTagsTable, db } from "@workspace/db";
import { getAuthenticatedUser } from "../lib/auth";
import { availableCardTags } from "../lib/card-tag-catalog";
const router: IRouter = Router();
router.use(async (request, response, next) => {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) { response.status(401).json({ message: "로그인이 필요합니다." }); return; }
    if (user.role !== "ADMIN") { response.status(403).json({ message: "관리자만 접근할 수 있습니다." }); return; }
    response.setHeader("Cache-Control", "no-store"); next();
  } catch (error) { next(error); }
});
function tagName(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
router.get("/", async (_request, response, next) => {
  try {
    const [tags, cards] = await Promise.all([
      availableCardTags(),
      db.select({ id: cardsTable.id, name: cardsTable.name, tags: cardsTable.tags, status: cardsTable.status,
        rarity: cardsTable.rarity, cost: cardsTable.cost, attack: cardsTable.attack, health: cardsTable.health })
        .from(cardsTable).where(eq(cardsTable.cardType, "WRESTLER")).orderBy(asc(cardsTable.name)),
    ]);
    response.json({ tags, cards: cards.map(card => ({ ...card, tags: [...new Set(card.tags.map(tag => tag.trim()).filter(Boolean))] })) });
  } catch (error) { next(error); }
});
router.post("/", async (request, response, next) => {
  try {
    const name = tagName(request.body?.name);
    if (!name) { response.status(400).json({ message: "태그 이름을 입력해 주세요." }); return; }
    const [created] = await db.insert(cardTagsTable).values({ name }).onConflictDoNothing().returning();
    response.status(created ? 201 : 200).json({ name });
  } catch (error) { next(error); }
});
router.patch("/:name/cards/:cardId", async (request, response, next) => {
  try {
    const name = tagName(request.params.name), cardId = String(request.params.cardId);
    if (!name || typeof request.body?.attached !== "boolean") { response.status(400).json({ message: "태그와 연결 여부를 확인해 주세요." }); return; }
    const attached: boolean = request.body.attached;
    const result = await db.transaction(async tx => {
      // Serialize deletion and membership changes for the same tag.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"card-tag:" + name}))`);
      const [registered] = await tx.select().from(cardTagsTable).where(eq(cardTagsTable.name, name));
      const [legacy] = registered ? [] : await tx.select({ id: cardsTable.id }).from(cardsTable).where(sql`EXISTS (SELECT 1 FROM unnest(${cardsTable.tags}) AS t(tag) WHERE btrim(t.tag) = ${name})`).limit(1);
      if (!registered && !legacy) return { error: "태그를 찾을 수 없습니다." } as const;
      const [existing] = await tx.select().from(cardsTable).where(eq(cardsTable.id, cardId));
      if (!existing || existing.cardType !== "WRESTLER") return { error: "선수 카드를 찾을 수 없습니다." } as const;
      await tx.insert(cardTagsTable).values({ name }).onConflictDoNothing();
      const [updated] = await tx.update(cardsTable).set({
        tags: attached ? sql`array_append(${cardsTable.tags}, ${name})` : sql`ARRAY(SELECT t.tag FROM unnest(${cardsTable.tags}) AS t(tag) WHERE btrim(t.tag) <> ${name})`,
        version: sql`${cardsTable.version} + 1`, updatedAt: new Date(),
      }).where(and(eq(cardsTable.id, cardId), attached ? sql`NOT EXISTS (SELECT 1 FROM unnest(${cardsTable.tags}) AS t(tag) WHERE btrim(t.tag) = ${name})` : sql`EXISTS (SELECT 1 FROM unnest(${cardsTable.tags}) AS t(tag) WHERE btrim(t.tag) = ${name})`)).returning();
      return { card: updated ?? existing };
    });
    if ("error" in result) { response.status(404).json({ message: result.error }); return; }
    response.json(result);
  } catch (error) { next(error); }
});
router.delete("/:name", async (request, response, next) => {
  try {
    const name = tagName(request.params.name);
    if (!name) { response.status(400).json({ message: "태그 이름을 확인해 주세요." }); return; }
    const result = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"card-tag:" + name}))`);
      const changed = await tx.update(cardsTable).set({
        tags: sql`ARRAY(SELECT t.tag FROM unnest(${cardsTable.tags}) AS t(tag) WHERE btrim(t.tag) <> ${name})`, version: sql`${cardsTable.version} + 1`, updatedAt: new Date(),
      }).where(sql`EXISTS (SELECT 1 FROM unnest(${cardsTable.tags}) AS t(tag) WHERE btrim(t.tag) = ${name})`).returning({ id: cardsTable.id });
      const removed = await tx.delete(cardTagsTable).where(eq(cardTagsTable.name, name)).returning();
      return { found: changed.length > 0 || removed.length > 0, affectedCards: changed.length };
    });
    if (!result.found) { response.status(404).json({ message: "태그를 찾을 수 없습니다." }); return; }
    response.json({ deleted: true, affectedCards: result.affectedCards });
  } catch (error) { next(error); }
});
export default router;
