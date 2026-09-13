import { and, asc, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db,
  packDefinitionsTable,
  userCardCollectionsTable,
  userChampionCollectionsTable,
} from "@workspace/db";
import { getAuthenticatedUser } from "../lib/auth";
import { ensureStarterCollection } from "../lib/collection";
import { rollPack } from "./collection";

const router: IRouter = Router();

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

router.get("/", async (_request, response): Promise<void> => {
  const packs = await db.select().from(packDefinitionsTable)
    .where(and(eq(packDefinitionsTable.status, "PUBLISHED"), sql`${packDefinitionsTable.deletedAt} IS NULL`))
    .orderBy(asc(packDefinitionsTable.name));
  response.json({ packs });
});

router.post("/:id/open", async (request, response): Promise<void> => {
  const [pack] = await db.select().from(packDefinitionsTable)
    .where(and(eq(packDefinitionsTable.id, request.params.id), eq(packDefinitionsTable.status, "PUBLISHED"), sql`${packDefinitionsTable.deletedAt} IS NULL`))
    .limit(1);
  if (!pack) {
    response.status(404).json({ message: "공개된 팩을 찾을 수 없습니다." });
    return;
  }
  try {
    const rewards = await rollPack(pack);
    await db.transaction(async (tx) => {
      for (const reward of rewards) {
        if (reward.rewardType === "CHAMPION_UNLOCK") {
          await tx.insert(userChampionCollectionsTable).values({
            userId: request.authUser!.id,
            championDefinitionId: reward.championDefinitionId,
            owned: true,
          }).onConflictDoUpdate({
            target: [userChampionCollectionsTable.userId, userChampionCollectionsTable.championDefinitionId],
            set: { owned: true },
          });
        } else {
          await tx.insert(userCardCollectionsTable).values({
            userId: request.authUser!.id,
            cardDefinitionId: reward.cardDefinitionId,
            quantity: 1,
          }).onConflictDoUpdate({
            target: [userCardCollectionsTable.userId, userCardCollectionsTable.cardDefinitionId],
            set: { quantity: sql`${userCardCollectionsTable.quantity} + 1`, obtainedAt: new Date() },
          });
        }
      }
    });
    response.json({ rewards });
  } catch (error) {
    response.status(422).json({ message: error instanceof Error ? error.message : "현재 이 팩은 개봉할 수 없습니다." });
  }
});

export default router;