import { and, eq, isNull, sql } from "drizzle-orm";
import { currencyTransactionsTable, db, usersTable } from "@workspace/db";
import { randomUUID } from "node:crypto";

export const SHOP_CURRENCY = "SHOP_CURRENCY" as const;
export const STARTING_SHOP_CURRENCY = Math.max(
  0,
  Number.parseInt(process.env["STARTING_SHOP_CURRENCY"] ?? "5000", 10) || 0,
);
export const SHOP_CURRENCY_DISPLAY_NAME = (process.env["SHOP_CURRENCY_DISPLAY_NAME"] ?? "크레딧").trim() || "크레딧";

export async function ensureStartingShopCurrency(userId: string): Promise<number | null> {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(usersTable)
      .set({
        currencyBalance: sql`${usersTable.currencyBalance} + ${STARTING_SHOP_CURRENCY}`,
        shopCurrencyStarterGrantedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(usersTable.id, userId), isNull(usersTable.shopCurrencyStarterGrantedAt)))
      .returning({
        id: usersTable.id,
        currencyBalance: usersTable.currencyBalance,
      });

    if (!updated) {
      const [current] = await tx
        .select({ currencyBalance: usersTable.currencyBalance })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      return current?.currencyBalance ?? null;
    }

    await tx.insert(currencyTransactionsTable).values({
      id: randomUUID(),
      userId,
      amount: STARTING_SHOP_CURRENCY,
      balanceAfter: updated.currencyBalance,
      currencyType: SHOP_CURRENCY,
      type: "STARTER_GRANT",
      metadata: { source: "server_config", startingAmount: STARTING_SHOP_CURRENCY },
    });
    return updated.currencyBalance;
  });
}