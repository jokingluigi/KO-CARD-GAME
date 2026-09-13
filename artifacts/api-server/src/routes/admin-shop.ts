import { and, asc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  currencyTransactionsTable,
  db,
  packDefinitionsTable,
  shopListingsTable,
  usersTable,
} from "@workspace/db";
import { getAuthenticatedUser } from "../lib/auth";

const router: IRouter = Router();

function requireAdmin(request: Request, response: Response): boolean {
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

router.get("/", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const [listings, packs] = await Promise.all([
    db.select({ listing: shopListingsTable, pack: packDefinitionsTable })
      .from(shopListingsTable)
      .innerJoin(packDefinitionsTable, eq(packDefinitionsTable.id, shopListingsTable.packDefinitionId))
      .orderBy(asc(shopListingsTable.displayOrder), asc(packDefinitionsTable.name)),
    db.select().from(packDefinitionsTable)
      .where(and(eq(packDefinitionsTable.status, "PUBLISHED"), sql`${packDefinitionsTable.deletedAt} IS NULL`))
      .orderBy(asc(packDefinitionsTable.name)),
  ]);
  const now = Date.now();
  response.json({
    listings: listings.map(({ listing, pack }) => ({
      ...listing,
      imageUrl: listing.imageAssetId ? `/api/storage${listing.imageAssetId}` : pack.imageUrl,
      pack,
      packUnavailable: pack.status !== "PUBLISHED" || Boolean(pack.deletedAt),
      isSaleable: listing.enabled && listing.isActive === 1 && pack.status === "PUBLISHED" && !pack.deletedAt
        && (!listing.startsAt || listing.startsAt.getTime() <= now)
        && (!listing.endsAt || listing.endsAt.getTime() >= now),
    })),
    packs,
  });
});

type ListingInput = {
  name: string;
  description: string;
  imageAssetId: string | null;
  productType: "PACK";
  packDefinitionId: string;
  quantity: number;
  price: number;
  enabled: boolean;
  isActive: number;
  displayOrder: number;
  startsAt: Date | null;
  endsAt: Date | null;
};

function parseListingInput(value: unknown): ListingInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  const imageAssetId = typeof input.imageAssetId === "string" && input.imageAssetId.trim()
    ? input.imageAssetId.trim()
    : null;
  const productType = input.productType === "PACK" ? "PACK" : null;
  const packDefinitionId = typeof input.packDefinitionId === "string" ? input.packDefinitionId.trim() : "";
  const quantity = typeof input.quantity === "number" && Number.isInteger(input.quantity) ? input.quantity : 0;
  const price = typeof input.price === "number" && Number.isInteger(input.price) ? input.price : -1;
  const enabled = input.enabled === true || input.enabled === 1;
  const isActive = enabled ? 1 : 0;
  const displayOrder = typeof input.displayOrder === "number" && Number.isInteger(input.displayOrder) ? input.displayOrder : 0;
  const date = (key: string) => {
    const raw = input[key];
    if (raw === null || raw === undefined || raw === "") return null;
    if (typeof raw !== "string") return undefined;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  };
  const startsAt = date("startsAt");
  const endsAt = date("endsAt");
  if (
    !name || name.length > 120 || description.length > 2000 || productType !== "PACK" ||
    !packDefinitionId || quantity < 1 || quantity > 999 || price < 0 || price > 2_147_483_647 ||
    displayOrder < 0 || (imageAssetId && !imageAssetId.startsWith("/objects/uploads/card-images/")) ||
    startsAt === undefined || endsAt === undefined || (startsAt && endsAt && endsAt < startsAt)
  ) return null;
  return { name, description, imageAssetId, productType, packDefinitionId, quantity, price, enabled, isActive, displayOrder, startsAt, endsAt };
}

async function publishedPack(id: string) {
  const [pack] = await db.select({ id: packDefinitionsTable.id }).from(packDefinitionsTable).where(and(
    eq(packDefinitionsTable.id, id),
    eq(packDefinitionsTable.status, "PUBLISHED"),
    sql`${packDefinitionsTable.deletedAt} IS NULL`,
  )).limit(1);
  return pack;
}

