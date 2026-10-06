import test from "node:test";
import assert from "node:assert/strict";
import {
  DRAFT_MUTATIONS,
  applicableDraftMutations,
  applyDraftMutation,
} from "../../../../artifacts/ko-game/src/game/cards/draft-mutation";
import { generateCardInstance } from "../../../../artifacts/ko-game/src/game/cards/generation";
import {
  resetCardAfterLeavingBoard,
  resetCardForGraveyard,
} from "../../../../artifacts/ko-game/src/game/cards/zone-state";
import { silenceCard } from "../../../../artifacts/ko-game/src/game/engine/card-status";
import { createInitialGameState } from "../../../../artifacts/ko-game/src/game/engine/create-initial-game-state";
import { getActiveCardKeywords } from "../../../../artifacts/ko-game/src/game/cards/granted-text";
import {
  keywordDamage,
  healLifesteal,
  hasEntryDefense,
} from "../../../../artifacts/ko-game/src/game/engine/keyword-rules";
import { endTurn } from "../../../../artifacts/ko-game/src/game/engine/turn-system";
import {
  executeAction,
  getLegalActions,
} from "../../../../artifacts/ko-game/src/game/actions/engine-actions";
import { applyEffect } from "../../../../artifacts/ko-game/src/game/effects/effect-engine";
import { drawCard } from "../../../../artifacts/ko-game/src/game/engine/draw-card";
import {
  beginDraftMutation,
  chooseMutationTarget,
  chooseDraftMutation,
} from "./mutations";
import {
  DEFAULT_DRAFT_CONFIG,
  draftOffers,
  specialDraftPick,
  parseDraftConfig,
  type DraftSeat,
  type DraftSnapshot,
} from "./domain";
import type { CardDefinition } from "../../../../artifacts/ko-game/src/game/cards/types";
const definition: CardDefinition = {
  id: "base",
  name: "QA",
  cardType: "WRESTLER",
  cost: 3,
  attack: 3,
  health: 4,
  rarity: "NORMAL",
  status: "PUBLISHED",
  rulesText: "",
  isToken: false,
  isChampionToken: false,
  keywords: [],
  abilities: [],
};
for (const m of DRAFT_MUTATIONS)
  test(`mutation baseline/reset/serialization: ${m.id}`, () => {
    const original = structuredClone(definition);
    const c = applyDraftMutation(
      generateCardInstance(definition, { instanceId: "copy" }),
      m,
    );
    const expected = [Math.max(0, 3 + m.cost), 3 + m.attack, 4 + m.health];
    assert.deepEqual([c.currentCost, c.currentAttack, c.maxHealth], expected);
    for (const reset of [resetCardAfterLeavingBoard, resetCardForGraveyard]) {
      const buffed = JSON.parse(
        JSON.stringify({
          ...c,
          currentAttack: 20,
          currentCost: 0,
          currentHealth: 1,
          maxHealth: 30,
          isSilenced: true,
          keywords: [],
        }),
      );
      const n = reset(buffed);
      assert.deepEqual([n.currentCost, n.currentAttack, n.maxHealth], expected);
      assert.deepEqual(n.keywords, m.keywords);
      assert.equal(n.isSilenced, false);
    }
    assert.deepEqual(definition, original);
  });
