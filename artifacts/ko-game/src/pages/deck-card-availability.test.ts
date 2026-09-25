import assert from "node:assert/strict";
import test from "node:test";

import type { DeckCard } from "../lib/decks-client.ts";
import { getDeckCardAction, getDeckCardCountView } from "./deck-card-availability.ts";

function deckCard(overrides: Partial<DeckCard> = {}): DeckCard {
  return {
    id: "card-1",
    name: "Test card",
    cardType: "WRESTLER",
    cost: 2,
    attack: 2,
    health: 3,
    text: "",
    rarity: "NORMAL",
    imageUrl: null,
    imageDisplayMode: "COVER",
    imageScale: 1,
    imagePositionX: 50,
    imagePositionY: 50,
    isToken: false,
    isChampionToken: false,
    status: "PUBLISHED",
    quantity: 1,
    ...overrides,
  };
}

const args = {
  count: 0,
  deckCount: 0,
  deckSize: 25,
  legendaryCount: 0,
  maxLegendaryCards: 5,
  isTestAccount: false,
};

test("unowned published card offers craft instead of deck add", () => {
  assert.deepEqual(getDeckCardAction(deckCard({ quantity: 0 }), args), { kind: "CRAFT" });
});

test("owned card remains addable but owned-copy limits still apply", () => {
  assert.deepEqual(getDeckCardAction(deckCard({ quantity: 2 }), args), { kind: "ADD" });
  assert.deepEqual(
    getDeckCardAction(deckCard({ quantity: 1 }), { ...args, count: 1 }),
    { kind: "DISABLED", reason: "보유 수량 1장에 도달했습니다." },
  );
  assert.deepEqual(
    getDeckCardAction(deckCard({ quantity: 3 }), { ...args, count: 2 }),
    { kind: "DISABLED", reason: "동일 카드 최대 2장" },
  );
});

test("legendary duplicate and total limits remain enforced", () => {
  assert.deepEqual(
    getDeckCardAction(deckCard({ rarity: "LEGENDARY", quantity: 2 }), { ...args, count: 1 }),
    { kind: "DISABLED", reason: "레전더리 동일 카드 1장 제한" },
  );
  assert.deepEqual(
    getDeckCardAction(deckCard({ rarity: "LEGENDARY", quantity: 2 }), {
      ...args,
      legendaryCount: args.maxLegendaryCards,
    }),
    { kind: "DISABLED", reason: `레전더리 총 ${args.maxLegendaryCards}장 제한` },
  );
});

test("tokens cannot be added and full deck remains protected", () => {
  assert.equal(getDeckCardAction(deckCard({ isToken: true }), args).kind, "DISABLED");
  assert.deepEqual(
    getDeckCardAction(deckCard(), { ...args, deckCount: args.deckSize }),
    { kind: "DISABLED", reason: `덱은 정확히 ${args.deckSize}장까지 구성할 수 있습니다.` },
  );
});

test("ownership remains immutable while deck count and availability are derived", () => {
  const card = deckCard({ quantity: 3 });
  assert.deepEqual(getDeckCardCountView(card, 0), { ownedCount: 3, deckCount: 0, availableToAdd: 3 });
  assert.deepEqual(getDeckCardCountView(card, 1), { ownedCount: 3, deckCount: 1, availableToAdd: 2 });
  assert.deepEqual(getDeckCardCountView(card, 2), { ownedCount: 3, deckCount: 2, availableToAdd: 1 });
  assert.deepEqual(getDeckCardCountView(card, 1), { ownedCount: 3, deckCount: 1, availableToAdd: 2 });
  assert.equal(card.quantity, 3);
});

test("a single owned copy cannot be added twice and full decks stay blocked", () => {
  const card = deckCard({ quantity: 1 });
  assert.deepEqual(getDeckCardAction(card, args), { kind: "ADD" });
  assert.deepEqual(
    getDeckCardAction(card, { ...args, count: 1 }),
    { kind: "DISABLED", reason: "보유 수량 1장에 도달했습니다." },
  );
  assert.deepEqual(
    getDeckCardAction(card, { ...args, deckCount: args.deckSize }),
    { kind: "DISABLED", reason: `덱은 정확히 ${args.deckSize}장까지 구성할 수 있습니다.` },
  );
});

test("AI-style cards without ownership limits do not borrow player counts", () => {
  const card = deckCard({ quantity: undefined });
  assert.deepEqual(getDeckCardCountView(card, 2), { ownedCount: undefined, deckCount: 2, availableToAdd: undefined });
  assert.deepEqual(getDeckCardAction(card, { ...args, count: 1 }), { kind: "ADD" });
});
