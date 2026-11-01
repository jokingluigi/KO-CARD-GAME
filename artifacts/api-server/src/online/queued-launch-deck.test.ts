import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { withFrozenLaunchDeck } from "../lib/frozen-launch-deck";
test(
  "real quick lobby freezes PvP and 30-second AI compositions after editor changes",
  {
    skip:
      typeof mock.module !== "function"
        ? "Requires --experimental-test-module-mocks"
        : false,
  },
  async () => {
    const records = new Map([
      [
        "one",
        {
          deckId: "deck-one",
          deckName: "before",
          championName: "old champion",
          championDefinitionId: "old",
          cardDefinitionIds: ["old-card"],
          isValid: true,
          invalidReasons: [],
        },
      ],
      [
        "two",
        {
          deckId: "deck-two",
          deckName: "second",
          championName: "second",
          championDefinitionId: "second",
          cardDefinitionIds: ["second-card"],
          isValid: true,
          invalidReasons: [],
        },
      ],
    ]);
    const starts: unknown[][] = [],
      aiStarts: unknown[][] = [];
    mock.module("./service.ts", {
      namedExports: {
        validateOnlineDeck: async (
          user: string,
          _id: string,
          _test = false,
          frozen?: any,
        ) => {
          const live = records.get(user)!;
          if (!frozen) return live;
          const owned = {
            id: live.deckId,
            name: live.deckName,
            championDefinitionId: live.championDefinitionId,
            cardDefinitionIds: live.cardDefinitionIds,
          };
          const x = withFrozenLaunchDeck(owned, frozen);
          return {
            ...live,
            deckName: x.name,
            championDefinitionId: x.championDefinitionId,
            cardDefinitionIds: x.cardDefinitionIds,
          };
        },
        startOnlineMatch: async (...args: unknown[]) => {
          starts.push(args);
          return { matchId: "match" };
        },
        userHasActiveMatch: async () => false,
      },
    });
    mock.module("../lib/quick-ai-match.ts", {
      namedExports: {
        activeQuickAI: async () => null,
        prepareQuickAI: async (...args: unknown[]) => {
          aiStarts.push(args);
          return "ai-captured";
        },
        releaseDisconnectedQuickAI: async () => {},
      },
    });
    const { joinQuickQueue } = await import("./lobby");
    const oneMessages: any[] = [],
      twoMessages: any[] = [];
    const connection = (userId: string, messages: any[]) =>
      ({
        userId,
        nickname: userId,
        id: userId,
        send: (x: unknown) => messages.push(x),
      }) as any;
    const one = connection("one", oneMessages),
      two = connection("two", twoMessages);
    await joinQuickQueue(one, "deck-one");
    records.get("one")!.cardDefinitionIds = ["edited-card"];
    records.get("one")!.championDefinitionId = "edited";
    records.get("one")!.deckName = "after";
    await joinQuickQueue(one, "deck-other");
    assert.equal(oneMessages.at(-1).deck.deckName, "before");
    await joinQuickQueue(two, "deck-two");
    assert.equal(starts.length, 1);
    const frozen = starts[0][5] as any[];
    assert.deepEqual(frozen[0].cardDefinitionIds, ["old-card"]);
    assert.equal(frozen[0].championDefinitionId, "old");
    assert.equal(frozen[0].deckName, "before");
    assert.ok(oneMessages.some((m) => m.type === "MATCH_FOUND"));
    assert.ok(twoMessages.some((m) => m.type === "MATCH_FOUND"));
    records.set("three", {
      ...records.get("two")!,
      deckId: "deck-three",
      deckName: "queue AI",
      cardDefinitionIds: ["ai-old"],
    });
    mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1000 });
    try {
      const threeMessages: any[] = [];
      await joinQuickQueue(connection("three", threeMessages), "deck-three");
      records.get("three")!.cardDefinitionIds = ["ai-edited"];
      mock.timers.tick(30001);
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.equal(aiStarts.length, 1);
      assert.deepEqual((aiStarts[0][2] as any).cardDefinitionIds, ["ai-old"]);
      assert.ok(threeMessages.some((m) => m.type === "QUICK_AI_MATCH_FOUND"));
    } finally {
      mock.timers.reset();
    }
  },
);
