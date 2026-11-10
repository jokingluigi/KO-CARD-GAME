import { Router, type IRouter } from "express";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { cardsTable, cardTagsTable, db } from "@workspace/db";
import { getAuthenticatedUser } from "../lib/auth";
import { availableCardTags, cardTagLabels } from "../lib/card-tag-catalog";
const router: IRouter = Router();
router.use(async (request, response, next) => {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      response.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }
    if (user.role !== "ADMIN") {
      response.status(403).json({ message: "관리자만 접근할 수 있습니다." });
      return;
    }
    response.setHeader("Cache-Control", "no-store");
    next();
  } catch (error) {
    next(error);
  }
});
function tagName(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
router.get("/", async (_request, response, next) => {
  try {
    const [tags, cards, labels] = await Promise.all([
      availableCardTags(),
      db
        .select({
          id: cardsTable.id,
          name: cardsTable.name,
          tags: cardsTable.tags,
          status: cardsTable.status,
          rarity: cardsTable.rarity,
          cost: cardsTable.cost,
          attack: cardsTable.attack,
          health: cardsTable.health,
          imageUrl: cardsTable.imageUrl,
        })
        .from(cardsTable)
        .where(eq(cardsTable.cardType, "WRESTLER"))
        .orderBy(asc(cardsTable.name)),
      cardTagLabels(),
    ]);
    response.json({
      tags,
      labels,
      cards: cards.map((card) => ({
        ...card,
        tags: [...new Set(card.tags.map((tag) => tag.trim()).filter(Boolean))],
      })),
    });
  } catch (error) {
    next(error);
  }
});
router.post("/", async (request, response, next) => {
  try {
    const name = tagName(request.body?.name);
    if (!name || name.length > 100 || /[\u0000-\u001f]/u.test(name)) {
      response
        .status(400)
        .json({ message: "태그 이름은 1~100자로 입력하세요." });
      return;
    }
    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('card-tags:catalog'))`,
      );
      const [labelConflict] = await tx
        .select()
        .from(cardTagsTable)
        .where(
          and(
            eq(cardTagsTable.displayName, name),
            sql`${cardTagsTable.name} <> ${name}`,
          ),
        )
        .limit(1);
      if (labelConflict) return { conflict: true } as const;
      const [created] = await tx
        .insert(cardTagsTable)
        .values({ name })
        .onConflictDoNothing()
        .returning();
      return { created: !!created };
    });
    if ("conflict" in result) {
      response.status(409).json({ message: "이미 사용 중인 태그 이름입니다." });
      return;
    }
    response.status(result.created ? 201 : 200).json({ name });
  } catch (error) {
    next(error);
  }
});
router.patch("/:name", async (request, response, next) => {
  try {
    const name = tagName(request.params.name),
      label = tagName(request.body?.displayName);
    if (
      !name ||
      !label ||
      label.length > 100 ||
      /[\u0000-\u001f]/u.test(label)
    ) {
      response
        .status(400)
        .json({ message: "태그 이름은 1~100자로 입력하세요." });
      return;
    }
    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('card-tags:catalog'))`,
      );
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${"card-tag:" + name}))`,
      );
      const [registered] = await tx
        .select()
        .from(cardTagsTable)
        .where(eq(cardTagsTable.name, name));
      const [legacy] = registered
        ? []
        : await tx
            .select({ id: cardsTable.id })
            .from(cardsTable)
            .where(
              sql`EXISTS (SELECT 1 FROM unnest(${cardsTable.tags}) AS t(tag) WHERE btrim(t.tag) = ${name})`,
            )
            .limit(1);
      if (!registered && !legacy)
        return { status: 404, message: "태그를 찾을 수 없습니다." } as const;
      const [conflict] = await tx
        .select()
        .from(cardTagsTable)
        .where(
          sql`${cardTagsTable.name} <> ${name} AND (${cardTagsTable.name} = ${label} OR coalesce(${cardTagsTable.displayName},${cardTagsTable.name}) = ${label})`,
        )
        .limit(1);
      const [legacyConflict] =
        label === name
          ? []
          : await tx
              .select({ id: cardsTable.id })
              .from(cardsTable)
              .where(
                sql`EXISTS (SELECT 1 FROM unnest(${cardsTable.tags}) AS t(tag) WHERE btrim(t.tag) = ${label})`,
              )
              .limit(1);
      if (conflict || legacyConflict)
        return {
          status: 409,
          message: "이미 사용 중인 태그 이름입니다. 다른 이름을 입력하세요.",
        } as const;
      await tx
        .insert(cardTagsTable)
        .values({ name, displayName: label })
        .onConflictDoUpdate({
          target: cardTagsTable.name,
          set: { displayName: label },
        });
      return { name, displayName: label };
    });
    if ("status" in result) {
      response.status(result.status ?? 400).json({ message: result.message });
      return;
    }
    response.json(result);
  } catch (error) {
    next(error);
  }
});
router.patch("/:name/cards", async (request, response, next) => {
  try {
    const name = tagName(request.params.name),
      raw = request.body?.cardIds,
      attached = request.body?.attached;
    if (
      !name ||
      typeof attached !== "boolean" ||
      !Array.isArray(raw) ||
      raw.length === 0 ||
      raw.length > 1000 ||
      raw.some((id) => typeof id !== "string" || !id || id.length > 200)
    ) {
      response
        .status(400)
        .json({ message: "선수 카드 1~1000장과 연결 여부를 확인하세요." });
      return;
    }
    const ids = [...new Set<string>(raw)];
    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${"card-tag:" + name}))`,
      );
      const [registered] = await tx
        .select()
        .from(cardTagsTable)
        .where(eq(cardTagsTable.name, name));
      const [legacy] = registered
        ? []
        : await tx
            .select({ id: cardsTable.id })
            .from(cardsTable)
            .where(
              sql`EXISTS (SELECT 1 FROM unnest(${cardsTable.tags}) AS t(tag) WHERE btrim(t.tag) = ${name})`,
            )
            .limit(1);
      if (!registered && !legacy)
        return { error: "태그를 찾을 수 없습니다." } as const;
      const candidates = await tx
        .select({ id: cardsTable.id })
        .from(cardsTable)
        .where(
          and(inArray(cardsTable.id, ids), eq(cardsTable.cardType, "WRESTLER")),
        );
      if (candidates.length !== ids.length)
        return {
          error: "선수 카드 목록이 변경됐습니다. 새로고침 후 다시 선택하세요.",
        } as const;
      await tx.insert(cardTagsTable).values({ name }).onConflictDoNothing();
      const changed = await tx
        .update(cardsTable)
        .set({
          tags: attached
            ? sql`array_append(${cardsTable.tags},${name})`
            : sql`ARRAY(SELECT t.tag FROM unnest(${cardsTable.tags}) AS t(tag) WHERE btrim(t.tag) <> ${name})`,
          version: sql`${cardsTable.version}+1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            inArray(cardsTable.id, ids),
            attached
              ? sql`NOT EXISTS (SELECT 1 FROM unnest(${cardsTable.tags}) AS t(tag) WHERE btrim(t.tag) = ${name})`
              : sql`EXISTS (SELECT 1 FROM unnest(${cardsTable.tags}) AS t(tag) WHERE btrim(t.tag) = ${name})`,
          ),
        )
        .returning({ id: cardsTable.id });
      return { affectedCards: changed.length, selectedCards: ids.length };
    });
    if ("error" in result) {
      response.status(404).json({ message: result.error });
      return;
    }
    response.json(result);
  } catch (error) {
    next(error);
  }
});
router.patch("/:name/cards/:cardId", async (request, response, next) => {
  try {
    const name = tagName(request.params.name),
      cardId = String(request.params.cardId);
    if (!name || typeof request.body?.attached !== "boolean") {
      response
        .status(400)
        .json({ message: "태그와 연결 여부를 확인해 주세요." });
      return;
    }
    const attached: boolean = request.body.attached;
    const result = await db.transaction(async (tx) => {
      // Serialize deletion and membership changes for the same tag.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${"card-tag:" + name}))`,
      );
      const [registered] = await tx
        .select()
        .from(cardTagsTable)
        .where(eq(cardTagsTable.name, name));
      const [legacy] = registered
        ? []
        : await tx
            .select({ id: cardsTable.id })
            .from(cardsTable)
            .where(
              sql`EXISTS (SELECT 1 FROM unnest(${cardsTable.tags}) AS t(tag) WHERE btrim(t.tag) = ${name})`,
            )
            .limit(1);
      if (!registered && !legacy)
        return { error: "태그를 찾을 수 없습니다." } as const;
      const [existing] = await tx
        .select()
        .from(cardsTable)
        .where(eq(cardsTable.id, cardId));
      if (!existing || existing.cardType !== "WRESTLER")
        return { error: "선수 카드를 찾을 수 없습니다." } as const;
      await tx.insert(cardTagsTable).values({ name }).onConflictDoNothing();
      const [updated] = await tx
        .update(cardsTable)
        .set({
          tags: attached
            ? sql`array_append(${cardsTable.tags}, ${name})`
            : sql`ARRAY(SELECT t.tag FROM unnest(${cardsTable.tags}) AS t(tag) WHERE btrim(t.tag) <> ${name})`,
          version: sql`${cardsTable.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(cardsTable.id, cardId),
            attached
              ? sql`NOT EXISTS (SELECT 1 FROM unnest(${cardsTable.tags}) AS t(tag) WHERE btrim(t.tag) = ${name})`
              : sql`EXISTS (SELECT 1 FROM unnest(${cardsTable.tags}) AS t(tag) WHERE btrim(t.tag) = ${name})`,
          ),
        )
        .returning();
      return { card: updated ?? existing };
    });
    if ("error" in result) {
      response.status(404).json({ message: result.error });
      return;
    }
    response.json(result);
  } catch (error) {
    next(error);
  }
});
router.delete("/:name", async (request, response, next) => {
  try {
    const name = tagName(request.params.name);
    if (!name) {
      response.status(400).json({ message: "태그 이름을 확인해 주세요." });
      return;
    }
    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${"card-tag:" + name}))`,
      );
      const changed = await tx
        .update(cardsTable)
        .set({
          tags: sql`ARRAY(SELECT t.tag FROM unnest(${cardsTable.tags}) AS t(tag) WHERE btrim(t.tag) <> ${name})`,
          version: sql`${cardsTable.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          sql`EXISTS (SELECT 1 FROM unnest(${cardsTable.tags}) AS t(tag) WHERE btrim(t.tag) = ${name})`,
        )
        .returning({ id: cardsTable.id });
      const removed = await tx
        .delete(cardTagsTable)
        .where(eq(cardTagsTable.name, name))
        .returning();
      return {
        found: changed.length > 0 || removed.length > 0,
        affectedCards: changed.length,
      };
    });
    if (!result.found) {
      response.status(404).json({ message: "태그를 찾을 수 없습니다." });
      return;
    }
    response.json({ deleted: true, affectedCards: result.affectedCards });
  } catch (error) {
    next(error);
  }
});
export default router;
