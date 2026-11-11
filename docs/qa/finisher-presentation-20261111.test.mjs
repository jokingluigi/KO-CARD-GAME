/** Real admin endpoints and isolated DB. Existing fixture images are treated as already registered assets. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTutorialFixture } from "./tutorial-rewards-fixture.mjs";
import { defaultSpritePlacement as p } from "../../lib/cosmetics/src/index.ts";
let f;
const frame = (name) => ({
  url: "/api/storage/objects/uploads/cosmetics/" + name + ".png",
  self: { ...p },
  opponent: { ...p, flip: true },
});
const root = {
  version: 1,
  frames: { default: frame("registered-base"), low: frame("registered-low") },
  reactions: {},
  finishers: {
    "option-1": {
      sprite: {
        version: 1,
        frames: { default: frame("registered-a") },
        reactions: {},
      },
      portrait: frame("registered-profile-a"),
    },
    "option-2": {
      sprite: {
        version: 1,
        frames: { default: frame("registered-b") },
        reactions: {},
      },
    },
  },
};
before(async () => {
  f = await startTutorialFixture();
  await f.db
    .update(f.schema.championsTable)
    .set({
      presentationLines: { BATTLE_SPRITE: root },
      questCondition: {
        finisherChoices: [
          { id: "option-1", name: "선택지 A" },
          { id: "option-2", name: "선택지 B" },
        ],
      },
    })
    .where(
      (await import("../../lib/db/node_modules/drizzle-orm/index.js")).eq(
        f.schema.championsTable.id,
        "reward-champion",
      ),
    );
  await f.db
    .insert(f.schema.gameMediaTable)
    .values({
      id: "branch-music",
      mediaType: "BGM",
      name: "선택지 음악",
      assetId: "/objects/uploads/game-bgm/registered.mp3",
      assetUrl: "/api/storage/objects/uploads/game-bgm/registered.mp3",
      fileName: "registered.mp3",
      contentType: "audio/mpeg",
      gameEnabled: false,
    });
});
after(async () => await f.close());
const request = async (path, body, method = "PATCH") => {
  const r = await fetch(f.origin + "/api" + path, {
    method,
    headers: { Cookie: f.cookie, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
};
test("branch images, music, size and labels save/reenter through authenticated admin routes, including conflict rejection and media references", async () => {
  let result = await request("/admin/battle-sprites", undefined, "GET");
  assert.equal(result.status, 200);
  let target = result.body.targets.find((t) => t.id === "reward-champion");
  assert.equal(target.finisherChoices.length, 2);
  const changed = structuredClone(root);
  changed.finishers["option-1"].music = {
    name: "선택지 음악",
    assetUrl: "/api/storage/objects/uploads/game-bgm/registered.mp3",
    volume: 63,
  };
  changed.finishers["option-2"].sprite.frames.default.self.scale = 1.3;
  result = await request("/admin/battle-sprites/default/reward-champion", {
    sprite: changed,
    revision: target.revision,
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  const saved = result.body;
  result = await request("/admin/battle-sprites", undefined, "GET");
  target = result.body.targets.find((t) => t.id === "reward-champion");
  assert.deepEqual(target.config, saved.config);
  assert.equal(
    target.config.finishers["option-2"].sprite.frames.default.self.scale,
    1.3,
  );
  assert.equal(
    (
      await request("/admin/battle-sprites/default/reward-champion", {
        sprite: root,
        revision: "stale",
      })
    ).status,
    409,
  );
  const invalid = structuredClone(changed);
  invalid.finishers["option-1"].music.assetUrl = "/api/storage/unknown.mp3";
  assert.equal(
    (
      await request("/admin/battle-sprites/default/reward-champion", {
        sprite: invalid,
        revision: target.revision,
      })
    ).status,
    400,
  );
  const image = structuredClone(changed);
  image.finishers["option-2"].sprite.frames.default.url =
    "https://example.invalid/unregistered.png";
  assert.equal(
    (
      await request("/admin/battle-sprites/default/reward-champion", {
        sprite: image,
        revision: target.revision,
      })
    ).status,
    400,
  );
  assert.equal(
    (await request("/admin/game-media/branch-music", undefined, "DELETE"))
      .status,
    409,
  );
  const clear = structuredClone(changed);
  delete clear.finishers["option-1"].portrait;
  delete clear.finishers["option-1"].music;
  result = await request("/admin/battle-sprites/default/reward-champion", {
    sprite: clear,
    revision: target.revision,
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.config.finishers["option-1"].portrait, undefined);
  assert.ok(result.body.config.finishers["option-2"].sprite.frames.default);
});

test("mobile administrator selects a branch, edits its scale, saves and re-enters using the real API", async () => {
  const { chromium } = await import("./black-gold-playwright.mjs");
  const { mkdir, readFile } = await import("node:fs/promises");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const origin = "http://127.0.0.1:5186";
  const [name, ...v] = f.cookie.split("=");
  await page.context().addCookies([{ name, value: v.join("="), url: origin }]);
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/storage/")) {
      await route.fulfill({
        contentType: "image/png",
        body: await readFile(
          "artifacts/ko-game/qa/retro-font/assets/champion-5e4a5a52-ef2c-4e1a-9b76-a4edc9f79e2c.png",
        ),
      });
      return;
    }
    const response = await route.fetch({
      url: f.origin + url.pathname + url.search,
    });
    await route.fulfill({ response });
  });
  try {
    await page.goto(
      origin + "/admin/battle-sprites?target=default:reward-champion",
    );
    await page.getByLabel("편집할 피니셔 연출").selectOption("option-2");
    await page.getByLabel("스프라이트 scale", { exact: true }).fill("1.2");
    const response = page.waitForResponse(
      (r) =>
        r.url().includes("/admin/battle-sprites/default/") &&
        r.request().method() === "PATCH",
    );
    await page
      .getByRole("button", { name: "스프라이트 저장", exact: true })
      .click();
    assert.equal((await response).status(), 200);
    await page.reload();
    await page.getByLabel("편집할 피니셔 연출").selectOption("option-2");
    assert.equal(
      Number(
        await page.getByLabel("스프라이트 scale", { exact: true }).inputValue(),
      ),
      1.2,
    );
    await mkdir("docs/qa/20261111-balance-content/branches", {
      recursive: true,
    });
    await page.screenshot({
      path: "docs/qa/20261111-balance-content/branches/admin-mobile.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
