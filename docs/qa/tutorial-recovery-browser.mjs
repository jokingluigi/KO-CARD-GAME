import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
const browser = await chromium.launch(),
  results = [];
try {
  for (const mode of ["failure", "empty", "timeout"]) {
    const p = await browser.newPage({
        viewport: { width: 320, height: 568 },
        reducedMotion: "reduce",
      }),
      errors = [],
      writes = [];
    let recover = false,
      release;
    const blocked = new Promise((r) => (release = r));
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("dialog", (d) => d.accept());
    await p.addInitScript(() => {
      HTMLMediaElement.prototype.play = () => Promise.resolve();
    });
    await p.route("**/api/**", async (r) => {
      const path = new URL(r.request().url()).pathname;
      if (r.request().method() !== "GET") {
        writes.push(path);
        return r.fulfill({ status: 503, json: {} });
      }
      let json = {};
      if (path.includes("/storage/")) return r.abort();
      if (path.endsWith("/auth/me"))
        json = {
          authenticated: true,
          user: { id: "tutorial-recovery", nickname: "QA", role: "USER" },
        };
      else if (path.endsWith("/server-status"))
        json = { enabled: false, allowed: true };
      else if (path.endsWith("/cards")) {
        if (!recover && mode === "failure")
          return r.fulfill({ status: 503, json: {} });
        if (!recover && mode === "timeout") await blocked;
        json = mode === "empty" ? { cards: [] } : data.cards;
      } else if (path.endsWith("/champions"))
        json = mode === "empty" ? { champions: [] } : data.champions;
      else if (path.endsWith("/card-frames")) json = { frames: [] };
      return r.fulfill({ json });
    });
    await p.goto("http://127.0.0.1:5186/tutorial");
    if (mode === "empty") {
      await p.getByTestId("lesson-basics").waitFor();
      assert.equal(await p.getByTestId("lesson-basics").isDisabled(), true);
      await p
        .getByRole("button", { name: "규칙 설명 보기", exact: true })
        .click();
      await p.getByRole("dialog").waitFor();
      await p.keyboard.press("Escape");
    } else {
      await p.getByRole("alert").waitFor({ timeout: 16000 });
      if (mode === "timeout") {
        release();
        await p.waitForTimeout(200);
        assert.equal(await p.getByRole("alert").count(), 1);
      }
      recover = true;
      await p
        .getByRole("button", { name: "다시 불러오기", exact: true })
        .click();
      await p.getByTestId("lesson-basics").waitFor();
      await p.getByTestId("lesson-basics").click();
      await p.getByRole("button", { name: "직접 해보기", exact: true }).click();
      const opening = p
        .locator(".fixed")
        .filter({
          has: p.getByRole("button", { name: "그대로 시작", exact: true }),
        })
        .last();
      // Exercise a real opening exchange rather than a next-step button.
      await p.getByRole("button", { name: "그대로 시작", exact: true }).click();
      await p.locator('[data-goal="summon"]').waitFor();
      await p.locator(".ko-hand-card").first().click();
      await p.locator(".ko-player-board-row .ko-board-slot").first().click();
      await p.locator('[data-goal="turn"]').waitFor();
      await p
        .locator('[data-testid="tutorial-current-goal"][data-busy="false"]')
        .waitFor();
      await p.screenshot({ path: `${out}/recovery-${mode}-320.png` });
      const geom = await p
        .locator(".ko-player-board-row .ko-board-slot")
        .first()
        .boundingBox();
      assert.ok(geom.width >= 43 && geom.height >= 60, JSON.stringify(geom));
      await p
        .getByRole("button", { name: "훈련 안내 열기", exact: true })
        .click();
      await p
        .getByRole("button", { name: "이번 실습 다시 시작", exact: true })
        .click();
      await p.getByRole("button", { name: "직접 해보기", exact: true }).click();
      assert.equal(
        await p.getByTestId("tutorial-current-goal").getAttribute("data-goal"),
        "mulligan",
      );
      await p.getByRole("button", { name: "그대로 시작", exact: true }).click();
      await p
        .getByRole("button", { name: "훈련 안내 열기", exact: true })
        .click();
      await p
        .getByRole("button", { name: "실습 목록 · 나가기", exact: true })
        .click();
      assert.equal(
        await p.getByText("완료 · 다시 연습", { exact: true }).count(),
        0,
      );
    }
    assert.deepEqual(errors, []);
    assert.ok(writes.every((path) => path.endsWith("/ws-ticket")));
    results.push({
      mode,
      loadingFailureHandled: true,
      retryOrUnavailableExplained: true,
      ...(mode !== "empty"
        ? {
            failedImagesStillPlayable: true,
            smallViewportTargets: true,
            restartResets: true,
            exitDoesNotMarkComplete: true,
          }
        : {}),
      errors,
    });
    await p.close();
  }
  await writeFile(
    out + "/recovery-results.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