test("same definition keeps independent mutations; ordinary card and generated copies stay original", () => {
  const copies = ["balance", "vampire"].map((id, i) =>
    applyDraftMutation(
      generateCardInstance(definition, { instanceId: `copy${i}` }),
      DRAFT_MUTATIONS.find((m) => m.id === id)!,
    ),
  );
  const ordinary = generateCardInstance(definition, { instanceId: "plain" });
  assert.deepEqual(
    copies.map((c) => [c.currentAttack, c.currentHealth, c.keywords]),
    [
      [4, 5, []],
      [3, 4, ["LIFESTEAL"]],
    ],
  );
  assert.deepEqual(
    resetCardAfterLeavingBoard({ ...ordinary, currentAttack: 20 }, definition)
      .currentAttack,
    3,
  );
  assert.equal(ordinary.draftMutation, undefined);
});
test("silence disables mutation keyword, resets stats to draft baseline and hidden-zone reset restores keyword", () => {
  let s = createInitialGameState(undefined, [definition]);
  const card = applyDraftMutation(
    generateCardInstance(definition, { instanceId: "v" }),
    DRAFT_MUTATIONS.find((m) => m.id === "grand-combat")!,
  );
  s.players[0].board[0] = {
    ...card,
    boardSlot: 0,
    currentAttack: 15,
    maxHealth: 20,
    currentHealth: 3,
  };
  s = silenceCard(s, "v");
  const c = s.players[0].board[0]!;
  assert.equal(c.currentAttack, 5);
  assert.equal(c.maxHealth, 4);
  assert.equal(c.currentHealth, 3);
  assert.deepEqual(getActiveCardKeywords(c), []);
  assert.equal(keywordDamage(c, 3, 1), 3);
  const revived = resetCardAfterLeavingBoard(c, definition);
  assert.deepEqual(getActiveCardKeywords(revived), ["ARMOR"]);
  assert.equal(keywordDamage(revived, 3, 1), 2);
});
test("mutation keywords execute existing armor, lifesteal, defense and regeneration rules", () => {
  const build = (id: string) =>
    applyDraftMutation(
      generateCardInstance(definition, { instanceId: id }),
      DRAFT_MUTATIONS.find((m) => m.id === id)!,
    );
  assert.equal(keywordDamage(build("armor"), 3, 1), 2);
  assert.equal(
    hasEntryDefense({ ...build("defense"), enteredOnTurn: 3 }, 3),
    true,
  );
  assert.equal(
    hasEntryDefense({ ...build("defense"), enteredOnTurn: 3 }, 4),
    true,
  );
  assert.equal(
    hasEntryDefense({ ...build("defense"), enteredOnTurn: 3 }, 5),
    false,
  );
  let s = createInitialGameState();
  s.players[0].health = 10;
  assert.equal(
    healLifesteal(s, s.players[0].id, build("vampire"), 3).players[0].health,
    13,
  );
  s.status = "IN_PROGRESS";
  s.activePlayerId = s.players[0].id;
  s.turn = 3;
  s.players[0].board[0] = { ...build("regen"), boardSlot: 0, currentHealth: 1 };
  assert.equal(
    endTurn(s, s.players[0].id).state.players[0].board[0]?.currentHealth,
    3,
  );
});
test("invalid HP/attack/cost and Technique mutations are excluded; IMMUNE never appears", () => {
  const choices = applicableDraftMutations({
    ...definition,
    attack: 0,
    health: 1,
    cost: 6,
  });
  assert.ok(
    choices.every((m) => m.attack >= 0 && 1 + m.health >= 1 && 6 + m.cost <= 6),
  );
  assert.deepEqual(
    applicableDraftMutations({ ...definition, cardType: "TECHNIQUE" }),
    [],
  );
  assert.ok(DRAFT_MUTATIONS.every((m) => !m.keywords.includes("IMMUNE")));
});
const seat = (): DraftSeat => ({
  userId: "u",
  name: "u",
  championId: "hero",
  deck: [],
  offers: [],
  ready: false,
  deadline: null,
  history: [],
});
const snapshot = (): DraftSnapshot => ({
  config: {
    ...DEFAULT_DRAFT_CONFIG,
    techniquePicks: [],
    legendaryPicks: [],
    grandMutationChance: 1,
  },
  champions: [],
  cards: Array.from({ length: 15 }, (_, i) => ({
    ...definition,
    id: `n${i}`,
    cost: (i % 6) + 1,
    tags: i % 2 ? ["zombie"] : ["other"],
    rarity: i % 3 ? "NORMAL" : "EPIC",
  })) as CardDefinition[],
});
test("special rounds fixed at 5/10/15/20/25 and EPIC/high/low/synergy/chaos generate legal distinct choices", () => {
  const s = snapshot(),
    own = seat();
  for (let pick = 1; pick <= 25; pick++) {
    own.deck = Array.from({ length: pick - 1 }, (_, i) => `n${i % 15}`);
    assert.equal(
      Boolean(specialDraftPick(s, own, `seed:${pick}`)),
      pick % 5 === 0,
    );
  }
  own.deck = [];
  for (const special of [
    "EPIC",
    "HIGH_COST",
    "LOW_COST",
    "SYNERGY",
    "CHAOS",
  ] as const) {
    own.specialPick = special;
    const ids = draftOffers(s, own, "seed");
    assert.equal(ids.length, 3);
    assert.equal(new Set(ids).size, 3);
    if (special === "EPIC")
      assert.ok(
        ids.some((id) => s.cards.find((c) => c.id === id)?.rarity === "EPIC"),
      );
    if (special === "HIGH_COST")
      assert.ok(ids.every((id) => s.cards.find((c) => c.id === id)!.cost >= 4));
    if (special === "LOW_COST")
      assert.ok(ids.every((id) => s.cards.find((c) => c.id === id)!.cost <= 2));
    assert.deepEqual(draftOffers(s, own, "seed"), ids);
  }
});
test("lock preserves one candidate; candidate generation falls back with missing specialty", () => {
  const s = snapshot(),
    own = seat();
  own.offers = draftOffers(s, own, "first");
  own.lockedOfferId = own.offers[1];
  assert.ok(draftOffers(s, own, "second").includes(own.lockedOfferId));
  s.cards = s.cards.map((c) => ({ ...c, cost: 3, rarity: "NORMAL" }));
  own.specialPick = "HIGH_COST";
  assert.equal(draftOffers(s, own, "fallback").length, 3);
});
test("saved mutation choices survive reload and only one grand mutation can be acquired", () => {
  const s = snapshot();
  let own = seat();
  own.deck = ["n0", "n0", "n1", "n2", "n3"];
  own.cards = own.deck.map((definitionId, i) => ({
    instanceId: `copy:${i}`,
    definitionId,
  }));
  beginDraftMutation(s, own, "seed");
  assert.equal(own.mutationEvent?.grand, true);
  chooseMutationTarget(s, own, "copy:0", "seed");
  const offers = own.mutationEvent!.offers;
  own = JSON.parse(JSON.stringify(own));
  assert.deepEqual(own.mutationEvent?.offers, offers);
  assert.throws(() => chooseMutationTarget(s, own, "copy:1", "new seed"));
  chooseDraftMutation(own, offers[0]);
  assert.equal(own.grandMutationUsed, true);
  assert.equal(own.cards?.[1].mutation, undefined);
  own.deck.push("n4", "n5", "n6", "n7", "n8");
  beginDraftMutation(s, own, "next");
  assert.equal(own.mutationEvent?.grand, false);
  own.deck = Array.from({ length: 25 }, () => "n0");
  own.mutationEvent = null;
  beginDraftMutation(s, own, "final");
  assert.equal(own.mutationEvent, null);
});
test("config validates switches, reroll, mutation interval and grand probability", () => {
  for (const input of [
    { rerollCount: -1 },
    { mutationInterval: 0 },
    { grandMutationChance: 1.1 },
    { mutationEnabled: "yes" },
  ])
    assert.throws(() => parseDraftConfig(input));
  assert.equal(parseDraftConfig({}).rerollCount, 2);
});

