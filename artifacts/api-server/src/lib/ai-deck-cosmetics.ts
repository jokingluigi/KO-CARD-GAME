import {legacySkinItem,legacySkinId} from "./legacy-skin-cosmetics";
import {parseBattleSprite} from "@workspace/cosmetics";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, aiDeckCosmeticsTable, cosmeticItemsTable,cardSkinDefinitionsTable,cardsTable } from "@workspace/db";
import {
  emptyCosmetics,
  skinKey,
  validImageUrl,
  parseCosmeticDisplay,
  type CosmeticItem,
  type CosmeticLoadout,
} from "@workspace/cosmetics";
/** Safe rollout: older schemas continue serving ordinary AI decks. No auto-DDL. */
export async function aiCosmeticsAvailable() {
  const result = await db.execute(
    sql`select to_regclass('public.ai_deck_cosmetics') is not null as ready`,
  );
  return result.rows[0]?.ready === true;
}
export function aiSkinLoadout(items: CosmeticItem[]): CosmeticLoadout {
  const loadout = emptyCosmetics();
  for (const item of items) {
    if (
      !item.isActive ||
      !item.targetId ||
      !["CARD_SKIN", "CHAMPION_SKIN"].includes(item.type)
    )
      continue;
    const imageAssets = Object.fromEntries(
      Object.entries(item.imageAssets ?? {}).filter(([key, value]) =>
        key === "__battle" ? item.type === "CHAMPION_SKIN" && !!parseBattleSprite(value) : key === "__display"
          ? !!parseCosmeticDisplay(value)
          : (["art", "portrait", "intro", "awakened"].includes(key) ||
              (item.type === "CHAMPION_SKIN" &&
                /^token:[a-zA-Z0-9_-]+$/.test(key))) &&
            validImageUrl(value),
      ),
    );
    loadout.skins[skinKey(item.type, item.targetId)] = { ...item, imageAssets };
  }
  return loadout;
}
export function aiSkinSelectionError(
  ids: unknown,
  items: CosmeticItem[],
  championId: string | null,
  cardIds: string[],
): string | null {
  if (
    !Array.isArray(ids) ||
    ids.length > 101 ||
    ids.some((id) => typeof id !== "string") ||
    new Set(ids).size !== ids.length
  )
    return "AI 스킨 선택을 확인해 주세요.";
  const slots = new Set<string>();
  for (const id of ids) {
    const item = items.find((item) => item.id === id);
    if (
      !item?.isActive ||
      !item.targetId ||
      !["CARD_SKIN", "CHAMPION_SKIN"].includes(item.type)
    )
      return "사용할 수 없는 스킨이 포함되어 있습니다.";
    if (
      item.type === "CHAMPION_SKIN"
        ? item.targetId !== championId
        : !cardIds.includes(item.targetId)
    )
      return "AI 덱의 챔피언 또는 카드에 맞는 스킨을 선택해 주세요.";
    const slot = skinKey(item.type, item.targetId);
    if (slots.has(slot))
      return "같은 챔피언이나 카드에는 스킨 하나만 선택할 수 있습니다.";
    slots.add(slot);
  }
  return null;
}
export async function readAIDeckCosmetics(deckIds: string[]) {
  const result = new Map<
    string,
    { cosmeticIds: string[]; cosmetics: CosmeticLoadout }
  >();
  if (!deckIds.length || !(await aiCosmeticsAvailable())) return result;
  const rows = await db
    .select({ deckId: aiDeckCosmeticsTable.deckId, item: cosmeticItemsTable })
    .from(aiDeckCosmeticsTable)
    .innerJoin(
      cosmeticItemsTable,
      eq(aiDeckCosmeticsTable.cosmeticId, cosmeticItemsTable.id),
    )
    .where(inArray(aiDeckCosmeticsTable.deckId, deckIds));
  for (const deckId of deckIds) {
    const items = rows
      .filter((row) => row.deckId === deckId)
      .map((row) => row.item as CosmeticItem);
    result.set(deckId, {
      cosmeticIds: items.map((i) => i.id),
      cosmetics: aiSkinLoadout(items),
    });
  }
  return result;
}
export async function aiSkinCatalog() {
 const [items,legacy]=await Promise.all([
  db.select().from(cosmeticItemsTable).where(and(eq(cosmeticItemsTable.isActive,true),inArray(cosmeticItemsTable.type,['CHAMPION_SKIN','CARD_SKIN']))),
  db.select({skin:cardSkinDefinitionsTable}).from(cardSkinDefinitionsTable).innerJoin(cardsTable,eq(cardsTable.id,cardSkinDefinitionsTable.cardDefinitionId)).where(and(eq(cardSkinDefinitionsTable.status,'PUBLISHED'),eq(cardsTable.status,'PUBLISHED'),eq(cardsTable.isToken,false),eq(cardsTable.isChampionToken,false)))
 ]);
 // The legacy source is authoritative. A stale/inactive bridge must not hide or revive it.
 return [...items.filter(item=>!legacySkinId(item.id)),...legacy.map(({skin})=>legacySkinItem(skin))] as CosmeticItem[];
}
