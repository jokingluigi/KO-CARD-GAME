import { and, asc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  db,
  championPrismTransactionsTable,
  packDefinitionsTable,
  packOpeningClaimsTable,
  userCardCollectionsTable,
  userChampionCollectionsTable,
  userCardSkinCollectionsTable,
  userPackInventoryTable,
  usersTable,
} from "@workspace/db";
import { getAuthenticatedUser } from "../lib/auth";
import { ensureStarterCollection } from "../lib/collection";
import { rollPack } from "./collection";
import { getPackDetails } from "../lib/pack-details";
import { getChampionPrismSetting } from "../lib/champion-prism";
import { isTestAccountUser, TEST_ACCOUNT_UNLIMITED_BALANCE } from "../lib/test-account";

const router: IRouter = Router();

class PackOpenError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

router.use(async (request, response, next) => {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      response.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }
    request.authUser = user;
    await ensureStarterCollection(user.id);
    next();
  } catch (error) {
    next(error);
  }
});

router.get("/", async (request, response): Promise<void> => {
  const packs = await db.select({
    pack: packDefinitionsTable,
    quantity: sql<number>`coalesce(${userPackInventoryTable.quantity}, 0)::int`,
  }).from(packDefinitionsTable)
    .leftJoin(userPackInventoryTable, and(
      eq(userPackInventoryTable.packDefinitionId, packDefinitionsTable.id),
      eq(userPackInventoryTable.userId, request.authUser!.id),
    ))
    .where(and(eq(packDefinitionsTable.status, "PUBLISHED"), sql`${packDefinitionsTable.deletedAt} IS NULL`))
    .orderBy(asc(packDefinitionsTable.name));
  response.json({ packs: packs.map(({ pack, quantity }) => ({ ...pack, quantity })) });
});

router.get("/:id/details", async (request, response): Promise<void> => {
  const [pack] = await db.select().from(packDefinitionsTable)
    .where(and(
      eq(packDefinitionsTable.id, request.params.id),
      eq(packDefinitionsTable.status, "PUBLISHED"),
      sql`${packDefinitionsTable.deletedAt} IS NULL`,
    ))
    .limit(1);
  if (!pack) {
    response.status(404).json({ message: "공개된 팩을 찾을 수 없습니다." });
    return;
  }
  response.json({ pack, details: await getPackDetails(pack) });
});

