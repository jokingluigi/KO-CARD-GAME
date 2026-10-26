import {
  legacySkinItem,
  legacySkinId,
  syncLegacySkin,
  grantLegacySkin,
  revokeLegacySkin,
  deleteLegacySkin,
} from "../lib/legacy-skin-cosmetics";
import { AdminDeletionError } from "../lib/admin-content-deletion";
import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { and, eq, asc, ilike, or, inArray, sql } from "drizzle-orm";
import {
  db,
  cosmeticItemsTable as items,
  userCosmeticsTable as owned,
  equippedCosmeticsTable as equips,
  cosmeticAuditTable as audit,
  usersTable,
  cardsTable,
  cardSkinDefinitionsTable,
  championsTable,
  packDefinitionsTable,
} from "@workspace/db";
import { getAuthenticatedUser } from "../lib/auth";
import {
  COSMETIC_TYPES,
  validImageUrl,
  CosmeticError,
  loadCosmetics,
  listOwnedCosmetics,
  equipCosmetic,
  validateCosmeticTarget,
  cosmeticsWriteLock,
  type CosmeticItem,
} from "../lib/cosmetics";
import { CosmeticImageStorage } from "../lib/object-storage";
const router: IRouter = Router();
const storage = new CosmeticImageStorage();
router.use(async (req, res, next) => {
  if (!/^\/(?:cosmetics(?:\/|$)|admin\/cosmetics(?:\/|$))/i.test(req.path)) {
    next();
    return;
  }
  try {
    req.authUser = (await getAuthenticatedUser(req)) ?? undefined;
    if (!req.authUser) {
      res.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }
    next();
  } catch (e) {
    next(e);
  }
});
router.get("/cosmetics", async (req, res) => {
  const inventory = await listOwnedCosmetics(req.authUser!.id);
  const cardIds = inventory
      .filter((o) => o.item.type === "CARD_SKIN")
      .map((o) => o.item.targetId!)
      .filter(Boolean),
    championIds = inventory
      .filter((o) => o.item.type === "CHAMPION_SKIN")
      .map((o) => o.item.targetId!)
      .filter(Boolean);
  const [cards, champions] = await Promise.all([
    cardIds.length
      ? db.select().from(cardsTable).where(inArray(cardsTable.id, cardIds))
      : [],
    championIds.length
      ? db
          .select()
          .from(championsTable)
          .where(inArray(championsTable.id, championIds))
      : [],
  ]);
  res.json({
    owned: inventory,
    loadout: await loadCosmetics(req.authUser!.id),
    cards,
    champions,
  });
});
router.put("/cosmetics/equipment", async (req, res) => {
  const { slot, cosmeticId } = req.body ?? {};
  if (
    typeof slot !== "string" ||
    (cosmeticId !== null && typeof cosmeticId !== "string")
  ) {
    res.status(400).json({ message: "장착 입력값을 확인해 주세요." });
    return;
  }
  res.json({
    loadout: await equipCosmetic(req.authUser!.id, slot, cosmeticId),
  });
});
router.use("/admin/cosmetics", (req, res, next) => {
  if (req.authUser?.role !== "ADMIN") {
    res.status(403).json({ message: "관리자 권한이 필요합니다." });
    return;
  }
  next();
});
router.get("/admin/cosmetics", async (_req, res) => {
  const [catalog, cards, champions, legacy] = await Promise.all([
    db.select().from(items).orderBy(asc(items.sortOrder), asc(items.name)),
    db
      .select()
      .from(cardsTable)
      .where(
        and(
          inArray(cardsTable.cardType, ["WRESTLER", "TECHNIQUE"]),
          eq(cardsTable.isToken, false),
          eq(cardsTable.isChampionToken, false),
        ),
      )
      .orderBy(asc(cardsTable.name)),
    db.select().from(championsTable).orderBy(asc(championsTable.name)),
    db
      .select()
      .from(cardSkinDefinitionsTable)
      .orderBy(asc(cardSkinDefinitionsTable.name)),
  ]);
  res.json({
    items: [
      ...catalog.filter((item) => !legacySkinId(item.id)),
      ...legacy.map((skin) => ({
        ...legacySkinItem(skin),
        sortOrder:
          catalog.find((item) => item.id === `pack-skin:${skin.id}`)
            ?.sortOrder ?? 0,
      })),
    ],
    cards,
    champions,
  });
});
function parseItem(body: unknown, legacy = false) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new CosmeticError(400, "입력값을 확인해 주세요.");
  const b = body as Record<string, unknown>;
  if (
    !COSMETIC_TYPES.includes(b.type as CosmeticItem["type"]) ||
    typeof b.name !== "string" ||
    !b.name.trim() ||
    b.name.length > 120 ||
    typeof b.description !== "string" ||
    b.description.length > 2000 ||
    typeof b.isActive !== "boolean" ||
    !Number.isInteger(b.sortOrder) ||
    Math.abs(Number(b.sortOrder)) > 1000000
  )
    throw new CosmeticError(400, "이름·유형·정렬 순서를 확인해 주세요.");
  const targetId =
    typeof b.targetId === "string" && b.targetId.length <= 256 && b.targetId
      ? b.targetId
      : null;
  const assets = b.imageAssets;
  if (!assets || typeof assets !== "object" || Array.isArray(assets))
    throw new CosmeticError(400, "이미지를 등록해 주세요.");
  const imageAssets: Record<string, string> = {};
  for (const [key, url] of Object.entries(assets)) {
    if (
      (!["art", "portrait", "intro", "awakened"].includes(key) &&
        !/^token:[a-zA-Z0-9_-]{1,256}$/.test(key)) ||
      !validImageUrl(url)
    )
      throw new CosmeticError(400, "이미지 주소가 올바르지 않습니다.");
    imageAssets[key] = url;
  }
  if (
    (!Object.keys(imageAssets).length && !legacy) ||
    (b.type !== "CHAMPION_SKIN" && !imageAssets.art && !legacy)
  )
    throw new CosmeticError(400, "기본 이미지를 등록해 주세요.");
  if (
    b.type !== "CHAMPION_SKIN" &&
    Object.keys(imageAssets).some((k) => k !== "art")
  )
    throw new CosmeticError(400, "챔피언 전용 이미지 슬롯입니다.");
  return {
    type: b.type as CosmeticItem["type"],
    name: b.name.trim(),
    description: b.description,
    targetId,
    imageAssets,
    isActive: b.isActive,
    sortOrder: Number(b.sortOrder),
  };
}
async function validateTokenAssets(input: ReturnType<typeof parseItem>) {
  const tokenKeys = Object.keys(input.imageAssets).filter((key) =>
    key.startsWith("token:"),
  );
  if (!tokenKeys.length) return;
  if (input.type !== "CHAMPION_SKIN")
    throw new CosmeticError(
      422,
      "챔피언 스킨에만 토큰 외형을 연결할 수 있습니다.",
    );
  const [row] = await db
    .select({ tokenId: championsTable.championTokenDefinitionId })
    .from(championsTable)
    .innerJoin(
      cardsTable,
      eq(cardsTable.id, championsTable.championTokenDefinitionId),
    )
    .where(
      and(
        eq(championsTable.id, input.targetId ?? ""),
        eq(cardsTable.isChampionToken, true),
      ),
    )
    .limit(1);
  if (
    !row?.tokenId ||
    tokenKeys.length !== 1 ||
    tokenKeys[0] !== `token:${row.tokenId}`
  )
    throw new CosmeticError(
      422,
      "선택한 챔피언에 연결된 챔피언 토큰만 등록할 수 있습니다.",
    );
}
async function verifyCatalogAssets(
  assets: Record<string, string>,
  known = new Set<string>(),
) {
  for (const url of new Set(Object.values(assets))) {
    if (known.has(url)) continue;
    if (!url.startsWith("/api/storage/objects/uploads/cosmetics/"))
      throw new CosmeticError(
        400,
        "전용 저장소에 업로드한 이미지만 등록할 수 있습니다.",
      );
    const path = url.slice("/api/storage".length),
      extension = path.toLowerCase().split(".").pop();
    const contentType =
      extension === "png"
        ? "image/png"
        : extension === "webp"
          ? "image/webp"
          : ["jpg", "jpeg"].includes(extension ?? "")
            ? "image/jpeg"
            : null;
    if (
      !contentType ||
      !(await storage.verifyImage(path, contentType, 5 * 1024 * 1024))
    )
      throw new CosmeticError(
        400,
        "검증된 꾸미기 이미지만 저장할 수 있습니다.",
      );
  }
}
router.post("/admin/cosmetics/items", async (req, res) => {
  const input = parseItem(req.body);
  await validateTokenAssets(input);
  await validateCosmeticTarget(input.type, input.targetId);
  await verifyCatalogAssets(input.imageAssets);
  // A new card skin uses the original pack catalog, so the same item can be
  // selected by existing pack settings and equipped through the unified catalog.
  if (input.type === "CARD_SKIN") {
    const item = await db.transaction(async (tx) => {
      await tx.execute(cosmeticsWriteLock);
      const id = randomUUID();
      await tx.insert(cardSkinDefinitionsTable).values({
        id,
        cardDefinitionId: input.targetId!,
        name: input.name,
        description: input.description,
        imageUrl: input.imageAssets.art!,
        status: input.isActive ? "PUBLISHED" : "DRAFT",
        version: 1,
      });
      const normalized = await syncLegacySkin(id, tx);
      await tx
        .update(items)
        .set({ sortOrder: input.sortOrder })
        .where(eq(items.id, normalized.id));
      return { ...normalized, sortOrder: input.sortOrder };
    });
    res.status(201).json({ item });
    return;
  }
  const [item] = await db
    .insert(items)
    .values({ id: randomUUID(), ...input })
    .returning();
  res.status(201).json({ item });
});
router.patch("/admin/cosmetics/items/:id", async (req, res) => {
  const legacyId = legacySkinId(String(req.params.id));
  const input = parseItem(req.body, !!legacyId);
  if (legacyId) {
    if (input.type !== "CARD_SKIN" || !input.targetId)
      throw new CosmeticError(
        422,
        "카드팩 스킨은 카드 스킨 유형을 유지해야 합니다.",
      );
    await validateCosmeticTarget(input.type, input.targetId);
    const [previous] = await db
      .select()
      .from(cardSkinDefinitionsTable)
      .where(eq(cardSkinDefinitionsTable.id, legacyId));
    if (!previous) throw new CosmeticError(404, "스킨을 찾을 수 없습니다.");
    await verifyCatalogAssets(
      input.imageAssets,
      new Set(previous.imageUrl ? [previous.imageUrl] : []),
    );
    const requestedStatus = req.body.publicationStatus;
    if (
      requestedStatus !== undefined &&
      !["DRAFT", "PUBLISHED", "DISABLED"].includes(requestedStatus)
    )
      throw new CosmeticError(400, "스킨 공개 상태를 확인해 주세요.");
    const status = input.isActive
      ? "PUBLISHED"
      : requestedStatus === "DRAFT" ||
          (!requestedStatus && previous.status === "DRAFT")
        ? "DRAFT"
        : "DISABLED";
    if (!["DRAFT", "PUBLISHED", "DISABLED"].includes(status))
      throw new CosmeticError(400, "스킨 공개 상태를 확인해 주세요.");
    const item = await db.transaction(async (tx) => {
      await tx.execute(cosmeticsWriteLock);
      const [updated] = await tx
        .update(cardSkinDefinitionsTable)
        .set({
          name: input.name,
          description: input.description,
          cardDefinitionId: input.targetId!,
          imageUrl: input.imageAssets.art ?? null,
          status,
          version: sql`${cardSkinDefinitionsTable.version}+1`,
          updatedAt: new Date(),
        })
        .where(eq(cardSkinDefinitionsTable.id, legacyId))
        .returning();
      if (!updated) throw new CosmeticError(404, "스킨을 찾을 수 없습니다.");
      const normalized = await syncLegacySkin(legacyId, tx);
      await tx
        .update(items)
        .set({ sortOrder: input.sortOrder })
        .where(eq(items.id, normalized.id));
      return { ...normalized, sortOrder: input.sortOrder };
    });
    res.json({ item });
    return;
  }
  await validateTokenAssets(input);
  const [previous] = await db
    .select()
    .from(items)
    .where(eq(items.id, req.params.id));
  if (!previous) throw new CosmeticError(404, "아이템을 찾을 수 없습니다.");
  if (input.isActive) await validateCosmeticTarget(input.type, input.targetId);
  await verifyCatalogAssets(
    input.imageAssets,
    new Set(
      previous.isActive || !input.isActive
        ? Object.values(previous.imageAssets)
        : [],
    ),
  );
  const item = await db.transaction(async (tx) => {
    await tx.execute(cosmeticsWriteLock);
    const [old] = await tx
      .select()
      .from(items)
      .where(eq(items.id, req.params.id));
    if (!old) throw new CosmeticError(404, "아이템을 찾을 수 없습니다.");
    if (old.type !== input.type || old.targetId !== input.targetId)
      await tx.delete(equips).where(eq(equips.cosmeticId, old.id));
    const [updated] = await tx
      .update(items)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(items.id, old.id))
      .returning();
    return updated;
  });
  res.json({ item });
});
router.delete("/admin/cosmetics/items/:id", async (req, res) => {
  const id = String(req.params.id);
  const legacyId = legacySkinId(id);
  if (legacyId) {
    await deleteLegacySkin(legacyId, req.authUser!.id);
    res.json({ deleted: true, id });
    return;
  }
  await db.transaction(async (tx) => {
    await tx.execute(cosmeticsWriteLock);
    const [item] = await tx
      .select()
      .from(items)
      .where(eq(items.id, id))
      .for("update");
    if (!item) throw new CosmeticError(404, "아이템을 찾을 수 없습니다.");
    const packs = await tx
      .select({ name: packDefinitionsTable.name })
      .from(packDefinitionsTable)
      .where(
        and(
          sql`${id} = ANY(${packDefinitionsTable.skinPool})`,
          sql`${packDefinitionsTable.deletedAt} IS NULL`,
        ),
      );
    if (packs.length)
      throw new CosmeticError(
        409,
        `다음 팩의 스킨 풀에서 먼저 제거해 주세요: ${packs.map((pack) => pack.name).join(", ")}`,
      );
    await tx.delete(equips).where(eq(equips.cosmeticId, id));
    await tx.delete(owned).where(eq(owned.cosmeticId, id));
    await tx.delete(items).where(eq(items.id, id));
    await tx.insert(audit).values({
      id: randomUUID(),
      actorId: req.authUser!.id,
      cosmeticId: id,
      action: "DELETE",
    });
  });
  // Image files and frozen match/pack receipts are retained for existing games/history.
  res.json({ deleted: true, id });
});
router.get("/admin/cosmetics/users", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q.length < 2 || q.length > 100) {
    res.json({ users: [] });
    return;
  }
  const escaped = q.replace(/[\\%_]/g, "\\$&");
  const users = await db
    .select({ id: usersTable.id, nickname: usersTable.nickname })
    .from(usersTable)
    .where(or(ilike(usersTable.nickname, `%${escaped}%`), eq(usersTable.id, q)))
    .limit(30);
  res.json({ users });
});
router.get("/admin/cosmetics/users/:id", async (req, res) => {
  res.json({
    owned: await listOwnedCosmetics(req.params.id),
    loadout: await loadCosmetics(req.params.id),
  });
});
router.post("/admin/cosmetics/users/:id/grants", async (req, res) => {
  const cosmeticId = req.body?.cosmeticId,
    action = req.body?.action;
  if (typeof cosmeticId !== "string" || !["GRANT", "REVOKE"].includes(action))
    throw new CosmeticError(400, "지급 입력값을 확인해 주세요.");
  await db.transaction(async (tx) => {
    await tx.execute(cosmeticsWriteLock);
    const [user] = await tx
      .select({ id: usersTable.id, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, req.params.id));
    const legacyId = legacySkinId(cosmeticId);
    if (legacyId) await syncLegacySkin(legacyId, tx);
    const [item] = await tx
      .select()
      .from(items)
      .where(eq(items.id, cosmeticId));
    if (!user || !item)
      throw new CosmeticError(404, "계정 또는 아이템을 찾을 수 없습니다.");
    if (
      action === "REVOKE" &&
      user.role === "ADMIN" &&
      item.isActive &&
      ["CHAMPION_SKIN", "CARD_SKIN"].includes(item.type)
    )
      throw new CosmeticError(
        422,
        "관리자 계정은 모든 활성 스킨이 자동 해금되어 개별 회수할 수 없습니다.",
      );
    if (action === "GRANT") {
      if (!item.isActive)
        throw new CosmeticError(422, "비활성 아이템은 지급할 수 없습니다.");
      if (legacyId) await grantLegacySkin(user.id, legacyId, tx);
      await tx
        .insert(owned)
        .values({ userId: user.id, cosmeticId })
        .onConflictDoNothing();
    } else {
      if (legacyId) await revokeLegacySkin(user.id, legacyId, tx);
      await tx
        .delete(owned)
        .where(
          and(eq(owned.userId, user.id), eq(owned.cosmeticId, cosmeticId)),
        );
    }
    await tx.insert(audit).values({
      id: randomUUID(),
      actorId: req.authUser!.id,
      userId: user.id,
      cosmeticId,
      action,
    });
  });
  res.json({ owned: await listOwnedCosmetics(req.params.id) });
});
const imageTypes: Record<string, readonly string[]> = {
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/jpeg": ["jpg", "jpeg"],
};
router.post("/admin/cosmetics/uploads", async (req, res) => {
  const { name, size, contentType } = req.body ?? {};
  const extension =
    typeof name === "string" ? (name.toLowerCase().split(".").pop() ?? "") : "";
  if (
    typeof contentType !== "string" ||
    !Object.hasOwn(imageTypes, contentType) ||
    !imageTypes[contentType]?.includes(extension) ||
    !Number.isInteger(size) ||
    size <= 0 ||
    size > 5 * 1024 * 1024
  )
    throw new CosmeticError(400, "PNG·WebP·JPEG, 최대 5MB만 지원합니다.");
  res.json(await storage.createUpload(extension));
});
router.post("/admin/cosmetics/uploads/complete", async (req, res) => {
  const { objectPath, contentType } = req.body ?? {};
  if (
    typeof objectPath !== "string" ||
    !/^\/objects\/uploads\/cosmetics\/[a-zA-Z0-9._-]+$/.test(objectPath) ||
    typeof contentType !== "string" ||
    !Object.hasOwn(imageTypes, contentType)
  )
    throw new CosmeticError(400, "이미지 경로가 올바르지 않습니다.");
  if (!(await storage.verifyImage(objectPath, contentType, 5 * 1024 * 1024)))
    throw new CosmeticError(400, "파일 내용·크기·형식 검증에 실패했습니다.");
  res.json({ imageUrl: `/api/storage${objectPath}` });
});
router.use(
  (
    error: unknown,
    _req: import("express").Request,
    res: import("express").Response,
    next: import("express").NextFunction,
  ) => {
    if (error instanceof CosmeticError || error instanceof AdminDeletionError) {
      res.status(error.status).json({ message: error.message });
      return;
    }
    next(error);
  },
);
export default router;
