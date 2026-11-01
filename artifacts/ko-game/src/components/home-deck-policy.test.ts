import test from "node:test";
import assert from "node:assert/strict";
import { homeDeckSummary } from "./home-deck-policy";
import type { Deck } from "@/lib/decks-client";
test("home summary counts repeated physical cards and hides incomplete data instead of estimating", () => {
  const deck = {
    cards: [
      { id: "a", cost: 2, cardType: "WRESTLER" },
      { id: "b", cost: 5, cardType: "TECHNIQUE" },
    ],
    cardDefinitionIds: ["a", "a", "b"],
  } as Deck;
  assert.deepEqual(homeDeckSummary(deck), {
    average: 3,
    wrestlers: 2,
    spells: 1,
  });
  assert.equal(
    homeDeckSummary({ ...deck, cardDefinitionIds: ["missing"] }),
    null,
  );
  assert.equal(homeDeckSummary({ ...deck, cardDefinitionIds: [] }), null);
  assert.equal(
    homeDeckSummary({ ...deck, cards: undefined } as unknown as Deck),
    null,
  );
});
