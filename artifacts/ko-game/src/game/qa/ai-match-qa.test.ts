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
import type { CardDefinition } from "../cards/types";
import type { GameState } from "../types/game-state";

const apiOrigin = process.env.KO_QA_API_ORIGIN ?? "http://127.0.0.1:8080";
const reportPath = process.env.KO_AI_QA_REPORT ?? "qa-results/ko-ai-match-qa.md";
const MATCH_COUNT = 100;
const MAX_ACTIONS_PER_MATCH = 400;

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

function stableRandom(seed = 0x9e3779b9) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function sameAction(left: GameAction, right: GameAction): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function playableDefinitions(cards: readonly CardDefinition[]): CardDefinition[] {
  return cards.filter((card) => !card.isToken && !card.isChampionToken);
}

function deckTemplates(cards: readonly CardDefinition[]): string[][] {
  const playable = playableDefinitions(cards);
  assert.ok(playable.length >= 10, "published catalog does not contain enough playable cards");

  const byCost = [...playable].sort((left, right) => left.cost - right.cost || left.id.localeCompare(right.id));
  const byAttack = [...playable].sort((left, right) => right.attack - left.attack || left.id.localeCompare(right.id));
  const byHealth = [...playable].sort((left, right) => right.health - left.health || left.id.localeCompare(right.id));
  const techniquesFirst = [
    ...playable.filter((card) => card.cardType === "TECHNIQUE"),
    ...playable.filter((card) => card.cardType === "WRESTLER"),
  ];
  const structuredFirst = [...playable].sort(
    (left, right) => Number(Boolean(right.effectId)) - Number(Boolean(left.effectId)) || left.id.localeCompare(right.id),
  );
  const sources = [playable, byCost, byAttack, byHealth, techniquesFirst, structuredFirst];

  return sources.map((source, templateIndex) =>
    Array.from({ length: 25 }, (_, index) => source[(index + templateIndex * 3) % source.length]!.id),
  );
}

function allCards(state: GameState) {
  return state.players.flatMap((player) => [
    ...player.deck,
    ...player.hand,
    ...player.board.filter((card): card is NonNullable<typeof card> => Boolean(card)),
    ...player.graveyard,
    ...player.removedFromGame,
  ]);
}

function assertStateInvariants(state: GameState, previousEventCount: number): void {
  assert.equal(state.players.length, 2, "match must have exactly two players");
  assert.ok(state.events.length >= previousEventCount, "event log moved backwards");
  if (state.status === "IN_PROGRESS") {
    assert.ok(state.activePlayerId, "in-progress match lost its active player");
    assert.ok(state.players.some((player) => player.id === state.activePlayerId), "active player is unknown");
  }

  const instanceIds = new Set<string>();
  for (const player of state.players) {
    assert.ok(player.currentGold >= 0, `${player.id} has negative gold`);
    assert.ok(player.health <= player.maxHealth, `${player.id} health exceeds max health`);
    if (state.status === "IN_PROGRESS") {
      assert.ok(player.health > 0, `${player.id} has non-positive health in an active match`);
    }
    if (player.champion) {
      assert.ok(player.champion.health <= player.champion.maxHealth, `${player.id} Champion health exceeds max health`);
      if (state.status === "IN_PROGRESS") {
        assert.ok(player.champion.health > 0, `${player.id} has non-positive Champion health in an active match`);
      }
    }
    assert.equal(player.board.length, 4, `${player.id} board does not have four slots`);
    player.board.forEach((card, slot) => {
      if (!card) return;
      assert.equal(card.boardSlot, slot, `${card.instanceId} boardSlot disagrees with board position`);
    });
  }

  for (const card of allCards(state)) {
    assert.equal(instanceIds.has(card.instanceId), false, `duplicate card instance: ${card.instanceId}`);
    instanceIds.add(card.instanceId);
  }
  for (const player of state.players) {
    for (const card of player.board.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))) {
      assert.equal(card.cardType, "WRESTLER", `${card.instanceId} put a non-WRESTLER card on the board`);
      assert.ok(card.currentHealth >= 0, `${card.instanceId} has negative active health`);
      assert.ok(card.maxHealth >= 1, `${card.instanceId} has invalid active max health`);
      assert.ok(card.currentHealth <= card.maxHealth, `${card.instanceId} exceeds active max health`);
    }
  }
}

type MatchSummary = {
  match: number;
  seed: number;
  deckA: number;
  deckB: number;
  championA: string;
  championB: string;
  firstPlayer: string;
  actions: number;
  events: number;
  status: GameState["status"];
  winnerId: string | null;
  actionTypes: string[];
  result: "SUCCESS" | "FAILURE" | "TIMEOUT" | "INTERRUPTED";
  error?: string;
};

