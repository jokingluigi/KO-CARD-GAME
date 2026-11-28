import assert from "node:assert/strict";
import test from "node:test";
import { fixture, unit, definitions } from "../../../qa/quality-a-fixture";
import { executeAction, getLegalActions } from "../actions/engine-actions";
import { chooseBestAction } from "../actions/ai-evaluator";
import { generateCardInstance } from "../cards/generation";
import {
  championAbilityExplanation,
  effectChoiceExplanation,
  ownsEffectChoice,
} from "../../lib/battle-action-explanation";
import { cardPlayPreview } from "../../lib/card-play-preview";
import {
  historyGroups,
  historyDetailLines,
  historyEvents,
} from "../../components/action-history-utils";
import { matchSummary } from "../../lib/match-summary";
import { championPreparationProgress } from "../../lib/champion-preparation-progress";
import { processChampionQuestEvents } from "../champions/quests";
import type { GameState } from "../types/game-state";
import type { GameAction } from "../actions/types";
function act(state: GameState, action: GameAction) {
  const r = executeAction(state, action);
  assert.ok(r.success, r.success ? "" : r.message);
  return r.state;
}
function begin(state: GameState, playerId = "player-1") {
  return act(state, {
    type: "BEGIN_TARGETED_ACTION",
    playerId,
    action: { type: "USE_CHAMPION_ABILITY" },
  });
}
function play(state: GameState, name = "신입 사이드킥") {
  state.players[0].hand = [unit(name, "source")];
  return act(state, {
    type: "PLAY_WRESTLER",
    playerId: "player-1",
    cardInstanceId: "source",
    boardSlot: 0,
  });
}
test("A1: current Pandora data explains both sides; precommit cancellation restores exact resources and use count", () => {
  const s = fixture();
  s.players[0].board[0] = { ...unit("좀비 벨로나", "ally"), boardSlot: 0 };
  s.players[1].board[0] = { ...unit("불록스", "enemy"), boardSlot: 0 };
  const before = structuredClone(s);
  const pending = begin(s);
  const explanation = effectChoiceExplanation(pending, "player-1")!;
  assert.equal(explanation.name, "불안한 일격");
  assert.match(explanation.description, /핀폴.*2/);
  assert.match(explanation.target, /아군 또는 상대.*선수/);
  assert.match(explanation.cost, /확정 시 1골드/);
  assert.deepEqual(pending.targetingState!.validTargetIds, ["ally", "enemy"]);
  const cancelled = act(pending, {
    type: "CANCEL_EFFECT_TARGET",
    playerId: "player-1",
  });
  assert.deepEqual(
    { ...cancelled, targetingState: undefined },
    { ...before, targetingState: undefined },
  );
  assert.deepEqual(s, before);
  const done = act(begin(s), {
    type: "CONFIRM_PRECOMMIT_TARGET",
    playerId: "player-1",
    targetId: "ally",
  });
  assert.equal(done.players[0].currentGold, 1);
  assert.equal(done.players[0].championAbilityUsedThisTurn, true);
  assert.equal(done.players[0].board[0]!.currentHealth, 2);
  assert.ok(
    done.players[0].board.some(
      (c) => c?.definitionId === definitions.find((d) => d.name === "좀비")!.id,
    ),
  );
});
test("A1: ability overrides supply their own name, cost and rules rather than a Pandora-specific string", () => {
  const s = fixture();
  const c = s.players[0].champion!;
  c.abilityOverride = {
    id: "override",
    name: "다른 능력",
    cost: 0,
    description: "골드를 2 얻습니다.",
    effects: [{ type: "GAIN_GOLD", amount: 2 }],
  };
  assert.deepEqual(championAbilityExplanation(c), {
    name: "다른 능력",
    cost: 0,
    description: "골드를 2 얻습니다.",
    targets: "",
  });
});
test("A2: AI owns its choice; auto target resolves, while an off-turn local response stays local", () => {
  let s = fixture();
  s.activePlayerId = "player-2";
  s.players[0].board[0] = {
    ...unit("불록스", "target"),
    boardSlot: 0,
    currentHealth: 1,
  };
  let pending = begin(s, "player-2");
  assert.equal(ownsEffectChoice(pending, "player-1"), false);
  assert.equal(effectChoiceExplanation(pending, "player-1"), null);
  const choice = chooseBestAction(
    pending,
    getLegalActions(pending, "player-2"),
    "player-2",
  );
  assert.ok(choice);
  pending = act(pending, choice!);
  assert.equal(pending.targetingState, undefined);
  assert.equal(pending.players[1].currentGold, 1);
  s = fixture();
  s.players[1].board[0] = { ...unit("불록스", "target"), boardSlot: 0 };
  pending = begin(s);
  pending.activePlayerId = "player-2";
  assert.equal(ownsEffectChoice(pending, "player-1"), true);
  assert.ok(
    getLegalActions(pending, "player-1").some(
      (a) => a.type === "CONFIRM_PRECOMMIT_TARGET",
    ),
  );
});
test("A2: empty AI targets fail without taking gold or leaving a human selection behind", () => {
  const s = fixture();
  s.activePlayerId = "player-2";
  const before = structuredClone(s);
  const r = executeAction(s, {
    type: "BEGIN_TARGETED_ACTION",
    playerId: "player-2",
    action: { type: "USE_CHAMPION_ABILITY" },
  });
  assert.equal(r.success, false);
  assert.deepEqual(r.state, before);
});
for (const [gold, paid, stats] of [
  [1, 1, [1, 1]],
  [2, 2, [2, 2]],
] as const)
  test(`A3: Sidekick at ${gold} gold previews the authoritative ${paid}-gold play`, () => {
    const s = fixture(gold);
    const card = unit("신입 사이드킥", "source");
    s.players[0].hand = [card];
    const before = structuredClone(s);
    const p = cardPlayPreview(s, "player-1", card)!;
    assert.equal(p.totalCost, paid);
    assert.deepEqual(s, before);
    const done = act(s, {
      type: "PLAY_WRESTLER",
      playerId: "player-1",
      cardInstanceId: card.instanceId,
      boardSlot: 0,
    });
    assert.equal(done.players[0].currentGold, gold - paid);
    assert.deepEqual(
      [
        done.players[0].board[0]!.currentAttack,
        done.players[0].board[0]!.currentHealth,
      ],
      stats,
    );
    assert.equal(p.stats, stats.join("/"));
    const log = historyEvents(done, Infinity).filter(
      (e) => e.type === "PROGRAM_ACTIVATED",
    );
    assert.equal(log.length, gold === 2 ? 1 : 0);
  });
