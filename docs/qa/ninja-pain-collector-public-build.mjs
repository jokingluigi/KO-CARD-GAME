/** Executes the downloaded public frontend engine in isolated browser memory.
 * All API requests are intercepted. No account, match or production data is written.
 * Export aliases below are pinned to the inspected deployment, not a public API.
 */
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "./black-gold-playwright.mjs";
import { createInitialGameState } from "../../artifacts/ko-game/src/game/engine/create-initial-game-state.ts";
import { cardRecordToDefinition } from "../../artifacts/ko-game/src/game/cards/published-cards.ts";
import { generateCardInstance } from "../../artifacts/ko-game/src/game/cards/generation.ts";
const origin = "https://ko-card-game-vr69.onrender.com";
const enginePath =
  process.env.KO_ENGINE_PATH ?? "/assets/effect-engine-CwiLKbEL.js";
const expectFixed = process.env.KO_EXPECT_FIXED === "1";
const definitions = JSON.parse(
  await readFile("docs/qa/fixtures/20261104-ninja-pain-collector.json", "utf8"),
).map(cardRecordToDefinition);
const state = createInitialGameState();
Object.assign(state, {
  status: "IN_PROGRESS",
  activePlayerId: "player-1",
  turn: 3,
  events: [],
  cardPool: definitions,
});
for (const p of state.players)
  Object.assign(p, {
    currentGold: 99,
    hand: [],
    deck: [],
    board: [null, null, null, null],
    graveyard: [],
    champion: { ...p.champion, quest: null },
  });
const cards = Object.fromEntries(
  definitions.map((d) => [
    d.name,
    generateCardInstance(d, { instanceId: d.name }),
  ]),
);
const browser = await chromium.launch(),
  results = [];
try {
  const p = await browser.newPage({ ignoreHTTPSErrors: true });
  await p.route("**/api/**", (r) =>
    r.fulfill({ json: { authenticated: false, cards: [], champions: [] } }),
  );
  await p.routeWebSocket("**", (ws) => ws.close());
  await p.goto(origin + "/");
  for (const helOwner of ["player-1", "player-2"]) {
    const r = await p.evaluate(
      async ({ state, cards, enginePath, helOwner }) => {
        const remote = await import(enginePath),
          enter = remote.e,
          resume = remote.m;
        if (!enter.toString().includes("PLAY_FROM_HAND"))
          throw Error("Pinned engine export changed");
        const settle = (s) => {
          for (
            let i = 0;
            i < 20 &&
            s.targetingState?.active &&
            !s.targetingState.validTargetIds.length;
            i++
          )
            s = resume(s);
          return s;
        };
        let s = settle(enter(state, "player-1", cards["고통 수집가"], 0));
        s = settle(
          enter(s, helOwner, cards["헬뻑"], helOwner === "player-1" ? 1 : 0),
        );
        const before = s.players[0].board[0].currentAttack,
          start = s.events.length;
        s = settle(enter(s, "player-1", cards["닌자"], 2));
        return {
          helOwner,
          before,
          after: s.players[0].board[0].currentAttack,
          ninjaEntries: s.events
            .slice(start)
            .filter((e) => e.type === "ENTER_FIELD").length,
          ninjaGraveyard: s.players[0].graveyard.filter(
            (c) => c.definitionId === cards["닌자"].definitionId,
          ).length,
          actualDamage: s.events
            .slice(start)
            .filter((e) => e.type === "DAMAGE_DEALT" && e.amount === 1).length,
        };
      },
      { state, cards, enginePath, helOwner },
    );
    assert.equal(r.ninjaEntries, 2);
    assert.equal(r.ninjaGraveyard, 2);
    assert.equal(r.actualDamage, 2);
    assert.equal(
      r.after,
      r.before + (expectFixed ? 2 : 0),
      expectFixed
        ? "deployed fix counts both hits"
        : "current public deployment reproduces the missing buff",
    );
    results.push(r);
  }
  const code = execFileSync(
    "curl",
    [
      "--fail",
      "--silent",
      "--show-error",
      "--max-time",
      "30",
      origin + enginePath,
    ],
    { maxBuffer: 8 * 1024 * 1024 },
  );
  const report = {
    expectFixed,
    checkedAt: new Date().toISOString(),
    origin,
    enginePath,
    sha256: createHash("sha256").update(code).digest("hex"),
    isolatedBrowserMemory: true,
    allAPIRequestsIntercepted: true,
    productionWrites: 0,
    results,
  };
  await mkdir("qa-results/ninja-pain-collector", { recursive: true });
  await writeFile(
    `qa-results/ninja-pain-collector/${expectFixed ? "deployed-fixed" : "public-build"}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
