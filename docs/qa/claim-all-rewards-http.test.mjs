import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { startClaimAllFixture } from "./claim-all-rewards-fixture.mjs";
let f;
before(async () => {
  f = await startClaimAllFixture();
});
after(async () => {
  await f?.close();
});
const req = (path, body, method = "POST", cookie = f.cookie) =>
  fetch(f.origin + "/api/rewards" + path, {
    method,
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
test("authenticated discovery includes daily, season, completion bonus and attendance without granting them", async () => {
  const response = await req("/available", null, "GET");
  assert.equal(response.status, 200);
  const r = await response.json();
  assert.equal(r.accountId, "tutorial-user");
  assert.equal(r.items.filter((i) => i.kind === "QUEST").length, 4);
  assert.equal(r.items.filter((i) => i.kind === "DAILY_BONUS").length, 1);
  assert.equal(r.items.filter((i) => i.kind === "ATTENDANCE").length, 1);
  assert.equal(
    (await f.db.select().from(f.schema.rewardGrantsTable)).length,
    0,
  );
  assert.equal((await req("/available", null, "GET", "")).status, 401);
});
test("account binding and invalid proof containers reject without a grant", async () => {
  assert.equal(
    (await req("/claim-all", { accountId: "different-account" })).status,
    409,
  );
  assert.equal(
    (
      await req("/claim-all", {
        accountId: "tutorial-user",
        tutorialProofs: Array(7).fill({}),
      })
    ).status,
    400,
  );
  assert.equal(
    (await f.db.select().from(f.schema.rewardGrantsTable)).length,
    0,
  );
});
test("one call collects all source types, multiple rewards per quest and verified tutorial proofs", async () => {
  const response = await req("/claim-all", {
    accountId: "tutorial-user",
    tutorialProofs: f.proofs,
  });
  const r = await response.json();
  assert.equal(response.status, 200);
  assert.equal(r.failedCount, 0, JSON.stringify(r));
  assert.equal(r.claimedCount, 12);
  assert.equal(r.balances.currencyBalance, 62);
  assert.equal(
    r.totals.find((t) => t.rewardType === "CURRENCY").rewardAmount,
    62,
  );
  assert.equal(
    r.totals.find((t) => t.rewardTargetId === "normal-pack").rewardAmount,
    20,
  );
  assert.equal(
    r.totals.find((t) => t.rewardTargetId === "champion-pack").rewardAmount,
    1,
  );
  assert.equal(
    r.totals.find((t) => t.rewardTargetId === "normal-pack").label,
    "노멀팩",
  );
  const rows = await f.db.select().from(f.schema.userPackInventoryTable);
  assert.equal(
    rows.find((p) => p.packDefinitionId === "normal-pack").quantity,
    20,
  );
  assert.equal(
    rows.find((p) => p.packDefinitionId === "champion-pack").quantity,
    1,
  );
});
test("concurrent repeats and a lost response retry never add currency, packs or attendance twice", async () => {
  const before = (await f.db.select().from(f.schema.rewardGrantsTable)).length;
  const replies = await Promise.all(
    Array.from({ length: 5 }, () =>
      req("/claim-all", {
        accountId: "tutorial-user",
        tutorialProofs: f.proofs,
      }),
    ),
  );
  for (const response of replies) {
    const r = await response.json();
    assert.equal(r.claimedCount, 0);
    assert.equal(r.totals.length, 0);
    assert.equal(r.failedCount, 0);
  }
  assert.equal(
    (await f.db.select().from(f.schema.rewardGrantsTable)).length,
    before,
  );
  assert.equal(
    (await f.db.select().from(f.schema.attendanceClaimsTable)).length,
    1,
  );
  assert.equal(
    (await f.db.select().from(f.schema.usersTable))[0].currencyBalance,
    62,
  );
  assert.equal(
    (await req("/available", null, "GET").then((r) => r.json())).items.length,
    0,
  );
});
test("one invalid reward/proof does not roll back a good reward; retry claims only the repaired remainder", async () => {
  const { eq } = await import("../../lib/db/node_modules/drizzle-orm/index.js");
  for (const [id, target] of [
    ["good-extra", "normal-pack"],
    ["bad-extra", "missing-pack"],
  ]) {
    await f.db
      .insert(f.schema.dailyQuestDefinitionsTable)
      .values({
        id,
        title: id,
        description: "격리",
        objectiveType: "PLAY_MATCH",
        targetValue: 1,
        rewardType: "PACK",
        rewardAmount: 1,
        rewardTargetId: target,
        enabled: true,
        platform: {
          questType: "SEASON",
          seasonId: "claim-all-season",
          version: 1,
          rewards: [
            { rewardType: "PACK", rewardAmount: 1, rewardTargetId: target },
          ],
        },
      });
  }
  const { ensureAllQuestAssignments } =
    await import("../../artifacts/api-server/src/lib/daily-quest-service.ts");
  await ensureAllQuestAssignments("tutorial-user");
  const { inArray } =
    await import("../../lib/db/node_modules/drizzle-orm/index.js");
  await f.db
    .update(f.schema.dailyQuestAssignmentsTable)
    .set({ status: "COMPLETED", progress: 1 })
    .where(
      inArray(f.schema.dailyQuestAssignmentsTable.definitionId, [
        "good-extra",
        "bad-extra",
      ]),
    );
  const response = await req("/claim-all", {
    accountId: "tutorial-user",
    tutorialProofs: [{ lessonId: "basics", complete: true }],
  });
  const result = await response.json();
  assert.equal(result.claimedCount, 1);
  assert.equal(result.failedCount, 2);
  assert.equal(
    result.totals.find((t) => t.rewardTargetId === "normal-pack").rewardAmount,
    1,
  );
  const pending = (
    await f.db.select().from(f.schema.dailyQuestAssignmentsTable)
  ).find((q) => q.definitionId === "bad-extra");
  assert.equal(pending.status, "COMPLETED");
  await f.db
    .update(f.schema.dailyQuestAssignmentsTable)
    .set({
      rewardTargetId: "normal-pack",
      platform: {
        questType: "SEASON",
        seasonId: "claim-all-season",
        version: 1,
        rewards: [
          {
            rewardType: "PACK",
            rewardAmount: 1,
            rewardTargetId: "normal-pack",
          },
        ],
      },
    })
    .where(eq(f.schema.dailyQuestAssignmentsTable.id, pending.id));
  const retry = await req("/claim-all", { accountId: "tutorial-user" }).then(
    (r) => r.json(),
  );
  assert.equal(retry.claimedCount, 1);
  assert.equal(retry.failedCount, 0);
  assert.equal(retry.totals[0].rewardAmount, 1);
  const rows = await f.db.select().from(f.schema.userPackInventoryTable);
  assert.equal(
    rows.find((p) => p.packDefinitionId === "normal-pack").quantity,
    22,
  );
  assert.equal(
    (await f.db.select().from(f.schema.usersTable))[0].currencyBalance,
    62,
  );
});
