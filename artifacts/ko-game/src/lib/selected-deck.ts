export type SelectableDeck = {
  id: string;
  isValid: boolean;
};

export function resolveAvailableDeckId(
  decks: SelectableDeck[] | null,
  selectedDeckId: string | null,
): string | null {
  if (!decks) return selectedDeckId;
  const selected = selectedDeckId ? decks.find((deck) => deck.id === selectedDeckId) : undefined;
  if (selected?.isValid) return selected.id;
  return decks.find((deck) => deck.isValid)?.id ?? null;
}