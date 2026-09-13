import { and, eq } from "drizzle-orm";
import {
  cardsTable,
  championsTable,
  db,
  userCardCollectionsTable,
  userChampionCollectionsTable,
} from "@workspace/db";

export async function ensureStarterCollection(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [starterCards, starterChampions] = await Promise.all([
      tx
        .select({ id: cardsTable.id })
        .from(cardsTable)
        .where(and(eq(cardsTable.status, "PUBLISHED"), eq(cardsTable.isStarterGrant, true))),
      tx
        .select({ id: championsTable.id })
        .from(championsTable)
        .where(and(eq(championsTable.status, "PUBLISHED"), eq(championsTable.isStarterGrant, true))),
    ]);

    if (starterCards.length > 0) {
      await tx
        .insert(userCardCollectionsTable)
        .values(starterCards.map((card) => ({ userId, cardDefinitionId: card.id, quantity: 1 })))
        .onConflictDoNothing();
    }
    if (starterChampions.length > 0) {
      await tx
        .insert(userChampionCollectionsTable)
        .values(starterChampions.map((champion) => ({ userId, championDefinitionId: champion.id, owned: true })))
        .onConflictDoNothing();
    }
  });
}