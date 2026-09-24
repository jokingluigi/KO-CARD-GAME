import assert from "node:assert/strict";
import test from "node:test";
import { canonicalChampionPair, mapIntroToSeats, normalizeIntroStatus, resolveChampionIntro } from "./intro";

const champion = (id: string, line: string | null) => ({
  id, name: id, introLineOne: line, maxHealth: 20,
} as any);

test("canonical pair normalization rejects self-pairs", () => {
  assert.deepEqual(canonicalChampionPair("b", "a"), ["a", "b"]);
  assert.equal(canonicalChampionPair("a", "a"), null);
});

test("canonical dialogue lines and first speaker map to match seats", () => {
  const canonicalIntro = { lineOne: "A speaks", lineTwo: "B replies", firstSpeaker: "ONE" as const };
  assert.deepEqual(mapIntroToSeats("a", "b", canonicalIntro), {
    playerOneLine: "A speaks",
    playerTwoLine: "B replies",
    firstSpeaker: "PLAYER_ONE",
  });
  assert.deepEqual(mapIntroToSeats("b", "a", canonicalIntro), {
    playerOneLine: "B replies",
    playerTwoLine: "A speaks",
    firstSpeaker: "PLAYER_TWO",
  });
  assert.deepEqual(mapIntroToSeats("a", "b", { ...canonicalIntro, firstSpeaker: "TWO" }), {
    playerOneLine: "A speaks",
    playerTwoLine: "B replies",
    firstSpeaker: "PLAYER_TWO",
  });
  assert.deepEqual(mapIntroToSeats("same", "same", canonicalIntro), {
    playerOneLine: null,
    playerTwoLine: null,
    firstSpeaker: null,
  });
});

test("intro statuses round-trip without coercion", () => {
  for (const status of ["DRAFT", "PUBLISHED", "DISABLED"]) assert.equal(normalizeIntroStatus(status), status);
  assert.equal(normalizeIntroStatus("unexpected"), null);
});

test("online intro prefers an enabled exact canonical pair over defaults", () => {
  const result = resolveChampionIntro(champion("b", "default b"), champion("a", "default a"), [{
    championOneId: "a", championTwoId: "b", lineOne: "special a", lineTwo: "special b", firstSpeaker: "TWO", status: "PUBLISHED",
  }]);
  assert.deepEqual(result, { lineOne: "special a", lineTwo: "special b", firstSpeaker: "TWO" });
});

test("online intro falls back to defaults and permits no dialogue", () => {
  assert.deepEqual(
    resolveChampionIntro(champion("a", "hello"), champion("b", null), []),
    { lineOne: "hello", lineTwo: null, firstSpeaker: "ONE" },
  );
  assert.deepEqual(
    resolveChampionIntro(champion("a", null), champion("b", null), []),
    { lineOne: null, lineTwo: null, firstSpeaker: null },
  );
});

test("online intro ignores disabled and non-exact pairs", () => {
  const result = resolveChampionIntro(champion("a", "a"), champion("b", "b"), [
    { championOneId: "a", championTwoId: "c", lineOne: "bad", lineTwo: "bad", firstSpeaker: "ONE", status: "PUBLISHED" },
    { championOneId: "a", championTwoId: "b", lineOne: "disabled", lineTwo: "disabled", firstSpeaker: "ONE", status: "DISABLED" },
  ]);
  assert.deepEqual(result, { lineOne: "a", lineTwo: "b", firstSpeaker: "ONE" });
});