import assert from "node:assert/strict";
import test from "node:test";

import { validateDeckCounts } from "@workspace/game-engine";
import type { DeckCard, DeckValidationReason } from "../lib/decks-client";
import { getDeckCardAction, getDeckCardCountView } from "./deck-card-availability";
import { cardOwnershipValidationReason, formatDeckValidationReason, mergeDeckValidationReasons } from "./deck-validation";

function card(quantity: number, rarity: string = "NORMAL", id = "first-card"): DeckCard {
  return {
    id, name: "First card", cardType: "WRESTLER", cost: 1, attack: 1, health: 1,
    text: "", rarity, imageUrl: null, imageDisplayMode: "COVER", imageScale: 1,
    imagePositionX: 50, imagePositionY: 50, isToken: false, isChampionToken: false,
    status: "PUBLISHED", quantity,
  };
}

const actionArgs = {
  count: 0, deckCount: 0, deckSize: 25, legendaryCount: 0,
  maxLegendaryCards: 5, isTestAccount: false,
};

test("existing normal cards are legal at the owned limit; adding one more is disabled", () => {
  for (const [owned, count, valid, canAdd] of [
    [1, 0, true, true],
    [1, 1, true, false],
    [1, 2, false, false],
    [2, 1, true, true],
    [2, 2, true, false],
    [2, 3, false, false],
  ] as const) {
    const ownedCard = card(owned);
    assert.equal(cardOwnershipValidationReason(ownedCard, count, false) === null, valid, `${owned}/${count} validity`);
    assert.equal(getDeckCardAction(ownedCard, { ...actionArgs, count }).kind === "ADD", canAdd, `${owned}/${count} can add`);
    assert.deepEqual(getDeckCardCountView(ownedCard, count), {
      ownedCount: owned, deckCount: count, availableToAdd: Math.max(0, owned - count),
    });
  }
  assert.equal(cardOwnershipValidationReason(card(1), 2, false)?.message, "보유 수량보다 1장 많이 포함되어 있습니다.");
});

test("legendary equality is legal, while a second copy exceeds the separate duplicate rule", () => {
  const legendary = card(1, "LEGENDARY");
  assert.equal(cardOwnershipValidationReason(legendary, 1, false), null);
  assert.deepEqual(getDeckCardAction(legendary, { ...actionArgs, count: 1 }), {
    kind: "DISABLED", reason: "레전더리 동일 카드 1장 제한",
  });
  assert.ok(cardOwnershipValidationReason(legendary, 2, false));
  assert.deepEqual(validateDeckCounts({
    cardCount: 25, legendaryCount: 2, legendaryDefinitionCounts: [2], championCount: 1,
  }), ["DUPLICATE_LEGENDARY"]);
});

test("a 25-card owned deck allows exactly five distinct legendaries, not six or 24/26 cards", () => {
  const ownedCards = Array.from({ length: 25 }, (_, i) => card(1, i < 5 ? "LEGENDARY" : "NORMAL", `card-${i}`));
  assert.ok(ownedCards.every((entry) => cardOwnershipValidationReason(entry, 1, false) === null));
  assert.deepEqual(validateDeckCounts({
    cardCount: ownedCards.length, legendaryCount: 5, legendaryDefinitionCounts: [1, 1, 1, 1, 1], championCount: 1,
  }), []);
  assert.deepEqual(validateDeckCounts({ cardCount: 24, legendaryCount: 5, championCount: 1 }), ["INVALID_CARD_COUNT"]);
  assert.deepEqual(validateDeckCounts({ cardCount: 26, legendaryCount: 5, championCount: 1 }), ["INVALID_CARD_COUNT"]);
  assert.deepEqual(validateDeckCounts({ cardCount: 25, legendaryCount: 6, championCount: 1 }), ["TOO_MANY_LEGENDARIES"]);
  assert.equal(cardOwnershipValidationReason(card(1), 1, true), null);
});

test("saved and live errors for the same card are not repeated, and real errors identify the card", () => {
  const first = card(1);
  const second = card(2, "NORMAL", "second-card");
  const local = [
    cardOwnershipValidationReason(first, 2, false)!,
    cardOwnershipValidationReason(second, 3, false)!,
  ];
  const saved: DeckValidationReason[] = [{
    scope: "CARD", reasonCode: "CARD_QUANTITY_EXCEEDED",
    message: "현재 보유 수량보다 많은 카드가 덱에 포함되어 있습니다.",
    cardDefinitionIds: [first.id, second.id],
  }];
  const merged = mergeDeckValidationReasons(local, saved);
  assert.deepEqual(merged, local);
  const names = new Map([[first.id, "퍼스트"], [second.id, "세컨드"]]);
  assert.equal(formatDeckValidationReason(merged[0]!, names), "카드 문제 · 퍼스트 · 보유 수량보다 1장 많이 포함되어 있습니다.");
  assert.equal(formatDeckValidationReason(merged[1]!, names), "카드 문제 · 세컨드 · 보유 수량보다 1장 많이 포함되어 있습니다.");
  assert.equal(formatDeckValidationReason(saved[0]!, names), "카드 문제 · 퍼스트, 세컨드 · 현재 보유 수량보다 많은 카드가 덱에 포함되어 있습니다.");
  assert.deepEqual(mergeDeckValidationReasons([], saved), saved);
});