/**
 * 챔피언 스킨에 딸려 오는 토큰 카드 찾기.
 * 챔피언 능력·피니셔·각성 보상·챔피언 토큰에 적힌 토큰 카드와,
 * 그 토큰이 다시 만들어 내는 토큰까지 따라가서 모은다. 전투 데이터는 바꾸지 않는다.
 */
export type TokenCardLike = {
  id: string;
  isToken?: boolean | null;
  isChampionToken?: boolean | null;
  [key: string]: unknown;
};
const CHAMPION_EFFECT_FIELDS = [
  "abilityEffects",
  "gameStartAbilityEffects",
  "upgradedAbilityEffects",
  "questCondition",
  "questRewardEffects",
  "championTokenDefinitionId",
  "championTokenEffectEffects",
] as const;
const CARD_SKIP_FIELDS = new Set(["id", "name", "description", "imageUrl", "imageAssetId", "createdAt", "updatedAt", "lore", "tags"]);
export const MAX_SKIN_TOKENS = 16;

function mentioned(value: unknown, tokens: Map<string, TokenCardLike>, found: Set<string>) {
  if (value == null) return;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  for (const id of tokens.keys()) if (text.includes(id)) found.add(id);
}

export function relatedChampionTokenIds(
  champion: Record<string, unknown> | null | undefined,
  cards: readonly TokenCardLike[],
): string[] {
  if (!champion) return [];
  const tokens = new Map(cards.filter((card) => card.isToken || card.isChampionToken).map((card) => [card.id, card]));
  const found = new Set<string>();
  for (const field of CHAMPION_EFFECT_FIELDS) mentioned(champion[field], tokens, found);
  const queue = [...found];
  while (queue.length) {
    const card = tokens.get(queue.shift()!);
    if (!card) continue;
    const before = new Set(found);
    for (const [key, value] of Object.entries(card)) if (!CARD_SKIP_FIELDS.has(key)) mentioned(value, tokens, found);
    for (const id of found) if (!before.has(id)) queue.push(id);
  }
  const first = typeof champion.championTokenDefinitionId === "string" ? champion.championTokenDefinitionId : null;
  return [...found].sort((a, b) => (a === first ? -1 : b === first ? 1 : 0)).slice(0, MAX_SKIN_TOKENS);
}

/** 스킨에 그림이 들어 있는 토큰 ID 목록. */
export function skinTokenIds(assets: Record<string, unknown> | null | undefined): string[] {
  return Object.keys(assets ?? {}).filter((key) => key.startsWith("token:")).map((key) => key.slice(6));
}
