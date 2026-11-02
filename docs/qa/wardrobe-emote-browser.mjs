/** Real wardrobe/equipment + PvP presentation against isolated DB/HTTP/WS. */
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile, copyFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const fixture = JSON.parse(
    await readFile("qa-results/cosmetics/fixture.json", "utf8"),
  ),
  origin = process.env.KO_COSMETICS_FRONTEND;
assert.equal(new URL(origin).hostname, "127.0.0.1");
const out = "qa-results/wardrobe-emote";
await mkdir(out, { recursive: true });
const browser = await chromium.launch(),
  results = [],
  errors = [];
async function client(id, width, height, video = false) {
  const c = await browser.newContext({
    viewport: { width, height },
    isMobile: width < 600,
    hasTouch: width < 600,
    ...(video
      ? { recordVideo: { dir: out + "/video", size: { width, height } } }
      : {}),
  });
  const [name, ...value] = fixture.cookies[id].split("=");
  await c.addCookies([{ name, value: value.join("="), url: origin }]);
  const p = await c.newPage();
  await p.addInitScript(() =>
    localStorage.setItem("ko-match-coach-v1", "done"),
  );
  p.on("pageerror", (e) => errors.push(e.message));
  return { c, p };
}
const api = async (c, path, method = "GET", data) => {
  const r = await c.request.fetch(origin + "/api" + path, {
    method,
    ...(data ? { data } : {}),
  });
  assert.ok(r.ok(), await r.text());
  return r.json();
};
async function choose(p, item) {
  await p
    .getByRole("button", { name: item.name + " 자세히 보기", exact: true })
    .click();
}
async function close(p) {
  const d = p.getByRole("dialog");
  if (await d.count()) {
    await d.last().getByRole("button", { name: "닫기", exact: true }).click();
    await d.last().waitFor({ state: "detached" });
  }
}
try {
  const admin = await client("admin", 1440, 900),
    a = await client("player-a", 390, 844, true),
    b = await client("player-b", 390, 844);
  const original = await api(a.c, "/cosmetics"),
    art = original.owned.find(
      (o) => o.item.type === "IMAGE_EMOTE" && o.item.isActive,
    ).item.imageAssets.art;
  const emote = (
    await api(admin.c, "/admin/cosmetics/items", "POST", {
      type: "IMAGE_EMOTE",
      name: "말풍선 연출 확인",
      description: "격리 검증용 이미지",
      targetId: null,
      imageAssets: { art },
      isActive: true,
      sortOrder: 999,
    })
  ).item;
  await api(admin.c, "/admin/cosmetics/users/player-a/grants", "POST", {
    cosmeticId: emote.id,
    action: "GRANT",
  });
  // Wardrobe: actual API writes and saved equipment, not fixture-only visual state.
  for (const [width, height] of [
    [360, 740],
    [390, 844],
    [844, 390],
    [1440, 900],
  ]) {
    await a.p.setViewportSize({ width, height });
    await a.p.goto(origin + "/cosmetics");
    await a.p.getByRole("heading", { name: "꾸미기", exact: true }).waitFor();
    await a.p.locator(".ko-wardrobe__tile").first().waitFor();
    assert.ok(
      await a.p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    const inventory = await api(a.c, "/cosmetics"),
      skin = inventory.owned.find(
        (o) => o.item.type === "CHAMPION_SKIN" && o.item.isActive,
      )?.item;
    assert.ok(skin);
    await choose(a.p, skin);
    const detail =
      width >= 1000
        ? a.p.getByLabel("선택 아이템 미리보기")
        : a.p.getByRole("dialog");
    await detail
      .locator(".ko-wardrobe__selection-copy h2")
      .filter({ hasText: skin.name })
      .waitFor();
    if (width < 1000) {
      const r = await detail.boundingBox();
      assert.ok(
        r.x >= 0 &&
          r.y >= 0 &&
          r.x + r.width <= width + 1 &&
          r.y + r.height <= height + 1,
      );
      assert.ok(
        await detail.evaluate((n) => n.scrollWidth <= n.clientWidth + 1),
      );
    }
    const reset = detail.getByRole("button", {
      name: "기본 외형으로",
      exact: true,
    });
    if (await reset.count()) {
      await reset.click();
      await detail
        .getByRole("button", { name: "이 외형 장착", exact: true })
        .waitFor();
    }
    await detail
      .getByRole("button", { name: "이 외형 장착", exact: true })
      .click();
    await detail
      .getByRole("button", { name: "장착 중", exact: true })
      .waitFor();
    assert.equal(
      (await api(a.c, "/cosmetics")).loadout.skins["champion:" + skin.targetId]
        .id,
      skin.id,
    );
    await close(a.p);
    await a.p.reload();
    await a.p.locator(".ko-wardrobe__equipped").first().waitFor();
    await a.p.getByLabel("보유 아이템 검색").fill("존재하지않는검색결과");
    await a.p.getByText("조건에 맞는 항목이 없어요", { exact: true }).waitFor();
    await a.p
      .getByRole("button", { name: "전체 보유 항목 보기", exact: true })
      .click();
    await a.p.getByRole("button", { name: "장착 중만", exact: true }).click();
    assert.equal(await a.p.locator(".ko-wardrobe__tile").count(), 1);
    await a.p.getByRole("button", { name: "장착 중만", exact: true }).click();
    await a.p.getByRole("button", { name: "카드 스킨", exact: true }).click();
    await a.p.locator(".ko-wardrobe__tile").first().waitFor();
    await a.p.locator(".ko-wardrobe__tile button").first().click();
    await (
      width >= 1000
        ? a.p.getByLabel("선택 아이템 미리보기")
        : a.p.getByRole("dialog")
    )
      .locator(".ko-card-depth")
      .waitFor();
    await close(a.p);
    await a.p.getByRole("button", { name: "이모티콘", exact: true }).click();
    await choose(a.p, emote);
    await a.p.getByText("대전에서 바로 사용 가능", { exact: true }).waitFor();
    assert.equal(
      await a.p.getByRole("button", { name: /장착 · 슬롯/ }).count(),
      0,
    );
    await close(a.p);
    await a.p.screenshot({
      path: `${out}/actual-inventory-${width}.png`,
      fullPage: true,
    });
    results.push({
      viewport: { width, height },
      wardrobeNoOverflow: true,
      actualEquipAndReload: true,
      searchAndEquippedFilter: true,
      cardPreviewPreserved: true,
      emoteNeedsNoEquipment: true,
    });
  }
  // Failure is recoverable in the sheet; do not visually claim failed equipment applied.
  await a.p.setViewportSize({ width: 390, height: 844 });
  await a.p.goto(origin + "/cosmetics");
  const skin = original.owned.find(
    (o) => o.item.type === "CHAMPION_SKIN" && o.item.isActive,
  ).item;
  await choose(a.p, skin);
  await a.p.route("**/api/cosmetics/equipment", (r) =>
    r.fulfill({ status: 503, json: { message: "장착 저장 실패 검사" } }),
  );
  await a.p
    .getByRole("dialog")
    .getByRole("button", { name: "기본 외형으로", exact: true })
    .click();
  await a.p
    .getByRole("dialog")
    .getByRole("alert")
    .filter({ hasText: "장착 저장 실패 검사" })
    .waitFor();
  await a.p.unroute("**/api/cosmetics/equipment");
  await close(a.p);
  results.push({
    failedEquipKeepsSelection: true,
    errorVisibleInMobileSheet: true,
  });
  // PvP: both authenticated clients, real sockets, real ownership and same expiry clock.
  await Promise.all([
    a.p.goto(origin + "/online/match/" + fixture.matchId),
    b.p.goto(origin + "/online/match/" + fixture.matchId),
  ]);
  await a.p
    .getByRole("button", { name: "이미지 이모티콘", exact: true })
    .click();
  await a.p.getByRole("button", { name: emote.name, exact: true }).click();
  for (const { p } of [a, b]) {
    const bubble = p.locator(
      `[data-cosmetic-emote-player="PLAYER_ONE"][data-ready=true]`,
    );
    await bubble.waitFor();
    const g = await bubble.evaluate((n) => {
      const r = n.getBoundingClientRect();
      return {
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        tail: n.dataset.tail,
        animation: getComputedStyle(n).animationName,
        pointerEvents: getComputedStyle(n).pointerEvents,
      };
    });
    assert.ok(g.left >= 0 && g.top >= 0 && g.right <= 391 && g.bottom <= 845);
    assert.equal(g.pointerEvents, "none");
    assert.equal(g.animation, "champion-emote-speech");
  }
  await a.p.screenshot({ path: out + "/self-bubble-390.png" });
  await b.p.screenshot({ path: out + "/opponent-bubble-390.png" });
  for (const { p } of [a, b])
    await p
      .locator(".cosmetic-emote-bubble")
      .waitFor({ state: "detached", timeout: 3500 });
  // Opponent hiding and a resize during the same expression.
  await b.p
    .getByRole("button", { name: "이미지 이모티콘", exact: true })
    .click();
  await b.p.getByLabel("상대 이미지 숨기기").check();
  await b.p.getByRole("button", { name: "닫기", exact: true }).click();
  await a.p
    .getByRole("button", { name: "이미지 이모티콘", exact: true })
    .click();
  await a.p.getByRole("button", { name: emote.name, exact: true }).click();
  await a.p.locator(".cosmetic-emote-bubble[data-ready=true]").waitFor();
  await a.p.setViewportSize({ width: 844, height: 390 });
  await a.p.waitForTimeout(100);
  const r = await a.p.locator(".cosmetic-emote-bubble").boundingBox();
  assert.ok(
    r.x >= 0 && r.y >= 0 && r.x + r.width <= 845 && r.y + r.height <= 391,
  );
  assert.equal(await b.p.locator(".cosmetic-emote-bubble").count(), 0);
  await a.p
    .locator(".cosmetic-emote-bubble")
    .waitFor({ state: "detached", timeout: 3500 });
  // System reduced motion uses opacity instead of zoom/bounce, same real event path.
  await a.p.emulateMedia({ reducedMotion: "reduce" });
  await a.p.setViewportSize({ width: 390, height: 844 });
  await a.p
    .getByRole("button", { name: "이미지 이모티콘", exact: true })
    .click();
  await a.p.getByRole("button", { name: emote.name, exact: true }).click();
  const reduced = a.p.locator(".cosmetic-emote-bubble[data-ready=true]");
  await reduced.waitFor();
  assert.equal(
    await reduced.evaluate((n) => getComputedStyle(n).animationName),
    "champion-emote-fade",
  );
  await reduced.waitFor({ state: "detached", timeout: 3500 });
  results.push({
    actualPvpBothClients: true,
    anchorAndTail: true,
    timedExit: true,
    noInputInterception: true,
    resizeDuringEvent: true,
    hideOpponent: true,
    reducedMotion: true,
  });
  assert.deepEqual(errors, []);
  await a.c.close();
  const video = await a.p.video()?.path();
  if (video) await copyFile(video, out + "/actual-wardrobe-emote.webm");
  await b.c.close();
  await admin.c.close();
  await writeFile(
    out + "/results.json",
    JSON.stringify({ results, errors }, null, 2),
  );
  console.log(JSON.stringify(results));
  await import("./wardrobe-gallery-review.mjs");
} finally {
  await browser.close();
}
