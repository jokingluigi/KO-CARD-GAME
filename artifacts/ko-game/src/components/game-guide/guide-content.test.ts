import test from "node:test";
import assert from "node:assert/strict";
import { GAME_GUIDE, searchGuide } from "./guide-content";
import { DECK_SIZE, MAX_LEGENDARY_CARDS } from "@workspace/game-engine/rules";
test("guide topics are uniquely addressable and include references for content maintenance", () => {
  assert.equal(new Set(GAME_GUIDE.map((x) => x.id)).size, GAME_GUIDE.length);
  assert.ok(GAME_GUIDE.every((x) => x.answer.length > 20 && x.source));
});
test("search understands unspaced immunity, case and multiple terms without exposing internal source paths", () => {
  assert.ok(
    searchGuide(GAME_GUIDE, "침묵면역", "all").some(
      (x) => x.id === "silence-immune",
    ),
  );
  assert.ok(
    searchGuide(GAME_GUIDE, "champion", "all").some(
      (x) => x.id === "silence-immune",
    ),
  );
  assert.ok(
    searchGuide(GAME_GUIDE, "액티브 1회", "combat").some(
      (x) => x.id === "active",
    ),
  );
  assert.equal(
    searchGuide(GAME_GUIDE, "game/engine/combat.ts", "all").length,
    0,
  );
  assert.equal(searchGuide(GAME_GUIDE, "없는 질문 xxzz", "all").length, 0);
  assert.equal(searchGuide(GAME_GUIDE, "액티브", "all")[0]?.id, "active");
});
test("category selection does not erase search intent and deck limits follow canonical constants", () => {
  assert.equal(searchGuide(GAME_GUIDE, "침묵면역", "start").length, 0);
  assert.equal(
    searchGuide(GAME_GUIDE, "   ", "start").length,
    GAME_GUIDE.filter((x) => x.category === "start").length,
  );
  const deck = GAME_GUIDE.find((x) => x.id === "deck")!;
  assert.ok(deck.answer.includes(`카드 ${DECK_SIZE}장`));
  assert.ok(deck.answer.includes(`최대 ${MAX_LEGENDARY_CARDS}장`));
});

test("champion rules form one dedicated chapter with identity, deployment, protection, space and silence coverage", () => {
  const entries = GAME_GUIDE.filter((e) => e.category === "champion");
  assert.equal(entries.length, 7);
  for (const id of [
    "champion-token-identity",
    "champion-token-deploy",
    "champion-token-protection",
    "champion-token-space",
    "champion-token-departure",
    "silence-immune",
    "quest",
  ])
    assert.ok(entries.some((e) => e.id === id));
  assert.equal(searchGuide(GAME_GUIDE, "침묵면역", "combat").length, 0);
  assert.ok(
    searchGuide(GAME_GUIDE, "침묵면역", "champion").some(
      (e) => e.id === "silence-immune",
    ),
  );
});
