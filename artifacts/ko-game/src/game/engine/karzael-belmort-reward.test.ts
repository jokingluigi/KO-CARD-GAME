import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { cardRecordToDefinition } from "../cards/published-cards";
import { championRecordToDefinition } from "../champions/published-champions";
import { generateCardInstance } from "../cards/generation";
import { createInitialGameState } from "./create-initial-game-state";
import { destroyCard } from "./destroy-card";
import { executeAction } from "../actions/engine-actions";
import { resolveTriggeredAbilities } from "../effects/effect-engine";
import { processChampionQuestEvents } from "../champions/quests";
import type { CardDefinition } from "../cards/types";
import type { GameState } from "../types/game-state";
const fixture = JSON.parse(
  readFileSync(
    new URL("../qa/fixtures/karzael-belmort-20261124.json", import.meta.url),
    "utf8",
  ),
);
const cards: CardDefinition[] = fixture.cards.map(cardRecordToDefinition),
  champion = championRecordToDefinition(fixture.champion);
const body: CardDefinition = {
  id: "messenger-host",
  name: "검증 선수",
  cardType: "WRESTLER",
  cost: 0,
  attack: 3,
  health: 20,
  rulesText: "",
  keywords: [],
  abilities: [],
  isToken: false,
  isChampionToken: false,
};
const KARZAEL = "3fef0a3f-93c9-477c-a958-2f26af360104",
  DESCENDED = "34ba511c-0479-4fe2-bf7b-48ad1798859d";
function setup(owner = 0) {
  const s = createInitialGameState(undefined, [...cards, body]);
  Object.assign(s, {
    status: "IN_PROGRESS",
    turn: 5,
    activePlayerId: s.players[owner].id,
    openingMulligan: undefined,
    events: [],
  });
  s.cardPool = [...cards, body];
  s.minionACardPool = s.cardPool;
  for (const p of s.players) {
    p.board = [null, null, null, null];
    p.hand = [];
    p.deck = [];
    p.graveyard = [];
    p.currentGold = 100;
    p.health = 25;
    p.champion!.quest = null;
  }
  s.players[owner].champion = {
    ...champion,
    health: 25,
    questProgress: 0,
    questCompleted: false,
  };
  return s;
}
function enemy(s: GameState, id: string, owner: number) {
  s.players[1 - owner].board[0] = {
    ...generateCardInstance(
      { ...body, attack: 0, health: 1 },
      { instanceId: id },
    ),
    boardSlot: 0,
    enteredThisTurn: false,
  };
}
function progress(s: GameState, owner: number) {
  for (let i = 0; i < 9; i++) {
    enemy(s, "earlier-" + i, owner);
    const before = s;
    s = destroyCard(s, s.players[1 - owner].id, "earlier-" + i, {
      sourcePlayerId: s.players[owner].id,
      sourceInstanceId: "host",
    }).state;
    s = processChampionQuestEvents(before, s);
  }
  assert.equal(s.players[owner].champion!.questCompleted, false);
  return s;
}
for (const owner of [0, 1])
  for (const slot of [0, 1, 2, 3] as const)
    for (const mode of [
      "ordinary-ability",
      "messenger-attack",
      "messenger-ability",
    ] as const)
      test(`one Belmort reward: player ${owner}, host slot ${slot}, ${mode}`, () => {
        let s = setup(owner);
        const playerId = s.players[owner].id,
          otherId = s.players[1 - owner].id;
        s.players[owner].board[slot] = {
          ...generateCardInstance(body, { instanceId: "host" }),
          boardSlot: slot,
          enteredThisTurn: false,
        };
        if (mode !== "ordinary-ability") {
          s.players[owner].hand = [
            generateCardInstance(
              cards.find((d) => d.id === KARZAEL)!,
              { instanceId: "karzael" },
            ),
          ];
          const played = executeAction(s, {
            type: "PLAY_WRESTLER",
            playerId,
            cardInstanceId: "karzael",
            boardSlot: slot === 0 ? 1 : 0,
          });
          assert.ok(played.success, played.message);
          const chosen = executeAction(played.state, {
            type: "SELECT_EFFECT_TARGET",
            playerId,
            targetId: "host",
          });
          assert.ok(chosen.success, chosen.message);
          s = chosen.state;
        }
        s = JSON.parse(JSON.stringify(progress(s, owner)));
        enemy(s, "tenth", owner);
        let result =
          mode === "messenger-attack"
            ? executeAction(s, {
                type: "ATTACK",
                playerId,
                attackerInstanceId: "host",
                target: {
                  type: "WRESTLER",
                  playerId: otherId,
                  cardInstanceId: "tenth",
                },
              })
            : executeAction(s, { type: "USE_CHAMPION_ABILITY", playerId });
        assert.ok(result.success, result.message);
        s = result.state;
        if (s.targetingState?.active) {
          result = executeAction(s, {
            type:
              s.targetingState.phase === "PRE_COMMIT"
                ? "CONFIRM_PRECOMMIT_TARGET"
                : "SELECT_EFFECT_TARGET",
            playerId,
            targetId: "tenth",
          });
          assert.ok(result.success, result.message);
          s = result.state;
        }
        assert.equal(s.targetingState, undefined);
        assert.equal(s.players[owner].champion!.questCompleted, true);
        assert.equal(
          s.events.filter(
            (e) =>
              e.type === "CHAMPION_QUEST_COMPLETED" && e.playerId === playerId,
          ).length,
          1,
        );
        assert.equal(
          s.events.filter((e) => e.reason === "FINISHER_AUTO_CAST").length,
          1,
        );
        assert.equal(
          s.players[owner].board.filter((c) => c?.definitionId === DESCENDED)
            .length,
          1,
        );
        assert.equal(
          s.events.filter(
            (e) => e.type === "ENTER_FIELD" && e.cardDefinitionId === DESCENDED,
          ).length,
          1,
        );
        assert.ok(
          !s.players.some((p) =>
            p.board.some(
              (c) =>
                c?.instanceId === "host" ||
                c?.instanceId === "karzael" ||
                c?.instanceId === "tenth",
            ),
          ),
        );
        const replay = processChampionQuestEvents(
          s,
          JSON.parse(JSON.stringify(s)),
        );
        assert.equal(
          replay.events.filter(
            (e) => e.type === "ENTER_FIELD" && e.cardDefinitionId === DESCENDED,
          ).length,
          1,
        );
      });

