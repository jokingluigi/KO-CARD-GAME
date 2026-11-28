import assert from "node:assert/strict";
import test from "node:test";
import upgrades from "../../../../docs/qa/20261128-quality-a/public-upgrades.json" with { type: "json" };
import support from "../../../../docs/qa/20261128-quality-a/public-upgrade-support.json" with { type: "json" };
import { fixture, unit, definitions } from "../../qa/quality-a-fixture";
import {
  cardRecordToDefinition,
  type PublishedCardRecord,
} from "../game/cards/published-cards";
import { generateCardInstance } from "../game/cards/generation";
import { executeAction } from "../game/actions/engine-actions";
import { cardPlayPreview, cardPlayPreviewText } from "./card-play-preview";
const catalog = [
  ...definitions,
  ...[...upgrades, ...support].map((record) =>
    cardRecordToDefinition(record as PublishedCardRecord),
  ),
];
const cards = catalog.filter(
  (card) =>
    upgrades.some((r) => r.id === card.id) &&
    card.abilities.some((a) =>
      a.effects.some((e) => e.type === "STRUCTURED" && e.action === "PROGRAM"),
    ),
);
const unique = [...new Map(cards.map((c) => [c.id, c])).values()];
test("the public snapshot contains seven playable upgrade effects, separate from the waiver aura", () =>
  assert.equal(unique.length, 7));
for (const definition of unique)
  for (const waived of [false, true])
    test(`${definition.name}: shared preview and actual upgrade payment${waived ? " with the public waiver aura" : ""}`, () => {
      const state = fixture(definition.cost + 1);
      state.cardPool = [...catalog];
      for (const player of state.players) player.champion!.quest = null;
      const card = generateCardInstance(definition, {
        instanceId: "upgrade-source",
      });
      state.players[0].hand = [card];
      const hero = {
        ...definitions.find((d) => d.name === "불록스")!,
        id: "isolated-hero",
        name: "격리 히어로",
        tags: ["히어로"],
        abilities: [],
      };
      state.cardPool.push(hero);
      state.players[0].deck = [
        generateCardInstance(hero, { instanceId: "deck-hero" }),
      ];
      if (waived) {
        const aura = catalog.find((d) => d.name === "나토마토(에스페란사)")!;
        state.players[0].board[1] = {
          ...generateCardInstance(aura, { instanceId: "waiver" }),
          boardSlot: 1,
        };
      }
      for (let i = 0; i < 4; i++)
        state.players[1].board[i] = {
          ...unit("불록스", "target-" + i),
          currentHealth: 20,
          maxHealth: 20,
          boardSlot: i as 0 | 1 | 2 | 3,
        };
      const before = structuredClone(state);
      const preview = cardPlayPreview(state, "player-1", card)!;
      assert.ok(preview, "common preview must recognize this upgrade");
      assert.deepEqual(state, before);
      let result = executeAction(
        state,
        definition.cardType === "TECHNIQUE"
          ? {
              type: "PLAY_TECHNIQUE",
              playerId: "player-1",
              cardInstanceId: card.instanceId,
            }
          : {
              type: "PLAY_WRESTLER",
              playerId: "player-1",
              cardInstanceId: card.instanceId,
              boardSlot: 0,
            },
      );
      assert.ok(result.success);
      for (let i = 0; result.state.targetingState && i < 10; i++) {
        const pending = result.state.targetingState;
        result = executeAction(result.state, {
          type:
            pending.phase === "PRE_COMMIT"
              ? "CONFIRM_PRECOMMIT_TARGET"
              : "SELECT_EFFECT_TARGET",
          playerId: pending.playerId,
          targetId: pending.validTargetIds[0]!,
        });
        assert.ok(result.success);
      }
      assert.equal(result.state.targetingState, undefined);
      const payments = result.state.events
        .filter(
          (e) => e.type === "GOLD_CHANGED" && e.reason === "CARD_EFFECT_COST",
        )
        .reduce((sum, e) => sum - (e.amount ?? 0), 0);
      assert.equal(payments, waived ? 0 : 1);
      assert.ok(
        result.state.events.some((e) => e.type === "PROGRAM_ACTIVATED"),
      );
      if (preview.pending)
        assert.match(cardPlayPreviewText(preview), /선택 후 결정/);
      else {
        assert.equal(preview.extraCost, payments);
        assert.equal(preview.totalCost, definition.cost + payments);
        assert.equal(preview.upgraded, true);
      }
    });

test("a newly authored upgrade with an unknown name and ID needs no preview registration", () => {
  const definition = {
    id: "future-upgrade-not-in-any-registry",
    name: "나중에 추가한 업그레이드 카드",
    cardType: "WRESTLER" as const,
    cost: 2,
    attack: 3,
    health: 2,
    keywords: [],
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
                  action: "BUFF" as const,
                  target: {
                    zone: "BOARD" as const,
                    owner: "SELF" as const,
                    selection: "SELF" as const,
                    count: 1,
                  },
                  values: { attack: 2, health: 1 },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  const state = fixture(3);
  for (const p of state.players) p.champion!.quest = null;
  state.cardPool = [...definitions, definition];
  const card = generateCardInstance(definition, { instanceId: "future-card" });
  state.players[0].hand = [card];
  const before = structuredClone(state),
    preview = cardPlayPreview(state, "player-1", card)!;
  assert.equal(preview.totalCost, 3);
  assert.equal(preview.extraCost, 1);
  assert.equal(preview.stats, "5/3");
  assert.deepEqual(state, before);
  const actual = executeAction(state, {
    type: "PLAY_WRESTLER",
    playerId: "player-1",
    cardInstanceId: "future-card",
    boardSlot: 0,
  });
  assert.ok(actual.success);
  assert.equal(actual.state.players[0].currentGold, 0);
  assert.equal(actual.state.players[0].board[0]!.currentAttack, 5);
  assert.equal(actual.state.players[0].board[0]!.currentHealth, 3);
});
