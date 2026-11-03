import { and, asc, eq, sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
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
import {
  SHOP_CURRENCY,
  SHOP_CURRENCY_DISPLAY_NAME,
} from "../lib/shop-currency";
import {
  isTestAccountUser,
  TEST_ACCOUNT_UNLIMITED_BALANCE,
} from "../lib/test-account";
import {
  shopPurchaseQuantity,
  shopPurchaseTotals,
} from "../../../../lib/game-engine/src/shop-purchase";

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
    .innerJoin(
      packDefinitionsTable,
      eq(packDefinitionsTable.id, shopListingsTable.packDefinitionId),
    )
    .leftJoin(
      userPackInventoryTable,
      and(
        eq(
          userPackInventoryTable.packDefinitionId,
          shopListingsTable.packDefinitionId,
        ),
        eq(userPackInventoryTable.userId, request.authUser!.id),
      ),
    )
    .where(
      and(
        eq(shopListingsTable.enabled, true),
        eq(shopListingsTable.isActive, 1),
        eq(packDefinitionsTable.status, "PUBLISHED"),
        sql`${packDefinitionsTable.deletedAt} IS NULL`,
        sql`(${shopListingsTable.startsAt} IS NULL OR ${shopListingsTable.startsAt} <= now())`,
        sql`(${shopListingsTable.endsAt} IS NULL OR ${shopListingsTable.endsAt} >= now())`,
      ),
    )
    .orderBy(
      asc(shopListingsTable.displayOrder),
      asc(packDefinitionsTable.name),
    );

  response.json({
    accountId: request.authUser!.id,
    purchaseRecovery: true,
    currencyBalance: isTestAccountUser(request.authUser)
      ? TEST_ACCOUNT_UNLIMITED_BALANCE
      : request.authUser!.currencyBalance,
    isTestAccount: isTestAccountUser(request.authUser),
    currencyDisplayName: SHOP_CURRENCY_DISPLAY_NAME,
    listings: listings.map(({ listing, pack, quantity }) => ({
      ...listing,
      imageUrl: listing.imageAssetId
        ? `/api/storage${listing.imageAssetId}`
        : pack.imageUrl,
      pack,
      packQuantity: listing.quantity,
      ownedQuantity: quantity,
    })),
  });
});

