import type { DeckCard, DeckValidationReason } from "../lib/decks-client";

/** Validate the copies already in a deck; reaching the owned limit is legal. */
export function cardOwnershipValidationReason(
  card: DeckCard,
  deckCount: number,
  isTestAccount: boolean,
): DeckValidationReason | null {
  const ownedCount = card.quantity;
  if (isTestAccount || ownedCount === undefined || deckCount <= ownedCount) return null;
  return {
    scope: "CARD",
    reasonCode: "CARD_QUANTITY_EXCEEDED",
    message: `보유 수량보다 ${deckCount - ownedCount}장 많이 포함되어 있습니다.`,
    cardDefinitionIds: [card.id],
    count: deckCount,
    limit: ownedCount,
  };
}

export function uniqueValidationReasons(reasons: DeckValidationReason[]): DeckValidationReason[] {
  const seen = new Set<string>();
  return reasons.filter((reason) => {
    const key = `${reason.reasonCode}:${reason.message}:${(reason.cardDefinitionIds ?? []).join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Keep authoritative saved errors, but don't repeat a local error for the same card/rule. */
export function mergeDeckValidationReasons(
  local: DeckValidationReason[],
  saved: DeckValidationReason[],
): DeckValidationReason[] {
  const localCardRules = new Set(
    local.flatMap((reason) => (reason.cardDefinitionIds ?? []).map((id) => `${reason.reasonCode}:${id}`)),
  );
  const localCodes = new Set(local.map((reason) => reason.reasonCode));
  const remainingSaved = saved.flatMap((reason) => {
    if (reason.reasonCode === "LEGENDARY_LIMIT_EXCEEDED" && localCodes.has(reason.reasonCode)) return [];
    if (!reason.cardDefinitionIds?.length) return [reason];
    const uncoveredIds = reason.cardDefinitionIds.filter((id) => !localCardRules.has(`${reason.reasonCode}:${id}`));
    return uncoveredIds.length ? [{ ...reason, cardDefinitionIds: uncoveredIds }] : [];
  });
  return uniqueValidationReasons([...local, ...remainingSaved]);
}

export function formatDeckValidationReason(
  reason: DeckValidationReason,
  cardNames: ReadonlyMap<string, string>,
): string {
  const names = reason.scope === "CARD"
    ? reason.cardDefinitionIds?.map((id) => cardNames.get(id) ?? `카드 ID ${id}`)
    : undefined;
  const prefix = reason.scope === "CARD" ? "카드 문제 · " : "덱 문제 · ";
  const count = reason.count !== undefined && reason.limit !== undefined && reason.reasonCode !== "CARD_QUANTITY_EXCEEDED"
    ? ` (${reason.count}/${reason.limit})`
    : "";
  return `${prefix}${names?.length ? `${names.join(", ")} · ` : ""}${reason.message}${count}`;
}