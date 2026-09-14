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
import { SHOP_CURRENCY, SHOP_CURRENCY_DISPLAY_NAME } from "../lib/shop-currency";

const router: IRouter = Router();

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
      eq(shopListingsTable.enabled, true),
      eq(shopListingsTable.isActive, 1),
      eq(packDefinitionsTable.status, "PUBLISHED"),
      sql`${packDefinitionsTable.deletedAt} IS NULL`,
      sql`(${shopListingsTable.startsAt} IS NULL OR ${shopListingsTable.startsAt} <= now())`,
      sql`(${shopListingsTable.endsAt} IS NULL OR ${shopListingsTable.endsAt} >= now())`,
    ))
    .orderBy(asc(shopListingsTable.displayOrder), asc(packDefinitionsTable.name));

  response.json({
    currencyBalance: request.authUser!.currencyBalance,
    currencyDisplayName: SHOP_CURRENCY_DISPLAY_NAME,
    listings: listings.map(({ listing, pack, quantity }) => ({
      ...listing,
      imageUrl: listing.imageAssetId ? `/api/storage${listing.imageAssetId}` : pack.imageUrl,
      pack,
      packQuantity: listing.quantity,
      ownedQuantity: quantity,
    })),
  });
});

router.post("/:listingId/purchase", async (request, response): Promise<void> => {
  try {
    const result = await db.transaction(async (tx) => {
      const [listing] = await tx
        .select({ listing: shopListingsTable, pack: packDefinitionsTable })
        .from(shopListingsTable)
        .innerJoin(packDefinitionsTable, eq(packDefinitionsTable.id, shopListingsTable.packDefinitionId))
        .where(and(
          eq(shopListingsTable.id, request.params.listingId),
          eq(shopListingsTable.enabled, true),
          eq(shopListingsTable.isActive, 1),
          eq(packDefinitionsTable.status, "PUBLISHED"),
          sql`${packDefinitionsTable.deletedAt} IS NULL`,
          sql`(${shopListingsTable.startsAt} IS NULL OR ${shopListingsTable.startsAt} <= now())`,
          sql`(${shopListingsTable.endsAt} IS NULL OR ${shopListingsTable.endsAt} >= now())`,
        ))
        .limit(1);
      if (!listing) throw new ShopError(404, "판매 중인 팩을 찾을 수 없습니다.");

      const total = listing.listing.price;
      const [updatedUser] = await tx
        .update(usersTable)
        .set({ currencyBalance: sql`${usersTable.currencyBalance} - ${total}`, updatedAt: new Date() })
        .where(and(
          eq(usersTable.id, request.authUser!.id),
          sql`${usersTable.currencyBalance} >= ${total}`,
        ))
        .returning({ currencyBalance: usersTable.currencyBalance });
      if (!updatedUser) throw new ShopError(422, "크레딧이 부족합니다.");

      const [inventory] = await tx
        .insert(userPackInventoryTable)
        .values({
          userId: request.authUser!.id,
          packDefinitionId: listing.pack.id,
          quantity: listing.listing.quantity,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [userPackInventoryTable.userId, userPackInventoryTable.packDefinitionId],
          set: {
            quantity: sql`${userPackInventoryTable.quantity} + ${listing.listing.quantity}`,
            updatedAt: new Date(),
          },
        })
        .returning();

      await tx.insert(currencyTransactionsTable).values({
        id: randomUUID(),
        userId: request.authUser!.id,
        amount: -total,
        balanceAfter: updatedUser.currencyBalance,
        relatedListingId: listing.listing.id,
        currencyType: SHOP_CURRENCY,
        type: "SHOP_PURCHASE",
        metadata: { listingId: listing.listing.id, packDefinitionId: listing.pack.id, packQuantity: listing.listing.quantity },
      });

      return {
        currencyBalance: updatedUser.currencyBalance,
        packQuantity: listing.listing.quantity,
        ownedQuantity: inventory?.quantity ?? listing.listing.quantity,
        pack: listing.pack,
      };
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