import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql, asc } from "drizzle-orm";
import {
  db,
  shopDecksTable,
  shopDeckPurchasesTable,
  cardsTable,
  championsTable,
  usersTable,
  decksTable,
  userCardCollectionsTable,
  userChampionCollectionsTable,
  currencyTransactionsTable,
  type CardRecord,
} from "@workspace/db";
import {
  DECK_SIZE,
  maxCardCopies,
  validateDeckCounts,
} from "@workspace/game-engine";
import {
  isTestAccountUser,
  TEST_ACCOUNT_UNLIMITED_BALANCE,
} from "./test-account";
import { SHOP_CURRENCY } from "./shop-currency";
export class ShopDeckError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type ShopDeckInput = Pick<
  typeof shopDecksTable.$inferSelect,
  | "name"
  | "description"
  | "imageUrl"
  | "cardDefinitionIds"
  | "price"
  | "recommendedChampionId"
  | "includeChampion"
  | "allowUnpublished"
  | "enabled"
  | "displayOrder"
>;
export function parseShopDeck(body: unknown): ShopDeckInput {
  const b = body as ShopDeckInput;
  if (
    !b ||
    typeof b !== "object" ||
    Array.isArray(b) ||
    typeof b.name !== "string" ||
    !b.name.trim() ||
    Array.from(b.name.trim()).length > 30 ||
    typeof b.description !== "string" ||
    b.description.length > 2000 ||
    !Number.isSafeInteger(b.price) ||
    b.price < 0 ||
    b.price > 2_000_000_000 ||
    !Number.isInteger(b.displayOrder) ||
    Math.abs(b.displayOrder) > 1_000_000 ||
    typeof b.enabled !== "boolean" ||
    typeof b.includeChampion !== "boolean" ||
    typeof b.allowUnpublished !== "boolean" ||
    !Array.isArray(b.cardDefinitionIds) ||
    b.cardDefinitionIds.length !== DECK_SIZE ||
    b.cardDefinitionIds.some(
      (id) => typeof id !== "string" || !id || id.length > 256,
    ) ||
    (b.recommendedChampionId !== null &&
      (typeof b.recommendedChampionId !== "string" ||
        !b.recommendedChampionId ||
        b.recommendedChampionId.length > 256)) ||
    (b.includeChampion && !b.recommendedChampionId) ||
    (b.imageUrl !== null &&
      (typeof b.imageUrl !== "string" ||
        !/^\/api\/storage\/objects\/uploads\/shop-decks\/[a-zA-Z0-9._-]+$/.test(
          b.imageUrl,
        )))
  )
    throw new ShopDeckError(
      400,
      "이름·가격·25장 구성·챔피언·이미지 입력을 확인해 주세요.",
    );
  return {
    name: b.name.trim(),
    description: b.description,
    imageUrl: b.imageUrl,
    cardDefinitionIds: [...b.cardDefinitionIds],
    price: b.price,
    recommendedChampionId: b.recommendedChampionId,
    includeChampion: b.includeChampion,
    allowUnpublished: b.allowUnpublished,
    enabled: b.enabled,
    displayOrder: b.displayOrder,
  };
}
export function validateShopDeckCards(
  product: Pick<ShopDeckInput, "cardDefinitionIds" | "allowUnpublished">,
  cards: CardRecord[],
) {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const counts = new Map<string, number>();
  for (const id of product.cardDefinitionIds)
    counts.set(id, (counts.get(id) ?? 0) + 1);
  let legendary = 0;
  const legendaryDefinitionCounts: number[] = [];
  for (const [id, n] of counts) {
    const c = byId.get(id);
    if (
      !c ||
      !["WRESTLER", "TECHNIQUE"].includes(c.cardType) ||
      c.isToken ||
      c.isChampionToken ||
      !["NORMAL", "EPIC", "LEGENDARY"].includes(c.rarity) ||
      !(
        c.status === "PUBLISHED" ||
        (product.allowUnpublished && c.status === "DRAFT")
      )
    )
      throw new ShopDeckError(
        422,
        "삭제·비공개·토큰 등 판매할 수 없는 카드가 포함되어 있습니다.",
      );
    if (n > maxCardCopies(c.rarity))
      throw new ShopDeckError(
        422,
        `${c.name}: 동일 카드 수량 제한을 초과했습니다.`,
      );
    if (c.rarity === "LEGENDARY") {
      legendary += n;
      legendaryDefinitionCounts.push(n);
    }
  }
  if (
    validateDeckCounts({
      cardCount: product.cardDefinitionIds.length,
      legendaryCount: legendary,
      legendaryDefinitionCounts,
      championCount: 1,
    }).length
  )
    throw new ShopDeckError(
      422,
      "25장, 레전더리 총 3장 등 일반 덱 규칙을 확인해 주세요.",
    );
}
export async function validateShopDeck(
  product: ShopDeckInput,
  database: Pick<typeof db, "select"> = db,
) {
  const ids = [...new Set(product.cardDefinitionIds)];
  const cards = ids.length
    ? await database
        .select()
        .from(cardsTable)
        .where(inArray(cardsTable.id, ids))
    : [];
  validateShopDeckCards(product, cards);
  if (product.recommendedChampionId) {
    const [c] = await database
      .select()
      .from(championsTable)
      .where(eq(championsTable.id, product.recommendedChampionId));
    if (
      !c ||
      !(
        c.status === "PUBLISHED" ||
        (product.allowUnpublished && c.status === "DRAFT")
      )
    )
      throw new ShopDeckError(422, "추천 챔피언의 공개 상태를 확인해 주세요.");
  }
  return cards;
}
/** One product per account. The durable unique receipt is also the retry key. */
export async function purchaseShopDeck(
  userId: string,
  productId: string,
  selectedChampion: unknown = null,
) {
  if (
    selectedChampion !== null &&
    (typeof selectedChampion !== "string" ||
      !selectedChampion ||
      selectedChampion.length > 256)
  )
    throw new ShopDeckError(400, "챔피언 선택을 확인해 주세요.");
  return db.transaction(async (tx) => {
    const [product] = await tx
      .select()
      .from(shopDecksTable)
      .where(eq(shopDecksTable.id, productId))
      .for("share");
    if (!product) throw new ShopDeckError(404, "덱 상품을 찾을 수 없습니다.");
    const [account] = await tx
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .for("update");
    if (!account) throw new ShopDeckError(401, "로그인이 필요합니다.");
    const [existing] = await tx
      .select()
      .from(shopDeckPurchasesTable)
      .where(
        and(
          eq(shopDeckPurchasesTable.userId, userId),
          eq(shopDeckPurchasesTable.productId, productId),
        ),
      );
    const testAccount = isTestAccountUser(account);
    if (existing)
      return {
        purchase: existing,
        deckId: existing.deckId,
        alreadyPurchased: true,
        currencyBalance: testAccount
          ? TEST_ACCOUNT_UNLIMITED_BALANCE
          : account.currencyBalance,
      };
    if (!product.enabled)
      throw new ShopDeckError(409, "현재 판매하지 않는 덱입니다.");
    // Lock the actual definitions until commit so catalog edits cannot race validation.
    const cards = await tx
      .select()
      .from(cardsTable)
      .where(inArray(cardsTable.id, [...new Set(product.cardDefinitionIds)]))
      .orderBy(asc(cardsTable.id))
      .for("share");
    validateShopDeckCards(product, cards);
    let recommended: typeof championsTable.$inferSelect | undefined;
    if (product.recommendedChampionId) {
      [recommended] = await tx
        .select()
        .from(championsTable)
        .where(eq(championsTable.id, product.recommendedChampionId))
        .for("share");
      if (
        !recommended ||
        !(
          recommended.status === "PUBLISHED" ||
          (product.allowUnpublished && recommended.status === "DRAFT")
        )
      )
        throw new ShopDeckError(
          409,
          "추천 챔피언을 사용할 수 없어 판매가 중단되었습니다.",
        );
    }
    let championId: string;
    if (product.includeChampion) {
      championId = recommended!.id;
    } else {
      const owned = await tx
        .select({ id: championsTable.id })
        .from(userChampionCollectionsTable)
        .innerJoin(
          championsTable,
          eq(
            championsTable.id,
            userChampionCollectionsTable.championDefinitionId,
          ),
        )
        .where(
          and(
            eq(userChampionCollectionsTable.userId, userId),
            eq(userChampionCollectionsTable.owned, true),
            inArray(championsTable.status, ["PUBLISHED", "DRAFT"]),
          ),
        )
        .orderBy(asc(championsTable.id));
      championId =
        (selectedChampion
          ? owned.find((c) => c.id === selectedChampion)?.id
          : (owned.find((c) => c.id === product.recommendedChampionId)?.id ??
            owned[0]?.id)) ?? "";
      if (!championId)
        throw new ShopDeckError(
          422,
          "사용할 수 있는 보유 챔피언을 먼저 선택해 주세요. 이 상품에는 챔피언이 포함되지 않습니다.",
        );
    }
    const balance = testAccount
      ? TEST_ACCOUNT_UNLIMITED_BALANCE
      : account.currencyBalance - product.price;
    if (!testAccount && balance < 0)
      throw new ShopDeckError(422, "크레딧이 부족합니다.");
    if (!testAccount)
      await tx
        .update(usersTable)
        .set({ currencyBalance: balance, updatedAt: new Date() })
        .where(eq(usersTable.id, userId));
    const counts = new Map<string, number>();
    product.cardDefinitionIds.forEach((id) =>
      counts.set(id, (counts.get(id) ?? 0) + 1),
    );
    // Materialize absent ownership rows under the same transaction before measuring
    // shortages. Concurrent pack opening cannot slip between an absent-row read
    // and the grant and inflate the recorded shortage.
    await tx
      .insert(userCardCollectionsTable)
      .values(
        [...counts.keys()].sort().map((cardDefinitionId) => ({
          userId,
          cardDefinitionId,
          quantity: 0,
        })),
      )
      .onConflictDoNothing();
    const old = await tx
      .select()
      .from(userCardCollectionsTable)
      .where(
        and(
          eq(userCardCollectionsTable.userId, userId),
          inArray(userCardCollectionsTable.cardDefinitionId, [
            ...counts.keys(),
          ]),
        ),
      )
      .orderBy(asc(userCardCollectionsTable.cardDefinitionId))
      .for("update");
    const owned = new Map(old.map((c) => [c.cardDefinitionId, c.quantity])),
      grantedCards: Record<string, number> = {};
    const grants = [...counts].sort(([a], [b]) => a.localeCompare(b));
    for (const [id, count] of grants)
      grantedCards[id] = Math.max(0, count - (owned.get(id) ?? 0));
    await tx
      .insert(userCardCollectionsTable)
      .values(
        grants.map(([cardDefinitionId, quantity]) => ({
          userId,
          cardDefinitionId,
          quantity,
        })),
      )
      .onConflictDoUpdate({
        target: [
          userCardCollectionsTable.userId,
          userCardCollectionsTable.cardDefinitionId,
        ],
        set: {
          quantity: sql`greatest(${userCardCollectionsTable.quantity}, excluded.quantity)`,
        },
      });
    if (product.includeChampion)
      await tx
        .insert(userChampionCollectionsTable)
        .values({ userId, championDefinitionId: championId, owned: true })
        .onConflictDoUpdate({
          target: [
            userChampionCollectionsTable.userId,
            userChampionCollectionsTable.championDefinitionId,
          ],
          set: { owned: true },
        });
    const deckId = randomUUID(),
      purchaseId = randomUUID();
    await tx.insert(decksTable).values({
      id: deckId,
      userId,
      name: product.name,
      championDefinitionId: championId,
      cardDefinitionIds: product.cardDefinitionIds,
      isSelected: false,
    });
    const receipt = {
      name: product.name,
      cardDefinitionIds: product.cardDefinitionIds,
      championDefinitionId: championId,
      includedChampionId: product.includeChampion ? championId : null,
      grantedCards,
      balanceAfter: balance,
    };
    const [purchase] = await tx
      .insert(shopDeckPurchasesTable)
      .values({
        id: purchaseId,
        userId,
        productId,
        deckId,
        price: product.price,
        receipt,
      })
      .returning();
    await tx.insert(currencyTransactionsTable).values({
      id: randomUUID(),
      userId,
      amount: -product.price,
      balanceAfter: balance,
      currencyType: SHOP_CURRENCY,
      type: "SHOP_DECK_PURCHASE",
      metadata: { productId, purchaseId, deckId, testAccount },
    });
    return {
      purchase,
      deckId,
      alreadyPurchased: false,
      currencyBalance: balance,
    };
  });
}
