import assert from "node:assert/strict";
import test from "node:test";

import { validateDeckCounts } from "@workspace/game-engine";

test("공식 덱 크기와 Legendary 제한을 공통 validator가 적용한다", () => {
  assert.deepEqual(validateDeckCounts({ cardCount: 24, legendaryCount: 5, championCount: 1 }), ["INVALID_CARD_COUNT"]);
  assert.deepEqual(validateDeckCounts({ cardCount: 25, legendaryCount: 5, championCount: 1 }), []);
  assert.deepEqual(validateDeckCounts({ cardCount: 26, legendaryCount: 5, championCount: 1 }), ["INVALID_CARD_COUNT"]);
  assert.deepEqual(validateDeckCounts({ cardCount: 25, legendaryCount: 4, championCount: 1 }), []);
  assert.deepEqual(validateDeckCounts({ cardCount: 25, legendaryCount: 6, championCount: 1 }), ["TOO_MANY_LEGENDARIES"]);
  assert.deepEqual(validateDeckCounts({
    cardCount: 25,
    legendaryCount: 5,
    legendaryDefinitionCounts: [2, 1, 1, 1],
    championCount: 1,
  }), ["DUPLICATE_LEGENDARY"]);
  assert.deepEqual(validateDeckCounts({ cardCount: 24, legendaryCount: 5, championCount: 1 }), ["INVALID_CARD_COUNT"]);
  assert.deepEqual(validateDeckCounts({ cardCount: 26, legendaryCount: 5, championCount: 1 }), ["INVALID_CARD_COUNT"]);
  assert.deepEqual(validateDeckCounts({ cardCount: 25, legendaryCount: 5, championCount: 0 }), ["INVALID_CHAMPION_COUNT"]);
  assert.deepEqual(validateDeckCounts({ cardCount: 25, legendaryCount: 5, championCount: 2 }), ["INVALID_CHAMPION_COUNT"]);
});