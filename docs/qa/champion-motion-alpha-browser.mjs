import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const b = await chromium.launch();
try {
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.route("**/api/**", async (r) =>
    r.fulfill(
      r.request().url().includes("motion-alpha.png")
        ? {
            body: await readFile("qa-results/champion-motion/alpha.png"),
            contentType: "image/png",
          }
        : { json: { cards: [], frames: [] } },
    ),
  );
  await p.goto("http://127.0.0.1:5186/qa/black-gold-board.html");
  await p.evaluate(async () => {
    const rm = await import("/node_modules/.vite/deps/react.js"),
      React = rm.default ?? rm,
      dom = await import("/node_modules/.vite/deps/react-dom_client.js"),
      createRoot = dom.createRoot ?? dom.default.createRoot;
    const { ChampionSpriteVisual } =
      await import("/src/components/champion-sprite-visual.tsx");
    const src = "/api/storage/objects/uploads/cosmetics/motion-alpha.png";
    function Host() {
      const [cue, setCue] = React.useState();
      window.__alphaPlay = (kind) =>
        setCue({
          id: crypto.randomUUID(),
          kind,
          event: kind === "HEAL" ? "HEAL" : "HIT",
        });
      return React.createElement(
        "div",
        {
          id: "alpha-host",
          style: { width: 200, height: 280, background: "#191919" },
        },
        React.createElement(
          ChampionSpriteVisual,
          {
            preview: true,
            cue,
            identity: "alpha",
            self: true,
            image: src,
            display: { imageDisplayMode: "CONTAIN" },
          },
          React.createElement("img", {
            src,
            style: { width: "100%", height: "100%", objectFit: "contain" },
          }),
        ),
      );
    }
    const host = document.createElement("div");
    document.body.replaceChildren(host);
    createRoot(host).render(React.createElement(Host));
  });
  await p.waitForFunction(
    () => document.querySelector("#alpha-host img")?.naturalWidth === 200,
  );
  const surface = p.locator("#alpha-host");
  await surface.screenshot({
    path: "qa-results/champion-motion/alpha-before.png",
  });
  await p.evaluate(() => window.__alphaPlay("HIT"));
  await p.waitForFunction(
    () => document.querySelector(".ko-sprite-pose")?.getAnimations().length > 0,
  );
  await p.evaluate(() => {
    for (const a of document.querySelector(".ko-sprite-pose").getAnimations()) {
      a.pause();
      a.currentTime = 22;
    }
  });
  await surface.screenshot({
    path: "qa-results/champion-motion/alpha-hit.png",
  });
  await p.waitForTimeout(300);
  await p.evaluate(() => window.__alphaPlay("HEAL"));
  await p.waitForFunction(
    () =>
      document.querySelector(".ko-sprite-sheen")?.getAnimations().length > 0,
  );
  await p.evaluate(() => {
    for (const a of document
      .querySelector(".ko-sprite-visual")
      .getAnimations({ subtree: true })) {
      a.pause();
      if (a.effect?.getTiming().duration !== Infinity) a.currentTime = 225;
    }
  });
  await surface.screenshot({
    path: "qa-results/champion-motion/alpha-heal.png",
  });
  assert.equal(await surface.locator(".ko-sprite-sheen").count(), 1);
  console.log(
    "PASS shared visual component alpha captures (pixel verification required)",
  );
} finally {
  await b.close();
}