router.post("/", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const input = parseListingInput(request.body);
  if (!input) { response.status(400).json({ message: "상품명, PACK 상품, 수량, 가격, 판매 기간을 확인해 주세요." }); return; }
  if (!await publishedPack(input.packDefinitionId)) { response.status(422).json({ message: "PUBLISHED 팩만 판매할 수 있습니다." }); return; }
  const [listing] = await db.insert(shopListingsTable).values({ id: randomUUID(), ...input }).returning();
  response.status(201).json({ listing });
});

router.post("/currency/grant", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const userId = typeof request.body?.userId === "string" ? request.body.userId : "";
  const amount = Number.isInteger(request.body?.amount) ? request.body.amount : 0;
  if (!userId || amount < 1 || amount > 1_000_000) {
    response.status(400).json({ message: "사용자와 1~1,000,000 사이의 지급량을 확인해 주세요." });
    return;
  }
  const result = await db.transaction(async (tx) => {
    const [user] = await tx.update(usersTable)
      .set({ currency: sql`${usersTable.currency} + ${amount}`, updatedAt: new Date() })
      .where(eq(usersTable.id, userId))
      .returning({ id: usersTable.id, currency: usersTable.currency });
    if (!user) return null;
    await tx.insert(currencyTransactionsTable).values({
      id: randomUUID(), userId, amount, balanceAfter: user.currency, type: "ADMIN_GRANT", metadata: { grantedBy: request.authUser!.id },
    });
    return user;
  });
  if (!result) { response.status(404).json({ message: "사용자를 찾을 수 없습니다." }); return; }
  response.json({ user: result });
});

router.patch("/:id", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const input = parseListingInput(request.body);
  if (!input) { response.status(400).json({ message: "상품명, PACK 상품, 수량, 가격, 판매 기간을 확인해 주세요." }); return; }
  if (!await publishedPack(input.packDefinitionId)) { response.status(422).json({ message: "PUBLISHED 팩만 판매할 수 있습니다." }); return; }
  const [listing] = await db.update(shopListingsTable).set({ ...input, updatedAt: new Date() })
    .where(eq(shopListingsTable.id, request.params.id)).returning();
  if (!listing) { response.status(404).json({ message: "상점 판매 목록을 찾을 수 없습니다." }); return; }
  response.json({ listing });
});

router.post("/:id/duplicate", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const [source] = await db.select().from(shopListingsTable).where(eq(shopListingsTable.id, request.params.id)).limit(1);
  if (!source) { response.status(404).json({ message: "상점 상품을 찾을 수 없습니다." }); return; }
  if (!await publishedPack(source.packDefinitionId)) { response.status(422).json({ message: "PUBLISHED 팩이 연결된 상품만 복제할 수 있습니다." }); return; }
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...copy } = source;
  const [listing] = await db.insert(shopListingsTable).values({
    ...copy,
    id: randomUUID(),
    name: `${source.name} 복사본`,
    enabled: false,
    isActive: 0,
  }).returning();
  response.status(201).json({ listing });
});

router.post("/:id/toggle", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const enabled = request.body?.enabled === true;
  const [listing] = await db.update(shopListingsTable)
    .set({ enabled, isActive: enabled ? 1 : 0, updatedAt: new Date() })
    .where(eq(shopListingsTable.id, request.params.id))
    .returning();
  if (!listing) { response.status(404).json({ message: "상점 상품을 찾을 수 없습니다." }); return; }
  response.json({ listing });
});

router.delete("/:id", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const [listing] = await db.delete(shopListingsTable).where(eq(shopListingsTable.id, request.params.id)).returning();
  if (!listing) { response.status(404).json({ message: "상점 판매 목록을 찾을 수 없습니다." }); return; }
  response.status(204).end();
});

export default router;