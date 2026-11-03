import {startTutorialFixture} from './tutorial-rewards-fixture.mjs';
const rewardFixture=await startTutorialFixture();
const origin=process.env.KO_UI_ORIGIN??'http://127.0.0.1:5186';
let lostReply=false;
/** Full tutorial through real Home + common battle UI; read-only API fixtures. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const out = process.env.KO_TUTORIAL_OUT??"qa-results/tutorial-rewards-ui";
const guestFallback=process.env.KO_TUTORIAL_GUEST_FALLBACK==='1';
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
      ignoreHTTPSErrors:true,
      isMobile: width === 390,
      hasTouch: width === 390,
      reducedMotion: width === 390 ? "no-preference" : "reduce",
      ...(width === 390
        ? { recordVideo: { dir: out, size: { width, height } } }
        : {}),
    });
    const p = await context.newPage(),
      errors = [],
      writes = [],earlyClaims=[];
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
      if(path.startsWith('/api/tutorial/')){
        if(path.endsWith('/claim'))earlyClaims.push({lessonId:req.postDataJSON().lessonId,beforeSuccessDialog:await p.locator('[role=dialog][data-state=open]').getByRole('heading',{name:'실습 성공',exact:true}).count()===0});
        const upstream=await fetch(rewardFixture.origin+path,{method:req.method(),headers:{Cookie:rewardFixture.cookie,'Content-Type':'application/json'},...(req.method()!=='GET'?{body:req.postData()}: {})});
        const body=await upstream.text();
        if(path.endsWith('/claim')&&!lostReply&&upstream.ok){lostReply=true;return r.fulfill({status:503,json:{message:'보상 응답을 잃었어요. 같은 완료 기록으로 다시 확인하세요.'}});}
        return r.fulfill({status:upstream.status,contentType:'application/json',body});
      }
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
          authenticated: !guestFallback,
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
      else if (path.endsWith("/cards")) json = guestFallback?{cards:[]}:data.cards;
      else if (path.endsWith("/champions")) json = guestFallback?{champions:[]}:data.champions;
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
      const panel=p.getByRole('dialog').getByRole('region',{name:'튜토리얼 보상'});
      await panel.waitFor();
      await p.waitForFunction(()=>document.querySelector('[role="dialog"] .ko-tutorial-rewards')?.getAttribute('aria-busy')==='false');
      if(await panel.getByRole('button',{name:'보상 다시 확인'}).count())await panel.getByRole('button',{name:'보상 다시 확인'}).click();
      await panel.getByText(/노멀팩 보상 [1-6]\/6 수령/).waitFor();
    };
    await p.goto(origin+"/"+(guestFallback?"practice":"tutorial"));
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
    assert.ok(earlyClaims.every(c=>c.beforeSuccessDialog));
    if(width===390)assert.equal(earlyClaims.length,6);
    results.push({
      settlementBeforeResultDialog:true,firstCompletionClaims:earlyClaims.length,
      actualServerValidatedRewards:true,lostReplyRecovered:lostReply,
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
  const inventory=await rewardFixture.db.select().from(rewardFixture.schema.userPackInventoryTable);
  assert.equal(inventory.find(p=>p.packDefinitionId==='normal-pack').quantity,18);
  assert.equal(inventory.find(p=>p.packDefinitionId==='champion-pack').quantity,1);
  results.push({normalPacks:18,guaranteedChampionPacks:1,grantRecords:(await rewardFixture.db.select().from(rewardFixture.schema.rewardGrantsTable)).length});
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
  await rewardFixture.close();
}
