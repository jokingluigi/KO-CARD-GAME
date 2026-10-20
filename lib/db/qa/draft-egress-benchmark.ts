/** Opt-in local fixture measurement. Result JSON contains only aggregate counts/bytes. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import * as schema from "../src/schema";
export async function runDraftEgressBenchmark({
  database,
  pg,
  request,
  replaceState,
  stored,
}: any) {
  const service =
    await import("../../../artifacts/api-server/src/lib/draft-service");
  const cards = JSON.parse(
    await readFile("docs/qa/snapshots/20261014-admin/cards.json", "utf8"),
  );
  const champions = JSON.parse(
    await readFile("docs/qa/snapshots/20261014-admin/champions.json", "utf8"),
  );
  const strip = (r: any) => {
    const { createdAt, updatedAt, ...rest } = r;
    return rest;
  };
  await database
    .insert(schema.cardsTable)
    .values(cards.map(strip))
    .onConflictDoNothing();
  await database
    .insert(schema.championsTable)
    .values(champions.map(strip))
    .onConflictDoNothing();
  await database.delete(schema.draftParticipantsTable);
  await request("admin", "/admin/draft/settings", "PUT", {
    enabled: true,
    config: (await service.draftSettings()).config,
  });
  const waiting = (
    await request("admin", "/admin/draft/sessions", "POST", { mode: "PVP" })
  ).body;
  assert.ok(waiting.id);
  await replaceState(waiting.id, (s: any) => {
    s.seed = "12345678-1234-1234-1234-123456789abc";
  });
  const canonicalPath = process.env.KO_DRAFT_EGRESS_INPUT;
  const canonical: Record<string, any> = canonicalPath
    ? JSON.parse(await readFile(canonicalPath, "utf8").catch(() => "{}"))
    : {};
  const scenarios: Record<string, any> = {};
  const originalQuery = pg.query.bind(pg),
    originalNow = Date.now;
  let recording = false,
    metrics: any;
  function instrument(client: any) {
    const original = client.query.bind(client);
    client.query = async (...args: any[]) => {
      const result = await original(...args);
      if (recording) {
        const q = typeof args[0] === "string" ? args[0] : args[0].text;
        const key = /pg_advisory_xact_lock/.test(q)
          ? "advisory_lock"
          : /draft_settings/.test(q)
            ? "settings"
            : /draft_sessions/.test(q)
              ? "sessions"
              : /draft_participants/.test(q)
                ? "participants"
                : "other";
        const m = (metrics[key] ??= {
          calls: 0,
          rows: 0,
          resultBytes: 0,
          requestBytes: 0,
        });
        m.calls++;
        m.rows += result.rows?.length ?? 0;
        m.resultBytes += Buffer.byteLength(JSON.stringify(result.rows ?? []));
        m.requestBytes +=
          Buffer.byteLength(q) +
          Buffer.byteLength(JSON.stringify(args[1] ?? []));
      }
      return result;
    };
    return () => {
      client.query = original;
    };
  }
  const restoreQuery = instrument(pg),
    originalTransaction = pg.transaction.bind(pg);
  pg.transaction = (callback: any, ...args: any[]) =>
    originalTransaction(
      async (tx: any) => {
        const restore = instrument(tx);
        try {
          return await callback(tx);
        } finally {
          restore();
        }
      },
      ...args,
    );
  async function measure(name: string, id: string, users: string[]) {
    // Clear process-local reads only when this optimized implementation provides it.
    const base = originalNow();
    if (canonical[name]) {
      const saved = structuredClone(canonical[name]);
      saved.state.id = id;
      if (saved.state.battle) {
        saved.state.battle.gameId = id;
        saved.state.lastSeen = [base, base];
        saved.state.gameplayStartsAt = base + 3600000;
        saved.state.turnDeadline = base + 3600000;
      }
      await database
        .update(schema.draftSessionsTable)
        .set({ state: saved.state, snapshot: saved.snapshot })
        .where(eq(schema.draftSessionsTable.id, id));
    } else if (canonicalPath) {
      const row = await stored(id);
      canonical[name] = { state: row.state, snapshot: row.snapshot };
      await writeFile(canonicalPath, JSON.stringify(canonical));
    }
    (service as any).clearDraftReadCaches?.();
    metrics = {};
    const versions = new Map<string, number>();
    recording = true;
    try {
      for (let second = 0; second < 60; second++) {
        Date.now = () => base + second * 1000;
        for (const user of users) {
          if (name === "battle" && (service as any).pollDraftBattle) {
            const r = await (service as any).pollDraftBattle(
              user,
              id,
              versions.get(user),
            );
            versions.set(user, r.version);
          } else await service.mutateDraft(user, id);
        }
        await service.tickDraftSessions();
      }
    } finally {
      recording = false;
      Date.now = originalNow;
    }
    const row = await stored(id);
    scenarios[name] = {
      snapshotSha256: createHash("sha256")
        .update(JSON.stringify(row.snapshot))
        .digest("hex"),
      seconds: 60,
      users: users.length,
      metrics,
      snapshotBytes: Buffer.byteLength(JSON.stringify(row.snapshot)),
      stateBytes: Buffer.byteLength(JSON.stringify(row.state)),
      phase: row.state.phase,
    };
  }
  try {
    await measure("waiting", waiting.id, ["admin"]);
    const invitation = (
      await request(
        "opponent",
        `/admin/draft/sessions/${waiting.id}/invitation`,
      )
    ).body;
    assert.equal(
      (
        await request(
          "opponent",
          `/admin/draft/sessions/${waiting.id}/commands`,
          "POST",
          {
            type: "JOIN",
            version: invitation.version,
            requestId: crypto.randomUUID(),
          },
        )
      ).status,
      200,
    );
    await replaceState(waiting.id, (s: any) => {
      for (const seat of s.seats) seat.deadline = originalNow() - 800000;
    });
    await service.tickDraftSessions();
    await replaceState(waiting.id, (s: any) => {
      s.gameplayStartsAt = originalNow() + 3600000;
      s.turnDeadline = originalNow() + 3600000;
      s.lastSeen = [originalNow(), originalNow()];
    });
    assert.equal((await stored(waiting.id)).state.phase, "BATTLE");
    await measure("battle", waiting.id, ["admin", "opponent"]);
    const report = {
      source:
        "isolated PGlite / archived 2026-10-14 admin content plus existing fixture cards",
      archivedCards: cards.length,
      archivedChampions: champions.length,
      measurement:
        "UTF-8 serialized returned DB rows; excludes PostgreSQL/TLS/pooler framing, not Supabase billing",
      scenarios,
    };
    await writeFile(
      process.env.KO_DRAFT_EGRESS_REPORT!,
      JSON.stringify(report, null, 2) + "\n",
    );
    console.log("DRAFT_EGRESS_METRICS " + process.env.KO_DRAFT_EGRESS_REPORT);
  } finally {
    restoreQuery();
    pg.transaction = originalTransaction;
    Date.now = originalNow;
  }
}
