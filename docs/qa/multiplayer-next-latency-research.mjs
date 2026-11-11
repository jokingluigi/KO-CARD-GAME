/** Research only. Synthetic states + checked-in public catalog; no DB/network writes. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { createInitialGameState } from "../../artifacts/ko-game/src/game/engine/create-initial-game-state.ts";
import { generateCardInstance } from "../../artifacts/ko-game/src/game/cards/generation.ts";
import { cardRecordToDefinition } from "../../artifacts/ko-game/src/game/cards/published-cards.ts";
import {
  getLegalActions,
  executeAction,
} from "../../artifacts/ko-game/src/game/actions/engine-actions.ts";
import { sanitizeGameStateForViewer } from "../../artifacts/api-server/src/online/sanitizer.ts";
assert.equal(typeof global.gc, "function", "Run with --expose-gc");
const catalog = JSON.parse(
  readFileSync("docs/qa/snapshots/20261111-admin/cards.json", "utf8"),
).map(cardRecordToDefinition);
const unit = {
  id: "research-unit",
  name: "격리 선수",
  cardType: "WRESTLER",
  rarity: "NORMAL",
  cost: 1,
  attack: 2,
  health: 5,
  abilities: [],
  keywords: [],
  rulesText: "격리용",
};
const median = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
function timed(fn, runs = 15) {
  const samples = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  return Math.round(median(samples) * 1000) / 1000;
}
const withoutCatalog = (state) => {
  const { cardPool, minionACardPool, ...rest } = state;
  return rest;
};
const sharedCatalogClone = (state) => ({
  ...structuredClone(withoutCatalog(state)),
  cardPool: state.cardPool,
  ...(state.minionACardPool ? { minionACardPool: state.minionACardPool } : {}),
});
function retained(clone, state) {
  global.gc();
  const before = process.memoryUsage().heapUsed;
  let copies = Array.from({ length: 64 }, () => clone(state));
  global.gc();
  const bytes = process.memoryUsage().heapUsed - before;
  assert.equal(copies.length, 64);
  copies = null;
  global.gc();
  return Math.round((bytes / 1048576) * 100) / 100;
}
const results = [];
for (const history of [20, 500, 2000]) {
  const state = createInitialGameState();
  Object.assign(state, {
    status: "IN_PROGRESS",
    turn: 3,
    activePlayerId: "player-1",
    openingMulligan: false,
    cardPool: [...catalog, unit],
    events: Array.from({ length: history }, (_, i) => ({
      type: "TURN_ENDED",
      playerId: i % 2 ? "player-1" : "player-2",
      reason: "RESEARCH_HISTORY",
    })),
  });
  state.players = state.players.map((p, index) => ({
    ...p,
    champion: { ...p.champion, quest: null, questCompleted: false },
    currentGold: 6,
    deck: Array.from({ length: 20 }, (_, i) =>
      generateCardInstance(unit, { instanceId: `deck-${index}-${i}` }),
    ),
    hand: Array.from({ length: 6 }, (_, i) =>
      generateCardInstance(unit, { instanceId: `hand-${index}-${i}` }),
    ),
    board: [
      ...Array.from({ length: 2 }, (_, i) => ({
        ...generateCardInstance(unit, { instanceId: `board-${index}-${i}` }),
        boardSlot: i,
        enteredThisTurn: false,
      })),
      null,
      null,
    ],
  }));
  const before = JSON.stringify(state);
  let legalCount = 0;
  const probeSamples = [];
  for (let i = 0; i < 15; i++) {
    const candidate = structuredClone(state),
      start = performance.now();
    legalCount = getLegalActions(candidate, "player-1").length;
    probeSamples.push(performance.now() - start);
  }
  assert.equal(JSON.stringify(state), before);
  const view = sanitizeGameStateForViewer(state, "player-1");
  const body = JSON.stringify(view),
    reduced = JSON.stringify(withoutCatalog(view));
  const withoutHistory = { ...withoutCatalog(view), events: [] };
  // A shared catalog is only a candidate design: runtime catalog additions exist.
  // No production code is changed and immutability is not proven by this benchmark.
  results.push({
    history,
    cardDefinitions: state.cardPool.length,
    legalCount,
    cloneMedianMs: timed(() => structuredClone(state)),
    sharedCatalogCloneMedianMs: timed(() => sharedCatalogClone(state)),
    allLegalActionsMedianMs: Math.round(median(probeSamples) * 1000) / 1000,
    actualEndTurnMedianMs: timed(() =>
      executeAction(state, { type: "END_TURN", playerId: "player-1" }),
    ),
    jsonBytes: Buffer.byteLength(body),
    catalogJsonBytes: Buffer.byteLength(JSON.stringify(view.cardPool)),
    historyJsonBytes: Buffer.byteLength(JSON.stringify(view.events)),
    compressedBytes: deflateRawSync(body, { level: 1 }).length,
    compressedWithoutCatalogBytes: deflateRawSync(reduced, { level: 1 }).length,
    dynamicStateWithoutHistoryBytes: Buffer.byteLength(
      JSON.stringify(withoutHistory),
    ),
    parseMedianMs: timed(() => JSON.parse(body)),
    parseWithoutCatalogMedianMs: timed(() => JSON.parse(reduced)),
    retained64FullClonesMB: retained(structuredClone, state),
    retained64SharedCatalogClonesMB: retained(sharedCatalogClone, state),
  });
}
const report = {
  at: new Date().toISOString(),
  researchOnly: true,
  productionWrites: 0,
  environment:
    "Node on execution workspace, controlled synthetic state; not Render CPU, browser FPS or live PvP latency",
  results,
};
if (process.env.KO_RESEARCH_OUTPUT)
  writeFileSync(
    process.env.KO_RESEARCH_OUTPUT,
    JSON.stringify(report, null, 2) + "\n",
  );
console.log(JSON.stringify(report, null, 2));
