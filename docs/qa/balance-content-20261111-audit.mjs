/** Read-only captured administrator catalog -> actual runtime definitions. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { cardRecordToDefinition } from "../../artifacts/ko-game/src/game/cards/published-cards.ts";
import { championRecordToDefinition } from "../../artifacts/ko-game/src/game/champions/published-champions.ts";
const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const root = "docs/qa/snapshots/20261111-admin/";
const cards = read(root + "cards.json"),
  champions = read(root + "champions.json");
const old = read("docs/qa/snapshots/20261030-admin/cards.json"),
  byID = new Map(old.map((c) => [c.id, c]));
const keys = [
  "name",
  "text",
  "cost",
  "attack",
  "health",
  "rarity",
  "keywords",
  "tags",
  "isToken",
  "isChampionToken",
];
const abilities = (arr) =>
  arr?.map((a) => ({
    trigger: a.trigger,
    effects: a.effects?.map((e) => ({
      type: e.type,
      action: e.action,
      balance: e.values?.balance?.operation,
    })),
    ...Object.fromEntries(
      Object.entries(a).filter(
        ([k]) => !["trigger", "effects", "condition"].includes(k),
      ),
    ),
  }));
const cardAudit = cards.map((record) => {
  const d = cardRecordToDefinition(record),
    before = byID.get(record.id);
  return {
    id: record.id,
    name: record.name,
    status: record.status,
    change: before ? "existing" : "new",
    changedFields: before
      ? keys.filter(
          (k) => JSON.stringify(before[k]) !== JSON.stringify(record[k]),
        )
      : keys,
    text: record.text,
    stats: { cost: d.cost, attack: d.attack, health: d.health },
    keywords: d.keywords,
    tags: d.tags,
    contentRule: d.contentRule,
    abilities: abilities(d.abilities),
  };
});
const champAudit = champions.map((record) => {
  const d = championRecordToDefinition(record);
  return {
    id: d.id,
    name: d.name,
    status: d.status,
    ability: d.ability,
    quest: d.quest,
    upgradedAbility: d.upgradedAbility,
  };
});
const result = {
  cards: cardAudit,
  champions: champAudit,
  manualProductionWrites: 0,
};
mkdirSync("docs/qa/20261111-balance-content", { recursive: true });
writeFileSync(
  "docs/qa/20261111-balance-content/catalog-audit.json",
  JSON.stringify(result, null, 2),
);
console.log(
  JSON.stringify(
    {
      cards: cards.length,
      champions: champions.length,
      new: cardAudit.filter((c) => c.change === "new").length,
      existingChanged: cardAudit.filter(
        (c) => c.change === "existing" && c.changedFields.length,
      ).length,
      textOrNew: cardAudit.filter(
        (c) => c.change === "new" || c.changedFields.includes("text"),
      ).length,
      textWithoutAbility: cardAudit
        .filter((c) => c.text && !c.abilities.length)
        .map((c) => ({
          name: c.name,
          contentRule: c.contentRule,
          keywords: c.keywords,
        })),
    },
    null,
    2,
  ),
);
