/** Entirely in-memory PostgreSQL-compatible tests. No deployed services or user data. */
import assert from "node:assert/strict";
import { test, after } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import * as schema from "../src/schema";
import { eq } from "drizzle-orm";
process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
process.env.NODE_ENV = "test";
const pg = new PGlite(),
  database = drizzle(pg, { schema });
for (const ddl of await generateMigration(
  generateDrizzleJson({}),
  generateDrizzleJson(schema),
))
  await pg.exec(ddl);
const migration = await readFile(
  new URL("../migrations/0057_player_experience.sql", import.meta.url),
  "utf8",
);
await pg.exec(migration);
await pg.exec(migration);
const { db, pool } = await import("../src/index");
for (const method of [
  "select",
  "insert",
  "update",
  "delete",
  "execute",
  "transaction",
] as const)
  Object.assign(db, { [method]: database[method].bind(database) });
const require = createRequire(
    new URL("../../../artifacts/api-server/package.json", import.meta.url),
  ),
  express = require("express");
const { hashPassword, verifyPassword } =
  await import("../../../artifacts/api-server/src/lib/auth");
const { default: recovery } =
  await import("../../../artifacts/api-server/src/routes/account-recovery");
const { default: journal } =
  await import("../../../artifacts/api-server/src/routes/player-journal");
const { default: diagnostics } =
  await import("../../../artifacts/api-server/src/routes/client-diagnostics");
const root = express(),
  diagnosticLogs: unknown[] = [];
root.use(express.json());
root.use((req: any, _res: any, next: any) => {
  req.log = { error: (...args: unknown[]) => diagnosticLogs.push(args) };
  next();
});
root.use("/auth", recovery);
root.use("/journal", journal);
root.use("/diagnostics", diagnostics);
root.use((e: any, _req: any, res: any, _next: any) => {
  console.error(e);
  res.status(500).json({ message: "fixture failure" });
});
const server = root.listen(0, "127.0.0.1");
await new Promise<void>((r) => server.once("listening", r));
const origin = "http://127.0.0.1:" + server.address().port;
after(async () => {
  server.closeAllConnections();
  await new Promise<void>((r) => server.close(() => r()));
  await pool.end();
  await pg.close();
});
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
async function user(id: string) {
  await database
    .insert(schema.usersTable)
    .values({
      id,
      email: id + "@example.com",
      nickname: "테스트 " + id,
      passwordHash: await hashPassword("old-password"),
    });
  return session(id);
}
async function session(id: string) {
  const token = randomBytes(32).toString("hex");
  await database
    .insert(schema.sessionsTable)
    .values({
      id: randomBytes(16).toString("hex"),
      userId: id,
      tokenHash: sha(token),
      expiresAt: new Date(Date.now() + 3600000),
    });
  return "ko_session=" + token;
}
async function api(path: string, cookie?: string, body?: unknown) {
  const r = await fetch(origin + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      "Content-Type": "application/json",
    },
    body:
      body === undefined
        ? undefined
        : JSON.stringify(
            path === "/journal/sync" && cookie
              ? {
                  accountId: cookie === first ? "one" : "two",
                  ...(body as object),
                }
              : body,
          ),
  });
  return {
    status: r.status,
    body: r.status === 202 ? null : await r.json(),
    headers: r.headers,
  };
}
const first = await user("one"),
  second = await user("two");
