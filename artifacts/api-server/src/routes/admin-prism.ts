import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  championPrismEconomySettingsTable,
  prismEconomySettingsTable,
  prismTransactionsTable,
  championPrismTransactionsTable,
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
import {
  CHAMPION_PRISM_CONFIG_ID,
  getChampionPrismSetting,
  isValidChampionPrismValue,
  toChampionPrismSettingView,
} from "../lib/champion-prism";

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
  const [settings, users, championPrismSetting] = await Promise.all([
    db.select().from(prismEconomySettingsTable)
      .where(inArray(prismEconomySettingsTable.rarity, [...PRISM_RARITIES])),
    db.select({
      id: usersTable.id,
      email: usersTable.email,
      nickname: usersTable.nickname,
      prismBalance: usersTable.prismBalance,
      championPrismBalance: usersTable.championPrismBalance,
    }).from(usersTable).orderBy(asc(usersTable.nickname)),
    getChampionPrismSetting(),
  ]);
  response.json({
    settings: PRISM_RARITIES.map((rarity) => toPrismSettingView(
      rarity,
      settings.find((setting) => setting.rarity === rarity),
    )),
    users,
    championPrismSetting: toChampionPrismSettingView(championPrismSetting ?? undefined),
  });
});

router.put("/champion-settings", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const craftCost = request.body?.craftCost;
  const duplicateReward = request.body?.duplicateReward;
  if (!isValidChampionPrismValue(craftCost) || !isValidChampionPrismValue(duplicateReward)) {
    response.status(400).json({ message: "챔피언 프리즘 제작 비용/중복 보상은 0 이상의 정수여야 합니다." });
    return;
  }
  const [setting] = await db.insert(championPrismEconomySettingsTable)
    .values({ id: CHAMPION_PRISM_CONFIG_ID, craftCost, duplicateReward, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: championPrismEconomySettingsTable.id,
      set: { craftCost, duplicateReward, updatedAt: new Date() },
    })
    .returning();
  response.json({ championPrismSetting: toChampionPrismSettingView(setting) });
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

router.post("/revoke", async (request, response): Promise<void> => {
  if (!requireAdmin(request, response)) return;
  const { userId, amount, reason, requestId } = request.body ?? {};
  const kind = request.body?.kind ?? "CARD";
  if (typeof userId !== "string" || !userId || !isValidPrismValue(amount) || amount < 1 || amount > 1_000_000 ||
      typeof reason !== "string" || !reason.trim() || reason.length > 300 ||
      typeof requestId !== "string" || !/^[a-zA-Z0-9-]{8,80}$/.test(requestId) || !["CARD","CHAMPION"].includes(kind)) {
    response.status(400).json({message:"사용자, 프리즘 종류, 회수량(1~1,000,000), 사유와 요청 ID를 확인해 주세요."}); return;
  }
  const table = kind === "CHAMPION" ? championPrismTransactionsTable : prismTransactionsTable;
  const balance = kind === "CHAMPION" ? usersTable.championPrismBalance : usersTable.prismBalance;
  const balanceKey = kind === "CHAMPION" ? "championPrismBalance" : "prismBalance";
  class RevokeError extends Error { constructor(public status: number, message: string) {super(message);} }
  try {
    const result = await db.transaction(async tx => {
      const [user] = await tx.select({id:usersTable.id}).from(usersTable).where(eq(usersTable.id,userId));
      if (!user) throw new RevokeError(404,"사용자를 찾을 수 없습니다.");
      const id = `admin-revoke-${requestId}`;
      const [reserved] = await tx.insert(table).values({id,userId,type:"ADMIN_REVOKE",amount:-amount,balanceAfter:0,metadata:JSON.stringify({revokedBy:request.authUser!.id,reason:reason.trim(),kind,requestId})})
        .onConflictDoNothing({target:table.id}).returning({id:table.id});
      if (!reserved) {
        const [previous] = await tx.select().from(table).where(eq(table.id,id));
        if (!previous || previous.userId !== userId || previous.type !== "ADMIN_REVOKE" || previous.amount !== -amount) throw new RevokeError(409,"다른 회수 요청에 사용된 ID입니다.");
        return {balanceAfter:previous.balanceAfter,alreadyRevoked:true};
      }
      const [updated] = await tx.update(usersTable).set({[balanceKey]:sql`${balance} - ${amount}`,updatedAt:new Date()})
        .where(and(eq(usersTable.id,userId),sql`${balance} >= ${amount}`)).returning({balanceAfter:balance});
      if (!updated) throw new RevokeError(409,"보유 프리즘보다 많이 회수할 수 없습니다.");
      await tx.update(table).set({balanceAfter:updated.balanceAfter}).where(eq(table.id,id));
      return {...updated,alreadyRevoked:false};
    });
    response.json(result);
  } catch(error) {
    if (error instanceof RevokeError) {response.status(error.status).json({message:error.message}); return;}
    throw error;
  }
});

export default router;