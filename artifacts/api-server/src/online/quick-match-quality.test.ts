import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseQuickPair } from "./quick-match-quality";
const c = (userId: string, games: number, wins = 0, joinedAt = 1000) => ({
  userId,
  joinedAt,
  experience: { games, wins },
});
test("new players prefer new players; veteran waits widen without permanent starvation", () => {
  assert.equal(chooseQuickPair([c("a", 0), c("b", 20, 15)], 2000), null);
  assert.deepEqual(
    chooseQuickPair([c("a", 0), c("b", 20, 15), c("c", 2, 1)], 2000)?.map(
      (x) => x.userId,
    ),
    ["a", "c"],
  );
  assert.deepEqual(
    chooseQuickPair([c("a", 0), c("b", 20, 15)], 11000)?.map((x) => x.userId),
    ["a", "b"],
  );
});
test("similar recent results win a soft preference; never pairs the same user", () => {
  assert.deepEqual(
    chooseQuickPair([c("a", 20, 10), c("b", 20, 1), c("c", 20, 11)], 2000)?.map(
      (x) => x.userId,
    ),
    ["a", "c"],
  );
  assert.equal(chooseQuickPair([c("a", 0), c("a", 1)], 2000), null);
});
