import { test } from "node:test";
import assert from "node:assert/strict";
import { DraftBattleClient } from "./draft-client";
import type { OnlineServerMessage } from "./online-lobby-client";
test("draft transport preserves animations, recovers connection and retains finished snapshot", async () => {
  const originalFetch = globalThis.fetch,
    originalInterval = globalThis.setInterval,
    originalClear = globalThis.clearInterval;
  let interval: (() => void) | undefined,
    version = 1,
    failed = false,
    finished = false;
  const message = () => ({
    type: "MATCH_SNAPSHOT",
    matchId: "room",
    seat: "PLAYER_ONE",
    version,
    state: { status: finished ? "FINISHED" : "IN_PROGRESS" },
    events: [],
    serverTime: 1,
    turnStartedAt: 1,
    turnDeadlineAt: 90000,
    gameplayStartsAt: 0,
    publicPlayers: [],
    introFirstSpeaker: null,
    connectionStates: { PLAYER_ONE: "CONNECTED", PLAYER_TWO: "CONNECTED" },
  });
  globalThis.setInterval = ((fn: () => void) => {
    interval = fn;
    return 1;
  }) as unknown as typeof setInterval;
  globalThis.clearInterval = (() => {
    interval = undefined;
  }) as typeof clearInterval;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    if (failed) throw new Error("offline");
    if (init?.method === "POST") {
      version++;
      finished = true;
      return new Response(
        JSON.stringify({
          ...message(),
          type: "ACTION_ACCEPTED",
          requestId: "action",
        }),
      );
    }
    return new Response(JSON.stringify(message()));
  }) as typeof fetch;
  const messages: OnlineServerMessage[] = [],
    connections: string[] = [],
    client = new DraftBattleClient();
  client.onMessage((m) => messages.push(m));
  client.onConnectionState((s) => connections.push(s));
  const drain = () => new Promise<void>((resolve) => setImmediate(resolve));
  try {
    client.connect();
    client.send({ type: "SUBSCRIBE", matchId: "room" });
    await drain();
    assert.equal(messages.filter((m) => m.type === "MATCH_SNAPSHOT").length, 1);
    interval!();
    await drain();
    assert.equal(
      messages.filter((m) => "state" in m).length,
      1,
      "same version must not reset UI presentation",
    );
    version++;
    interval!();
    await drain();
    assert.equal(messages.at(-1)?.type, "ACTION_ACCEPTED");
    assert.equal(messages.filter((m) => m.type === "MATCH_SNAPSHOT").length, 1);
    failed = true;
    interval!();
    await drain();
    assert.equal(client.state, "error");
    failed = false;
    interval!();
    await drain();
    assert.equal(client.state, "open");
    assert.equal(messages.at(-1)?.type, "MATCH_SNAPSHOT");
    assert.equal(
      client.send({
        type: "MATCH_ACTION",
        matchId: "room",
        requestId: "action",
        expectedVersion: version,
        action: { type: "SURRENDER" },
      }),
      true,
    );
    await drain();
    assert.equal(messages.at(-1)?.type, "MATCH_ENDED");
    client.send({ type: "UNSUBSCRIBE", matchId: "room" });
    assert.equal(
      client.state,
      "open",
      "completed result remains authoritative",
    );
    assert.equal(interval, undefined);
    assert.ok(!connections.includes("closed"));
  } finally {
    client.close();
    globalThis.fetch = originalFetch;
    globalThis.setInterval = originalInterval;
    globalThis.clearInterval = originalClear;
  }
});
