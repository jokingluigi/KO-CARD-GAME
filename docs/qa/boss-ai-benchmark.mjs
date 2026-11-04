/** Paired deterministic games, identical cards/seed/sides; compares decision policies only. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { createDeterministicRandom } from "../../artifacts/ko-game/src/game/random/random.ts";
import { chooseBestAction as current } from "../../artifacts/ko-game/src/game/actions/ai-evaluator.ts";
import { createInitialGameState } from "../../artifacts/ko-game/src/game/engine/create-initial-game-state.ts";
import { startGame } from "../../artifacts/ko-game/src/game/engine/turn-system.ts";
import {
  getLegalActions,
  executeAction,
} from "../../artifacts/ko-game/src/game/actions/engine-actions.ts";
import { cardRecordToDefinition } from "../../artifacts/ko-game/src/game/cards/published-cards.ts";
import { championRecordToDefinition } from "../../artifacts/ko-game/src/game/champions/published-champions.ts";
const out = process.env.KO_AI_BENCH_OUT ?? "qa-results/boss-ai";
await mkdir(out, { recursive: true });
const filename = "artifacts/ko-game/src/game/actions/ai-evaluator.ts";
const baseline = execFileSync("git", ["show", "b8c3715:" + filename], {
  encoding: "utf8",
}).replace(/from '([^']+)'/g, (all, path) =>
  path.startsWith(".")
    ? "from '" + resolve(dirname(filename), path) + ".ts" + "'"
    : all,
);
const temp = "/tmp/ko-ai-before-" + process.pid + ".ts";
await writeFile(temp, baseline);
try {
  const { chooseBestAction: old } = await import(pathToFileURL(temp).href);
  const raw = JSON.parse(
    await readFile(
      process.env.KO_AI_BENCH_CARDS ??
        "artifacts/ko-game/src/game/qa/fixtures/cards-2026-10-12-all.json",
      "utf8",
    ),
  );
  const records = Array.isArray(raw) ? raw : raw.cards;
  const definitions = records.map(cardRecordToDefinition);
  const champions = JSON.parse(
    await readFile(
      "artifacts/ko-game/src/game/qa/fixtures/champions-2026-10-12-all.json",
      "utf8",
    ),
  ).map(championRecordToDefinition);
  // Fixed published, non-token cards with rarity copy limits; both sides receive the same legal 25-card deck.
  const candidates = definitions.filter(
    (c) =>
      c.status === "PUBLISHED" &&
      !c.isToken &&
      !c.isChampionToken &&
      c.cost >= 1 &&
      c.cost <= 5,
  );
  const units = candidates
    .filter((c) => c.cardType === "WRESTLER")
    .sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id));
  const spells = candidates
    .filter((c) => c.cardType === "TECHNIQUE")
    .sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id));
  const pool = [...units.slice(0, 8), ...spells.slice(0, 4)];
  if (pool.length < 9) throw Error("Insufficient benchmark catalog");
  const deck = [];
  for (let copy = 0; copy < 3; copy++)
    for (const c of pool) {
      const cap = c.rarity === "NORMAL" ? 3 : c.rarity === "EPIC" ? 2 : 1;
      if (copy < cap && deck.length < 25) deck.push(c.id);
    }
  if (deck.length !== 25) throw Error("Cannot make a legal paired deck");
  const results = [],
    latencies = [],
    samples = [];
  for (const opponent of process.env.KO_AI_BENCH_OPPONENT
    ? [process.env.KO_AI_BENCH_OPPONENT]
    : ["legacy", "previous-boss"])
    for (
      let seed = 1;
      seed <= Number(process.env.KO_AI_BENCH_SEEDS ?? 3);
      seed++
    )
      for (const side of [0, 1]) {
        if (
          process.env.KO_AI_BENCH_SEED &&
          seed !== Number(process.env.KO_AI_BENCH_SEED)
        )
          continue;
        if (
          process.env.KO_AI_BENCH_SIDE &&
          side !== Number(process.env.KO_AI_BENCH_SIDE)
        )
          continue;
        let s = startGame(
          createInitialGameState(
            [champions[0].id, champions[0].id],
            definitions,
            champions,
            [deck, deck],
            {
              gameId: `boss-bench-${opponent}-${seed}-${side}`,
              randomSeed: seed * 991,
            },
          ),
          createDeterministicRandom(seed * 991),
        );
        const initialDigest = createHash("sha256")
          .update(
            JSON.stringify({
              players: s.players,
              randomSeed: s.randomSeed,
              turn: s.turn,
            }),
          )
          .digest("hex");
        const newId = s.players[side].id;
        let actions = 0;
        const recent = [];
        for (
          ;
          actions < Number(process.env.KO_AI_BENCH_ACTION_CAP ?? 640) &&
          s.status === "IN_PROGRESS";
          actions++
        ) {
          const playerId = s.targetingState?.active
            ? s.targetingState.playerId
            : s.activePlayerId;
          const legal = getLegalActions(s, playerId);
          if (!legal.length)
            throw Error(
              "No legal action at " +
                JSON.stringify({
                  opponent,
                  seed,
                  side,
                  actions,
                  playerId,
                  frame: s.targetingState,
                }),
            );
          const metric = {
            simulations: 0,
            replySimulations: 0,
            reachedDepth: 0,
          };
          const start = performance.now();
          const action =
            playerId === newId
              ? current(s, legal, playerId, undefined, metric)
              : old(
                  s,
                  legal,
                  playerId,
                  opponent === "previous-boss" ? "BOSS" : undefined,
                );
          const ms = performance.now() - start;
          if (playerId === newId) {
            latencies.push(ms);
            if (samples.length < 12)
              samples.push({
                state: s,
                actions: legal,
                playerId,
                expected: action,
              });
          }
          recent.push(action);
          if (recent.length > 20) recent.shift();
          const r = executeAction(s, action);
          if (!r.success) throw Error(r.message);
          s = r.state;
        }
        const row = {
          opponent,
          initialDigest,
          seed,
          side,
          actions,
          status: s.status,
          winner: s.winnerId === newId ? "new" : s.winnerId ? "previous" : null,
          ...(s.status !== "FINISHED"
            ? {
                probe: {
                  turn: s.turn,
                  players: s.players.map((p) => ({
                    id: p.id,
                    health: p.health,
                    gold: p.currentGold,
                    hand: p.hand.length,
                    deck: p.deck.length,
                    board: p.board.map((c) =>
                      c
                        ? {
                            id: c.definitionId,
                            attack: c.currentAttack,
                            health: c.currentHealth,
                          }
                        : null,
                    ),
                  })),
                  recent,
                },
              }
            : {}),
        };
        results.push(row);
        console.log(JSON.stringify(row));
      }
  for (const seed of new Set(results.map((r) => r.seed)))
    assert.equal(
      new Set(
        results.filter((r) => r.seed === seed).map((r) => r.initialDigest),
      ).size,
      1,
      "Both policies and seats must start from identical shuffled states",
    );
  latencies.sort((a, b) => a - b);
  const report = {
    baselineRevision: "b8c3715",
    openingShuffleExplicitlySeeded: true,
    deck,
    cardNames: pool.map((d) => d.name),
    games: results.length,
    wins: results.filter((r) => r.winner === "new").length,
    losses: results.filter((r) => r.winner === "previous").length,
    capped: results.filter((r) => r.status !== "FINISHED").length,
    decisionMs: {
      count: latencies.length,
      p50: latencies[Math.floor(latencies.length * 0.5)],
      p95: latencies[Math.floor(latencies.length * 0.95)],
      max: latencies.at(-1),
    },
    results,
  };
  await writeFile(out + "/benchmark.json", JSON.stringify(report, null, 2));
  await writeFile(out + "/worker-samples.json", JSON.stringify(samples));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await rm(temp, { force: true });
}
