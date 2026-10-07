import { cardsTable, cardTagsTable, db } from "@workspace/db";
export async function availableCardTags(): Promise<string[]> {
  const [registered, cards] = await Promise.all([
    db.select({ name: cardTagsTable.name }).from(cardTagsTable),
    db.select({ tags: cardsTable.tags }).from(cardsTable),
  ]);
  return [...new Set([...registered.map(tag => tag.name), ...cards.flatMap(card => card.tags.map(tag => tag.trim()).filter(Boolean))])]
    .sort((a, b) => a.localeCompare(b, "ko"));
}
