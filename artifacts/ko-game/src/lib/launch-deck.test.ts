import test from "node:test";
import assert from "node:assert/strict";
import { resolveLaunchDeck, launchDeckEditor } from "./launch-deck";
import type { Deck } from "./decks-client";
const d = (id: string, selected = false, valid = true) =>
  ({
    id,
    isSelected: selected,
    isValid: valid,
    championDefinitionId: "champion",
    invalidReasons: valid ? [] : ["카드 수 부족"],
  }) as Deck;
test("only account-selected valid deck launches, never the first available deck", () => {
  assert.equal(
    resolveLaunchDeck([d("first"), d("selected", true)]).deck?.id,
    "selected",
  );
  assert.ok(resolveLaunchDeck([d("first")]).reason);
  assert.equal(resolveLaunchDeck([d("first")]).deck, null);
  assert.match(
    resolveLaunchDeck([d("invalid", true, false), d("valid")]).reason!,
    /카드 수/,
  );
  assert.ok(resolveLaunchDeck([d("a", true), d("b", true)]).reason);
});
test("explicit rematch is honored only if it still exists and is valid; no fallback", () => {
  assert.equal(
    resolveLaunchDeck([d("selected", true), d("repeat")], "repeat").deck?.id,
    "repeat",
  );
  assert.equal(resolveLaunchDeck([d("selected", true)], "deleted").deck, null);
  assert.ok(resolveLaunchDeck([d("selected", true)], "deleted").reason);
  assert.match(launchDeckEditor("a/b"), /a%2Fb/);
});