test("journal requires ownership and validates payloads; merges two devices without duplicate matches", async () => {
  assert.equal(
    (
      await api("/journal/sync", first, {
        accountId: "two",
        wishes: [],
        matches: [],
      })
    ).status,
    409,
  );
  assert.equal(
    (await api("/journal/sync", undefined, { wishes: [], matches: [] })).status,
    401,
  );
  assert.equal(
    (
      await api("/journal/sync", first, {
        wishes: [
          { id: "x", kind: "skin", name: "bad", image: "javascript:bad" },
        ],
        matches: [],
      })
    ).status,
    400,
  );
  const match = {
    id: "match-1",
    opponent: "연습 상대",
    result: "승리",
    at: 100,
    mode: "AI",
  };
  let r = await api("/journal/sync", first, {
    wishes: [{ id: "a", kind: "card", name: "첫 목표", updatedAt: 1 }],
    matches: [match],
  });
  assert.equal(r.status, 200);
  r = await api("/journal/sync", first, {
    wishes: [{ id: "b", kind: "skin", name: "다른 기기의 목표", updatedAt: 2 }],
    matches: [match],
  });
  assert.equal(r.body.document.wishes.length, 2);
  assert.equal(r.body.document.matches.length, 1);
  r = await api("/journal/sync", first, {
    wishes: [],
    matches: [{ ...match, deckId: "later-known", deckName: "실제 출전 덱" }],
  });
  assert.equal(r.body.document.matches[0].deckId, "later-known");
  const other = await api("/journal/sync", second, { wishes: [], matches: [] });
  assert.deepEqual(other.body.document.wishes, []);
  r = await api("/journal/sync", first, {
    wishes: [],
    matches: [],
    removedWishes: [{ id: "a", at: 3 }],
  });
  assert.deepEqual(
    r.body.document.wishes.map((v: any) => v.id),
    ["b"],
  );
  r = await api("/journal/sync", first, {
    wishes: [
      { id: "a", kind: "card", name: "오래된 오프라인 목표", updatedAt: 1 },
    ],
    matches: [],
  });
  assert.equal(r.body.document.wishes.length, 1);
  r = await api("/journal/sync", first, {
    wishes: [{ id: "a", kind: "card", name: "다시 추가한 목표", updatedAt: 4 }],
    matches: [],
  });
  assert.equal(r.body.document.wishes.length, 2);
});
test("password changes require current password, revoke all sessions and preserve the account", async () => {
  assert.equal((await api("/auth/password/change", undefined, {})).status, 401);
  assert.equal(
    (
      await api("/auth/password/change", first, {
        currentPassword: "incorrect",
        password: "new-password",
        passwordConfirmation: "new-password",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await database
        .select()
        .from(schema.sessionsTable)
        .where(eq(schema.sessionsTable.userId, "one"))
    ).length,
    1,
  );
  const r = await api("/auth/password/change", first, {
    currentPassword: "old-password",
    password: "new-password",
    passwordConfirmation: "new-password",
  });
  assert.equal(r.status, 200);
  assert.match(r.headers.get("set-cookie") ?? "", /Max-Age=0/);
  assert.equal(
    (
      await database
        .select()
        .from(schema.sessionsTable)
        .where(eq(schema.sessionsTable.userId, "one"))
    ).length,
    0,
  );
  const [u] = await database
    .select()
    .from(schema.usersTable)
    .where(eq(schema.usersTable.id, "one"));
  assert.ok(await verifyPassword("new-password", u.passwordHash));
});
test("email recovery is explicit when unconfigured; tokens expire, are single use and revoke sessions", async () => {
  assert.equal((await api("/auth/recovery-options")).body.emailRecovery, false);
  assert.equal(
    (
      await api("/auth/password/forgot", undefined, {
        email: "two@example.com",
      })
    ).status,
    503,
  );
  const token = randomBytes(32).toString("hex"),
    expired = randomBytes(32).toString("hex");
  await database.insert(schema.passwordResetTokensTable).values([
    {
      tokenHash: sha(token),
      userId: "two",
      expiresAt: new Date(Date.now() + 60000),
    },
    {
      tokenHash: sha(expired),
      userId: "two",
      expiresAt: new Date(Date.now() - 1000),
    },
  ]);
  const payload = (t: string) => ({
    token: t,
    password: "reset-password",
    passwordConfirmation: "reset-password",
  });
  assert.equal(
    (await api("/auth/password/reset", undefined, payload(expired))).status,
    400,
  );
  assert.equal(
    (await api("/auth/password/reset", undefined, payload(token))).status,
    200,
  );
  assert.equal(
    (await api("/auth/password/reset", undefined, payload(token))).status,
    400,
  );
  assert.equal(
    (
      await database
        .select()
        .from(schema.sessionsTable)
        .where(eq(schema.sessionsTable.userId, "two"))
    ).length,
    0,
  );
});
test("configured delivery uses a fragment link, stores only token hash and does not enumerate accounts", async () => {
  process.env.RESEND_API_KEY = "fixture-only";
  process.env.PASSWORD_RESET_FROM = "fixture@example.com";
  process.env.PUBLIC_APP_URL = "https://example.com";
  const original = globalThis.fetch;
  const emails: any[] = [];
  globalThis.fetch = async (input: any, init: any) => {
    if (String(input) === "https://api.resend.com/emails") {
      emails.push(JSON.parse(init.body));
      return new Response("{}", { status: 200 });
    }
    return original(input, init);
  };
  try {
    const r = await api("/auth/password/forgot", undefined, {
        email: "two@example.com",
      }),
      unknown = await api("/auth/password/forgot", undefined, {
        email: "missing@example.com",
      });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, unknown.body);
    assert.equal(emails.length, 1);
    assert.match(emails[0].text, /account-recovery#token=[a-f0-9]{64}/);
    const raw = emails[0].text.match(/token=([a-f0-9]{64})/)[1];
    assert.equal(
      (
        await database
          .select()
          .from(schema.passwordResetTokensTable)
          .where(eq(schema.passwordResetTokensTable.tokenHash, raw))
      ).length,
      0,
    );
    assert.equal(
      (
        await database
          .select()
          .from(schema.passwordResetTokensTable)
          .where(eq(schema.passwordResetTokensTable.tokenHash, sha(raw)))
      ).length,
      1,
    );
  } finally {
    globalThis.fetch = original;
    delete process.env.RESEND_API_KEY;
    delete process.env.PASSWORD_RESET_FROM;
    delete process.env.PUBLIC_APP_URL;
  }
});
test("diagnostics accepts only bounded screen metadata; strips private payloads and limits abuse", async () => {
  const payload = {
    id: "qa-diagnostic",
    kind: "RENDER",
    screen: "DECKS",
    build: "test",
    online: true,
    password: "must-not-log",
    url: "https://private?token=secret",
  };
  for (let n = 0; n < 10; n++)
    assert.equal((await api("/diagnostics", undefined, payload)).status, 202);
  const r = await fetch(origin + "/diagnostics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  assert.equal(r.status, 429);
  const captured = JSON.stringify(diagnosticLogs);
  assert.ok(!captured.includes("must-not-log"));
  assert.ok(!captured.includes("private?token"));
});

test("anonymous database roles cannot read journals or reset tokens", async () => {
  await pg.exec(
    "CREATE ROLE experience_anon; GRANT USAGE ON SCHEMA public TO experience_anon; GRANT SELECT,INSERT,UPDATE,DELETE ON player_journals,password_reset_tokens TO experience_anon; SET ROLE experience_anon",
  );
  try {
    assert.equal(
      (await pg.query("SELECT * FROM player_journals")).rows.length,
      0,
    );
    assert.equal(
      (await pg.query("SELECT * FROM password_reset_tokens")).rows.length,
      0,
    );
    await assert.rejects(() =>
      pg.exec("INSERT INTO player_journals(user_id) VALUES('one')"),
    );
  } finally {
    await pg.exec("RESET ROLE");
  }
});
