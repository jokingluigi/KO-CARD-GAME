import { test } from "node:test";
import assert from "node:assert/strict";
import { DraftBattleClient, draftCommand, type DraftView } from "./draft-client";
import type { OnlineServerMessage } from "./online-lobby-client";
test("selection retries an opponent-only version change with the same request identifier", async () => {
  const original = globalThis.fetch;
  const view = { id: "room", phase: "DRAFT", seat: 0, version: 1, own: { deck: [], offers: ["a", "b"], deadline: 999999 } } as unknown as DraftView;
  const bodies: any[] = [];
  globalThis.fetch = (async (_url, init) => {
    if (init?.method === "POST") {
      bodies.push(JSON.parse(String(init.body)));
      return bodies.length === 1 ? new Response(JSON.stringify({ code: "STALE_VERSION", message: "stale" }), { status: 409 }) : new Response(JSON.stringify({ ...view, version: 3 }));
    }
    return new Response(JSON.stringify({ ...view, version: 2, opponent: { picks: 1 } }));
  }) as typeof fetch;
  try {
    assert.equal((await draftCommand(view, "PICK", "a")).version, 3);
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0].requestId, bodies[1].requestId);
    assert.equal(bodies[1].version, 2);
    assert.equal(bodies[1].pickId, "a");
  } finally { globalThis.fetch = original; }
});
test("expired or advanced own selection never retries an old click", async () => {
  const original = globalThis.fetch;
  const view = { id: "room", phase: "DRAFT", seat: 0, version: 1, own: { deck: [], offers: ["a"] } } as unknown as DraftView;
  let posts = 0;
  globalThis.fetch = (async (_url, init) => {
    if (init?.method === "POST") { posts++; return new Response(JSON.stringify({ code: "STALE_VERSION", message: "stale" }), { status: 409 }); }
    return new Response(JSON.stringify({ ...view, version: 2, own: { deck: ["b"], offers: ["a"] } }));
  }) as typeof fetch;
  try { await assert.rejects(draftCommand(view, "PICK", "a"), /stale/); assert.equal(posts, 1); }
  finally { globalThis.fetch = original; }
});

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

test("draft action is sent during slow polling and stale poll cannot replace accepted version", async () => {
 const originalFetch = globalThis.fetch, originalInterval = globalThis.setInterval, originalClear = globalThis.clearInterval;
 let resolvePoll: ((response: Response) => void) | undefined; const messages: OnlineServerMessage[] = [];
 const snapshot = (version: number) => ({type:'MATCH_SNAPSHOT',matchId:'room',seat:'PLAYER_ONE',version,state:{status:'IN_PROGRESS'},events:[],serverTime:1,turnStartedAt:1,turnDeadlineAt:90000,gameplayStartsAt:0,publicPlayers:[],introFirstSpeaker:null,connectionStates:{PLAYER_ONE:'CONNECTED',PLAYER_TWO:'CONNECTED'}});
 globalThis.setInterval = (() => 1) as unknown as typeof setInterval; globalThis.clearInterval = (() => {}) as typeof clearInterval;
 globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
   if (init?.method === 'POST') return new Response(JSON.stringify({...snapshot(2),type:'ACTION_ACCEPTED',requestId:'action'}));
   return new Promise<Response>(resolve => { resolvePoll = resolve; });
 }) as typeof fetch;
 const client = new DraftBattleClient(); client.onMessage(message => messages.push(message));
 try {
  client.connect(); client.send({type:'SUBSCRIBE',matchId:'room'});
  assert.ok(resolvePoll);
  assert.equal(client.send({type:'MATCH_ACTION',matchId:'room',requestId:'action',expectedVersion:1,action:{type:'END_TURN'}}),true);
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(messages.at(-1)?.type,'ACTION_ACCEPTED');
  resolvePoll!(new Response(JSON.stringify(snapshot(1))));
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(messages.filter(message => message.type === 'MATCH_SNAPSHOT').length,0);
  assert.equal(messages.at(-1)?.type,'ACTION_ACCEPTED');
 } finally {client.close();globalThis.fetch=originalFetch;globalThis.setInterval=originalInterval;globalThis.clearInterval=originalClear;}
});
