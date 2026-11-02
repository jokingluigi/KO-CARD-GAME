import { championTokenSilenceImmune } from "../game/cards/silence-immunity";
type ProtectionRecord = {
  rarity?: string | null;
  isToken?: boolean;
  isChampionToken?: boolean;
  isSilenceImmune?: boolean;
};
/** Presentation only: use the same token/rarity rule as the engine, never card names or artwork. */
export function cardSilenceProtection(
  card: ProtectionRecord,
  definition?: ProtectionRecord,
) {
  const source = definition ?? card;
  const intrinsic = championTokenSilenceImmune(
    {
      isToken: Boolean(card.isToken),
      isChampionToken: Boolean(card.isChampionToken),
    },
    source.rarity === "CHAMPION"
      ? {
          rarity: "CHAMPION",
          isToken: Boolean(source.isToken),
          isChampionToken: Boolean(source.isChampionToken),
        }
      : undefined,
  );
  return { intrinsic, immune: Boolean(card.isSilenceImmune) || intrinsic };
}
