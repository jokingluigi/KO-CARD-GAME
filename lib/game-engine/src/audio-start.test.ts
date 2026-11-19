import assert from "node:assert/strict";
import test from "node:test";
import {
  audioStartSeconds,
  withAudioStart,
  validAudioStartUrl,
  validAudioStartSeconds,
  audioFileUrl,
} from "./audio-start";
test("start offset round trips as a standard media fragment without changing the asset path", () => {
  for (const start of [0, 0.1, 12.5, 3599.125, 86400]) {
    const url = withAudioStart(
      "/api/storage/objects/uploads/audio/song.mp3",
      start,
    );
    assert.equal(audioStartSeconds(url), start);
    assert.equal(
      audioFileUrl(url),
      "/api/storage/objects/uploads/audio/song.mp3",
    );
    assert.ok(validAudioStartUrl(url));
  }
  assert.equal(withAudioStart("/song.mp3#t=10", 0), "/song.mp3");
  assert.equal(audioStartSeconds("/legacy.mp3"), 0);
});
test("invalid offsets and malformed fragments are rejected", () => {
  for (const value of [-1, 86401, NaN, Infinity, "12", null])
    assert.equal(validAudioStartSeconds(value), false);
  for (const url of [
    "/a#t=-1",
    "/a#t=NaN",
    "/a#t=Infinity",
    "/a#t=86401",
    "/a#t=1#t=2",
  ])
    assert.equal(validAudioStartUrl(url), false);
});
