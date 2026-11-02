/** Entry/start/pick/cancel via actual isolated Draft HTTP. */
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const fixture = JSON.parse(
    await readFile("qa-results/cosmetics/draft-fixture.json", "utf8"),
  ),
  origin = process.env.KO_COSMETICS_FRONTEND;
assert.equal(new URL(origin).hostname, "127.0.0.1");
const out = "qa-results/ui-draft-entry";
await mkdir(out, { recursive: true });
const b = await chromium.launch(),
  results = [];
try {
  for (const [width, height] of [
    [390, 844],
    [1440, 900],
  ]) {
    const c = await b.newContext({
      viewport: { width, height },
      reducedMotion: "reduce",
    });
    let selectedUser;
    for (const [user, cookie] of Object.entries(fixture.cookies)) {
      const [name, ...value] = cookie.split("=");
      await c.addCookies([{ name, value: value.join("="), url: origin }]);
      const auth = await c.request
        .get(origin + "/api/auth/me")
        .then((r) => r.json());
      if (auth.user?.role !== "USER") continue;
      const settings = await c.request
        .get(origin + "/api/draft")
        .then((r) => r.json());
      if (settings.enabled && !settings.poolError && !settings.currentId) {
        selectedUser = user;
        break;
      }
    }
    assert.ok(selectedUser, "Need an idle ordinary fixture user");
    const p = await c.newPage(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(origin + "/draft");
    const start = p.getByRole("button", {
      name: "AI 드래프트 시작",
      exact: true,
    });
    await start.waitFor();
    await p.screenshot({
      path: `${out}/entry-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    const next = p.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/draft/sessions" &&
        r.request().method() === "POST",
    );
    await start.click();
    const response = await next;
    assert.equal(response.status(), 201);
    let view = await response.json();
    assert.equal(view.phase, "DRAFT");
    assert.equal(view.mode, "AI");
    await p.getByText("챔피언을 선택해 주세요", { exact: true }).waitFor();
    const chosen = view.champions.find((ch) => ch.id === view.own.offers[0]);
    assert.ok(chosen);
    await p
      .locator("button")
      .filter({
        has: p.getByRole("heading", { name: chosen.name, exact: true }),
      })
      .click();
    await p.getByText(/0\/25장 선택/).waitFor();
    await p.getByRole("button", { name: "드래프트 종료", exact: true }).click();
    await start.waitFor();
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      ordinaryUser: true,
      realAiDraftStart: true,
      championPick: true,
      abortAndReturn: true,
      errors,
    });
    await c.close();
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await b.close();
}
