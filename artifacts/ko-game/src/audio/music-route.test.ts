import assert from "node:assert/strict";
import test from "node:test";
import { musicContextForPath, shouldLoadMainBgm } from "./music-route";

test("main BGM is eligible on direct non-battle route loads", () => {
  for (const path of ["/", "/decks", "/collection", "/shop", "/packs"]) {
    assert.equal(musicContextForPath(path), "NON_BATTLE", path);
    assert.equal(shouldLoadMainBgm(path), true, path);
  }
});

test("match routes suppress main BGM and use the battle context", () => {
  for (const path of ["/ai-match", "/online/match/match-123", "/draft/match/draft-123", "/tower"]) {
    assert.equal(musicContextForPath(path), "BATTLE", path);
    assert.equal(shouldLoadMainBgm(path), false, path);
  }
});

test("every administrator route suppresses background music including test matches", () => {
  for (const path of ["/admin", "/admin/", "/admin/cards", "/admin/draft", "/admin/draft/match/draft-123", "/admin/tower-test", "/admin/notices"]) {
    assert.equal(musicContextForPath(path), "SILENT", path);
    assert.equal(shouldLoadMainBgm(path), false, path);
  }
  assert.equal(musicContextForPath("/administrator"), "NON_BATTLE");
});