test("multiple destruction-growth listeners finish before the parent explicitly summons two cards and pays gold once", () => {
  let s = setup();
  s.players[0].champion!.quest = null;
  const growth: CardDefinition = {
    ...body,
    id: "growth",
    abilities: [
      {
        trigger: "CARD_DESTROYED",
        effects: [
          {
            type: "STRUCTURED",
            action: "BUFF",
            target: {
              zone: "BOARD",
              owner: "SELF",
              selection: "SELF",
              count: 1,
            },
            values: { attack: 1, health: 1 },
          },
        ],
      },
    ],
  };
  for (const slot of [0, 1] as const)
    s.players[0].board[slot] = {
      ...generateCardInstance(growth, { instanceId: "growth-" + slot }),
      boardSlot: slot,
    };
  for (const slot of [0, 1] as const)
    s.players[1].board[slot] = {
      ...generateCardInstance(body, { instanceId: "victim-" + slot }),
      boardSlot: slot,
    };
  const spell = generateCardInstance(
    {
      ...body,
      id: "clear-spell",
      cardType: "TECHNIQUE",
      abilities: [
        {
          trigger: "ACTIVE",
          effects: [
            {
              type: "STRUCTURED",
              action: "DESTROY",
              target: {
                zone: "BOARD",
                owner: "ENEMY",
                selection: "ALL",
                count: 4,
              },
            },
            {
              type: "STRUCTURED",
              action: "SUMMON",
              values: { definition: body, count: 2 },
            },
            { type: "GAIN_GOLD", amount: 3 },
          ],
        },
      ],
    },
    { instanceId: "clear" },
  );
  s = resolveTriggeredAbilities(s, "player-1", spell, "ACTIVE");
  assert.equal(s.players[0].currentGold, 103);
  assert.equal(s.players[1].board.filter(Boolean).length, 0);
  assert.equal(
    s.players[0].board.filter((c) => c?.definitionId === body.id).length,
    2,
  );
  for (const slot of [0, 1])
    assert.equal(s.players[0].board[slot]!.currentAttack, 5);
  assert.equal(
    s.events.filter(
      (e) => e.type === "ENTER_FIELD" && e.cardDefinitionId === body.id,
    ).length,
    2,
  );
  assert.equal(s.targetingState, undefined);
});