test("A3: insufficient base gold does not play; a failed upgrade target never charges extra", () => {
  let s = fixture(0);
  s.players[0].hand = [unit("신입 사이드킥", "source")];
  const before = structuredClone(s);
  assert.equal(cardPlayPreview(s, "player-1", s.players[0].hand[0]!), null);
  assert.equal(
    executeAction(s, {
      type: "PLAY_WRESTLER",
      playerId: "player-1",
      cardInstanceId: "source",
      boardSlot: 0,
    }).success,
    false,
  );
  assert.deepEqual(s, before);
  s = fixture(2);
  const d = {
    ...definitions.find((d) => d.name === "신입 사이드킥")!,
    id: "target-upgrade",
    abilities: [
      {
        trigger: "ENTER_FIELD" as const,
        effects: [
          {
            type: "STRUCTURED" as const,
            action: "PROGRAM" as const,
            values: {
              programCost: 1,
              programEffects: [
                {
                  action: "DAMAGE" as const,
                  target: {
                    zone: "BOARD" as const,
                    owner: "ENEMY" as const,
                    selection: "PLAYER_CHOICE" as const,
                    count: 1,
                  },
                  values: { amount: 1 },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  const card = generateCardInstance(d, { instanceId: "target-upgrade" });
  s.cardPool!.push(d);
  s.players[0].hand = [card];
  const preview = cardPlayPreview(s, "player-1", card)!;
  assert.equal(preview.totalCost, 1);
  assert.equal(preview.upgraded, false);
  const done = act(s, {
    type: "PLAY_WRESTLER",
    playerId: "player-1",
    cardInstanceId: card.instanceId,
    boardSlot: 0,
  });
  assert.equal(done.players[0].currentGold, 1);
});
test("A3: a field waiver is reflected by the real upgrade resolver", () => {
  const s = fixture(1);
  s.players[0].board[1] = {
    ...unit("불록스", "waiver"),
    boardSlot: 1,
    abilities: [{ trigger: "ACTIVE", effects: [], waiveUpgradeCost: true }],
  };
  const card = unit("신입 사이드킥", "source");
  s.players[0].hand = [card];
  const preview = cardPlayPreview(s, "player-1", card)!;
  assert.equal(preview.totalCost, 1);
  assert.equal(preview.upgraded, true);
  assert.equal(preview.stats, "2/2");
});
for (const distributed of [false, true])
  test(`A4: two fireworks hits ${distributed ? "split between two victims" : "kill the same 2/2 victim"} stay in expanded log`, () => {
    const s = fixture();
    s.players[1].board[0] = { ...unit("불록스", "bull-a"), boardSlot: 0 };
    if (distributed)
      s.players[1].board[1] = { ...unit("불록스", "bull-b"), boardSlot: 1 };
    // Find a seed once, deterministically; no live random draws or balance changes.
    let done: GameState | undefined;
    for (let seed = 1; seed < 40; seed++) {
      const copy = structuredClone(s);
      copy.randomSeed = seed;
      const candidate = play(copy, "폭죽광");
      const hits = candidate.events.filter((e) => e.type === "DAMAGE_DEALT");
      if (
        !distributed ||
        new Set(
          hits.map((e) =>
            e.target?.type === "CARD" ? e.target.cardInstanceId : "",
          ),
        ).size === 2
      ) {
        done = candidate;
        break;
      }
    }
    assert.ok(done);
    const hits = done.events.filter((e) => e.type === "DAMAGE_DEALT");
    assert.deepEqual(
      hits.map((e) => e.amount),
      [1, 1],
    );
    const lines = historyGroups(done, Infinity).flatMap((g) =>
      historyDetailLines(done!, g, "player-1"),
    );
    assert.equal(
      lines.filter((line) => line.event.type === "DAMAGE_DEALT").length,
      2,
    );
    if (!distributed) {
      assert.equal(done.players[1].board[0], null);
      assert.match(
        lines.find((l) => l.event.type === "DAMAGE_DEALT")!.text,
        /체력 2 → 1/,
      );
      assert.ok(lines.some((l) => /체력 1 → 0/.test(l.text)));
      assert.equal(
        lines.filter((l) => l.event.type === "CARD_RETIRED").length,
        1,
      );
    }
  });
test("A4: even legacy hits without before/after fields remain separate when their text is identical", () => {
  const s = fixture();
  s.players[1].board[0] = { ...unit("불록스", "bull"), boardSlot: 0 };
  s.events = [
    { type: "CARD_PLAYED", playerId: "player-1", cardInstanceId: "fire" },
    ...Array.from({ length: 2 }, () => ({
      type: "DAMAGE_DEALT" as const,
      amount: 1,
      target: { type: "CARD" as const, cardInstanceId: "bull" },
    })),
  ];
  const lines = historyDetailLines(s, historyGroups(s)[0]!, "player-1");
  assert.equal(lines.length, 2);
  assert.equal(lines[0]!.text, lines[1]!.text);
});
test("A5: final 1/8 and 4/8 read the same condition counters as the battlefield, not the dormant legacy zero", () => {
  const s = fixture();
  s.status = "FINISHED";
  s.players[0].champion!.questConditionCounts = { root: 1 };
  s.players[1].champion!.questConditionCounts = { root: 4 };
  assert.deepEqual(
    s.players.map((p) => p.champion!.questProgress),
    [0, 0],
  );
  const sums = matchSummary(s);
  assert.deepEqual(
    sums.map((p) => p.preparationAtEnd),
    ["1/8", "4/8"],
  );
  sums.forEach((sum, i) =>
    assert.equal(
      sum.questProgress,
      championPreparationProgress(s.players[i]!.champion!).current,
    ),
  );
});
test("A5: real qualifying kill updates the report without resetting state at match finish", () => {
  let s = fixture();
  s.players[1].board[0] = {
    ...unit("불록스", "victim"),
    boardSlot: 0,
    currentHealth: 1,
  };
  s = act(begin(s), {
    type: "CONFIRM_PRECOMMIT_TARGET",
    playerId: "player-1",
    targetId: "victim",
  });
  assert.equal(s.players[0].champion!.questConditionCounts!.root, 1);
  s = act(s, { type: "SURRENDER", playerId: "player-1" });
  assert.equal(matchSummary(s)[0]!.preparationAtEnd, "1/8");
});
test("A5: reaching preparation does not mean a cast; casting and a later reset remain separate metrics", () => {
  const s = fixture();
  const c = s.players[0].champion!;
  c.questCompleted = true;
  c.questConditionCounts = { root: 8 };
  c.questProgress = 8;
  assert.equal(matchSummary(s)[0]!.preparationAtEnd, "8/8");
  assert.equal(matchSummary(s)[0]!.finishersPlayed, 0);
  s.events.push({
    type: "CARD_PLAYED",
    playerId: "player-1",
    cardDefinitionId: c.quest!.finisher!.cardDefinitionId,
    cardType: "TECHNIQUE",
  });
  c.questCompleted = false;
  c.questProgress = 0;
  c.questConditionCounts = { root: 0 };
  assert.equal(matchSummary(s)[0]!.preparationAtEnd, "0/8");
  assert.equal(matchSummary(s)[0]!.finishersPlayed, 1);
});
test("A5: choice conditions and automatic finisher casts use separate final-state and usage labels", () => {
  const s = fixture();
  const c = s.players[0].champion!;
  c.quest!.finisherChoices = [
    {
      id: "a",
      name: "연계",
      description: "검증",
      cardDefinitionId: "choice-card",
      condition: {
        type: "EVENT",
        event: "CARD_PLAYED",
        owner: "SELF",
        required: 3,
      },
    },
  ];
  c.finisherProgress = { a: { completed: false, counts: { root: 2 } } };
  s.events = [
    { type: "CHAMPION_QUEST_COMPLETED", playerId: "player-1" },
    { type: "CARD_PLAYED", reason: "FINISHER_AUTO_CAST", playerId: "player-1" },
  ];
  assert.equal(matchSummary(s)[0]!.preparationAtEnd, "연계: 2/3");
  assert.equal(matchSummary(s)[0]!.finishersPlayed, 1);
});

test("A5: actual preparation reward, unused finisher, hand cast and match finish stay distinct", () => {
  let s = fixture(3);
  const c = s.players[0].champion!;
  c.questConditionCounts = { root: 7 };
  const finisherId = c.quest!.finisher!.cardDefinitionId;
  s.cardPool!.push({
    id: finisherId,
    name: "집계 검증용 피니셔",
    cardType: "TECHNIQUE",
    rarity: "CHAMPION",
    isToken: true,
    isChampionToken: true,
    cost: 0,
    attack: 0,
    health: 0,
    rulesText: "상대 챔피언에게 1 피해",
    keywords: [],
    abilities: [
      {
        trigger: "ACTIVE",
        effects: [
          {
            type: "STRUCTURED",
            action: "DAMAGE",
            target: {
              zone: "PLAYER",
              owner: "ENEMY",
              selection: "ALL",
              count: 1,
            },
            values: { amount: 1 },
          },
        ],
      },
    ],
  });
  s.players[1].board[0] = {
    ...unit("불록스", "last-preparation-victim"),
    boardSlot: 0,
    currentHealth: 1,
  };
  s = act(begin(s), {
    type: "CONFIRM_PRECOMMIT_TARGET",
    playerId: "player-1",
    targetId: "last-preparation-victim",
  });
  assert.equal(matchSummary(s)[0]!.preparationAtEnd, "8/8");
  assert.equal(matchSummary(s)[0]!.finishersPlayed, 0);
  const finisher = s.players[0].hand.find(
    (card) => card.definitionId === finisherId,
  );
  assert.ok(finisher);
  s = act(s, {
    type: "PLAY_TECHNIQUE",
    playerId: "player-1",
    cardInstanceId: finisher.instanceId,
  });
  s = act(s, { type: "SURRENDER", playerId: "player-1" });
  assert.equal(matchSummary(s)[0]!.preparationAtEnd, "8/8");
  assert.equal(matchSummary(s)[0]!.finishersPlayed, 1);
});

test("A3/A4: a technique payment before its play remains in the same history group", () => {
  const s = fixture();
  s.events = [
    {
      type: "GOLD_CHANGED",
      playerId: "player-1",
      reason: "CARD_COST",
      amount: -1,
    },
    { type: "CARD_PLAYED", playerId: "player-1", cardInstanceId: "technique" },
  ];
  const groups = historyGroups(s);
  assert.equal(groups.length, 1);
  assert.deepEqual(
    historyDetailLines(s, groups[0]!, "player-1").map((line) => line.text),
    ["기본 비용 1골드 지불"],
  );
});

test("A4: the identical head event is not duplicated, but subsequent equal hits are retained", () => {
  const s = fixture();
  s.events = [
    { type: "TURN_STARTED", playerId: "player-1" },
    { type: "DAMAGE_DEALT", amount: 1 },
    { type: "DAMAGE_DEALT", amount: 1 },
  ];
  const group = historyGroups(s)[0]!;
  const lines = historyDetailLines(s, group, "player-1");
  assert.equal(lines.length, 1);
  assert.equal(lines[0]!.event, s.events[2]);
});
