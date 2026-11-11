import assert from "node:assert/strict";
import { test } from "node:test";
import { generatedPlayBatch } from "./generated-play-batch";
import type { CardPlayAnimationState } from "./card-play-animation-utils";
const wrestler = (batchId?: string) =>
  ({ kind: "WRESTLER", batchId }) as CardPlayAnimationState & {
    batchId?: string;
  };
test("same authoritative summon batch overlaps, preserves identity, and caps four", () => {
  const queue = Array.from({ length: 6 }, () => wrestler("event-batch-1"));
  assert.deepEqual(generatedPlayBatch(queue), queue.slice(0, 4));
  const completed = queue[1];
  assert.deepEqual(
    queue.filter((entry) => entry !== completed),
    [queue[0], ...queue.slice(2)],
  );
});
test("spells, distinct server results and legacy entries never overlap", () => {
  const a = wrestler("a"),
    b = wrestler("b"),
    spell = { kind: "TECHNIQUE", batchId: "a" } as CardPlayAnimationState & {
      batchId?: string;
    };
  assert.deepEqual(generatedPlayBatch([a, b]), [a]);
  assert.deepEqual(generatedPlayBatch([a, spell, a]), [a]);
  assert.deepEqual(generatedPlayBatch([spell, a]), [spell]);
  assert.equal(generatedPlayBatch([wrestler(), wrestler()]).length, 1);
  assert.deepEqual(generatedPlayBatch([]), []);
});
