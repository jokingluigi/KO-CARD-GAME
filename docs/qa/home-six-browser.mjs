/** Actual home and reward routes. Account/reward responses are isolated; no production writes. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const out = "qa-results/home-six";
await mkdir(out, { recursive: true });
const data = JSON.parse(
    await readFile("artifacts/ko-game/qa/art-direction-data.json", "utf8"),
  ),
  content = JSON.parse(
    await readFile(
      process.env.KO_QA_HOME_MAIN_CONTENT ??
        "/tmp/home-menu-public-content.json",
      "utf8",
    ).catch(() => JSON.stringify(data["main-content"])),
  );
const background = await readFile(
    process.env.KO_QA_HOME_BACKGROUND ?? "/tmp/home-menu-live-background.png",
  ).catch(() =>
    readFile(
      "artifacts/ko-game/qa/retro-font/assets/champion-5e4a5a52-ef2c-4e1a-9b76-a4edc9f79e2c.png",
    ),
  ),
  champ = {
    ...data.champions.champions[0],
    imageUrl:
      "/qa/retro-font/assets/champion-5e4a5a52-ef2c-4e1a-9b76-a4edc9f79e2c.png",
  };
const b = await chromium.launch(),
  results = [];
try {
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [740, 360],
    [1440, 900],
  ]) {
    const p = await b.newPage({
        viewport: { width, height },
        reducedMotion: "reduce",
      }),
      errors = [],
      writes = [],
      releases = [];
    p.on("pageerror", (e) => errors.push(e.message));
    let rewardMode = "pending",
      accountId = "six-user",
      ready;
    const readyForRelease = new Promise((r) => (ready = r));
    const notice = {
      id: "latest",
      title: "최신 업데이트 · 홈 메뉴 개선 안내",
      body: "새로운 소식을 확인해 주세요.",
      displayOrder: 0,
      createdAt: "2026-11-01",
      updatedAt: "2026-11-01",
    };
    const quest = {
      id: "claimable",
      title: "검증용 완료 퀘스트",
      description: "이미 완료한 조건",
      assignmentDate: "2026-11-01",
      slot: 0,
      objectiveType: "PLAY_MATCH",
      targetValue: 1,
      progress: 1,
      status: "COMPLETED",
      rewardType: "CURRENCY",
      rewardAmount: 100,
    };
    const bonus = {
        enabled: true,
        status: "COMPLETED",
        targetValue: 3,
        progress: 3,
        date: "2026-11-01",
        rewardType: "CURRENCY",
        rewardAmount: 100,
      },
      day = {
        dayIndex: 1,
        enabled: true,
        state: "AVAILABLE",
        rewardType: "CURRENCY",
        rewardAmount: 100,
      };
    await p.route("**/api/**", async (r) => {
      const req = r.request(),
        path = new URL(req.url()).pathname;
      let json = {};
      if (req.method() !== "GET") writes.push(path);
      if (path.includes("/storage/"))
        return r.fulfill({ body: background, contentType: "image/png" });
      if (path.endsWith("/auth/me"))
        json = {
          authenticated: true,
          user: {
            id: accountId,
            nickname: "홈 메뉴 검증 유저",
            role: "USER",
            currencyBalance: 580,
            prismBalance: 3026,
            championPrismBalance: 0,
          },
        };
      else if (path.endsWith("/server-status"))
        json = { enabled: false, allowed: true };
      else if (path.endsWith("/availability")) json = { enabled: true };
      else if (path.endsWith("/main-content"))
        json = {
          ...content,
          backgroundPlacement: {
            desktop: { x: 20, y: 60 },
            mobile: { x: 80, y: 40 },
          },
          notices: [
            {
              ...notice,
              id: "pinned",
              title: "이전 고정 공지",
              displayOrder: 999,
              createdAt: "2026-10-01",
            },
            notice,
          ],
        };
      else if (path === "/api/daily-quests" || path === "/api/attendance") {
        if (rewardMode === "pending") {
          await new Promise((resolve) => {
            releases.push(resolve);
            if (releases.length === 2) ready();
          });
        }
        if (rewardMode === "failed" && path === "/api/attendance")
          return r.fulfill({ status: 503, json: { message: "test timeout" } });
        json =
          path === "/api/daily-quests"
            ? {
                assignments: [
                  quest,
                  { ...quest, id: "already", status: "CLAIMED" },
                ],
                completionBonus: bonus,
                seasons: [],
              }
            : {
                today: "2026-11-01",
                nextDayIndex: 1,
                definitions: [day],
                claims: [],
              };
      } else if (path.endsWith("/decks"))
        json = {
          decks: [
            {
              id: "six-deck",
              name: "검증 출전 덱 · 전술 A",
              isSelected: true,
              isValid: true,
              championDefinitionId: champ.id,
              champion: champ,
              cards: [],
              cardDefinitionIds: [],
              invalidReasons: [],
              validationReasons: [],
              missingCardDefinitionIds: [],
            },
          ],
        };
      else if (path.endsWith("/cards")) json = { cards: [] };
      else if (path.endsWith("/champions")) json = { champions: [] };
      else if (path.endsWith("/card-frames")) json = { frames: [] };
      else if (path.endsWith("/active")) json = { match: null };
      else if (path === "/api/cosmetics")
        json = {
          owned: [],
          loadout: { version: 1, skins: {}, emotes: [], cardBack: null },
          cards: [],
          champions: [],
        };
      await r.fulfill({ json });
    });
    await p.goto("http://127.0.0.1:5186/");
    await p.getByTestId("button-battle-modes").waitFor();
    assert.equal(
      await p.locator("#home-reward-count").count(),
      0,
      "pending reward reads must not block home or invent a badge",
    );
    await readyForRelease;
    rewardMode = "ready";
    for (const release of releases) release();
    await p
      .locator("#home-reward-count")
      .filter({ hasText: "받을 보상 3건" })
      .waitFor();
    const banner = p.getByTestId("launch-deck-banner");
    await banner
      .getByRole("heading", { name: "검증 출전 덱 · 전술 A" })
      .waitFor();
    assert.match(await banner.innerText(), /현재 출전 중/);
    assert.match(await banner.innerText(), new RegExp(champ.name));
    await p.locator(".ko-home-notice-new").waitFor();
    assert.equal(
      await p.locator(".ko-home-notice-title").innerText(),
      notice.title,
    );
    await p.getByRole("button", { name: "공지 · 2건", exact: true }).click();
    await p.getByRole("dialog").waitFor();
    await p.keyboard.press("Escape");
    await p.getByRole("dialog").waitFor({ state: "detached" });
    assert.equal(await p.locator(".ko-home-notice-new").count(), 0);
    await p.getByRole("button", { name: "계정 메뉴", exact: true }).click();
    await p.getByRole("menuitem", { name: "닉네임 변경", exact: true }).click();
    await p.getByRole("dialog").waitFor();
    await p.getByLabel("새 닉네임").fill("테스트 이름");
    await p.keyboard.press("Escape");
    await p.getByRole("dialog").waitFor({ state: "detached" });
    await p.waitForFunction(() =>
      document.activeElement?.classList.contains("ko-home-account"),
    );
    await p.getByRole("button", { name: "계정 메뉴", exact: true }).click();
    await p.getByRole("menuitem", { name: "로그아웃", exact: true }).waitFor();
    await p.keyboard.press("Escape");
    await p.locator("[role=menu]").waitFor({ state: "detached" });
    await p.locator(".ko-home-background-image").evaluate((n) => n.decode());
    await p.evaluate(() => document.fonts.ready);
    const expected = width < 768 ? "80% 40%" : "20% 60%";
    assert.equal(
      await p
        .locator(".ko-home-background-image")
        .evaluate((n) => getComputedStyle(n).objectPosition),
      expected,
    );
    const controls = await p
      .locator(
        ".ko-battle-mode-button,.ko-home-account,.ko-lobby-shortcuts button,.ko-lobby-more",
      )
      .evaluateAll((ns) =>
        ns.map((n) => {
          const r = n.getBoundingClientRect();
          return {
            w: r.width,
            h: r.height,
            top: r.top,
            bottom: r.bottom,
            hit:
              document
                .elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
                ?.closest("button") === n,
          };
        }),
      );
    for (const c of controls) {
      assert.ok(
        c.w >= 44 && c.h >= 44 && c.top >= 0 && c.bottom <= height + 1,
        JSON.stringify(c),
      );
      assert.equal(c.hit, true);
    }
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight + 1,
      ),
    );
    await p.screenshot({ path: `${out}/home-${width}.png` });
    await p
      .getByRole("button", { name: "보상 · 상점 · 전체 메뉴 ▸", exact: true })
      .click();
    await p
      .getByRole("button", {
        name: "퀘스트 보상 2건 받으러 가기 ▸",
        exact: true,
      })
      .click();
    await p.waitForURL("**/daily-quests");
    quest.status = "CLAIMED";
    bonus.status = "CLAIMED";
    day.state = "CLAIMED";
    await p.goto("http://127.0.0.1:5186/");
    await p.getByTestId("button-battle-modes").waitFor();
    await p.waitForTimeout(100);
    assert.equal(await p.locator("#home-reward-count").count(), 0);
    assert.equal(
      await p.locator(".ko-home-notice-new").count(),
      0,
      "read state survives re-entry",
    );
    notice.updatedAt = "2026-11-02";
    rewardMode = "failed";
    await p.reload();
    await p.getByTestId("button-battle-modes").waitFor();
    await p.locator(".ko-home-notice-new").waitFor();
    assert.equal(await p.locator("#home-reward-count").count(), 0);
    await p.getByRole("button", { name: "공지 · 2건", exact: true }).click();
    await p.getByRole("dialog").waitFor();
    await p.keyboard.press("Escape");
    await p.getByRole("dialog").waitFor({ state: "detached" });
    accountId = "other-user";
    await p.reload();
    await p.getByTestId("button-battle-modes").waitFor();
    await p.locator(".ko-home-notice-new").waitFor();
    accountId = "six-user";
    await p.reload();
    await p.getByTestId("button-battle-modes").waitFor();
    await p.waitForTimeout(100);
    assert.equal(await p.locator(".ko-home-notice-new").count(), 0);
    assert.equal(writes.filter((x) => x.includes("/claim")).length, 0);
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      homeUsableBeforeRewards: true,
      claimableOnly: true,
      deckNamePriority: true,
      accountMenuAndNickname: true,
      accountNoticeIsolation: true,
      focusReturnsToAccount: true,
      latestNoticeAndReadPersistence: true,
      editedNoticeNew: true,
      deviceBackground: expected,
      rewardLinks: true,
      claimedAndFailedBadgeHidden: true,
      noRewardWrites: true,
      noScroll: true,
      min44Touch: true,
      errors,
    });
    await p.close();
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await b.close();
}
