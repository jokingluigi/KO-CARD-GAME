/** Public rule snapshot only; no accounts, production mutations or random draws. */
import cards from "../../../docs/qa/20261128-quality-a/public-cards.json" with { type: "json" };
import champions from "../../../docs/qa/20261128-quality-a/public-champions.json" with { type: "json" };
import {
  cardRecordToDefinition,
  type PublishedCardRecord,
} from "../src/game/cards/published-cards";
import {
  championRecordToDefinition,
  type PublishedChampionRecord,
} from "../src/game/champions/published-champions";
import { createInitialGameState } from "../src/game/engine/create-initial-game-state";
import { generateCardInstance } from "../src/game/cards/generation";
import type { GameState } from "../src/game/types/game-state";
export const definitions = cards.map((c) =>
  cardRecordToDefinition(c as PublishedCardRecord),
);
export function fixture(gold = 2): GameState {
  const champion = championRecordToDefinition(
    champions[0] as PublishedChampionRecord,
  );
  const state = createInitialGameState(
    [champion.id, champion.id],
    definitions,
    [champion],
  );
  Object.assign(state, {
    gameId: "quality-a-fixture",
    status: "IN_PROGRESS",
    turn: 15,
    activePlayerId: "player-1",
    openingMulligan: false,
    events: [],
    randomSeed: 7,
  });
  for (const p of state.players)
    Object.assign(p, {
      board: [null, null, null, null],
      hand: [],
      deck: [],
      graveyard: [],
      removedFromGame: [],
      currentGold: gold,
      health: 12,
    });
  return state;
}
export function unit(name: string, id = name) {
  const definition = definitions.find((c) => c.name === name);
  if (!definition) throw Error("Missing fixture: " + name);
  return generateCardInstance(definition, { instanceId: id });
}