test("actual play/cost, bounce, deck-return, draw, RETIRE and DESTROY use the per-copy Draft baseline", () => {
  let s = createInitialGameState(undefined, [definition]);
  s.status = "IN_PROGRESS";
  s.turn = 3;
  s.activePlayerId = s.players[0].id;
  const p = s.players[0];
  p.hand = [];
  p.deck = [];
  p.board = [null, null, null, null];
  p.graveyard = [];
  p.currentGold = 2;
  const card = applyDraftMutation(
    generateCardInstance(definition, { instanceId: "draft-copy" }),
    DRAFT_MUTATIONS.find((m) => m.id === "light")!,
  );
  p.hand = [card];
  assert.ok(
    getLegalActions(s, p.id).some(
      (a) => a.type === "PLAY_WRESTLER" && a.cardInstanceId === "draft-copy",
    ),
  );
  const played = executeAction(s, {
    type: "PLAY_WRESTLER",
    playerId: p.id,
    cardInstanceId: "draft-copy",
    boardSlot: 0,
  });
  assert.ok(played.success);
  s = played.state;
  assert.equal(s.players[0].currentGold, 0);
  const field = s.players[0].board[0]!;
  s.players[0].board[0] = {
    ...field,
    currentAttack: 10,
    currentHealth: 12,
    maxHealth: 12,
    currentCost: 0,
  };
  s = applyEffect(s, p.id, field, {
    type: "STRUCTURED",
    action: "MOVE_TO_HAND",
    target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
  });
  assert.deepEqual(
    s.players[0].hand.map((c) => [c.currentCost, c.currentAttack, c.maxHealth]),
    [[2, 2, 4]],
  );
  const hand = s.players[0].hand[0];
  s = applyEffect(s, p.id, hand, {
    type: "STRUCTURED",
    action: "MOVE_TO_DECK",
    target: { zone: "HAND", owner: "SELF", selection: "SELF", count: 1 },
  });
  assert.equal(s.players[0].deck[0]?.draftMutation?.id, "light");
  s = drawCard(s, p.id);
  assert.deepEqual(
    s.players[0].hand.map((c) => [c.currentCost, c.currentAttack, c.maxHealth]),
    [[2, 2, 4]],
  );
  s.players[0].hand = [];
  s.players[0].board[0] = {
    ...hand,
    boardSlot: 0,
    currentAttack: 11,
    currentHealth: 1,
  };
  s = applyEffect(s, p.id, s.players[0].board[0]!, {
    type: "STRUCTURED",
    action: "RETIRE",
    target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
  });
  assert.equal(s.players[0].graveyard[0]?.draftMutation?.id, "light");
  assert.equal(s.players[0].graveyard[0]?.currentAttack, 2);
  s.players[0].board[0] = { ...hand, boardSlot: 0 };
  s = applyEffect(s, p.id, s.players[0].board[0]!, {
    type: "STRUCTURED",
    action: "DESTROY",
    target: { zone: "BOARD", owner: "SELF", selection: "SELF", count: 1 },
  });
  assert.equal(s.players[0].graveyard.length, 1);
  assert.equal(s.players[0].board[0], null);
});

