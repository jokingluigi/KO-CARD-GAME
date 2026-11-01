import type { CardDefinition, CardInstance } from "./types";
/** Rarity and token identity are separate: normal tokens and non-token cards do not inherit this rule. */
export function championTokenSilenceImmune(
  card: Pick<CardInstance, "isToken" | "isChampionToken">,
  definition?: Pick<CardDefinition, "rarity" | "isToken" | "isChampionToken">,
): boolean {
  return (
    definition?.rarity === "CHAMPION" &&
    Boolean(
      card.isToken ||
      card.isChampionToken ||
      definition.isToken ||
      definition.isChampionToken,
    )
  );
}
