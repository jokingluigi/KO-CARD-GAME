import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeOnlineCardCatalog } from "./online-card-catalog";
import { getCardDefinition, setRuntimeCardDefinitions } from "../game/cards/test-cards";
import type { CardDefinition } from "../game/cards/types";
const card = (id: string, name: string): CardDefinition => ({ id, name, cardType: "WRESTLER", rarity: "EPIC", cost: 2, attack: 3, health: 4, keywords: [], rulesText: "테스트" });
for (const order of ["snapshot-first", "resources-first"]) test(`owned unpublished opponent card renders without Minion A: ${order}`, () => {
  const own = card("owned-draft", "내 미공개 카드"), opponent = card("opponent-draft", "상대 미공개 카드");
  const match = { cardPool: [own, opponent] };
  let account: CardDefinition[] = [], snapshot: typeof match | undefined;
  for (const step of order === "snapshot-first" ? ["snapshot", "resources"] : ["resources", "snapshot"]) {
    if (step === "snapshot") snapshot = match; else account = [own];
    setRuntimeCardDefinitions(mergeOnlineCardCatalog(account, snapshot));
  }
  assert.equal(getCardDefinition(opponent.id)?.name, opponent.name);
  assert.equal(getCardDefinition(own.id)?.cost, 2);
  assert.equal(getCardDefinition("unowned-unpublished"), undefined);
  assert.equal(getCardDefinition("__hidden__"), undefined);
  setRuntimeCardDefinitions([]);
});
test("match definitions take precedence while Minion A definitions remain available", () => {
  const stale = card("same", "이전"), current = card("same", "현재"), minion = card("minion", "미니언");
  const before = JSON.stringify([stale, current, minion]);
  const result = mergeOnlineCardCatalog([stale], { cardPool: [current], minionACardPool: [minion] });
  assert.equal(result.length, 2); assert.equal(result.find(c => c.id === "same")?.name, "현재");
  assert.equal(JSON.stringify([stale, current, minion]), before);
});
