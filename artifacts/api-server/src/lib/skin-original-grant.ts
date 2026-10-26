import { and, eq, lte } from "drizzle-orm";
import {
  db,
  userCardCollectionsTable as cards,
  userChampionCollectionsTable as champions,
} from "@workspace/db";
/** Only called inside the pack claim transaction. Never adds another copy to an owned original. */
export async function grantSkinOriginal(
  tx: Pick<typeof db, "insert" | "update">,
  userId: string,
  type: "CARD" | "CHAMPION",
  id: string,
) {
  if (type === "CHAMPION") {
    const inserted = await tx
      .insert(champions)
      .values({ userId, championDefinitionId: id, owned: true })
      .onConflictDoNothing()
      .returning({ id: champions.championDefinitionId });
    if (inserted.length) return true;
    const restored = await tx
      .update(champions)
      .set({ owned: true, obtainedAt: new Date() })
      .where(
        and(
          eq(champions.userId, userId),
          eq(champions.championDefinitionId, id),
          eq(champions.owned, false),
        ),
      )
      .returning({ id: champions.championDefinitionId });
    return restored.length > 0;
  }
  const inserted = await tx
    .insert(cards)
    .values({ userId, cardDefinitionId: id, quantity: 1 })
    .onConflictDoNothing()
    .returning({ id: cards.cardDefinitionId });
  if (inserted.length) return true;
  const restored = await tx
    .update(cards)
    .set({ quantity: 1, obtainedAt: new Date() })
    .where(
      and(
        eq(cards.userId, userId),
        eq(cards.cardDefinitionId, id),
        lte(cards.quantity, 0),
      ),
    )
    .returning({ id: cards.cardDefinitionId });
  return restored.length > 0;
}
