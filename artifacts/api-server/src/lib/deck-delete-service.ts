export type DeckDeleteResult =
  | { kind: "NOT_FOUND" }
  | { kind: "REFERENCED_BY_MATCH" }
  | { kind: "DELETED"; id: string };

export type DeckDeleteRepository = {
  findOwnedDeck: (userId: string, deckId: string) => Promise<{ id: string } | null>;
  hasMatchReference: (deckId: string) => Promise<boolean>;
  deleteDeck: (userId: string, deckId: string) => Promise<Array<{ id: string }>>;
};

export async function deleteOwnedDeck(
  repository: DeckDeleteRepository,
  userId: string,
  deckId: string,
): Promise<DeckDeleteResult> {
  const existing = await repository.findOwnedDeck(userId, deckId);
  if (!existing) return { kind: "NOT_FOUND" };
  if (await repository.hasMatchReference(existing.id)) return { kind: "REFERENCED_BY_MATCH" };
  try {
    const deleted = await repository.deleteDeck(userId, existing.id);
    return deleted[0] ? { kind: "DELETED", id: deleted[0].id } : { kind: "NOT_FOUND" };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23503") {
      return { kind: "REFERENCED_BY_MATCH" };
    }
    throw error;
  }
}