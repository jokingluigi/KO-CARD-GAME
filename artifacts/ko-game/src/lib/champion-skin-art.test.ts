import test from "node:test";
import assert from "node:assert/strict";
import { cosmeticImage, emptyCosmetics, type CosmeticAssets } from "@workspace/cosmetics";
const base = "https://assets.example/skin.png";
function loadout(imageAssets: CosmeticAssets) {
  const result = emptyCosmetics();
  result.skins["champion:hero"] = {
    id: "skin",
    type: "CHAMPION_SKIN",
    name: "Skin",
    description: "",
    targetId: "hero",
    imageAssets,
    isActive: true,
    sortOrder: 0,
  };
  return result;
}
test("a single champion artwork appears in basic, battle and VS contexts", () => {
  for (const context of ["art", "portrait", "intro"] as const)
    assert.equal(
      cosmeticImage(
        loadout({ art: base }),
        "CHAMPION_SKIN",
        "hero",
        context,
        "original",
      ),
      base,
    );
});
test("legacy portrait-only and intro-only registrations still provide one shared image", () => {
  for (const assets of [{ portrait: base }, { intro: base }])
    for (const context of ["art", "portrait", "intro"] as const)
      assert.equal(
        cosmeticImage(
          loadout(assets),
          "CHAMPION_SKIN",
          "hero",
          context,
          "original",
        ),
        base,
      );
});
test("new common artwork wins over preserved legacy context bindings", () => {
  const saved = loadout({
    art: base,
    portrait: "https://assets.example/old-battle.png",
    intro: "https://assets.example/old-vs.png",
  });
  for (const context of ["art", "portrait", "intro"] as const)
    assert.equal(
      cosmeticImage(saved, "CHAMPION_SKIN", "hero", context, "original"),
      base,
    );
  assert.equal(
    saved.skins["champion:hero"]!.imageAssets.intro,
    "https://assets.example/old-vs.png",
  );
});
test("awakening remains distinct and falls back to the original awakened image", () => {
  assert.equal(
    cosmeticImage(
      loadout({ art: base }),
      "CHAMPION_SKIN",
      "hero",
      "awakened",
      "original-awake",
    ),
    "original-awake",
  );
  assert.equal(
    cosmeticImage(
      loadout({ art: base, awakened: "awake" }),
      "CHAMPION_SKIN",
      "hero",
      "awakened",
      "original-awake",
    ),
    "awake",
  );
});
test("token and another champion never inherit the common champion image", () => {
  assert.equal(
    cosmeticImage(
      loadout({ art: base }),
      "CARD_SKIN",
      "token",
      "art",
      "original-token",
    ),
    "original-token",
  );
  assert.equal(
    cosmeticImage(
      loadout({ art: base }),
      "CHAMPION_SKIN",
      "opponent",
      "intro",
      "original-opponent",
    ),
    "original-opponent",
  );
});
