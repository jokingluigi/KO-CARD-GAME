import test from "node:test";
import assert from "node:assert/strict";
import { cardSilenceProtection } from "./card-protection-display";
test("champion rarity token displays innate immunity even in a legacy snapshot with a false flag", () => {
  assert.deepEqual(
    cardSilenceProtection(
      { isToken: true, isChampionToken: true, isSilenceImmune: false },
      { rarity: "CHAMPION", isToken: true },
    ),
    { immune: true, intrinsic: true },
  );
});
test("ordinary and legendary tokens and non-token champion rarity are not advertised as immune", () => {
  for (const rarity of ["NORMAL", "EPIC", "LEGENDARY"])
    assert.equal(
      cardSilenceProtection({ rarity, isToken: true, isChampionToken: true })
        .immune,
      false,
    );
  assert.equal(
    cardSilenceProtection({ rarity: "CHAMPION", isToken: false }).immune,
    false,
  );
  assert.equal(
    cardSilenceProtection({ rarity: null, isChampionToken: true }).immune,
    false,
  );
});
test("an explicit runtime immunity remains visible without falsely calling it a champion-token trait", () => {
  assert.deepEqual(
    cardSilenceProtection({ rarity: "NORMAL", isSilenceImmune: true }),
    { immune: true, intrinsic: false },
  );
});
test("registered token definition supplies identity absent from a static preview record", () => {
  assert.equal(
    cardSilenceProtection(
      { rarity: "CHAMPION" },
      { rarity: "CHAMPION", isToken: true },
    ).immune,
    true,
  );
});
