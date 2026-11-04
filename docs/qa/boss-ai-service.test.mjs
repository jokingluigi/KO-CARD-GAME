import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { startTutorialFixture } from "./tutorial-rewards-fixture.mjs";
let f;
before(async () => {
  f = await startTutorialFixture();
  await f.db
    .insert(f.schema.aiDecksTable)
    .values({
      id: "legacy-normal",
      name: "Legacy bot",
      championDefinitionId: "reward-champion",
      cardDefinitionIds: ["reward-unit"],
      difficulty: "NORMAL",
      enabled: true,
    });
});
after(async () => {
  await f.close();
});
async function request(path, method = "GET", body) {
  const r = await fetch(f.origin + path, {
    method,
    headers: { Cookie: f.cookie, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await r.json();
  assert.ok(r.ok, JSON.stringify(json));
  return json;
}
test("existing NORMAL bot is served as highest difficulty without rewriting the saved deck", async () => {
  const data = await request("/api/ai-decks");
  assert.equal(
    data.decks.find((d) => d.id === "legacy-normal").difficulty,
    "BOSS",
  );
  const [stored] = await f.db.select().from(f.schema.aiDecksTable);
  assert.equal(stored.difficulty, "NORMAL");
  assert.deepEqual(stored.cardDefinitionIds, ["reward-unit"]);
});
test("creating and editing a bot cannot lower runtime difficulty through a legacy client", async () => {
  const payload = {
    name: "Highest bot",
    description: "",
    championDefinitionId: "reward-champion",
    cardDefinitionIds: ["reward-unit"],
    difficulty: "NORMAL",
    enabled: true,
    displayOrder: 0,
  };
  const made = await request("/api/admin/ai-decks", "POST", payload);
  assert.equal(made.deck.difficulty, "BOSS");
  const edited = await request("/api/admin/ai-decks/" + made.deck.id, "PATCH", {
    ...payload,
    difficulty: "HARD",
  });
  assert.equal(edited.deck.difficulty, "BOSS");
});
test("resuming an older recorded AI match normalizes the runtime profile", async () => {
  const { storedAIQuestMatch } =
    await import("../../artifacts/api-server/src/lib/ai-quest-match-storage.ts");
  await f.db
    .insert(f.schema.decksTable)
    .values({
      id: "resume-deck",
      userId: "tutorial-user",
      name: "Resume deck",
    });
  await f.db
    .insert(f.schema.aiQuestMatchesTable)
    .values({
      id: "old-match",
      userId: "tutorial-user",
      deckId: "resume-deck",
      aiDeckId: "legacy-normal",
      difficulty: "HARD",
      initialState: {},
      questDate: "2026-11-04",
    });
  const restored = await storedAIQuestMatch({
    matchId: "old-match",
    userId: "tutorial-user",
    deckId: "resume-deck",
    aiDeckId: "legacy-normal",
  });
  assert.equal(restored.difficulty, "BOSS");
});
