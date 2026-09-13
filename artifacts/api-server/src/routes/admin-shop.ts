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
  const [listings, packs, users] = await Promise.all([
    db.select({ listing: shopListingsTable, pack: packDefinitionsTable })
      .from(shopListingsTable)
      .innerJoin(packDefinitionsTable, eq(packDefinitionsTable.id, shopListingsTable.packDefinitionId))
      .where(sql`${packDefinitionsTable.deletedAt} IS NULL`)
      .orderBy(asc(shopListingsTable.displayOrder), asc(packDefinitionsTable.name)),
    db.select().from(packDefinitionsTable)
      .where(and(eq(packDefinitionsTable.status, "PUBLISHED"), sql`${packDefinitionsTable.deletedAt} IS NULL`))
      .orderBy(asc(packDefinitionsTable.name)),
    db.select({ id: usersTable.id, email: usersTable.email, nickname: usersTable.nickname, role: usersTable.role, currency: usersTable.currency })
      .from(usersTable).orderBy(asc(usersTable.nickname)),
  ]);
  response.json({ listings: listings.map(({ listing, pack }) => ({ ...listing, pack })), packs, users });
});

function parseListingInput(value: unknown): { packDefinitionId: string; price: number; isActive: number; displayOrder: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const packDefinitionId = typeof input.packDefinitionId === "string" ? input.packDefinitionId.trim() : "";
  const price = typeof input.price === "number" && Number.isInteger(input.price) ? input.price : -1;
  const isActive = input.isActive === true || input.isActive === 1 ? 1 : 0;
  const displayOrder = typeof input.displayOrder === "number" && Number.isInteger(input.displayOrder) ? input.displayOrder : 0;
  if (!packDefinitionId || price < 1 || price > 2_147_483_647 || displayOrder < 0) return null;
  return { packDefinitionId, price, isActive, displayOrder };
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
  if (!input) { response.status(400).json({ message: "상점 판매값을 확인해 주세요." }); return; }
  if (!await publishedPack(input.packDefinitionId)) { response.status(422).json({ message: "PUBLISHED 팩만 판매할 수 있습니다." }); return; }
  const [existing] = await db.select({ id: shopListingsTable.id }).from(shopListingsTable)
    .where(eq(shopListingsTable.packDefinitionId, input.packDefinitionId)).limit(1);
  if (existing) { response.status(409).json({ message: "이 팩은 이미 상점에 등록되어 있습니다." }); return; }
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
  if (!input) { response.status(400).json({ message: "상점 판매값을 확인해 주세요." }); return; }
  if (!await publishedPack(input.packDefinitionId)) { response.status(422).json({ message: "PUBLISHED 팩만 판매할 수 있습니다." }); return; }
  const [duplicate] = await db.select({ id: shopListingsTable.id }).from(shopListingsTable).where(and(
    eq(shopListingsTable.packDefinitionId, input.packDefinitionId),
    sql`${shopListingsTable.id} <> ${request.params.id}`,
  )).limit(1);
  if (duplicate) { response.status(409).json({ message: "이 팩은 이미 다른 판매 목록에 등록되어 있습니다." }); return; }
  const [listing] = await db.update(shopListingsTable).set({ ...input, updatedAt: new Date() })
    .where(eq(shopListingsTable.id, request.params.id)).returning();
  if (!listing) { response.status(404).json({ message: "상점 판매 목록을 찾을 수 없습니다." }); return; }
  response.json({ listing });
});

router.delete("/:id", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const [listing] = await db.delete(shopListingsTable).where(eq(shopListingsTable.id, request.params.id)).returning();
  if (!listing) { response.status(404).json({ message: "상점 판매 목록을 찾을 수 없습니다." }); return; }
  response.status(204).end();
});

export default router;