import assert from "node:assert/strict";
import test from "node:test";
import { deleteOwnedDeck, type DeckDeleteRepository } from "./deck-delete-service";

function repository(overrides: Partial<DeckDeleteRepository> = {}): DeckDeleteRepository {
  return {
    findOwnedDeck: async () => ({ id: "deck-fixture" }),
    hasMatchReference: async () => false,
    deleteDeck: async () => [{ id: "deck-fixture" }],
    ...overrides,
  };
}

test("fixture delete allows the owner and deletes only the requested deck", async () => {
  const deleted: string[] = [];
  const result = await deleteOwnedDeck(repository({
    deleteDeck: async (_userId, deckId) => {
      deleted.push(deckId);
      return [{ id: deckId }];
    },
  }), "owner-fixture", "deck-fixture");
  assert.deepEqual(result, { kind: "DELETED", id: "deck-fixture" });
  assert.deepEqual(deleted, ["deck-fixture"]);
});

test("unknown and foreign fixture IDs share the same not-found result", async () => {
  const result = await deleteOwnedDeck(repository({
    findOwnedDeck: async () => null,
  }), "owner-fixture", "unknown-or-foreign");
  assert.deepEqual(result, { kind: "NOT_FOUND" });
});

test("a deck referenced by a match is rejected without calling delete", async () => {
  let deleteCalls = 0;
  const result = await deleteOwnedDeck(repository({
    hasMatchReference: async () => true,
    deleteDeck: async () => {
      deleteCalls += 1;
      return [];
    },
  }), "owner-fixture", "deck-fixture");
  assert.deepEqual(result, { kind: "REFERENCED_BY_MATCH" });
  assert.equal(deleteCalls, 0);
});

test("a PostgreSQL foreign-key race maps to the same conflict without cascading", async () => {
  let cascadeCalls = 0;
  const result = await deleteOwnedDeck(repository({
    deleteDeck: async () => {
      cascadeCalls += 1;
      throw { code: "23503" };
    },
  }), "owner-fixture", "deck-fixture");
  assert.deepEqual(result, { kind: "REFERENCED_BY_MATCH" });
  assert.equal(cascadeCalls, 1);
});