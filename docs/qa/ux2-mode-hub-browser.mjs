/** Actual navigation and /online page, including unavailable/error visibility. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const b = await chromium.launch(),
  out = "qa-results/ux2-hub",
  results = [];
await mkdir(out, { recursive: true });
try {
  for (const [width, height] of [
    [360, 740],
    [390, 844],
    [740, 360],
    [1440, 900],
  ]) {
    const p = await b.newPage({ viewport: { width, height } }),
      errors = [];
    let availability = "error";
    p.on("pageerror", (e) => errors.push(e.message));
    await p.route("**/api/**", async (r) => {
      const path = new URL(r.request().url()).pathname;
      let json = {};
      if (path.endsWith("/auth/me"))
        json = {
          authenticated: true,
          user: {
            id: "hub-test",
            nickname: "모드 검증",
            role: "USER",
            currencyBalance: 0,
            prismBalance: 0,
            championPrismBalance: 0,
          },
        };
      else if (path.endsWith("/server-status"))
        json = { enabled: false, allowed: true };
      else if (path === "/api/draft/availability") {
        if (availability === "error")
          return r.fulfill({ status: 503, json: { message: "fixture" } });
        json = { enabled: availability === "enabled" };
      } else if (path.endsWith("/decks")) json = { decks: [] };
      else if (path.endsWith("/cards")) json = { cards: [] };
      else if (path.endsWith("/champions")) json = { champions: [] };
      else if (path.endsWith("/card-frames")) json = { frames: [] };
      else if (path.endsWith("/online-matches/active")) json = { match: null };
      else if (path.endsWith("/cosmetics"))
        json = {
          owned: [],
          loadout: { version: 1, skins: {}, cardBack: null, emotes: [] },
        };
      return r.fulfill({ json });
    });
    await p.goto("http://127.0.0.1:5186/collection");
    await p
      .getByRole("navigation", { name: "게임 화면 이동" })
      .getByRole("link", { name: "대전", exact: true })
      .click();
    await p.getByTestId("button-mode-ai").waitFor();
    assert.equal(await p.locator(".ko-battle-mode-grid>button").count(), 4);
    await p.getByRole("button", { name: "드래프트 상태 다시 확인" }).waitFor();
    assert.equal(await p.getByTestId("button-mode-draft").isDisabled(), true);
    availability = "enabled";
    await p.getByRole("button", { name: "드래프트 상태 다시 확인" }).click();
    await p.waitForFunction(
      () => !document.querySelector("[data-testid=button-mode-draft]").disabled,
    );
    for (const button of await p.locator(".ko-battle-mode-grid>button").all()) {
      const rect = await button.boundingBox();
      assert.ok(rect.width >= 44 && rect.height >= 44);
      assert.ok(rect.x >= 0 && rect.x + rect.width <= width + 1);
      if(width<500)assert.ok(rect.y>=0&&rect.y+rect.height<=height+1,JSON.stringify(rect));
    }
    await p.screenshot({ path: `${out}/hub-${width}.png`, fullPage: true });
    await p.getByTestId("button-online-friendly").click();
    await p.waitForURL("**/online/friendly");
    availability = "disabled";
    await p.goto("http://127.0.0.1:5186/online");
    await p.getByTestId("button-mode-draft").waitFor();
    await p.getByText("현재 이용할 수 없어요.", { exact: true }).waitFor();
    assert.equal(await p.locator(".ko-battle-mode-grid>button").count(), 4);
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      topNavigationAllFourModes: true,
      errorRetry: true,
      unavailableStillVisible: true,
      friendlyEntry: true,
      min44: true,
      errors,
    });
    await p.close();
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await b.close();
}
