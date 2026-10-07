import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DRAFT_CONFIG,
  draftOffers,
  selectableCards,
  chaosCards,
  canComplete,
  validateDraftPool,
  parseDraftConfig,
  prepareDraftSnapshot,
  type DraftSnapshot,
  type DraftSeat,
} from "./domain";
const snapshot: DraftSnapshot = {
  config: structuredClone(DEFAULT_DRAFT_CONFIG),
  champions: Array.from({ length: 3 }, (_, i) => ({
    id: `champ${i}`,
    status: "PUBLISHED",
  })) as any,
  cards: [
    ...Array.from({ length: 12 }, (_, i) => ({
      id: `n${i}`,
      rarity: "NORMAL",
      cardType: "WRESTLER",
    })),
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `e${i}`,
      rarity: "EPIC",
      cardType: "WRESTLER",
    })),
    ...Array.from({ length: 4 }, (_, i) => ({
      id: `l${i}`,
      rarity: "LEGENDARY",
      cardType: "WRESTLER",
    })),
    ...Array.from({ length: 3 }, (_, i) => ({
      id: `t${i}`,
      rarity: "NORMAL",
      cardType: "TECHNIQUE",
    })),
  ].map((c) => ({
    ...c,
    name: c.id,
    cost: 1,
    attack: 2,
    health: 3,
    rulesText: "",
    status: "PUBLISHED",
    isToken: false,
    isChampionToken: false,
    keywords: [],
    abilities: [],
  })) as any,
};
const seat = (): DraftSeat => ({
  userId: "u",
  name: "u",
  championId: "champ0",
  deck: [],
  offers: [],
  deadline: null,
  ready: false,
  history: [],
});
test("selection exclusion preserves runtime definitions and removes normal and special offers", () => {
  const s = structuredClone(snapshot);
  s.config.excludedCardIds = ["n0"];
  const prepared = prepareDraftSnapshot(s);
  assert.deepEqual(prepared.cards.find(c => c.id === "n0"), snapshot.cards.find(c => c.id === "n0"));
  assert.ok(!selectableCards(prepared).some(c => c.id === "n0"));
  assert.ok(!chaosCards(prepared).some(c => c.id === "n0"));
  for (let seed = 0; seed < 100; seed++) assert.ok(!draftOffers(prepared, seat(), String(seed)).includes("n0"));
  s.config.excludedCardIds = [];
  assert.ok(selectableCards(s).some(c => c.id === "n0"));
});

test("missing published techniques resolve to legal wrestler slots without changing saved rules", () => {
  for (const available of [0, 1, 2]) {
    const s = structuredClone(snapshot);
    s.cards = s.cards.filter((c) => c.cardType !== "TECHNIQUE");
    s.cards.push(
      ...snapshot.cards
        .filter((c) => c.cardType === "TECHNIQUE")
        .slice(0, available),
    );
    const prepared = prepareDraftSnapshot(s);
    assert.deepEqual(s.config.techniquePicks, [5, 10, 15, 20, 25]);
    assert.equal(
      prepared.config.techniquePicks.length,
      Math.min(5, available * 3),
    );
    validateDraftPool(s);
    for (let seed = 0; seed < 20; seed++) {
      const p = seat();
      for (let i = 1; i <= 25; i++) {
        const offers = draftOffers(prepared, p, `${seed}:${i}`);
        assert.ok(offers.length > 0);
        const card = prepared.cards.find((c) => c.id === offers[0])!;
        assert.equal(
          card.cardType,
          prepared.config.techniquePicks.includes(i) ? "TECHNIQUE" : "WRESTLER",
        );
        p.deck.push(card.id);
      }
      assert.ok(canComplete(prepared, p.deck));
    }
  }
  assert.deepEqual(prepareDraftSnapshot(snapshot).config, snapshot.config);
});
test("published-only pool excludes tokens, champion tokens and excluded definitions", () => {
  const s = structuredClone(snapshot);
  s.cards.push(
    ...["DRAFT", "DISABLED"].map(
      (status, i) => ({ ...s.cards[0], id: `hidden${i}`, status }) as any,
    ),
    { ...s.cards[0], id: "token", isToken: true },
    { ...s.cards[0], id: "champToken", isChampionToken: true },
  );
  s.config.excludedCardIds = ["n0"];
  assert.ok(
    selectableCards(s).every(
      (c) =>
        !["n0", "hidden0", "hidden1", "token", "champToken"].includes(c.id),
    ),
  );
});
test("NORMAL 3 / EPIC 2 / LEGENDARY 1 and legendary total 3 are authoritative offer caps", () => {
  assert.ok(canComplete(snapshot, ["n0", "n0", "n0"]));
  assert.ok(!canComplete(snapshot, ["n0", "n0", "n0", "n0"]));
  assert.ok(canComplete(snapshot, ["e0", "e0"]));
  assert.ok(!canComplete(snapshot, ["e0", "e0", "e0"]));
  assert.ok(canComplete(snapshot, ["l0"]));
  assert.ok(!canComplete(snapshot, ["l0", "l0"]));
  assert.ok(canComplete(snapshot, ["l0", "l1", "l2"]));
  assert.ok(!canComplete(snapshot, ["l0", "l1", "l2", "l3"]));
  assert.ok(
    canComplete(snapshot, ["e0", "e0", "e1", "e1", "e2", "e2", "e3", "e3"]),
  );
});
test("1000 deterministic drafts complete without dead ends, correct slot types and limits", () => {
  validateDraftPool(snapshot);
  for (let run = 0; run < 1000; run++) {
    const p = seat();
    for (let pick = 1; pick <= 25; pick++) {
      const offers = draftOffers(snapshot, p, `${run}:${pick}`);
      assert.ok(offers.length > 0 && offers.length <= 3);
      assert.deepEqual(offers, draftOffers(snapshot, p, `${run}:${pick}`));
      for (const id of offers) {
        const c = snapshot.cards.find((c) => c.id === id)!;
        assert.equal(
          c.cardType,
          snapshot.config.techniquePicks.includes(pick)
            ? "TECHNIQUE"
            : "WRESTLER",
        );
        assert.ok(canComplete(snapshot, [...p.deck, id]));
      }
      p.deck.push(offers[run % offers.length]);
    }
    assert.equal(p.deck.length, 25);
  }
});
test("scarce pools retain enough capacity to finish; missing technique/champions reject enable", () => {
  const s = structuredClone(snapshot);
  s.cards = s.cards.filter(
    (c) =>
      (c.id.startsWith("n") && Number(c.id.slice(1)) < 7) ||
      c.id === "t0" ||
      c.id === "t1",
  );
  validateDraftPool(s);
  const p = seat();
  for (let i = 0; i < 25; i++) {
    const offers = draftOffers(s, p, String(i));
    assert.ok(offers.length);
    p.deck.push(offers[0]);
  }
  s.cards = s.cards.filter((c) => c.cardType !== "TECHNIQUE");
  assert.throws(() => validateDraftPool(s));
  assert.throws(() =>
    validateDraftPool({
      ...snapshot,
      champions: snapshot.champions.slice(0, 2),
    }),
  );
});
test("configuration validates duplicate slots, cost totals, clocks and malformed scores", () => {
  assert.deepEqual(parseDraftConfig({}), DEFAULT_DRAFT_CONFIG);
  for (const input of [
    { techniquePicks: [5, 5] },
    { legendaryPicks: [26] },
    { costTargets: [1, 2, 3] },
    { pickSeconds: 0 },
    { cardScores: { x: Infinity } },
    { championTags: { x: "bad" } },
    { championTagWeight: 9 },
  ])
    assert.throws(() => parseDraftConfig(input));
});

