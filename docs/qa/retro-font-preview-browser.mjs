import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const { chromium } = await import(process.env.KO_QA_PLAYWRIGHT ?? "playwright");
const origin = process.env.KO_QA_ORIGIN ?? "http://127.0.0.1:5175";
const output = process.env.KO_RETRO_OUTPUT ?? "qa-results/retro-font-preview";
fs.mkdirSync(path.join(output, "individual"), { recursive: true });
const executablePath = process.env.KO_QA_CHROMIUM_EXECUTABLE;
const browser = await chromium.launch({
  headless: true,
  ...(executablePath
    ? { executablePath }
    : process.env.KO_QA_CHROME_CHANNEL === "chromium"
      ? {}
      : { channel: "chrome" }),
});
const newContext = browser.newContext.bind(browser);
browser.newContext = async (options) => {
  const context = await newContext(options);
  // All baseline faces are pinned and local. Do not depend on the production Google CSS import.
  await context.route("https://fonts.googleapis.com/**", (r) =>
    r.fulfill({ contentType: "text/css", body: "" }),
  );
  return context;
};
const scenes = ["menu", "cards", "champions", "battle", "readability"];
const modes = ["baseline", "full", "hybrid"];
const results = [],
  additional = [],
  errors = [],
  requests = [],
  quality = [];
const sceneUrl = (scene, mode) =>
  `${origin}/qa/retro-font-scene.html?scene=${scene}&mode=${mode}`;