test("Chaos may offer a playable published token but ordinary picks keep tokens/private/invalid rows out", () => {
  const s = snapshot(),
    own = seat();
  const token = {
    ...definition,
    id: "chaos-token",
    rarity: "TOKEN" as const,
    isToken: true,
  };
  s.cards = [
    ...s.cards,
    token,
    { ...token, id: "private", status: "DRAFT" },
    { ...token, id: "invalid", health: 0 },
  ];
  let found = false;
  for (let n = 0; n < 100; n++) {
    own.specialPick = "CHAOS";
    const chaos = draftOffers(s, own, `chaos:${n}`);
    assert.ok(!chaos.includes("private") && !chaos.includes("invalid"));
    if (chaos.includes(token.id)) found = true;
    own.specialPick = null;
    assert.ok(!draftOffers(s, own, `ordinary:${n}`).includes(token.id));
  }
  assert.ok(found);
  own.deck = [token.id];
  own.specialPick = null;
  assert.equal(draftOffers(s, own, "after-chaos").length, 3);
});

test("battle-granted keywords and armor never overwrite the saved Draft catalog baseline", () => {
  const c = applyDraftMutation(
    generateCardInstance(definition, { instanceId: "stable" }),
    DRAFT_MUTATIONS.find((m) => m.id === "armor")!,
  );
  const modified = {
    ...c,
    keywords: ["ARMOR", "RUSH"] as typeof c.keywords,
    armor: 99,
  };
  const n = resetCardAfterLeavingBoard(JSON.parse(JSON.stringify(modified)));
  assert.deepEqual(n.keywords, ["ARMOR"]);
  assert.equal(n.armor, 1);
});