test("legendary slots prefer three distinct legends and fall back when total cap is reached", () => {
  const p = seat();
  p.deck = ["n0", "n0", "n1", "n1", "t0", "n2", "n2"];
  const offered = draftOffers(snapshot, p, "legendary-pick");
  assert.equal(offered.length, 3);
  assert.ok(offered.every((id) => id.startsWith("l")));
  p.deck = ["l0", "l1", "l2", "n0", "t0", "n1", "n2"];
  assert.ok(
    draftOffers(snapshot, p, "fallback").every((id) => !id.startsWith("l")),
  );
});
test("champion token dependency is validated while remaining outside the selection pool", () => {
  const s = structuredClone(snapshot);
  (s.champions[0] as any).championTokenDefinitionId = "support";
  assert.throws(() => validateDraftPool(s));
  s.cards.push({
    ...s.cards[0],
    id: "support",
    status: "DRAFT",
    isChampionToken: true,
  });
  validateDraftPool(s);
  assert.ok(!selectableCards(s).some((c) => c.id === "support"));
  s.cards.at(-1)!.status = "DISABLED";
  assert.throws(() => validateDraftPool(s));
});

test("rare draft surprises use a seeded five-percent roll and never offer disabled or excluded entries", () => {
 const s=structuredClone(snapshot);
 s.cards.push({...s.cards[0],id:"private",status:"DRAFT"}, {...s.cards[0],id:"token",isToken:true}, {...s.cards[0],id:"champ-token",rarity:"CHAMPION",isChampionToken:true}, {...s.cards[0],id:"disabled",status:"DISABLED"});
 s.champions.push({...s.champions[0],id:"private-champ",status:"DRAFT"}, {...s.champions[0],id:"disabled-champ",status:"DISABLED"});
 let cardHits=0,champHits=0;const rareIds=["private","token","champ-token"];const seen=new Set<string>();
 for(let i=0;i<10000;i++){
  const offers=draftOffers(s,seat(),"rare:"+i);
  assert.deepEqual(offers,draftOffers(s,seat(),"rare:"+i));
  const unusual=offers.filter(id=>rareIds.includes(id));assert.ok(unusual.length<=1);
  if(unusual.length)cardHits++;unusual.forEach(id=>seen.add(id));
  assert.ok(!offers.includes("disabled"));
  for(const id of offers)assert.ok(canComplete(s,[id]));
  const champs=draftOffers(s,{...seat(),championId:null},"champ-rare:"+i);
  if(champs.includes("private-champ"))champHits++;
  assert.ok(!champs.includes("disabled-champ"));assert.equal(champs.length,3);
 }
 assert.ok(cardHits>400&&cardHits<600, String(cardHits));assert.ok(champHits>400&&champHits<600,String(champHits));
 assert.deepEqual([...seen].sort(),rareIds.sort());
 s.config.excludedCardIds=rareIds;s.config.excludedChampionIds=["private-champ"];
 for(let i=0;i<200;i++){assert.ok(draftOffers(s,seat(),"excluded:"+i).every(id=>!rareIds.includes(id)));assert.ok(!draftOffers(s,{...seat(),championId:null},"excluded:"+i).includes("private-champ"));}
});