router.post("/:id/open", async (request, response): Promise<void> => {
  const idempotencyKey = request.get("Idempotency-Key")?.trim() ?? "";
  if (!idempotencyKey || idempotencyKey.length > 200) {
    response.status(400).json({ message: "팩 개봉 요청 식별자가 필요합니다." });
    return;
  }
  try {
    const rewards = await db.transaction(async (tx) => {
      const [existingClaim] = await tx.select().from(packOpeningClaimsTable)
        .where(and(
          eq(packOpeningClaimsTable.userId, request.authUser!.id),
          eq(packOpeningClaimsTable.idempotencyKey, idempotencyKey),
        ))
        .limit(1);
      if (existingClaim) {
        if (existingClaim.packDefinitionId !== request.params.id) {
          throw new PackOpenError(409, "이미 다른 팩에 사용된 개봉 요청 식별자입니다.");
        }
        return existingClaim.rewards;
      }

      const [claim] = await tx.insert(packOpeningClaimsTable).values({
        id: randomUUID(),
        userId: request.authUser!.id,
        packDefinitionId: request.params.id,
        idempotencyKey,
        rewards: [],
      }).onConflictDoNothing().returning();
      if (!claim) {
        const [retryClaim] = await tx.select().from(packOpeningClaimsTable)
          .where(and(
            eq(packOpeningClaimsTable.userId, request.authUser!.id),
            eq(packOpeningClaimsTable.idempotencyKey, idempotencyKey),
          ))
          .limit(1);
        if (!retryClaim) throw new PackOpenError(409, "팩 개봉 요청이 이미 처리 중입니다.");
        if (retryClaim.packDefinitionId !== request.params.id) {
          throw new PackOpenError(409, "이미 다른 팩에 사용된 개봉 요청 식별자입니다.");
        }
        return retryClaim.rewards;
      }

      const [pack] = await tx.select().from(packDefinitionsTable)
        .where(and(eq(packDefinitionsTable.id, request.params.id), eq(packDefinitionsTable.status, "PUBLISHED"), sql`${packDefinitionsTable.deletedAt} IS NULL`))
        .limit(1);
      if (!pack) throw new Error("공개된 팩을 찾을 수 없습니다.");
      if (pack.normalRate + pack.legendaryRate + pack.championRate !== 100) {
        throw new Error("팩 확률 설정이 올바르지 않습니다.");
      }
      const [spent] = await tx.update(userPackInventoryTable).set({
        quantity: sql`${userPackInventoryTable.quantity} - 1`,
        updatedAt: new Date(),
      }).where(and(
        eq(userPackInventoryTable.userId, request.authUser!.id),
        eq(userPackInventoryTable.packDefinitionId, pack.id),
        sql`${userPackInventoryTable.quantity} > 0`,
      )).returning();
      if (!spent) throw new Error("보유한 팩이 없습니다.");

      const nextRewards = await rollPack(pack, tx);
      for (const reward of nextRewards) {
        if (reward.rewardType === "NORMAL_CARD" || reward.rewardType === "LEGENDARY_CARD") {
          const card = reward.card;
          await tx.insert(userCardCollectionsTable).values({
            userId: request.authUser!.id, cardDefinitionId: card.id, quantity: 1,
          }).onConflictDoUpdate({
            target: [userCardCollectionsTable.userId, userCardCollectionsTable.cardDefinitionId],
            set: { quantity: sql`${userCardCollectionsTable.quantity} + 1`, obtainedAt: new Date() },
          });
        } else if (reward.rewardType === "CHAMPION_UNLOCK") {
          const champion = reward.champion;
          const [existingChampion] = await tx.select({ owned: userChampionCollectionsTable.owned })
            .from(userChampionCollectionsTable)
            .where(and(
              eq(userChampionCollectionsTable.userId, request.authUser!.id),
              eq(userChampionCollectionsTable.championDefinitionId, champion.id),
            ))
            .limit(1);
          let newlyOwned = false;
          if (!existingChampion) {
            const [inserted] = await tx.insert(userChampionCollectionsTable).values({
              userId: request.authUser!.id, championDefinitionId: champion.id, owned: true,
            }).onConflictDoNothing().returning({ championDefinitionId: userChampionCollectionsTable.championDefinitionId });
            newlyOwned = Boolean(inserted);
          }
          if (!newlyOwned && existingChampion?.owned !== true) {
            const [restored] = await tx.update(userChampionCollectionsTable).set({
              owned: true,
              obtainedAt: new Date(),
            }).where(and(
              eq(userChampionCollectionsTable.userId, request.authUser!.id),
              eq(userChampionCollectionsTable.championDefinitionId, champion.id),
              eq(userChampionCollectionsTable.owned, false),
            )).returning({ championDefinitionId: userChampionCollectionsTable.championDefinitionId });
            newlyOwned = Boolean(restored);
          }
          reward.alreadyOwned = !newlyOwned;
          if (!newlyOwned) {
            const setting = await getChampionPrismSetting(tx);
            if (!setting) throw new Error("챔피언 중복 보상 설정이 없어 팩을 열 수 없습니다.");
            let championPrismBalance = request.authUser!.championPrismBalance;
            if (!isTestAccountUser(request.authUser!)) {
              const [updatedUser] = await tx.update(usersTable).set({
                championPrismBalance: sql`${usersTable.championPrismBalance} + ${setting.duplicateReward}`,
                updatedAt: new Date(),
              }).where(eq(usersTable.id, request.authUser!.id))
                .returning({ championPrismBalance: usersTable.championPrismBalance });
              if (!updatedUser) throw new Error("사용자를 찾을 수 없습니다.");
              championPrismBalance = updatedUser.championPrismBalance;
            } else {
              championPrismBalance = TEST_ACCOUNT_UNLIMITED_BALANCE;
            }
            await tx.insert(championPrismTransactionsTable).values({
              id: randomUUID(),
              userId: request.authUser!.id,
              type: "PACK_DUPLICATE",
              amount: setting.duplicateReward,
              balanceAfter: championPrismBalance,
              championDefinitionId: champion.id,
              metadata: JSON.stringify({ packDefinitionId: pack.id }),
            });
            reward.championPrismReward = setting.duplicateReward;
          }
        } else {
          const [existingSkin] = await tx.select({ id: userCardSkinCollectionsTable.skinDefinitionId })
            .from(userCardSkinCollectionsTable)
            .where(and(
              eq(userCardSkinCollectionsTable.userId, request.authUser!.id),
              eq(userCardSkinCollectionsTable.skinDefinitionId, reward.skinDefinitionId),
            )).limit(1);
          reward.alreadyOwned = Boolean(existingSkin);
          await tx.insert(userCardSkinCollectionsTable).values({
            userId: request.authUser!.id,
            skinDefinitionId: reward.skinDefinitionId,
          }).onConflictDoNothing();
        }
      }
      const resultRewards = nextRewards.map((reward) => reward.rewardType === "CHAMPION_UNLOCK"
        ? { ...reward, alreadyOwned: reward.alreadyOwned ?? false }
        : reward);
      await tx.update(packOpeningClaimsTable)
        .set({ rewards: resultRewards })
        .where(eq(packOpeningClaimsTable.id, claim.id));
      return resultRewards;
    });
    response.json({ rewards });
  } catch (error) {
    const status = error instanceof PackOpenError
      ? error.status
      : error instanceof Error && error.message === "공개된 팩을 찾을 수 없습니다." ? 404 : 422;
    response.status(status)
      .json({ message: error instanceof Error ? error.message : "현재 이 팩은 개봉할 수 없습니다." });
  }
});

export default router;