/** Full tutorial through real Home + common battle UI; read-only API fixtures. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const out = "qa-results/tutorial";
await mkdir(out, { recursive: true });
const data = JSON.parse(
  await readFile("artifacts/ko-game/qa/art-direction-data.json", "utf8"),
);
if (process.env.KO_TUTORIAL_LIVE_FIXTURES === "1") {
  data.cards = JSON.parse(
    await readFile("/tmp/tutorial-live-cards.json", "utf8"),
  );
  data.champions = JSON.parse(
    await readFile("/tmp/tutorial-live-champions.json", "utf8"),
  );
}
const images = new Map();
for (const c of [...data.cards.cards, ...data.champions.champions]) {
  try {
    images.set(
      new URL(c.imageUrl, "https://ko-card-game-vr69.onrender.com").pathname,
      await readFile("/tmp/tutorial-art/" + c.id + ".png"),
    );
  } catch {}
}
const browser = await chromium.launch(),
  results = [];
try {
  for (const [width, height] of [
    [390, 844],
    [740, 360],
    [1440, 900],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: width === 390,
      hasTouch: width === 390,
      reducedMotion: width === 390 ? "no-preference" : "reduce",
      ...(width === 390
        ? { recordVideo: { dir: out, size: { width, height } } }
        : {}),
    });
    const p = await context.newPage(),
      errors = [],
      writes = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("dialog", (d) => d.accept());
    await p.addInitScript(() => {
      HTMLMediaElement.prototype.play = () => Promise.resolve();
      HTMLMediaElement.prototype.pause = () => {};
      localStorage.setItem("ko-match-coach-v1", "done");
    });
    await p.route("**/api/**", async (r) => {
      const req = r.request(),
        path = new URL(req.url()).pathname;
      if (req.method() !== "GET") {
        writes.push(path);
        return r.fulfill({
          status: 503,
          json: { message: "QA blocks writes" },
        });
      }
      if (images.has(path))
        return r.fulfill({ contentType: "image/png", body: images.get(path) });
      if (path.includes("/storage/")) return r.abort();
      let json = {};
      if (path.endsWith("/auth/me"))
        json = {
          authenticated: true,
          user: {
            id: "tutorial-user",
            role: "USER",
            nickname: "연습생",
            currencyBalance: 0,
            prismBalance: 0,
          },
        };
      else if (path.endsWith("/server-status"))
        json = { enabled: false, allowed: true };
      else if (path.endsWith("/cards")) json = data.cards;
      else if (path.endsWith("/champions")) json = data.champions;
      else if (path.endsWith("/card-frames")) json = data["card-frames"];
      else if (path.endsWith("/main-content"))
        json = { notices: [], battleMenuArtwork: null };
      else if (path.endsWith("/decks")) json = { decks: [] };
      return r.fulfill({ json });
    });
    const goal = p.getByTestId("tutorial-current-goal");
    const idle = () =>
      p
        .locator('[data-testid="tutorial-current-goal"][data-busy="false"]')
        .waitFor({ timeout: 30000 });
    const courses = async () => {
      await p
        .getByRole("button", { name: "실습 목록 · 나가기", exact: true })
        .click();
      await p.getByRole("heading", { name: "직접 배우는 카드 전투" }).waitFor();
    };
    const intro = async (id) => {
      await p.getByTestId("lesson-" + id).click();
      await p.getByRole("button", { name: "직접 해보기", exact: true }).click();
    };
    const success = async () => {
      await p
        .getByRole("dialog")
        .getByRole("heading", { name: "실습 성공", exact: true })
        .waitFor({ timeout: 30000 });
    };
    await p.goto("http://127.0.0.1:5186/tutorial");
    await p.getByTestId("lesson-basics").waitFor();
    assert.equal(await p.getByTestId("lesson-basics").isEnabled(), true);
    await p.screenshot({ path: `${out}/courses-${width}.png` });
    await intro("basics");
    await p.getByRole("button", { name: "그대로 시작", exact: true }).click();
    await p.locator('[data-goal="summon"]').waitFor();
    // Unrelated actions neither spend resources nor advance the lesson.
    assert.equal(await p.locator(".ko-turn-end").isDisabled(), true);
    assert.equal(await goal.getAttribute("data-goal"), "summon");
    await p.locator(".ko-hand-card").first().click();
    await p.locator(".ko-player-board-row .ko-board-slot").first().click();
    await p.locator('[data-goal="turn"]').waitFor();
    await idle();
    await p.screenshot({ path: `${out}/summoned-${width}.png` });
    await p.locator(".ko-turn-end").click();
    if (
      await p
        .getByRole("button", { name: "남은 행동이 있지만 턴 종료 확정" })
        .count()
    )
      await p
        .getByRole("button", { name: "남은 행동이 있지만 턴 종료 확정" })
        .click();
    await p.locator('[data-goal="finish"]').waitFor();
    await idle();
    await p.locator(".ko-player-board-row .ko-board-slot").first().click();
    await p
      .getByRole("button", { name: "상대 챔피언 대상", exact: true })
      .click();
    await success();
    await p.screenshot({ path: `${out}/basic-victory-${width}.png` });
    await courses();
    await intro("combat");
    await idle();
    await p.locator(".ko-player-board-row .ko-board-slot").first().click();
    await p.locator(".ko-opponent-board-row .ko-board-slot").first().click();
    await p.locator('[data-goal="combatturn"]').waitFor();
    await idle();
    await p.locator(".ko-turn-end").click();
    if (
      await p
        .getByRole("button", { name: "남은 행동이 있지만 턴 종료 확정" })
        .count()
    )
      await p
        .getByRole("button", { name: "남은 행동이 있지만 턴 종료 확정" })
        .click();
    await p.locator('[data-goal="combatretire"]').waitFor();
    await idle();
    await p.locator(".ko-player-board-row .ko-board-slot").first().click();
    await p.locator(".ko-opponent-board-row .ko-board-slot").first().click();
    await success();
    await courses();
    await intro("rush");
    await idle();
    await p.locator(".ko-hand-card").first().click();
    await p.locator(".ko-player-board-row .ko-board-slot").first().click();
    await p.locator('[data-goal="rushattack"]').waitFor();
    await idle();
    await p.locator(".ko-player-board-row .ko-board-slot").first().click();
    await p
      .getByRole("button", { name: "상대 챔피언 대상", exact: true })
      .click();
    await success();
    await courses();
    await intro("spell");
    await idle();
    await p.locator(".ko-hand-card").first().click();
    await p.getByRole("button", { name: "사용", exact: true }).click();
    await p.getByTestId("effect-target-focus").waitFor();
    await p.screenshot({ path: `${out}/spell-target-${width}.png` });
    await p.getByRole("button", { name: "선택 취소", exact: true }).click();
    await p.locator('[data-goal="spell"]').waitFor();
    assert.equal(await p.locator(".ko-hand-card").count(), 1);
    await idle();
    await p.locator(".ko-hand-card").first().click();
    await p.getByRole("button", { name: "사용", exact: true }).click();
    await p.getByTestId("effect-target-focus").waitFor();
    await p.locator(".ko-opponent-board-row .ko-board-slot").first().click();
    await success();
    await courses();
    await intro("active");
    await idle();
    await p.getByRole("button", { name: "액티브", exact: true }).click();
    await success();
    await courses();
    await intro("champion");
    await idle();
    await p.locator(".ko-champion-ability").click();
    await success();
    await p.screenshot({ path: `${out}/quest-complete-${width}.png` });
    await courses();
    assert.equal(
      await p.getByText("완료 · 다시 연습", { exact: true }).count(),
      6,
    );
    await p.reload();
    await p.getByTestId("lesson-basics").waitFor();
    assert.equal(
      await p.getByText("완료 · 다시 연습", { exact: true }).count(),
      6,
    );
    await intro("basics");
    assert.equal(await goal.getAttribute("data-goal"), "mulligan");
    // Rotating preserves current lesson and keeps targets in the viewport.
    await p.setViewportSize({ width: height, height: width });
    await p.waitForTimeout(120);
    await p.getByRole("button", { name: "그대로 시작", exact: true }).click();
    await p.locator('[data-goal="summon"]').waitFor();
    const from = await p.locator(".ko-hand-card").first().boundingBox(),
      to = await p
        .locator(".ko-player-board-row .ko-board-slot")
        .first()
        .boundingBox();
    const a = { x: from.x + from.width * 0.5, y: from.y + from.height * 0.45 },
      z = { x: to.x + to.width * 0.5, y: to.y + to.height * 0.5 };
    if (width === 390) {
      const cd = await context.newCDPSession(p);
      await cd.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [a],
      });
      for (let i = 1; i <= 12; i++) {
        await cd.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            {
              x: a.x + ((z.x - a.x) * i) / 12,
              y: a.y + ((z.y - a.y) * i) / 12,
            },
          ],
        });
        await p.waitForTimeout(16);
      }
      await cd.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    } else {
      await p.mouse.move(a.x, a.y);
      await p.mouse.down();
      await p.mouse.move(z.x, z.y, { steps: 12 });
      await p.mouse.up();
    }
    await p.locator('[data-goal="turn"]').waitFor();
    await idle();
    const metrics = await p.evaluate(() => ({
      noScroll: document.documentElement.scrollHeight <= innerHeight + 1,
      guide: document
        .querySelector('[data-testid="tutorial-current-goal"]')
        .getBoundingClientRect()
        .toJSON(),
    }));
    assert.ok(metrics.noScroll);
    assert.ok(
      metrics.guide.y >= 0 && metrics.guide.y + metrics.guide.height <= width,
    );
    assert.deepEqual(errors, []);
    assert.ok(
      writes.every((path) => path.endsWith("/ws-ticket")),
      JSON.stringify(writes),
    );
    const video = p.video();
    await p.close();
    await context.close();
    if (video)
      await copyFile(
        await video.path(),
        out + "/tutorial-mobile-playthrough.webm",
      );
    results.push({
      width,
      height,
      sixLessonsCompletedThroughActualUi: true,
      noOwnedDeckRequired: true,
      wrongActionGuard: true,
      cancelThenCommit: true,
      actualActiveAndQuest: true,
      progressPersists: true,
      newLessonResets: true,
      rotationAndNoScroll: true,
      actualDragAfterRotation: width === 390 ? "touch" : "mouse",
      productionWritesSent: 0,
      blockedPresenceRequests: writes.length,
      errors,
    });
    console.log("PASS tutorial viewport", width, height);
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
