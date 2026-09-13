import { and, asc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  currencyTransactionsTable,
  db,
  packDefinitionsTable,
  shopListingsTable,
  userPackInventoryTable,
  usersTable,
} from "@workspace/db";
import { getAuthenticatedUser } from "../lib/auth";

const router: IRouter = Router();
const MAX_PURCHASE_QUANTITY = 10;

router.use(async (request, response, next) => {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      response.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }
    request.authUser = user;
    next();
  } catch (error) {
    next(error);
  }
});

router.get("/", async (request, response): Promise<void> => {
  const listings = await db
    .select({
      listing: shopListingsTable,
      pack: packDefinitionsTable,
      quantity: sql<number>`coalesce(${userPackInventoryTable.quantity}, 0)::int`,
    })
    .from(shopListingsTable)
    .innerJoin(packDefinitionsTable, eq(packDefinitionsTable.id, shopListingsTable.packDefinitionId))
    .leftJoin(userPackInventoryTable, and(
      eq(userPackInventoryTable.packDefinitionId, shopListingsTable.packDefinitionId),
      eq(userPackInventoryTable.userId, request.authUser!.id),
    ))
    .where(and(
      eq(shopListingsTable.isActive, 1),
      eq(packDefinitionsTable.status, "PUBLISHED"),
      sql`${packDefinitionsTable.deletedAt} IS NULL`,
    ))
    .orderBy(asc(shopListingsTable.displayOrder), asc(packDefinitionsTable.name));

  response.json({
    currency: request.authUser!.currency,
    listings: listings.map(({ listing, pack, quantity }) => ({ ...listing, pack, quantity })),
  });
});

router.post("/:listingId/purchase", async (request, response): Promise<void> => {
  const quantity = request.body && typeof request.body === "object" && Number.isInteger(request.body.quantity)
    ? request.body.quantity
    : 0;
  if (quantity < 1 || quantity > MAX_PURCHASE_QUANTITY) {
    response.status(400).json({ message: `구매 수량은 1~${MAX_PURCHASE_QUANTITY}개여야 합니다.` });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [listing] = await tx
        .select({ listing: shopListingsTable, pack: packDefinitionsTable })
        .from(shopListingsTable)
        .innerJoin(packDefinitionsTable, eq(packDefinitionsTable.id, shopListingsTable.packDefinitionId))
        .where(and(
          eq(shopListingsTable.id, request.params.listingId),
          eq(shopListingsTable.isActive, 1),
          eq(packDefinitionsTable.status, "PUBLISHED"),
          sql`${packDefinitionsTable.deletedAt} IS NULL`,
        ))
        .limit(1);
      if (!listing) throw new ShopError(404, "판매 중인 팩을 찾을 수 없습니다.");

      const total = listing.listing.price * quantity;
      const [updatedUser] = await tx
        .update(usersTable)
        .set({ currency: sql`${usersTable.currency} - ${total}`, updatedAt: new Date() })
        .where(and(
          eq(usersTable.id, request.authUser!.id),
          sql`${usersTable.currency} >= ${total}`,
        ))
        .returning({ currency: usersTable.currency });
      if (!updatedUser) throw new ShopError(422, "재화가 부족합니다.");

      const [inventory] = await tx
        .insert(userPackInventoryTable)
        .values({
          userId: request.authUser!.id,
          packDefinitionId: listing.pack.id,
          quantity,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [userPackInventoryTable.userId, userPackInventoryTable.packDefinitionId],
          set: {
            quantity: sql`${userPackInventoryTable.quantity} + ${quantity}`,
            updatedAt: new Date(),
          },
        })
        .returning();

      await tx.insert(currencyTransactionsTable).values({
        id: randomUUID(),
        userId: request.authUser!.id,
        amount: -total,
        balanceAfter: updatedUser.currency,
        type: "SHOP_PURCHASE",
        metadata: { listingId: listing.listing.id, packDefinitionId: listing.pack.id, quantity },
      });

      return { currency: updatedUser.currency, quantity: inventory?.quantity ?? quantity, pack: listing.pack };
    });
    response.json(result);
  } catch (error) {
    const status = error instanceof ShopError ? error.status : 500;
    response.status(status).json({ message: error instanceof Error ? error.message : "구매에 실패했습니다." });
  }
});

class ShopError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export default router;