// Static, dated content is for layout/interaction QA, not an assertion of current balance.
import records from "../src/game/qa/fixtures/cards-2026-10-12-all.json";
import champions from "../src/game/qa/fixtures/champions-2026-10-12-all.json";
import { cardRecordToDefinition } from "../src/game/cards/published-cards";
import { championRecordToDefinition } from "../src/game/champions/published-champions";
import { createInitialGameState, generateCardInstance } from "../src/game";
export const definitions = records.map((r) =>
  cardRecordToDefinition(r as Parameters<typeof cardRecordToDefinition>[0]),
);
export function boardFixture() {
  const cs = champions
    .filter(
      (c) => c.name === "챔피언 퍼플레인" || c.name === "챔피언 피 스타 세븐",
    )
    .map((c) =>
      championRecordToDefinition(
        c as Parameters<typeof championRecordToDefinition>[0],
      ),
    );
  const players = definitions.filter(
    (c) =>
      c.cardType === "WRESTLER" &&
      !c.isToken &&
      !c.isChampionToken &&
      c.status === "PUBLISHED",
  );
  const simple = players.filter((c) => !c.rulesText.trim());
  const byName = (name: string) => definitions.find((c) => c.name === name)!;
  const field = [simple[0] ?? players[0], simple[1] ?? players[1]];
  const hand = [
    byName("MPG"),
    byName("봉인"),
    byName("만당"),
    ...players.filter((c) => c.cost <= 3),
  ]
    .filter(Boolean)
    .slice(0, 7);
  const decks = [0, 1].map(() =>
    Array.from({ length: 25 }, (_, i) => players[i % players.length].id),
  ) as [string[], string[]];
  const s = createInitialGameState(
    [cs[0].id, cs[1].id],
    definitions,
    cs,
    decks,
    { gameId: "black-gold-local-preview", randomSeed: 731 },
  );
  s.status = "IN_PROGRESS";
  s.turn = 11;
  s.activePlayerId = s.players[0].id;
  s.players.forEach((p, n) => {
    p.currentGold = 6;
    p.personalTurn = 6;
    p.hand = n
      ? hand
          .slice(0, 5)
          .map((c, i) =>
            generateCardInstance(c, { instanceId: `opponent-hand-${i}` }),
          )
      : hand.map((c, i) =>
          generateCardInstance(c, { instanceId: `hand-${i}` }),
        );
    p.board = [null, null, null, null];
    field.forEach((c, i) => {
      p.board[i as 0 | 1] = {
        ...generateCardInstance(c, { instanceId: `${p.id}-field-${i}` }),
        boardSlot: i as 0 | 1,
        enteredThisTurn: false,
        attacksUsedThisTurn: 0,
      };
    });
    p.graveyard = [
      generateCardInstance(players[2], { instanceId: `${p.id}-grave` }),
    ];
  });
  return s;
}
