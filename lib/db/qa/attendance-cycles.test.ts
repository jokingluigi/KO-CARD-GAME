import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { eq } from "drizzle-orm";
import * as schema from "../src/schema";
process.env.DATABASE_URL = "postgresql://unused:unused@localhost:1/unused";
const pg = new PGlite(),
  database = drizzle(pg, { schema });
for (const ddl of await generateMigration(
  generateDrizzleJson({}),
  generateDrizzleJson(schema),
))
  await pg.exec(ddl);
const { db, pool } = await import("../src/index");
for (const method of [
  "select",
  "insert",
  "update",
  "delete",
  "transaction",
  "execute",
] as const)
  Object.assign(db, { [method]: database[method].bind(database) });
const { claimAttendance, publicAttendance, attendancePosition } =
  await import("../../../artifacts/api-server/src/lib/attendance-service");
after(async () => {
  await pg.close();
  await pool.end();
});
const date = (n: number) =>
  new Date(`2026-11-${String(n).padStart(2, "0")}T03:00:00Z`);
await database
  .insert(schema.usersTable)
  .values({
    id: "cycle-user",
    email: "cycle@qa.invalid",
    nickname: "Cycle",
    passwordHash: "unused",
  });
await database.insert(schema.attendanceRewardDefinitionsTable).values([
  { dayIndex: 1, rewardType: "CURRENCY", rewardAmount: 5, enabled: true },
  { dayIndex: 2, rewardType: "CURRENCY", rewardAmount: 10, enabled: true },
]);

test("last claim stays complete today, restarts at day 1 tomorrow, and never pays twice on one date", async () => {
  const first = await claimAttendance("cycle-user", date(21));
  assert.equal(first.claim.dayIndex, 1);
  assert.equal(first.claim.cycle, 1);
  const repeat = await claimAttendance("cycle-user", date(21));
  assert.equal(repeat.alreadyClaimed, true);
  assert.equal(repeat.reward, null);
  const last = await claimAttendance("cycle-user", date(22));
  assert.equal(last.claim.dayIndex, 2);
  const defs = await database
    .select()
    .from(schema.attendanceRewardDefinitionsTable);
  const claims = await database.select().from(schema.attendanceClaimsTable);
  const today = publicAttendance(defs, claims, date(22));
  assert.ok(today.definitions.every((d) => d.state === "CLAIMED"));
  assert.equal(today.cycle, 1);
  const tomorrow = publicAttendance(defs, [...claims].reverse(), date(23));
  assert.equal(tomorrow.cycle, 2);
  assert.equal(tomorrow.definitions[0].state, "AVAILABLE");
  assert.equal(tomorrow.definitions[1].state, "LOCKED");
  const results = await Promise.all([
    claimAttendance("cycle-user", date(23)),
    claimAttendance("cycle-user", date(23)),
  ]);
  assert.equal(results.filter((r) => !r.alreadyClaimed).length, 1);
  assert.equal(results.find((r) => !r.alreadyClaimed)!.claim.cycle, 2);
  const grants = await database
    .select()
    .from(schema.rewardGrantsTable)
    .where(eq(schema.rewardGrantsTable.userId, "cycle-user"));
  assert.equal(grants.length, 3);
  const all = await database.select().from(schema.attendanceClaimsTable);
  assert.equal(all.length, 3);
  assert.equal(all.filter((c) => c.dayIndex === 1).length, 2);
});
test("gaps and disabled definitions do not permanently block the cycle; missed days keep progress", () => {
  const defs = [
    { dayIndex: 1, enabled: true },
    { dayIndex: 2, enabled: false },
    { dayIndex: 4, enabled: true },
  ];
  assert.equal(
    attendancePosition(
      defs,
      [{ dayIndex: 1, claimDate: "2020-01-01" }],
      "2026-11-21",
    ).nextDayIndex,
    4,
  );
  const wrapped = attendancePosition(
    defs,
    [{ dayIndex: 4, claimDate: "2020-01-02" }],
    "2026-11-21",
  );
  assert.equal(wrapped.cycle, 2);
  assert.equal(wrapped.nextDayIndex, 1);
  assert.equal(
    attendancePosition(
      [],
      [{ dayIndex: 4, claimDate: "2020-01-02" }],
      "2026-11-21",
    ).nextDayIndex,
    null,
  );
});
test("migration preserves legacy claims and date uniqueness while allowing a new cycle", async () => {
  const legacy = new PGlite();
  try {
    await legacy.exec(
      `CREATE TABLE attendance_claims(id text PRIMARY KEY,user_id text,day_index integer,claim_date text,CONSTRAINT attendance_claims_user_day_unique UNIQUE(user_id,day_index),CONSTRAINT attendance_claims_user_date_unique UNIQUE(user_id,claim_date));CREATE UNIQUE INDEX attendance_claims_user_day_idx ON attendance_claims(user_id,day_index);INSERT INTO attendance_claims VALUES('old','u',1,'2026-11-20');`,
    );
    const migration = readFileSync(
      new URL("../migrations/0060_attendance_cycles.sql", import.meta.url),
      "utf8",
    );
    await legacy.exec(migration);
    await legacy.exec(migration);
    assert.equal(
      (
        await legacy.query<{ cycle: number }>(
          "SELECT cycle FROM attendance_claims WHERE id='old'",
        )
      ).rows[0].cycle,
      1,
    );
    await legacy.exec(
      "INSERT INTO attendance_claims VALUES('new','u',1,'2026-11-21',2)",
    );
    await assert.rejects(
      legacy.exec(
        "INSERT INTO attendance_claims VALUES('duplicate','u',2,'2026-11-21',2)",
      ),
    );
    await assert.rejects(
      legacy.exec(
        "INSERT INTO attendance_claims VALUES('duplicate-day','u',1,'2026-11-22',2)",
      ),
    );
  } finally {
    await legacy.close();
  }
});
