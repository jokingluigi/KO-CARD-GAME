import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { cardRecordToDefinition } from "../cards/published-cards";
import { generateCardInstance } from "../cards/generation";
import { createInitialGameState } from "./create-initial-game-state";
import {
  resolveTriggeredAbilities,
  resolvePendingEffects,
  resolveStateBasedDeaths,
} from "../effects/effect-engine";
const records = JSON.parse(
  readFileSync(
    new URL(
      "../../../../../docs/qa/fixtures/20261104-wimari-awakened.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
for (const variant of ["published", "canonical-leon-name", "renamed-healer"])
  test(
    "current Wimari awakened healing and exit remain functional: " + variant,
    () => {
      const changed = records.map((r: any) =>
        r.id !== "crisis-awakening-healer"
          ? r
          : {
              ...r,
              ...(variant === "canonical-leon-name"
                ? { text: r.text.replace("각성 리온", "리온(각성)") }
                : {}),
              ...(variant === "renamed-healer" ? { name: "각성 위마리" } : {}),
            },
      );
      const defs = changed.map(cardRecordToDefinition),
        healer = defs.find((d: any) => d.id === "crisis-awakening-healer")!;
      let s = createInitialGameState();
      Object.assign(s, {
        status: "IN_PROGRESS",
        turn: 3,
        activePlayerId: "player-1",
        events: [],
        cardPool: defs,
        minionACardPool: defs,
      });
      for (const p of s.players) {
        p.board = [null, null, null, null];
        p.hand = [];
        p.graveyard = [];
        p.health = 10;
        p.maxHealth = 25;
        p.champion!.quest = null;
      }
      const source = {
        ...generateCardInstance(healer, { instanceId: "healer" }),
        currentHealth: 1,
        boardSlot: 0 as const,
      };
      s.players[0].board[0] = source;
      s.players[0].board[1] = {
        ...source,
        instanceId: "ally",
        definitionId: "qa-injured-ally",
        abilities: [],
        keywords: [],
        currentHealth: 1,
        maxHealth: 10,
        boardSlot: 1,
      };
      s = resolveTriggeredAbilities(s, "player-1", source, "TURN_END");
      if (s.targetingState?.active) s = resolvePendingEffects(s);
      assert.equal(s.players[0].health, 12);
      assert.equal(s.players[1].health, 10);
      assert.equal(s.players[0].board[0]!.currentHealth, 3);
      assert.equal(s.players[0].board[1]!.currentHealth, 3);
      s.players[0].board[0]!.currentHealth = 0;
      s = resolveStateBasedDeaths(s);
      assert.equal(
        s.players[0].graveyard.filter((c) => c.instanceId === "healer").length,
        1,
      );
      assert.equal(
        s.players[0].board.filter(
          (c) => c?.definitionId === "crisis-awakening-dealer",
        ).length,
        1,
      );
      assert.equal(s.targetingState?.active ?? false, false);
    },
  );
