/** Real UI + actual isolated reward API/DB. No production reward writes. */
import assert from "node:assert/strict";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import {
  startClaimAllFixture,
  createClaimAllAccount,
} from "./claim-all-rewards-fixture.mjs";
import { auditSetup } from "./ui-audit-fixture.mjs";
import { chromium } from "./black-gold-playwright.mjs";
const f = await startClaimAllFixture(),
  browser = await chromium.launch();
const origin = process.env.KO_UI_ORIGIN ?? "http://127.0.0.1:5186",
  out = process.env.KO_CLAIM_ALL_OUT ?? "qa-results/claim-all-rewards";
await mkdir(out, { recursive: true });
const results = [];
try {
  for (const [index, [width, height]] of [
    [390, 844],
    [844, 390],
    [1440, 900],
    [360, 740],
  ].entries()) {
    const id = "all-rewards-ui-" + index,
      cookie = await createClaimAllAccount(f, id),
      partial = index === 3;
    let badAssignment;
    if (partial) {
      await f.db
        .insert(f.schema.dailyQuestDefinitionsTable)
        .values({
          id: "ui-bad-quest",
          title: "설정 확인 중인 보상",
          description: "격리",
          objectiveType: "PLAY_MATCH",
          targetValue: 1,
          rewardType: "PACK",
          rewardAmount: 1,
          rewardTargetId: "missing-pack",
          enabled: true,
          platform: {
            questType: "SEASON",
            seasonId: "claim-all-season",
            version: 1,
            rewards: [
              {
                rewardType: "PACK",
                rewardAmount: 1,
                rewardTargetId: "missing-pack",
              },
            ],
          },
        });
      const { ensureAllQuestAssignments } =
        await import("../../artifacts/api-server/src/lib/daily-quest-service.ts");
      await ensureAllQuestAssignments(id);
      const { and, eq } =
        await import("../../lib/db/node_modules/drizzle-orm/index.js");
      [badAssignment] = await f.db
        .update(f.schema.dailyQuestAssignmentsTable)
        .set({ status: "COMPLETED", progress: 1 })
        .where(
          and(
            eq(f.schema.dailyQuestAssignmentsTable.userId, id),
            eq(
              f.schema.dailyQuestAssignmentsTable.definitionId,
              "ui-bad-quest",
            ),
          ),
        )
        .returning();
    }
    const ctx = await browser.newContext({
        viewport: { width, height },
        hasTouch: width === 390 || width === 360,
        isMobile: width === 390 || width === 360,
        ignoreHTTPSErrors: true,
        reducedMotion: "reduce",
        ...(index === 0
          ? { recordVideo: { dir: out + "/video", size: { width, height } } }
          : {}),
      }),
      p = await ctx.newPage(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await auditSetup(ctx);
    await ctx.addInitScript(
      ({ id, proofs }) => {
        for (const proof of proofs)
          localStorage.setItem(
            "ko-tutorial-proof-v1:" + id + ":" + proof.lessonId,
            JSON.stringify(proof),
          );
      },
      { id, proofs: f.proofs },
    );
    let posts = 0,
      reads = 0,
      lost = false;
    await ctx.route("**/api/**", async (r) => {
      const q = r.request(),
        path = new URL(q.url()).pathname;
      if (path === "/api/auth/me") {
        const rows = await f.db.select().from(f.schema.usersTable);
        const u = rows.find((u) => u.id === id);
        return r.fulfill({
          json: {
            authenticated: true,
            user: {
              id,
              role: "USER",
              email: id + "@example.invalid",
              nickname: "보상 검증",
              currency: 0,
              currencyBalance: u.currencyBalance,
              prismBalance: 0,
              championPrismBalance: 0,
              isTestAccount: false,
            },
          },
        });
      }
      if (
        path.startsWith("/api/rewards/") ||
        path === "/api/daily-quests" ||
        path === "/api/attendance" ||
        path === "/api/packs"
      ) {
        if (path.endsWith("/claim-all")) posts++;
        if (path.endsWith("/available")) reads++;
        const response = await fetch(f.origin + path, {
          method: q.method(),
          headers: { Cookie: cookie, "Content-Type": "application/json" },
          ...(q.method() !== "GET" ? { body: q.postData() } : {}),
        });
        const body = await response.text();
        if (
          index === 1 &&
          path.endsWith("/claim-all") &&
          !lost &&
          response.ok
        ) {
          lost = true;
          return r.fulfill({
            status: 503,
            json: { message: "QA: 지급 응답 유실" },
          });
        }
        return r.fulfill({
          status: response.status,
          contentType: "application/json",
          body,
        });
      }
      return r.fallback();
    });
    await p.goto(origin + "/");
    const button = p.getByTestId("button-claim-all-rewards");
    await button.waitFor();
    await p.evaluate(() => document.fonts.ready);
    const box = await button.boundingBox();
    assert.ok(
      box.width >= 44 &&
        box.height >= 44 &&
        box.x >= 0 &&
        box.x + box.width <= width + 1 &&
        box.y >= 0 &&
        box.y + box.height <= height + 1,
      JSON.stringify({ width, height, box }),
    );
    assert.equal(
      await p.evaluate(
        () => document.documentElement.scrollHeight > innerHeight + 1,
      ),
      false,
      "home remains no-scroll",
    );
    await p.screenshot({ path: `${out}/home-${width}x${height}.png` });
    await button.evaluate((n) => {
      n.click();
      n.click();
    });
    const dialog = p.getByRole("dialog");
    await dialog.waitFor();
    if (index === 1) {
      await dialog
        .getByRole("button", { name: "지급 상태 다시 확인", exact: true })
        .waitFor();
      assert.equal(posts, 1);
      await dialog
        .getByRole("button", { name: "지급 상태 다시 확인", exact: true })
        .click();
      await dialog
        .getByText("현재 받을 수 있는 미수령 보상이 없어요.", { exact: true })
        .waitFor();
      assert.equal(posts, 1);
      assert.equal(reads, 1);
    } else {
      await dialog
        .getByRole("status")
        .filter({ hasText: "수령 완료" })
        .waitFor();
      assert.equal(posts, 1);
      await dialog
        .getByRole("list", { name: "이번에 받은 보상" })
        .getByText("노멀팩", { exact: true })
        .waitFor();
      await dialog.getByText("보유 크레딧 62", { exact: true }).waitFor();
    }
    await p.screenshot({ path: `${out}/collected-${width}x${height}.png` });
    if (partial) {
      await dialog
        .getByText("받은 보상은 유지돼요. 남은 항목만 다시 확인할 수 있어요.", {
          exact: true,
        })
        .waitFor();
      const { eq } =
        await import("../../lib/db/node_modules/drizzle-orm/index.js");
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
        .where(eq(f.schema.dailyQuestAssignmentsTable.id, badAssignment.id));
      await dialog
        .getByRole("button", { name: "남은 보상 모두 받기", exact: true })
        .click();
      await dialog
        .getByRole("status")
        .filter({ hasText: "1건 수령 완료" })
        .waitFor();
      assert.equal(posts, 2);
    }
    await dialog.getByRole("button", { name: "확인", exact: true }).click();
    await p.waitForFunction(
      () =>
        document.activeElement?.getAttribute("data-testid") ===
        "button-claim-all-rewards",
    );
    await p.waitForFunction(() =>
      document.querySelector(".ko-home-wallet")?.textContent?.includes("62"),
    );
    const rows = await f.db.select().from(f.schema.userPackInventoryTable);
    assert.equal(
      rows.find((p) => p.userId === id && p.packDefinitionId === "normal-pack")
        .quantity,
      partial ? 21 : 20,
    );
    assert.equal(
      rows.find(
        (p) => p.userId === id && p.packDefinitionId === "champion-pack",
      ).quantity,
      1,
    );
    const users = await f.db.select().from(f.schema.usersTable);
    assert.equal(users.find((u) => u.id === id).currencyBalance, 62);
    assert.equal(
      await p.evaluate(
        (id) =>
          Object.keys(localStorage).filter((k) =>
            k.startsWith("ko-tutorial-proof-v1:" + id + ":"),
          ).length,
        id,
      ),
      0,
    );
    if (index === 0) {
      await p.goto(origin + "/daily-quests");
      await p.getByTestId("button-claim-all-rewards").click();
      await p
        .getByRole("dialog")
        .getByText("지금 받을 수 있는 미수령 보상이 없어요.", { exact: true })
        .waitFor();
      await p
        .getByRole("dialog")
        .getByRole("button", { name: "확인", exact: true })
        .click();
      await p.goto(origin + "/attendance");
      await p.getByTestId("button-claim-all-rewards").click();
      await p
        .getByRole("dialog")
        .getByText("지금 받을 수 있는 미수령 보상이 없어요.", { exact: true })
        .waitFor();
      assert.equal(
        (await f.db.select().from(f.schema.usersTable)).find((u) => u.id === id)
          .currencyBalance,
        62,
      );
    }
    assert.deepEqual(errors, []);
    const video = p.video();
    await ctx.close();
    if (video)
      await copyFile(await video.path(), out + "/claim-all-mobile.webm");
    results.push({
      width,
      height,
      oneClickCollectsAllSources: true,
      homeNoScroll: true,
      touchTarget44: true,
      duplicateClickOnePost: true,
      walletRefreshes: true,
      paidTutorialProofsCleared: true,
      lostReplyReadOnlyCheck: index === 1,
      partialRetryOnlyRemainder: partial,
      dailyAndAttendanceButtons: index === 0,
      productionWrites: 0,
      errors,
    });
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
  await f.close();
}
