import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  db,
  shopDecksTable as products,
  shopDeckPurchasesTable as purchases,
  cardsTable,
  championsTable,
  userChampionCollectionsTable,
} from "@workspace/db";
import { getAuthenticatedUser } from "../lib/auth";
import {
  ShopDeckError,
  parseShopDeck,
  validateShopDeck,
  purchaseShopDeck,
  validateShopDeckCards,
} from "../lib/shop-decks";
import { ShopDeckImageStorage } from "../lib/object-storage";
const router: IRouter = Router(),
  storage = new ShopDeckImageStorage();
router.use(async (req, res, next) => {
  if (!/^\/(?:shop\/decks|admin\/shop-decks)(?:\/|$)/i.test(req.path))
    return next();
  req.authUser = (await getAuthenticatedUser(req)) ?? undefined;
  if (!req.authUser) {
    res.status(401).json({ message: "로그인이 필요합니다." });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  next();
});
router.use("/admin/shop-decks", (req, res, next) => {
  if (req.authUser?.role !== "ADMIN") {
    res.status(403).json({ message: "관리자 권한이 필요합니다." });
    return;
  }
  next();
});
router.get("/admin/shop-decks", async (_req, res) => {
  const [items, cards, champions] = await Promise.all([
    db
      .select()
      .from(products)
      .orderBy(asc(products.displayOrder), asc(products.name)),
    db
      .select()
      .from(cardsTable)
      .orderBy(asc(cardsTable.cost), asc(cardsTable.name)),
    db.select().from(championsTable).orderBy(asc(championsTable.name)),
  ]);
  res.json({ items, cards, champions });
});
async function verifyImage(url: string | null, previous?: string | null) {
  if (!url || url === previous) return;
  const extension = url.split(".").pop()?.toLowerCase(),
    mime =
      extension === "png"
        ? "image/png"
        : extension === "webp"
          ? "image/webp"
          : ["jpg", "jpeg"].includes(extension ?? "")
            ? "image/jpeg"
            : null;
  if (
    !mime ||
    !(await storage.verifyImage(
      url.slice("/api/storage".length),
      mime,
      5 * 1024 * 1024,
    ))
  )
    throw new ShopDeckError(400, "대표 이미지 파일 검증에 실패했습니다.");
}
router.post("/admin/shop-decks", async (req, res) => {
  const input = parseShopDeck(req.body);
  await validateShopDeck(input);
  await verifyImage(input.imageUrl);
  const [item] = await db
    .insert(products)
    .values({ id: randomUUID(), ...input })
    .returning();
  res.status(201).json({ item });
});
router.patch("/admin/shop-decks/:id", async (req, res) => {
  const input = parseShopDeck(req.body),
    [old] = await db
      .select()
      .from(products)
      .where(eq(products.id, req.params.id));
  if (!old) throw new ShopDeckError(404, "덱 상품을 찾을 수 없습니다.");
  await validateShopDeck(input);
  await verifyImage(input.imageUrl, old.imageUrl);
  const [item] = await db
    .update(products)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(products.id, old.id))
    .returning();
  res.json({ item });
});
router.delete("/admin/shop-decks/:id", async (req, res) => {
  const id = String(req.params.id);
  await db.transaction(async tx => {
    const [item] = await tx.select().from(products).where(eq(products.id, id)).for("update");
    if (!item) throw new ShopDeckError(404, "덱 상품을 찾을 수 없습니다.");
    const [receipt] = await tx.select({ id: purchases.id }).from(purchases).where(eq(purchases.productId, id)).limit(1);
    if (receipt) throw new ShopDeckError(409, "구매 기록이 있는 덱 상품은 삭제할 수 없습니다. 판매 중지를 사용해 주세요.");
    await tx.delete(products).where(eq(products.id, id));
  });
  res.json({ deleted: true, id });
});
// Deactivation must remain possible after a source card was deleted or unpublished.
router.post("/admin/shop-decks/:id/disable", async (req, res) => {
  const [item] = await db
    .update(products)
    .set({ enabled: false, updatedAt: new Date() })
    .where(eq(products.id, req.params.id))
    .returning();
  if (!item) throw new ShopDeckError(404, "덱 상품을 찾을 수 없습니다.");
  res.json({ item });
});
const mimeTypes: Record<string, string[]> = {
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/jpeg": ["jpg", "jpeg"],
};
router.post("/admin/shop-decks/uploads", async (req, res) => {
  const { name, size, contentType } = req.body ?? {},
    ext = typeof name === "string" ? name.split(".").pop()?.toLowerCase() : "";
  if (
    typeof contentType !== "string" ||
    !Object.hasOwn(mimeTypes, contentType) ||
    !mimeTypes[contentType].includes(ext ?? "") ||
    !Number.isInteger(size) ||
    size <= 0 ||
    size > 5 * 1024 * 1024
  )
    throw new ShopDeckError(400, "PNG·WebP·JPEG 최대 5MB만 지원합니다.");
  res.json(await storage.createUpload(ext!));
});
router.post("/admin/shop-decks/uploads/complete", async (req, res) => {
  const { objectPath, contentType } = req.body ?? {};
  if (
    typeof objectPath !== "string" ||
    !/^\/objects\/uploads\/shop-decks\/[a-zA-Z0-9._-]+$/.test(objectPath) ||
    typeof contentType !== "string" ||
    !Object.hasOwn(mimeTypes, contentType) ||
    !(await storage.verifyImage(objectPath, contentType, 5 * 1024 * 1024))
  )
    throw new ShopDeckError(400, "이미지 파일 검증에 실패했습니다.");
  res.json({ imageUrl: `/api/storage${objectPath}` });
});
router.get("/shop/decks", async (req, res) => {
  const [items, owned, champions] = await Promise.all([
    db
      .select()
      .from(products)
      .where(eq(products.enabled, true))
      .orderBy(asc(products.displayOrder), asc(products.name)),
    db
      .select({
        productId: purchases.productId,
        deckId: purchases.deckId,
        createdAt: purchases.createdAt,
      })
      .from(purchases)
      .where(eq(purchases.userId, req.authUser!.id)),
    db
      .select({
        id: championsTable.id,
        name: championsTable.name,
        imageUrl: championsTable.imageUrl,
      })
      .from(userChampionCollectionsTable)
      .innerJoin(
        championsTable,
        eq(
          championsTable.id,
          userChampionCollectionsTable.championDefinitionId,
        ),
      )
      .where(
        and(
          eq(userChampionCollectionsTable.userId, req.authUser!.id),
          eq(userChampionCollectionsTable.owned, true),
          inArray(championsTable.status, ["PUBLISHED", "DRAFT"]),
        ),
      ),
  ]);
  const ids = [...new Set(items.flatMap((p) => p.cardDefinitionIds))],
    cids = [
      ...new Set(
        items
          .map((p) => p.recommendedChampionId)
          .filter((id): id is string => !!id),
      ),
    ];
  const [cards, recommended] = await Promise.all([
    ids.length
      ? db.select().from(cardsTable).where(inArray(cardsTable.id, ids))
      : [],
    cids.length
      ? db
          .select({
            id: championsTable.id,
            name: championsTable.name,
            imageUrl: championsTable.imageUrl,
            status: championsTable.status,
          })
          .from(championsTable)
          .where(inArray(championsTable.id, cids))
      : ([] as Array<{
          id: string;
          name: string;
          imageUrl: string | null;
          status: string;
        }>),
  ]);
  res.json({
    champions,
    items: items.map((item) => {
      const rows = cards.filter((c) => item.cardDefinitionIds.includes(c.id)),
        champion =
          recommended.find((c) => c.id === item.recommendedChampionId) ?? null;
      let unavailable: string | null = null;
      try {
        validateShopDeckCards(item, rows);
        if (
          item.recommendedChampionId &&
          (!champion ||
            !(
              champion.status === "PUBLISHED" ||
              (item.allowUnpublished && champion.status === "DRAFT")
            ))
        )
          throw new Error("추천 챔피언을 사용할 수 없습니다.");
      } catch (e) {
        unavailable =
          e instanceof Error ? e.message : "현재 구매할 수 없습니다.";
      }
      return {
        ...item,
        cards: unavailable ? [] : rows,
        recommendedChampion:
          champion && !unavailable
            ? {
                id: champion.id,
                name: champion.name,
                imageUrl: champion.imageUrl,
              }
            : null,
        purchase: owned.find((p) => p.productId === item.id) ?? null,
        unavailable,
      };
    }),
  });
});
router.post("/shop/decks/:id/purchase", async (req, res) =>
  res.json(
    await purchaseShopDeck(
      req.authUser!.id,
      req.params.id,
      req.body?.championDefinitionId ?? null,
    ),
  ),
);
router.use(
  (
    error: unknown,
    _req: import("express").Request,
    res: import("express").Response,
    next: import("express").NextFunction,
  ) => {
    if (error instanceof ShopDeckError) {
      res.status(error.status).json({ message: error.message });
      return;
    }
    next(error);
  },
);
export default router;