function runMatch(
  match: number,
  seed: number,
  deckA: string[],
  deckB: string[],
  championA: string,
  championB: string,
  cards: CardDefinition[],
  champions: Awaited<ReturnType<typeof loadCatalog>>["champions"],
  firstPlayer: "player-1" | "player-2",
): MatchSummary {
  let state: GameState | undefined;
  let actions = 0;
  const actionTypes = new Set<string>();

  try {
    const initial = createInitialGameState(
      [championA, championB],
      cards,
      champions,
      [deckA, deckB],
      { gameId: `qa-ai-match-${match}`, randomSeed: seed },
    );
    const seated = firstPlayer === "player-1"
      ? initial
      : { ...initial, players: [initial.players[1]!, initial.players[0]!] };
    state = startGame(seated, stableRandom(seed));
    assertStateInvariants(state, 0);

    while (actions < MAX_ACTIONS_PER_MATCH && state.status !== "FINISHED") {
      const playerId = state.activePlayerId;
      assert.ok(playerId, `match ${match} lost active player at action ${actions}`);
      const legal = getLegalActions(state, playerId);
      assert.ok(legal.length > 0, `match ${match} deadlocked at action ${actions}`);
      const ranked = rankActions(state, legal, playerId);
      assert.ok(ranked.every((entry) => Number.isFinite(entry.score) || entry.score === -Infinity));
      const chosen = chooseBestAction(state, legal, playerId);
      assert.ok(legal.some((action) => sameAction(action, chosen)), "AI selected an action outside legal actions");

      const before = JSON.stringify(state);
      if (!state.targetingState?.active) {
        const otherPlayerId = state.players.find((player) => player.id !== playerId)!.id;
        const invalid = executeAction(state, { type: "END_TURN", playerId: otherPlayerId });
        assert.equal(invalid.success, false, `wrong-player action was accepted at ${match}:${actions}`);
        assert.strictEqual(invalid.state, state, "rejected action returned a different state object");
        assert.equal(JSON.stringify(state), before, "rejected action mutated GameState");
      }

      const result = executeAction(state, chosen);
      assert.equal(JSON.stringify(state), before, `action ${chosen.type} mutated its input state`);
      if (!result.success) {
        return {
          match,
          seed,
          deckA: 0,
          deckB: 0,
          championA,
          championB,
          firstPlayer,
          actions,
          events: state.events.length,
          status: state.status,
          winnerId: state.winnerId,
          actionTypes: [...actionTypes],
          result: "FAILURE",
          error: `${chosen.type}: ${result.errorCode}`,
        };
      }

      actionTypes.add(chosen.type);
      if (["END_TURN", "PLAY_WRESTLER", "PLAY_TECHNIQUE", "USE_CHAMPION_ABILITY"].includes(chosen.type)) {
        const duplicate = executeAction(result.state, chosen);
        assert.equal(duplicate.success, false, `duplicate ${chosen.type} was accepted at ${match}:${actions}`);
        assert.strictEqual(duplicate.state, result.state, "duplicate action returned a different state object");
      }

      const previousEventCount = state.events.length;
      state = result.state;
      actions += 1;
      assertStateInvariants(state, previousEventCount);
    }

    assert.ok(state, `match ${match} did not create a state`);
    return {
      match,
      seed,
      deckA: 0,
      deckB: 0,
      championA,
      championB,
      firstPlayer,
      actions,
      events: state.events.length,
      status: state.status,
      winnerId: state.winnerId,
      actionTypes: [...actionTypes],
      result: state.status === "FINISHED" ? "SUCCESS" : "TIMEOUT",
      ...(state.status !== "FINISHED" ? { error: `exceeded ${MAX_ACTIONS_PER_MATCH} actions` } : {}),
    };
  } catch (error) {
    return {
      match,
      seed,
      deckA: 0,
      deckB: 0,
      championA,
      championB,
      firstPlayer,
      actions,
      events: state?.events.length ?? 0,
      status: state?.status ?? "NOT_STARTED",
      winnerId: state?.winnerId ?? null,
      actionTypes: [...actionTypes],
      result: "INTERRUPTED",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

test("AI completes 100 varied deterministic full matches through legal engine actions", async () => {
  const { cards, champions } = await loadCatalog();
  const templates = deckTemplates(cards);
  const championPairs = champions.length >= 2
    ? champions.flatMap((left, leftIndex) =>
        champions
          .filter((_, rightIndex) => rightIndex !== leftIndex)
          .map((right) => [left.id, right.id] as [string, string]),
      )
    : [["test-champion-quest", "test-champion-no-quest"] as [string, string]];
  const summaries: MatchSummary[] = [];

  for (let index = 0; index < MATCH_COUNT; index += 1) {
    const pair = championPairs[index % championPairs.length]!;
    const firstTemplate = templates[index % templates.length]!;
    const secondTemplate = templates[(index * 3 + 1) % templates.length]!;
    const firstPlayer = index % 2 === 0 ? "player-1" : "player-2";
    const summary = runMatch(
      index + 1,
      20260920 + index * 7919,
      firstTemplate,
      secondTemplate,
      pair[0],
      pair[1],
      cards,
      champions,
      firstPlayer,
    );
    summaries.push({
      ...summary,
      deckA: index % templates.length,
      deckB: (index * 3 + 1) % templates.length,
    });
  }

  const counts = summaries.reduce(
    (accumulator, summary) => {
      accumulator[summary.result] += 1;
      return accumulator;
    },
    { SUCCESS: 0, FAILURE: 0, TIMEOUT: 0, INTERRUPTED: 0 } as Record<MatchSummary["result"], number>,
  );
  const actionTypes = new Set(summaries.flatMap((summary) => summary.actionTypes));
  const report = [
    "# KO AI Match QA",
    "",
    `- API source: ${apiOrigin}`,
    `- Published cards: ${cards.length}`,
    `- Published Champions: ${champions.length}`,
    `- matches requested: ${MATCH_COUNT}`,
    `- matches executed: ${summaries.length}`,
    `- success / failure / timeout / interrupted: ${counts.SUCCESS} / ${counts.FAILURE} / ${counts.TIMEOUT} / ${counts.INTERRUPTED}`,
    `- action cap per match: ${MAX_ACTIONS_PER_MATCH}`,
    `- total action steps: ${summaries.reduce((sum, summary) => sum + summary.actions, 0)}`,
    `- total events: ${summaries.reduce((sum, summary) => sum + summary.events, 0)}`,
    `- seed range: ${summaries[0]?.seed ?? "none"}..${summaries.at(-1)?.seed ?? "none"}`,
    `- deck templates exercised: ${templates.length}`,
    `- first-player seats: player-1=${summaries.filter((summary) => summary.firstPlayer === "player-1").length}, player-2=${summaries.filter((summary) => summary.firstPlayer === "player-2").length}`,
    `- Champion pairings exercised: ${championPairs.length}`,
    `- terminal statuses: ${[...new Set(summaries.map((summary) => summary.status))].join(", ") || "none"}`,
    `- action types exercised: ${[...actionTypes].sort().join(", ") || "none"}`,
    "",
    "## Scenario coverage",
    "",
    "- Decks are built from the current published catalog without tokens or Champion Tokens.",
    "- Templates vary by catalog order, cost, attack, health, Technique-first ordering, and structured-effect presence.",
    "- Published Champion pairings are rotated; player-1 and player-2 each receive the opening seat.",
    "- Every chosen action is checked against `getLegalActions` and executed through `executeAction`.",
    "- After every successful action, the input state immutability, board shape, card-instance uniqueness, health bounds, gold bounds, and event monotonicity are checked.",
    "- Wrong-player actions and duplicate non-target-selection actions must be rejected without changing state.",
    "",
    "## Failures and reproductions",
    "",
    ...summaries
      .filter((summary) => summary.result !== "SUCCESS")
      .map((summary) => `- match ${summary.match}: seed=${summary.seed}, decks=${summary.deckA}/${summary.deckB}, Champions=${summary.championA}/${summary.championB}, first=${summary.firstPlayer}, result=${summary.result}, actions=${summary.actions}, error=${summary.error ?? "none"}`),
    ...(summaries.some((summary) => summary.result !== "SUCCESS") ? [] : ["- none"]),
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

  assert.equal(summaries.length, MATCH_COUNT);
  assert.deepEqual(counts, { SUCCESS: MATCH_COUNT, FAILURE: 0, TIMEOUT: 0, INTERRUPTED: 0 });
  assert.ok(summaries.some((summary) => summary.status === "FINISHED"));
});

test("AI choice is stable when opponent hand contents change but hidden-zone size stays constant", async () => {
  const { cards, champions } = await loadCatalog();
  const deckIds = cards
    .filter((card) => card.cardType === "WRESTLER" && !card.isToken && !card.isChampionToken)
    .map((card) => card.id);
  const deck = Array.from({ length: 25 }, (_, index) => deckIds[index % deckIds.length]!);
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