async function ready(page, scene) {
  await page.waitForFunction(() => Boolean(window.__fontReview));
  await page
    .locator(
      scene === "menu"
        ? ".ko-main-menu__item"
        : scene === "cards"
          ? ".qa-card-gallery"
          : scene === "battle"
            ? ".ko-game-shell"
            : ".qa-gallery",
    )
    .first()
    .waitFor();
  await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('400 16px "NeoDunggeunmo Pro"', "한글ABC0123 +/−"),
      document.fonts.load('400 16px "Noto Sans KR"', "한글ABC0123"),
      document.fonts.load('700 32px "Oswald"', "KO CARD BATTLE"),
    ]);
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((i) =>
        i.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              i.onload = i.onerror = resolve;
            }),
      ),
    );
  });
  await page.waitForTimeout(200);
}
async function metrics(page) {
  return page.evaluate(() => {
    const rect = (e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const clipped = (selector) =>
      [...document.querySelectorAll(selector)]
        .filter((e) => {
          const r = e.getBoundingClientRect(),
            p = e.parentElement.getBoundingClientRect();
          return (
            e.scrollHeight > e.clientHeight + 1 ||
            r.top < p.top - 1 ||
            r.bottom > p.bottom + 1 ||
            e.scrollWidth > e.clientWidth + 1
          );
        })
        .map((e) => ({
          text: e.textContent,
          font: getComputedStyle(e).fontFamily,
          fontSize: getComputedStyle(e).fontSize,
        }));
    const targetSelectors = [
      ".ko-player-champion",
      ".ko-opponent-champion",
      ".ko-turn-end",
      ".ko-player-ability button",
      ".ko-player-board-row .ko-board-slot",
      ".ko-player-hand .ko-hand-card[role=button]",
      "[data-touch-inspect-trigger]",
    ];
    return {
      width: innerWidth,
      height: innerHeight,
      dpr: devicePixelRatio,
      scale: visualViewport.scale,
      scrollWidth: document.documentElement.scrollWidth,
      font: getComputedStyle(document.body).fontFamily,
      fontSynthesis: getComputedStyle(document.body).fontSynthesis,
      candidateLoaded: document.fonts.check(
        '400 16px "NeoDunggeunmo Pro"',
        "한글 ABC 0123 +/−",
      ),
      logo: [
        ...document.querySelectorAll(
          ".ko-main-menu__logo,.ko-main-menu__tagline",
        ),
      ].map((e) => ({
        text: e.textContent,
        font: getComputedStyle(e).fontFamily,
        weight: getComputedStyle(e).fontWeight,
        tracking: getComputedStyle(e).letterSpacing,
      })),
      images: [...document.images].map((e) => ({
        src: new URL(e.src).pathname,
        loaded: e.complete && e.naturalWidth > 0,
        opacity: getComputedStyle(e).opacity,
      })),
      clippedEffects: clipped(".line-clamp-6:not([data-qa-compact-rules])"),
      intentionalTruncations: [
        ...document.querySelectorAll('[data-qa-truncated="true"]'),
      ].map((e) => ({
        text: e.textContent,
        marker: getComputedStyle(e, "::after").content,
      })),
      clippedNames: clipped(".line-clamp-2"),
      targets: Object.fromEntries(
        targetSelectors.map((s) => [
          s,
          [...document.querySelectorAll(s)].map(rect),
        ]),
      ),
      state: JSON.stringify(window.__fontReview.state),
      readable: [
        ...document.querySelectorAll(".qa-readable,.qa-champion-copy p"),
      ].map((e) => ({
        font: getComputedStyle(e).fontFamily,
        size: getComputedStyle(e).fontSize,
        scrollWidth: e.scrollWidth,
        width: e.clientWidth,
      })),
      syntheticWeightCandidates: [
        ...document.querySelectorAll("body *"),
      ].filter(
        (e) =>
          !e.closest(".ko-main-menu__logo,.ko-main-menu__tagline") &&
          getComputedStyle(e).fontFamily.includes("NeoDunggeunmo") &&
          getComputedStyle(e).fontWeight !== "400",
      ).length,
    };
  });
}
try {
  for (const [width, height] of [
    [360, 740],
    [375, 812],
    [390, 844],
    [412, 915],
    [1440, 900],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: width < 800,
      hasTouch: width < 800,
      reducedMotion: "reduce",
    });
    context.on("request", (r) => {
      const u = new URL(r.url());
      if (u.origin !== origin && !u.hostname.includes("fonts.googleapis.com"))
        requests.push({ url: r.url(), method: r.method() });
      if (r.method() !== "GET")
        requests.push({ url: r.url(), method: r.method() });
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    for (const scene of scenes) {
      let baseline;
      for (const mode of modes) {
        await page.goto(sceneUrl(scene, mode));
        await ready(page, scene);
        const m = await metrics(page);
        assert.equal(
          m.scrollWidth,
          width,
          `${width}/${scene}/${mode}: horizontal overflow`,
        );
        assert.ok(m.candidateLoaded);
        assert.ok(
          m.images.every((i) => i.loaded),
          `${scene}: artwork must load`,
        );
        assert.equal(m.syntheticWeightCandidates, 0);
        if (mode !== "baseline") {
          assert.ok(m.font.includes("NeoDunggeunmo Pro"));
          assert.equal(m.fontSynthesis, "none");
        } else baseline = m;
        assert.equal(
          m.state,
          baseline.state,
          "font must not mutate game state",
        );
        assert.deepEqual(
          m.images,
          baseline.images,
          "same art, opacity and frames",
        );
        assert.deepEqual(m.logo, baseline.logo, "logo must remain unchanged");
        if (scene === "readability" && mode === "hybrid")
          assert.ok(m.readable.every((e) => e.font.includes("Noto Sans KR")));
        if (m.clippedEffects.length || m.clippedNames.length)
          quality.push({
            width,
            height,
            scene,
            mode,
            status: "VISUAL_FAIL",
            reason: "Clipped text in fixed card frame",
            effects: m.clippedEffects,
            names: m.clippedNames,
          });
        const differences = [];
        if (scene === "battle" && mode !== "baseline")
          for (const [selector, rects] of Object.entries(m.targets))
            for (const [i, r] of rects.entries())
              for (const axis of ["x", "y", "width", "height"])
                if (Math.abs(r[axis] - baseline.targets[selector][i][axis]) > 1)
                  differences.push({
                    selector,
                    index: i,
                    axis,
                    before: baseline.targets[selector][i][axis],
                    after: r[axis],
                  });
        if (differences.length)
          quality.push({
            width,
            height,
            scene,
            mode,
            status: "VISUAL_FAIL",
            reason: "Touch target geometry changed with font metrics",
            differences,
          });
        if (width === 390 || width === 1440)
          await page.screenshot({
            path: path.join(
              output,
              "individual",
              `${scene}-${mode}-${width}.png`,
            ),
            fullPage: true,
          });
        results.push({
          width,
          height,
          scene,
          mode,
          status: "TECHNICAL_PASS",
          metrics: m,
        });
        console.log(`${width}x${height} ${scene} ${mode}: rendered`);
      }
    }
    if (width === 390) {
      for (const mode of modes) {
        await page.goto(sceneUrl("cards", mode));
        await ready(page, "cards");
        await page
          .getByRole("button", { name: "카드 상세정보 열기", exact: true })
          .tap();
        const dialog = page.getByRole("dialog");
        await dialog.waitFor();
        assert.match(await dialog.textContent(), /좀비/);
        assert.ok((await dialog.boundingBox()).width <= width);
        await page.screenshot({
          path: path.join(output, "individual", `popup-${mode}-390.png`),
        });
        await page.keyboard.press("Escape");
        additional.push({
          case: "actual-card-detail-dialog",
          mode,
          status: "PASS",
        });
      }
      for (const mode of modes) {
        await page.goto(sceneUrl("battle", mode));
        await ready(page, "battle");
        await page
          .getByRole("button", { name: "내 챔피언 감정표현 열기" })
          .tap();
        const menu = page.getByRole("menu", { name: "챔피언 감정표현" });
        await menu.waitFor();
        const items = await menu.getByRole("menuitem").all();
        assert.equal(items.length, 6);
        for (const i of items) assert.ok(await i.isVisible());
        await items[0].tap();
        additional.push({ case: "six-emote-options", mode, status: "PASS" });
      }
    }
    await context.close();
  }
  for (const dpr of [1, 2, 3]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: dpr,
      isMobile: true,
      hasTouch: true,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    for (const mode of ["full", "hybrid"]) {
      await page.goto(sceneUrl("readability", mode));
      await ready(page, "readability");
      for (const scale of [1, 1.25, 1.5]) {
        const cdp = await context.newCDPSession(page);
        await cdp.send("Emulation.setPageScaleFactor", {
          pageScaleFactor: scale,
        });
        assert.ok(
          Math.abs((await page.evaluate(() => visualViewport.scale)) - scale) <
            0.01,
        );
        if (scale === 1 && dpr > 1)
          await page.screenshot({
            path: path.join(
              output,
              "individual",
              `readability-${mode}-dpr${dpr}.png`,
            ),
            fullPage: true,
          });
        additional.push({
          case: "DPR-and-visual-zoom",
          dpr,
          mode,
          scale,
          status: "PASS",
        });
        await cdp.detach();
      }
    }
    await context.close();
  }
  const reviewContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const reviewPage = await reviewContext.newPage();
  await reviewPage.goto(origin + "/qa/retro-font-review.html");
  await reviewPage.locator("iframe").first().waitFor();
  assert.equal(await reviewPage.locator("iframe").count(), 3);
  for (let i = 0; i < 3; i++) {
    const frame = reviewPage.locator("iframe").nth(i).contentFrame();
    await frame.locator(".ko-main-menu__item").first().waitFor();
    await frame.locator("body").evaluate(() => document.fonts.ready);
  }
  assert.equal(
    await reviewPage.evaluate(() => document.documentElement.scrollWidth),
    390,
  );
  await reviewPage.screenshot({
    path: path.join(output, "review-page.png"),
    fullPage: true,
  });
  await reviewContext.close();
  additional.push({ case: "mobile-review-page", status: "PASS" });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.route("**/api/**", (r) =>
    r.fulfill({
      json: { authenticated: false, user: null, enabled: false, allowed: true },
    }),
  );
  await page.goto(origin + "/");
  await page.waitForTimeout(500);
  assert.equal(
    await page.evaluate(() =>
      document.documentElement.hasAttribute("data-font-mode"),
    ),
    false,
  );
  assert.equal(
    await page.evaluate(() =>
      [...document.fonts].some((f) => f.family === "NeoDunggeunmo Pro"),
    ),
    false,
  );
  additional.push({ case: "normal-app-excludes-preview-font", status: "PASS" });
  await context.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  for (const row of results) {
    row.metrics.stateSha256 = crypto
      .createHash("sha256")
      .update(row.metrics.state)
      .digest("hex");
    delete row.metrics.state;
  }
  const report = {
    generatedAt: new Date().toISOString(),
    sourceCommit: "8d3f417ff062cc8d5390e27485d2b12cf0c9bf3d",
    snapshot: "20261014-predeploy-admin",
    technical: {
      matrix: results.length,
      pass: results.length,
      additional: additional.length,
      errors,
      unexpectedRequests: requests,
    },
    physicalSmartphoneTest: "NOT_RUN",
    visualApproval: "PENDING",
    visualFailures: quality,
    results,
    additional,
  };
  fs.writeFileSync(
    path.join(output, "results.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      matrix: results.length,
      additional: additional.length,
      visualFailures: quality.length,
      visualApproval: "PENDING",
    }),
  );
} finally {
  await browser.close();
}
