import test from "node:test";
import assert from "node:assert/strict";
import { impactAudioPriority } from "./impact-audio-policy";
test("damage-class cue names protect heavy and massive attacks from lower-priority sounds", () => {
  const levels = [
    "combat-hit-1-2",
    "combat-hit-3-5",
    "combat-hit-6-9",
    "combat-hit-10-plus",
    "combat-finisher",
  ].map((s) => impactAudioPriority("/sfx/" + s + ".wav?v=1"));
  assert.deepEqual(levels, [5, 5, 7, 8, 9]);
  assert.equal(
    impactAudioPriority("/api/storage/my-finisher-heavy-upload.wav"),
    5,
  );
});
