import assert from "node:assert/strict";
import test from "node:test";
import { cosmeticImage, emptyCosmetics, relatedChampionTokenIds, skinTokenIds } from "./index";

const cards = [
  { id: "tok-guard", isToken: true, effectConfig: { summon: "tok-elite" } },
  { id: "tok-elite", isToken: true, effectConfig: {} },
  { id: "tok-champ", isChampionToken: true, effectConfig: { generate: "tok-guard" } },
  { id: "tok-other", isToken: true },
  { id: "normal-card", isToken: false },
];

test("챔피언 능력·챔피언 토큰에서 관련 토큰을 따라가며 모두 찾는다", () => {
  const ids = relatedChampionTokenIds({ championTokenDefinitionId: "tok-champ", abilityEffects: { type: "X", cardId: "normal-card" } }, cards);
  assert.deepEqual(ids, ["tok-champ", "tok-guard", "tok-elite"]);
});

test("관련 없는 토큰과 일반 카드는 넣지 않는다", () => {
  assert.deepEqual(relatedChampionTokenIds({ abilityEffects: { summon: "tok-elite" } }, cards), ["tok-elite"]);
  assert.deepEqual(relatedChampionTokenIds(null, cards), []);
});

test("장착한 챔피언 스킨의 토큰 그림이 모든 관련 토큰에 적용된다", () => {
  const loadout = emptyCosmetics();
  loadout.skins["champion:ch1"] = { id: "s", type: "CHAMPION_SKIN", name: "s", description: "", targetId: "ch1", isActive: true, sortOrder: 0,
    imageAssets: { art: "https://x.test/a.png", "token:tok-guard": "https://x.test/g.png", "token:tok-elite": "https://x.test/e.png" } };
  assert.equal(cosmeticImage(loadout, "CARD_SKIN", "tok-guard", "art", "orig"), "https://x.test/g.png");
  assert.equal(cosmeticImage(loadout, "CARD_SKIN", "tok-elite", "art", "orig"), "https://x.test/e.png");
  assert.equal(cosmeticImage(loadout, "CARD_SKIN", "tok-other", "art", "orig"), "orig");
  assert.deepEqual(skinTokenIds(loadout.skins["champion:ch1"]!.imageAssets), ["tok-guard", "tok-elite"]);
});
