import test from "node:test";
import assert from "node:assert/strict";
import { explicitReferences } from "./related-cards";
import { changeShelf, readShelf } from "./shelf";
test("related cards resolve explicit generation references, never target filters or prose", () => {
  assert.deepEqual(
    [
      ...explicitReferences({
        effects: [
          { action: "SUMMON", values: { definitionRef: { id: "token" } } },
          {
            action: "TRANSFORM_TARGET",
            values: { definitionRef: { name: "Awakened" } },
          },
          {
            action: "DAMAGE",
            target: { filter: { definitionRef: { id: "enemy" } } },
          },
        ],
        text: "token other",
      }),
    ],
    ["token", "name:Awakened"],
  );
});
test("browser shelf is account-scoped, tolerates corrupt storage and quota errors", () => {
  const data = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
    clear: () => data.clear(),
    key: () => null,
    length: 0,
  };
  globalThis.window = new EventTarget() as unknown as Window &
    typeof globalThis;
  assert.equal(
    changeShelf("a", (s) => ({
      ...s,
      wishes: [{ id: "one", kind: "card", name: "One" }],
    })),
    true,
  );
  assert.equal(readShelf("a").wishes.length, 1);
  assert.equal(readShelf("b").wishes.length, 0);
  data.set("ko-player-shelf:b", "{bad");
  assert.deepEqual(readShelf("b").wishes, []);
  localStorage.setItem = () => {
    throw Error("quota");
  };
  assert.equal(
    changeShelf("a", (s) => s),
    false,
  );
});

import { observePublicCards } from "./public-cards-policy";
import type { GameState } from "../../game";
test("public cards never inspect concealed hands/decks or infer private discards", () => {
  const opponent = {
    id: "opp",
    board: [{ instanceId: "visible", definitionId: "public" }],
    graveyard: [{ instanceId: "discard", definitionId: "private" }],
    get hand() {
      throw Error("hidden hand read");
    },
    get deck() {
      throw Error("hidden deck read");
    },
  };
  const s = {
    players: [{ id: "me" }, opponent],
    events: [],
  } as unknown as GameState;
  const seen = new Map<string, string>();
  assert.deepEqual(observePublicCards(s, seen), ["public"]);
  s.events.push({
    type: "CARD_PLAYED",
    playerId: "opp",
    cardInstanceId: "discard",
  });
  assert.deepEqual(observePublicCards(s, seen), ["public", "private"]);
  opponent.board = [];
  assert.deepEqual(observePublicCards(s, seen), ["public", "private"]);
});
