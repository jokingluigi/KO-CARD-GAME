import { and, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  cardsTable,
  db,
  prismEconomySettingsTable,
  prismTransactionsTable,
  userCardCollectionsTable,
  usersTable,
} from "@workspace/db";
import { getAuthenticatedUser } from "../lib/auth";
import {
  PRISM_RARITIES,
  isPrismRarity,
  isValidPrismValue,
  toPrismSettingView,
  type PrismRarity,
} from "../lib/prism-economy";
import { isTestAccountUser, TEST_ACCOUNT_UNLIMITED_BALANCE } from "../lib/test-account";

const router: IRouter = Router();
type QueryExecutor = { select: typeof db.select };

class PrismError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function requireUser(request: Request, response: Response): NonNullable<Request["authUser"]> | null {
  if (request.authUser) return request.authUser;
  response.status(401).json({ message: "로그인이 필요합니다." });
  return null;
}

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
  const user = requireUser(request, response);
  if (!user) return;
  const rows = await db.select().from(prismEconomySettingsTable)
    .where(inArray(prismEconomySettingsTable.rarity, [...PRISM_RARITIES]));
  response.json({
    prismBalance: isTestAccountUser(user) ? TEST_ACCOUNT_UNLIMITED_BALANCE : user.prismBalance,
    isTestAccount: isTestAccountUser(user),
    settings: PRISM_RARITIES.map((rarity) => toPrismSettingView(
      rarity,
      rows.find((row) => row.rarity === rarity),
    )),
  });
});

async function getUsableSetting(rarity: PrismRarity, action: "제작" | "분해", executor: QueryExecutor = db) {
  const [setting] = await executor.select().from(prismEconomySettingsTable)
    .where(eq(prismEconomySettingsTable.rarity, rarity))
    .limit(1);
  if (!setting || !isValidPrismValue(setting.craftCost) || !isValidPrismValue(setting.disenchantReward)) {
    throw new PrismError(503, `프리즘 ${action} 설정이 없어 해당 기능을 사용할 수 없습니다.`);
  }
  return setting;
}

async function getCraftableCard(cardDefinitionId: string, executor: QueryExecutor = db) {
  const [card] = await executor.select().from(cardsTable).where(and(
    eq(cardsTable.id, cardDefinitionId),
    eq(cardsTable.status, "PUBLISHED"),
    inArray(cardsTable.rarity, ["NORMAL", "LEGENDARY"]),
    eq(cardsTable.isToken, false),
    eq(cardsTable.isChampionToken, false),
  )).limit(1);
  return card ?? null;
}

router.post("/craft/:cardDefinitionId", async (request, response): Promise<void> => {
  const user = requireUser(request, response);
  if (!user) return;
  try {
    const result = await db.transaction(async (tx) => {
      const card = await getCraftableCard(request.params.cardDefinitionId, tx);
      if (!card) throw new PrismError(404, "제작할 수 없는 카드입니다.");
      const setting = await getUsableSetting(card.rarity as PrismRarity, "제작", tx);
      let prismBalance = user.prismBalance;
      if (!isTestAccountUser(user)) {
        const [updatedUser] = await tx.update(usersTable)
          .set({
            prismBalance: sql`${usersTable.prismBalance} - ${setting.craftCost}`,
            updatedAt: new Date(),
          })
          .where(and(
            eq(usersTable.id, user.id),
            sql`${usersTable.prismBalance} >= ${setting.craftCost}`,
          ))
          .returning({ prismBalance: usersTable.prismBalance });
        if (!updatedUser) throw new PrismError(422, "프리즘이 부족합니다.");
        prismBalance = updatedUser.prismBalance;
      } else {
        prismBalance = TEST_ACCOUNT_UNLIMITED_BALANCE;
      }
      const [collection] = await tx.insert(userCardCollectionsTable)
        .values({
          userId: user.id,
          cardDefinitionId: card.id,
          quantity: 1,
        })
        .onConflictDoUpdate({
          target: [userCardCollectionsTable.userId, userCardCollectionsTable.cardDefinitionId],
          set: {
            quantity: sql`${userCardCollectionsTable.quantity} + 1`,
          },
        })
        .returning({ quantity: userCardCollectionsTable.quantity });
      await tx.insert(prismTransactionsTable).values({
        id: randomUUID(),
        userId: user.id,
        type: "CRAFT",
        amount: -setting.craftCost,
        balanceAfter: prismBalance,
        cardDefinitionId: card.id,
        metadata: JSON.stringify({ rarity: card.rarity }),
      });
      return { card, prismBalance, quantity: collection?.quantity ?? 1 };
    });
    response.json(result);
  } catch (error) {
    const status = error instanceof PrismError ? error.status : 500;
    response.status(status).json({ message: error instanceof Error ? error.message : "카드 제작에 실패했습니다." });
  }
});

router.post("/disenchant/:cardDefinitionId", async (request, response): Promise<void> => {
  const user = requireUser(request, response);
  if (!user) return;
  try {
    const result = await db.transaction(async (tx) => {
      const card = await getCraftableCard(request.params.cardDefinitionId, tx);
      if (!card) throw new PrismError(404, "분해할 수 없는 카드입니다.");
      const setting = await getUsableSetting(card.rarity as PrismRarity, "분해", tx);
      const [collection] = await tx.update(userCardCollectionsTable)
        .set({
          quantity: sql`${userCardCollectionsTable.quantity} - 1`,
        })
        .where(and(
          eq(userCardCollectionsTable.userId, user.id),
          eq(userCardCollectionsTable.cardDefinitionId, card.id),
          sql`${userCardCollectionsTable.quantity} > 0`,
        ))
        .returning({ quantity: userCardCollectionsTable.quantity });
      if (!collection) throw new PrismError(422, "소유한 카드만 분해할 수 있습니다.");
      let prismBalance = user.prismBalance;
      if (!isTestAccountUser(user)) {
        const [updatedUser] = await tx.update(usersTable)
          .set({
            prismBalance: sql`${usersTable.prismBalance} + ${setting.disenchantReward}`,
            updatedAt: new Date(),
          })
          .where(eq(usersTable.id, user.id))
          .returning({ prismBalance: usersTable.prismBalance });
        if (!updatedUser) throw new PrismError(404, "사용자를 찾을 수 없습니다.");
        prismBalance = updatedUser.prismBalance;
      } else {
        prismBalance = TEST_ACCOUNT_UNLIMITED_BALANCE;
      }
      await tx.insert(prismTransactionsTable).values({
        id: randomUUID(),
        userId: user.id,
        type: "DISENCHANT",
        amount: setting.disenchantReward,
        balanceAfter: prismBalance,
        cardDefinitionId: card.id,
        metadata: JSON.stringify({ rarity: card.rarity }),
      });
      return { card, prismBalance, quantity: collection.quantity };
    });
    response.json(result);
  } catch (error) {
    const status = error instanceof PrismError ? error.status : 500;
    response.status(status).json({ message: error instanceof Error ? error.message : "카드 분해에 실패했습니다." });
  }
});

export default router;