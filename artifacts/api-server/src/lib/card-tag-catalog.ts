import { cardsTable, cardTagsTable, db } from "@workspace/db";
export async function availableCardTags(): Promise<string[]> {
  const [registered, cards] = await Promise.all([
    db.select({ name: cardTagsTable.name }).from(cardTagsTable),
    db.select({ tags: cardsTable.tags }).from(cardsTable),
  ]);
  return [
    ...new Set([
      ...registered.map((tag) => tag.name),
      ...cards.flatMap((card) =>
        card.tags.map((tag) => tag.trim()).filter(Boolean),
      ),
    ]),
  ].sort((a, b) => a.localeCompare(b, "ko"));
}

/** Public labels only; names remain the stable keys used by authored effects. */
export async function cardTagLabels(): Promise<Record<string, string>> {
  const records = await db
    .select({
      name: cardTagsTable.name,
      displayName: cardTagsTable.displayName,
    })
    .from(cardTagsTable);
  return Object.fromEntries(
    records.map((tag) => [tag.name, tag.displayName?.trim() || tag.name]),
  );
}
