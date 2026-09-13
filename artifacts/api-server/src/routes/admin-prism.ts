import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  prismEconomySettingsTable,
  prismTransactionsTable,
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
  const [settings, users] = await Promise.all([
    db.select().from(prismEconomySettingsTable)
      .where(inArray(prismEconomySettingsTable.rarity, [...PRISM_RARITIES])),
    db.select({
      id: usersTable.id,
      email: usersTable.email,
      nickname: usersTable.nickname,
      prismBalance: usersTable.prismBalance,
    }).from(usersTable).orderBy(asc(usersTable.nickname)),
  ]);
  response.json({
    settings: PRISM_RARITIES.map((rarity) => toPrismSettingView(
      rarity,
      settings.find((setting) => setting.rarity === rarity),
    )),
    users,
  });
});

router.put("/settings/:rarity", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const rarity = request.params.rarity;
  const craftCost = request.body?.craftCost;
  const disenchantReward = request.body?.disenchantReward;
  if (!isPrismRarity(rarity) || !isValidPrismValue(craftCost) || !isValidPrismValue(disenchantReward)) {
    response.status(400).json({ message: "희귀도와 제작 비용/분해 획득량은 0 이상의 정수여야 합니다." });
    return;
  }
  const [setting] = await db.insert(prismEconomySettingsTable)
    .values({ rarity, craftCost, disenchantReward, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: prismEconomySettingsTable.rarity,
      set: { craftCost, disenchantReward, updatedAt: new Date() },
    })
    .returning();
  response.json({ setting: toPrismSettingView(rarity, setting) });
});

router.post("/grant", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const userId = typeof request.body?.userId === "string" ? request.body.userId : "";
  const amount = request.body?.amount;
  if (!userId || !isValidPrismValue(amount) || amount < 1 || amount > 1_000_000) {
    response.status(400).json({ message: "사용자와 1~1,000,000 사이의 프리즘 지급량을 확인해 주세요." });
    return;
  }
  const result = await db.transaction(async (tx) => {
    const [user] = await tx.update(usersTable)
      .set({
        prismBalance: sql`${usersTable.prismBalance} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId))
      .returning({ id: usersTable.id, prismBalance: usersTable.prismBalance });
    if (!user) return null;
    await tx.insert(prismTransactionsTable).values({
      id: randomUUID(),
      userId,
      type: "ADMIN_GRANT",
      amount,
      balanceAfter: user.prismBalance,
      metadata: JSON.stringify({ grantedBy: request.authUser!.id }),
    });
    return user;
  });
  if (!result) {
    response.status(404).json({ message: "사용자를 찾을 수 없습니다." });
    return;
  }
  response.json({ user: result });
});

export default router;