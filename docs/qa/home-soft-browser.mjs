/** Actual home route; local account/deck responses and an unchanged public background. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const phase = process.env.KO_HOME_PHASE ?? "after",
  out = "qa-results/home-soft";
await mkdir(out, { recursive: true });
const data = JSON.parse(
  await readFile("artifacts/ko-game/qa/art-direction-data.json", "utf8"),
);
const content = JSON.parse(
  await readFile(
    process.env.KO_QA_HOME_MAIN_CONTENT ?? "/tmp/home-menu-public-content.json",
    "utf8",
  ).catch(() => JSON.stringify(data["main-content"])),
);
const background = await readFile(
  process.env.KO_QA_HOME_BACKGROUND ?? out + "/background.png",
).catch(() =>
  readFile(
    "artifacts/ko-game/qa/retro-font/assets/champion-5e4a5a52-ef2c-4e1a-9b76-a4edc9f79e2c.png",
  ),
);
const champ = {
  ...data.champions.champions[0],
  imageUrl:
    "/qa/retro-font/assets/champion-5e4a5a52-ef2c-4e1a-9b76-a4edc9f79e2c.png",
};
const b = await chromium.launch(),
  results = [];
try {
  for (const [width, height, selected] of [
    [390, 844, true],
    [390, 844, false],
    [1440, 900, true],
    [1440, 900, false],
    [740, 360, true],
  ]) {
    const p = await b.newPage({
        viewport: { width, height },
        reducedMotion: "reduce",
      }),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/api/**", async (r) => {
      const path = new URL(r.request().url()).pathname;
      let json = {};
      if (path.includes("/storage/"))
        return r.fulfill({
          body: background,
          contentType: "image/png",
        });
      if (path.endsWith("/auth/me"))
        json = {
          authenticated: true,
          user: {
            id: "home-soft",
            nickname: "조킹루이지",
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
          notices: [
            {
              id: "soft-notice",
              title: "게임 업데이트 안내",
              body: "새로운 소식을 확인해 주세요.",
              displayOrder: 0,
            },
          ],
        };
      else if (path.endsWith("/decks"))
        json = {
          decks: selected
            ? [
                {
                  id: "soft-deck",
                  name: "내 출전 덱",
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
              ]
            : [],
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
    await p.locator(".ko-main-menu__art-original").evaluate((n) => n.decode());
    await p.evaluate(() => document.fonts.ready);
    await p
      .getByTestId("launch-deck-banner")
      .getByRole("button", {
        name: selected ? "덱 변경" : "출전 덱 고르기",
        exact: true,
      })
      .waitFor();
    await p.waitForTimeout(100);
    const metrics = await p.evaluate(() => {
      const nodes = [
        ...document.querySelectorAll(
          ".ko-battle-mode-button,.ko-lobby-shortcuts button,.ko-lobby-more,.ko-home-mode-shortcuts button",
        ),
      ].filter((n) => n.getBoundingClientRect().height);
      return {
        scroll: document.documentElement.scrollHeight - innerHeight,
        widthOverflow: document.documentElement.scrollWidth - innerWidth,
        controls: nodes.map((n) => {
          const r = n.getBoundingClientRect();
          return {
            text: n.textContent.trim(),
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            hit:
              document
                .elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
                ?.closest("button") === n,
          };
        }),
      };
    });
    assert.ok(metrics.scroll <= 1, JSON.stringify(metrics));
    assert.ok(metrics.widthOverflow <= 1);
    for (const c of metrics.controls) {
      assert.ok(c.width >= 44 && c.height >= 44);
      assert.ok(c.y >= 0 && c.y + c.height <= height + 1);
      assert.equal(c.hit, true);
    }
    assert.deepEqual(errors, []);
    await p.screenshot({
      path: `${out}/${phase}-${width}-${selected ? "deck" : "empty"}.png`,
    });
    results.push({ width, height, selected, ...metrics, errors });
    await p.close();
  }
  await writeFile(
    `${out}/${phase}-results.json`,
    JSON.stringify(results, null, 2),
  );
  console.log("PASS " + phase + " home layouts");
} finally {
  await b.close();
}
