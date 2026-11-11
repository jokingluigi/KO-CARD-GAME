import type { CardPlayAnimationState } from "./card-play-animation-utils";

/** Separate causal event batches and spell reveals stay in order. Same-result
 * wrestler summons land together instead of holding input for N full flights. */
export function generatedPlayBatch<
  T extends CardPlayAnimationState & { batchId?: string },
>(queue: T[]): T[] {
  const first = queue[0];
  if (!first) return [];
  if (first.kind !== "WRESTLER" || !first.batchId) return [first];
  const batch: T[] = [];
  for (const entry of queue) {
    if (
      entry.kind !== "WRESTLER" ||
      entry.batchId !== first.batchId ||
      batch.length === 4
    )
      break;
    batch.push(entry);
  }
  return batch;
}
