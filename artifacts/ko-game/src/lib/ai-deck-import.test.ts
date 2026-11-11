import { test } from "node:test";
import assert from "node:assert/strict";
import { readSharedAIDeck, compatibleAISkins } from "./ai-deck-import";
import {
  encodeDeck,
  deckShareLink,
  deckEntityRevision,
} from "./deck-share-code";
const card = {
    id: "one",
    name: "선수",
    cardType: "WRESTLER",
    rarity: "NORMAL",
    status: "PUBLISHED",
    cost: 1,
    attack: 1,
    health: 2,
    text: "",
    keywords: [],
    isToken: false,
    isChampionToken: false,
    imageUrl: null,
  },
  champion = {
    id: "hero",
    name: "챔피언",
    description: "",
    maxHealth: 20,
    status: "PUBLISHED",
    imageUrl: null,
  };
const options = {
  cards: [card],
  champions: [champion],
  minCardCount: 1,
  maxCardCount: 100,
  cosmetics: [
    { id: "skin", type: "CARD_SKIN", targetId: "one" },
    { id: "other", type: "CARD_SKIN", targetId: "other" },
    { id: "hero-skin", type: "CHAMPION_SKIN", targetId: "hero" },
  ] as any,
};
const snapshot = {
    name: "공유 덱",
    championId: "hero",
    championRevision: deckEntityRevision(champion),
    cards: [{ id: "one", count: 25, revision: deckEntityRevision(card) }],
  },
  code = encodeDeck(snapshot);
test("existing KO1 code and shared URL fill champion and exactly 25 card copies without ownership checks", () => {
  for (const input of [code, deckShareLink(code, "https://example.invalid")]) {
    const r = readSharedAIDeck(input, options);
    assert.equal(r.championDefinitionId, "hero");
    assert.equal(r.cardDefinitionIds.length, 25);
    assert.deepEqual(r.changed, []);
  }
});
test("invalid, missing, disabled and token cards are rejected without fallback replacement", () => {
  assert.throws(() => readSharedAIDeck(code + "bad", options));
  for (const bad of [
    { ...options, cards: [] },
    { ...options, champions: [] },
    { ...options, cards: [{ ...card, status: "DISABLED" }] },
    { ...options, cards: [{ ...card, isChampionToken: true }] },
  ])
    assert.throws(() => readSharedAIDeck(code, bad));
});
test("balance changes use the current card and warn instead of silently treating old revisions as current", () => {
  const r = readSharedAIDeck(code, {
    ...options,
    cards: [{ ...card, attack: 4, status: "DRAFT" }],
  });
  assert.deepEqual(r.changed, ["선수"]);
});
test("import retains skins only for definitions included in the imported AI deck", () => {
  assert.deepEqual(
    compatibleAISkins(
      ["skin", "hero-skin", "other", "missing"],
      options,
      "hero",
      ["one"],
    ),
    ["skin", "hero-skin"],
  );
});
