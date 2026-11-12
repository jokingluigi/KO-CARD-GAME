import assert from "node:assert/strict";
import { eq } from "../../lib/db/node_modules/drizzle-orm/index.js";
import { generateCardInstance } from "../../artifacts/ko-game/src/game/cards/generation.ts";
export async function lethalScenarios({
  f,
  service,
  runtime,
  own,
  opponent,
  out,
  width,
  baseCard,
  setRuntime,
}) {
  const checks = [];
  for (const kind of ["attack", "spell", "surrender"]) {
    const state = structuredClone(runtime.state);
    state.status = "IN_PROGRESS";
    state.winnerId = null;
    state.loserId = null;
    state.events = [];
    state.activePlayerId = "PLAYER_ONE";
    state.turn = 5;
    state.targetingState = undefined;
    const unit = {
      ...baseCard,
      id: "lethal-unit",
      cost: 1,
      attack: 8,
      health: 10,
      abilities: [],
      keywords: [],
    };
    const spell = {
      ...baseCard,
      id: "lethal-spell",
      name: "결정타 주문 검증",
      cardType: "TECHNIQUE",
      cost: 0,
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
              values: { amount: 8 },
            },
          ],
        },
      ],
      keywords: [],
    };
    state.cardPool = [
      ...state.cardPool.filter((c) => ![unit.id, spell.id].includes(c.id)),
      unit,
      spell,
    ];
    for (const [i, p] of state.players.entries()) {
      p.health = i ? 3 : 20;
      p.currentGold = 6;
      p.champion.quest = null;
      p.champion.championTokenDefinitionId = null;
      p.champion.questCompleted = false;
      p.hand = i
        ? []
        : [generateCardInstance(spell, { instanceId: "lethal-cast" })];
      p.board = i
        ? [null, null, null, null]
        : [
            {
              ...generateCardInstance(unit, { instanceId: "lethal-attacker" }),
              boardSlot: 0,
              enteredThisTurn: false,
              attacksUsedThisTurn: 0,
            },
            null,
            null,
            null,
          ];
      p.deck = [];
      p.graveyard = [];
    }
    await f.db
      .update(f.schema.onlineMatchesTable)
      .set({ status: "ACTIVE", serializedGameState: state })
      .where(eq(f.schema.onlineMatchesTable.id, runtime.matchId));
    service.cleanupMatchRuntime(runtime.matchId);
    runtime = await service.getRuntime(runtime.matchId);
    assert.ok(runtime, "isolated scenario restores valid battle state");
    setRuntime(runtime);
    await own.reload();
    await opponent.reload();
    await own.locator(".ko-turn-end:not([disabled])").waitFor();
    await opponent.locator(".ko-game-shell").waitFor();
    await opponent.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    for (const page of [own, opponent])
      await page.evaluate(() => {
        window.lethalProbe = {
          finisher: false,
          shatter: false,
          resultBeforeShatter: false,
          result: false,
          shatterRuns: 0,
        };
        let lastNode = null;
        const sample = () => {
          const p = window.lethalProbe;
          if (!p) return;
          const attack = document.querySelector(".attack-animation--finisher");
          if (attack) p.finisher = true;
          const shatter = document.querySelector(
            '[data-testid="champion-hud-shatter"]',
          );
          if (shatter && shatter !== lastNode) {
            p.shatterRuns++;
            lastNode = shatter;
          }
          if (
            shatter?.dataset.phase === "burst" ||
            shatter?.dataset.phase === "done"
          )
            p.shatter = true;
          if (document.querySelector('[data-testid="match-result-overlay"]')) {
            p.result = true;
            if (!p.shatter) p.resultBeforeShatter = true;
          }
        };
        new MutationObserver(sample).observe(document.body, {
          subtree: true,
          attributes: true,
          childList: true,
        });
      });
    if (kind === "attack") {
      await own
        .locator(
          '.ko-player-board-row [data-card-instance-id="lethal-attacker"]',
        )
        .click({ position: { x: 25, y: 60 } });
      await own.locator(".ko-opponent-champion").click();
      try {
        await Promise.all(
          [own, opponent].map((p) =>
            p.waitForFunction(() => window.lethalProbe.finisher),
          ),
        );
      } catch (e) {
        console.log(
          "LETHAL_DIAGNOSTIC",
          JSON.stringify(
            await Promise.all(
              [own, opponent].map((p) =>
                p.evaluate(() => ({
                  probe: window.lethalProbe,
                  text: document.body.innerText.slice(-1600),
                })),
              ),
            ),
          ),
        );
        console.log(
          "SERVER_FINAL",
          runtime.state.status,
          runtime.state.players.map((p) => p.health),
        );
        await own.screenshot({ path: out + "/failed-" + width + ".png" });
        throw e;
      }
    } else if (kind === "spell") {
      await own
        .locator('.ko-player-hand [data-card-definition="lethal-spell"]')
        .click({ position: { x: 25, y: 60 } });
      await own.getByRole("button", { name: "사용", exact: true }).click();
    } else {
      const execution = await service.applyMatchAction(
        runtime.matchId,
        "tutorial-user",
        "surrender-qa-" + width,
        runtime.version,
        { type: "SURRENDER" },
        runtime.primaryConnections.get("tutorial-user"),
      );
      assert.ok(execution.ok, execution.message);
      service.broadcastExecution(execution);
    }
    if (kind !== "surrender") {
      await Promise.all(
        [own, opponent].map((p) =>
          p.waitForFunction(() => window.lethalProbe.shatter),
        ),
      );
      await own.screenshot({ path: `${out}/lethal-${kind}-${width}.png` });
    }
    await Promise.all(
      [own, opponent].map((p) =>
        p.getByTestId("match-result-overlay").waitFor({ timeout: 20000 }),
      ),
    );
    const views = await Promise.all(
      [own, opponent].map((p) => p.evaluate(() => window.lethalProbe)),
    );
    for (const v of views) {
      assert.equal(v.result, true);
      assert.equal(v.shatter, kind !== "surrender");
      assert.equal(v.shatterRuns, kind === "surrender" ? 0 : 1);
      if (kind !== "surrender") assert.equal(v.resultBeforeShatter, false);
    }
    if (kind === "attack")
      for (const v of views) assert.equal(v.finisher, true);
    assert.equal(runtime.state.status, "FINISHED");
    await own.reload();
    await own.getByTestId("match-result-overlay").waitFor({ timeout: 10000 });
    assert.equal(await own.getByTestId("champion-hud-shatter").count(), 0);
    assert.equal(await own.locator(".attack-animation").count(), 0);
    checks.push({ kind, bothViews: views, reconnectDoesNotReplay: true });
  }
  return {
    actualOnlinePages: true,
    authoritativeServiceAndIsolatedDB: true,
    realMatchEndedMessage: true,
    checks,
  };
}