router.post(
  "/:listingId/purchase",
  async (request, response): Promise<void> => {
    try {
      const quantity = shopPurchaseQuantity(request.body?.quantity);
      const key = request.body?.idempotencyKey;
      if (
        key !== undefined &&
        (typeof key !== "string" || !/^[a-zA-Z0-9_-]{16,100}$/.test(key))
      )
        throw new ShopError(400, "구매 요청 식별자를 확인해 주세요.");
      if (
        request.body?.accountId !== undefined &&
        request.body.accountId !== request.authUser!.id
      )
        throw new ShopError(
          409,
          "구매 요청의 로그인 계정이 달라요. 원래 계정으로 로그인해 확인해 주세요.",
        );
      const transactionId = key
        ? "shop:" +
          createHash("sha256")
            .update(JSON.stringify([request.authUser!.id, key]))
            .digest("hex")
        : randomUUID();
      const result = await db.transaction(async (tx) => {
        if (key) {
          // Serialize retries for this account using an existing row. No new table/index.
          await tx
            .select({ id: usersTable.id })
            .from(usersTable)
            .where(eq(usersTable.id, request.authUser!.id))
            .for("update");
          const [previous] = await tx
            .select({ metadata: currencyTransactionsTable.metadata })
            .from(currencyTransactionsTable)
            .where(
              and(
                eq(currencyTransactionsTable.userId, request.authUser!.id),
                eq(currencyTransactionsTable.type, "SHOP_PURCHASE"),
                eq(currencyTransactionsTable.id, transactionId),
              ),
            )
            .limit(1);
          if (previous) {
            const receipt = previous.metadata as {
              listingId?: string;
              quantity?: number;
              receipt?: unknown;
            };
            if (
              receipt.listingId !== request.params.listingId ||
              receipt.quantity !== quantity ||
              !receipt.receipt
            )
              throw new ShopError(
                409,
                "같은 구매 요청으로 상품이나 수량을 변경할 수 없어요.",
              );
            return receipt.receipt;
          }
        }
        const [listing] = await tx
          .select({ listing: shopListingsTable, pack: packDefinitionsTable })
          .from(shopListingsTable)
          .innerJoin(
            packDefinitionsTable,
            eq(packDefinitionsTable.id, shopListingsTable.packDefinitionId),
          )
          .where(
            and(
              eq(shopListingsTable.id, request.params.listingId),
              eq(shopListingsTable.enabled, true),
              eq(shopListingsTable.isActive, 1),
              eq(packDefinitionsTable.status, "PUBLISHED"),
              sql`${packDefinitionsTable.deletedAt} IS NULL`,
              sql`(${shopListingsTable.startsAt} IS NULL OR ${shopListingsTable.startsAt} <= now())`,
              sql`(${shopListingsTable.endsAt} IS NULL OR ${shopListingsTable.endsAt} >= now())`,
            ),
          )
          .limit(1);
        if (!listing)
          throw new ShopError(404, "판매 중인 팩을 찾을 수 없습니다.");

        const { total, packQuantity } = shopPurchaseTotals(
          listing.listing.price,
          listing.listing.quantity,
          quantity,
        );
        const testAccount = isTestAccountUser(request.authUser);
        let currencyBalance = request.authUser!.currencyBalance;
        if (!testAccount) {
          const [updatedUser] = await tx
            .update(usersTable)
            .set({
              currencyBalance: sql`${usersTable.currencyBalance} - ${total}`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(usersTable.id, request.authUser!.id),
                sql`${usersTable.currencyBalance} >= ${total}`,
              ),
            )
            .returning({ currencyBalance: usersTable.currencyBalance });
          if (!updatedUser) throw new ShopError(422, "크레딧이 부족합니다.");
          currencyBalance = updatedUser.currencyBalance;
        } else {
          currencyBalance = TEST_ACCOUNT_UNLIMITED_BALANCE;
        }

        const [inventory] = await tx
          .insert(userPackInventoryTable)
          .values({
            userId: request.authUser!.id,
            packDefinitionId: listing.pack.id,
            quantity: packQuantity,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [
              userPackInventoryTable.userId,
              userPackInventoryTable.packDefinitionId,
            ],
            set: {
              quantity: sql`${userPackInventoryTable.quantity} + ${packQuantity}`,
              updatedAt: new Date(),
            },
          })
          .returning();

        const receipt = {
          currencyBalance,
          packQuantity,
          ownedQuantity: inventory?.quantity ?? packQuantity,
          pack: listing.pack,
        };
        await tx.insert(currencyTransactionsTable).values({
          id: transactionId,
          userId: request.authUser!.id,
          amount: -total,
          balanceAfter: currencyBalance,
          relatedListingId: listing.listing.id,
          currencyType: SHOP_CURRENCY,
          type: "SHOP_PURCHASE",
          metadata: {
            listingId: listing.listing.id,
            packDefinitionId: listing.pack.id,
            packQuantity,
            quantity,
            ...(key ? { idempotencyKey: key, receipt } : {}),
          },
        });

        return receipt;
      });
      response.json(result);
    } catch (error) {
      const status =
        error instanceof ShopError
          ? error.status
          : error instanceof RangeError
            ? 422
            : 500;
      if (status === 500)
        request.log.error(
          { err: error },
          "shop purchase result could not be confirmed",
        );
      if (!response.headersSent)
        response
          .status(status)
          .json({
            message:
              status === 500
                ? "구매 결과를 확인하지 못했어요. 같은 구매 요청으로 다시 확인해 주세요."
                : error instanceof Error
                  ? error.message
                  : "구매 요청을 확인해 주세요.",
          });
    }
  },
);

class ShopError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export default router;
