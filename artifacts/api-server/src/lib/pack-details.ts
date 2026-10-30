import {validPackRates} from "@workspace/cosmetics";
import {packEmotePool} from "./pack-emote-pool";
import { championSkinArtwork } from "@workspace/cosmetics";
import { championSkinPool } from "./champion-skin-pool";
import { and, eq, inArray } from "drizzle-orm";
import {
  cardsTable,
  cardSkinDefinitionsTable,
  championsTable,
  db,
  type PackDefinitionRecord,
} from "@workspace/db";

type PackDetailExecutor = Pick<typeof db,"select">;
export type PackDetailInput=Pick<PackDefinitionRecord,"normalRate"|"epicRate"|"legendaryRate"|"championRate"|"skinChance"|"emoteRate"|"normalCardPool"|"epicCardPool"|"legendaryCardPool"|"championPool"|"skinPool"|"emotePool">;

function cardView(card: typeof cardsTable.$inferSelect) {
  return {
    id: card.id,
    name: card.name,
    cardType: card.cardType,
    cost: card.cost,
    attack: card.attack,
    health: card.health,
    text: card.text,
    rarity: card.rarity,
    imageUrl: card.imageUrl,
    imageDisplayMode: card.imageDisplayMode,
    imageScale: card.imageScale,
    imagePositionX: card.imagePositionX,
    imagePositionY: card.imagePositionY,
  };
}

export async function getPackDetails(
  pack: PackDetailInput,
  executor: PackDetailExecutor = db,
) {
  const [normalCards, epicCards, legendaryCards, champions, skins, championSkins, emotes] = await Promise.all([
    pack.normalCardPool.length
      ? executor.select().from(cardsTable).where(and(
        inArray(cardsTable.id, pack.normalCardPool),
        eq(cardsTable.status, "PUBLISHED"),
        eq(cardsTable.rarity, "NORMAL"),
        eq(cardsTable.isToken, false),
        eq(cardsTable.isChampionToken, false),
      ))
      : [],
    pack.epicCardPool.length
      ? executor.select().from(cardsTable).where(and(
        inArray(cardsTable.id, pack.epicCardPool),
        eq(cardsTable.status, "PUBLISHED"),
        eq(cardsTable.rarity, "EPIC"),
        eq(cardsTable.isToken, false),
        eq(cardsTable.isChampionToken, false),
      ))
      : [],
    pack.legendaryCardPool.length
      ? executor.select().from(cardsTable).where(and(
        inArray(cardsTable.id, pack.legendaryCardPool),
        eq(cardsTable.status, "PUBLISHED"),
        eq(cardsTable.rarity, "LEGENDARY"),
        eq(cardsTable.isToken, false),
        eq(cardsTable.isChampionToken, false),
      ))
      : [],
    pack.championPool.length
      ? executor.select().from(championsTable).where(and(
        inArray(championsTable.id, pack.championPool),
        eq(championsTable.status, "PUBLISHED"),
      ))
      : [],
    pack.skinPool.length
      ? executor.select({
        skin: cardSkinDefinitionsTable,
        card: cardsTable,
      }).from(cardSkinDefinitionsTable)
        .innerJoin(cardsTable, eq(cardsTable.id, cardSkinDefinitionsTable.cardDefinitionId))
        .where(and(
          inArray(cardSkinDefinitionsTable.id, pack.skinPool),
          eq(cardSkinDefinitionsTable.status, "PUBLISHED"),
          eq(cardsTable.status, "PUBLISHED"),
          eq(cardsTable.isToken, false),
          eq(cardsTable.isChampionToken, false),
        ))
      : [],
    championSkinPool(pack.skinPool, executor),
    packEmotePool(pack.emotePool??[],executor),
  ]);

  const skinCount = skins.length + championSkins.length;
  const invalidReasons = [
    pack.normalRate > 0 && normalCards.length === 0 ? "일반 카드 풀이 비어 있습니다." : null,
    pack.epicRate > 0 && epicCards.length === 0 ? "에픽 카드 풀이 비어 있습니다." : null,
    pack.legendaryRate > 0 && legendaryCards.length === 0 ? "레전더리 카드 풀이 비어 있습니다." : null,
    pack.championRate > 0 && champions.length === 0 ? "Champion 풀이 비어 있습니다." : null,
    pack.emoteRate>0&&!emotes.length ? "이모티콘 풀이 비어 있습니다." : null,
    pack.skinChance > 0 && skinCount === 0 ? "스킨 풀이 비어 있습니다." : null,
  ].filter((reason): reason is string => Boolean(reason));

  return {
    valid: invalidReasons.length === 0 && validPackRates(pack),
    invalidReasons: !validPackRates(pack)
      ? ["스킨·이모티콘을 포함한 전체 확률 합계가 100%가 아닙니다.", ...invalidReasons]
      : invalidReasons,
    emotes:emotes.map(cosmetic=>({cosmetic,individualProbability:emotes.length?pack.emoteRate/emotes.length:0})),
    normalCards: normalCards.map((card) => ({
      ...cardView(card),
      individualProbability: normalCards.length ? pack.normalRate / normalCards.length : 0,
    })),
    epicCards: epicCards.map((card) => ({ ...cardView(card), individualProbability: epicCards.length ? pack.epicRate / epicCards.length : 0 })),
    legendaryCards: legendaryCards.map((card) => ({
      ...cardView(card),
      individualProbability: legendaryCards.length ? pack.legendaryRate / legendaryCards.length : 0,
    })),
    champions: champions.map((champion) => ({
      id: champion.id,
      name: champion.name,
      description: champion.description,
      imageUrl: champion.imageUrl,
      imageDisplayMode: champion.imageDisplayMode,
      imageScale: champion.imageScale,
      imagePositionX: champion.imagePositionX,
      imagePositionY: champion.imagePositionY,
      maxHealth: champion.maxHealth,
      abilityName: champion.abilityName,
      abilityCost: champion.abilityCost,
      abilityText: champion.abilityText,
      individualProbability: champions.length ? pack.championRate / champions.length : 0,
    })),
    skins: [...skins.map(({ skin, card }) => ({
      id: skin.id,
      name: skin.name,
      description: skin.description,
      imageUrl: skin.imageUrl,
      imageDisplayMode: skin.imageDisplayMode,
      imageScale: skin.imageScale,
      imagePositionX: skin.imagePositionX,
      imagePositionY: skin.imagePositionY,
      card: cardView(card),
      individualProbability: skinCount ? pack.skinChance / skinCount : 0,
    })), ...championSkins.map(({ cosmetic, champion }) => ({
      id: cosmetic.id, name: `${cosmetic.name} · 챔피언 스킨 세트`, description: cosmetic.description,
      imageUrl: championSkinArtwork(cosmetic.imageAssets) ?? cosmetic.imageAssets.awakened ?? null,
      imageDisplayMode: "CONTAIN", imageScale: 1, imagePositionX: 50, imagePositionY: 50,
      card: { id: champion.id, name: champion.name, cardType: "CHAMPION", cost: 0, attack: 0, health: champion.maxHealth, text: champion.abilityText, rarity: "CHAMPION", imageUrl: champion.imageUrl, imageDisplayMode: "CONTAIN", imageScale: 1, imagePositionX: 50, imagePositionY: 50 },
      individualProbability: skinCount ? pack.skinChance / skinCount : 0, cosmetic,
    }))],
  };
}
