import { cardsTable, db } from "@workspace/db";
import { createAwakeningCards } from "@workspace/game-engine";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Called only when an administrator explicitly saves an awakening champion. */
export async function ensureAwakeningCards(
  transaction: Transaction,
): Promise<void> {
  await transaction
    .insert(cardsTable)
    .values(
      createAwakeningCards().map((card) => ({
        id: card.id,
        name: card.name,
        cardType: "WRESTLER",
        cost: card.cost,
        attack: card.attack,
        health: card.health,
        text: card.rulesText,
        rarity: "CHAMPION",
        isToken: true,
        isChampionToken: true,
        isStarterGrant: false,
        status: "DRAFT",
        keywords: [],
        tags: [],
        effectId: card.effectId,
        effectConfig: card.effectConfig,
      })),
    )
    .onConflictDoNothing();
}
