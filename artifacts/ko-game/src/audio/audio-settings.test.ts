import assert from "node:assert/strict";
import test from "node:test";
import { parseStoredBgmMute, parseStoredBgmVolume } from "./audio-settings";

test("missing or invalid BGM volume restores the full-volume default", () => {
  assert.equal(parseStoredBgmVolume(null), 100);
  assert.equal(parseStoredBgmVolume(""), 100);
  assert.equal(parseStoredBgmVolume("not-a-number"), 100);
});

test("BGM volume is preserved and clamped to the supported range", () => {
  assert.equal(parseStoredBgmVolume("37.5"), 37.5);
  assert.equal(parseStoredBgmVolume("0"), 0);
  assert.equal(parseStoredBgmVolume("140"), 100);
  assert.equal(parseStoredBgmVolume("-4"), 0);
});

test("mute setting is enabled only for the explicit true value", () => {
  assert.equal(parseStoredBgmMute("true"), true);
  assert.equal(parseStoredBgmMute("false"), false);
  assert.equal(parseStoredBgmMute(null), false);
});