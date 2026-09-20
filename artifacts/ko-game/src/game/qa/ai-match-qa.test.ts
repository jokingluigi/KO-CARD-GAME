import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { chooseBestAction, evaluateAction, rankActions } from "../actions/ai-evaluator";
import { executeAction, getLegalActions } from "../actions/engine-actions";
import { cardRecordToDefinition, type PublishedCardRecord } from "../cards/published-cards";
import { createInitialGameState } from "../engine/create-initial-game-state";
import { startGame } from "../engine/turn-system";
import {
  championRecordToDefinition,
  type PublishedChampionRecord,
} from "../champions/published-champions";
import type { GameAction } from "../actions/types";

const apiOrigin = process.env.KO_QA_API_ORIGIN ?? "http://127.0.0.1:8080";
const reportPath = process.env.KO_AI_QA_REPORT ?? "qa-results/ko-ai-match-qa.md";

async function loadCatalog() {
  const [cardsResponse, championsResponse] = await Promise.all([
    fetch(`${apiOrigin}/api/cards`),
    fetch(`${apiOrigin}/api/champions`),
  ]);
  if (!cardsResponse.ok || !championsResponse.ok) {
    throw new Error(`QA catalog load failed: cards=${cardsResponse.status}, champions=${championsResponse.status}`);
  }
  const cards = ((await cardsResponse.json()) as { cards?: PublishedCardRecord[] }).cards ?? [];
  const champions =
    ((await championsResponse.json()) as { champions?: PublishedChampionRecord[] }).champions ?? [];
  return {
    cards: cards.filter((card) => card.status === "PUBLISHED").map(cardRecordToDefinition),
    champions: champions.filter((champion) => champion.status === "PUBLISHED").map(championRecordToDefinition),
  };
}

function stableRandom() {
  let state = 0x9e3779b9;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function sameAction(left: GameAction, right: GameAction): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

test("AI completes a deterministic full match through legal engine actions", async () => {
  const { cards, champions } = await loadCatalog();
  const deckIds = cards
    .filter((card) => card.cardType === "WRESTLER" && !card.isToken && !card.isChampionToken)
    .map((card) => card.id);
  assert.ok(deckIds.length >= 10, "published catalog does not contain enough playable Wrestlers");
  const deck = Array.from({ length: 20 }, (_, index) => deckIds[index % deckIds.length]!);
  const championIds: [string, string] = [
    champions[0]?.id ?? "test-champion-quest",
    champions[1]?.id ?? "test-champion-no-quest",
  ];
  let state = startGame(
    createInitialGameState(championIds, cards, champions, [deck, deck]),
    stableRandom(),
  );
  const actions: Array<{ step: number; playerId: string; action: GameAction }> = [];
  const failures: string[] = [];

  for (let step = 0; step < 400 && state.status !== "FINISHED"; step += 1) {
    const playerId = state.activePlayerId;
    assert.ok(playerId, "match lost active player");
    const legal = getLegalActions(state, playerId);
    assert.ok(legal.length > 0, `no legal actions at step ${step}`);
    const ranked = rankActions(state, legal, playerId);
    assert.ok(ranked.every((entry) => Number.isFinite(entry.score) || entry.score === -Infinity));
    const chosen = chooseBestAction(state, legal, playerId);
    assert.ok(legal.some((action) => sameAction(action, chosen)), "AI selected an action outside legal actions");
    const result = executeAction(state, chosen);
    if (!result.success) {
      failures.push(`${step}: ${chosen.type} rejected with ${result.errorCode}`);
      break;
    }
    actions.push({ step, playerId, action: chosen });
    state = result.state;
  }

  const finished = state.status === "FINISHED";
  const actionTypes = [...new Set(actions.map((entry) => entry.action.type))];
  const report = [
    "# KO AI Match QA",
    "",
    `- API source: ${apiOrigin}`,
    `- Published cards: ${cards.length}`,
    `- Published Champions: ${champions.length}`,
    `- deterministic action steps: ${actions.length}`,
    `- final status: ${state.status}`,
    `- winner: ${state.winnerId ?? "none"}`,
    `- action types: ${actionTypes.join(", ") || "none"}`,
    `- event count: ${state.events.length}`,
    `- failures: ${failures.join(" / ") || "none"}`,
    "",
    "## Hidden-information probe",
    "",
    "- AI actions are selected from `getLegalActions` and evaluated through `executeAction`.",
    "- The evaluator receives the complete state object by design; this runner verifies action legality, but does not claim a complete information-flow proof.",
    "",
  ];
  const output = join(process.cwd(), reportPath);
  mkdirSync(join(output, ".."), { recursive: true });
  writeFileSync(output, `${report.join("\n")}\n`);
  console.log(`AI QA report written: ${output}`);

  assert.deepEqual(failures, []);
  assert.ok(finished, `AI match did not finish within 400 actions; final status=${state.status}`);
  assert.ok(actionTypes.includes("END_TURN"), "AI never ended a turn");
  assert.ok(actionTypes.some((type) => type === "PLAY_WRESTLER" || type === "PLAY_TECHNIQUE" || type === "ATTACK"), "AI never took a board action");
});

test("AI choice is stable when opponent hand contents change but hidden-zone size stays constant", async () => {
  const { cards, champions } = await loadCatalog();
  const deckIds = cards
    .filter((card) => card.cardType === "WRESTLER" && !card.isToken && !card.isChampionToken)
    .map((card) => card.id);
  const deck = Array.from({ length: 20 }, (_, index) => deckIds[index % deckIds.length]!);
  const base = startGame(
    createInitialGameState(
      [champions[0]?.id ?? "test-champion-quest", champions[1]?.id ?? "test-champion-no-quest"],
      cards,
      champions,
      [deck, deck],
    ),
    stableRandom(),
  );
  const playerId = base.activePlayerId!;
  const legal = getLegalActions(base, playerId);
  const alternate = {
    ...base,
    players: base.players.map((player) =>
      player.id === playerId
        ? player
        : {
            ...player,
            hand: player.hand.map((card, index) => ({
              ...card,
              currentAttack: card.currentAttack + index + 1,
              currentHealth: card.currentHealth + index + 1,
            })),
          },
    ),
  };
  const alternateLegal = getLegalActions(alternate, playerId);
  assert.deepEqual(legal, alternateLegal);
  assert.deepEqual(chooseBestAction(base, legal, playerId), chooseBestAction(alternate, alternateLegal, playerId));
  assert.ok(Number.isFinite(evaluateAction(base, legal[0]!, playerId)) || evaluateAction(base, legal[0]!, playerId) === -Infinity);
});