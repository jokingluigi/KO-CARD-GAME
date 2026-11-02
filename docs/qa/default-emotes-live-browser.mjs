/** Deployed admin bundle smoke; account/catalog are intercepted, all writes blocked. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const browser = await chromium.launch(),
  p = await browser.newPage({
    viewport: { width: 390, height: 844 },
    ignoreHTTPSErrors: true,
  }),
  errors = [],
  writes = [];
p.on("pageerror", (e) => errors.push(e.message));
try {
  await p.route("**/api/**", (r) => {
    const path = new URL(r.request().url()).pathname;
    if (r.request().method() !== "GET") {
      writes.push(path);
      return r.abort();
    }
    let json = {};
    if (path.endsWith("/admin/session") || path.endsWith("/auth/me"))
      json = {
        authenticated: true,
        user: {
          id: "isolated-admin-preview",
          role: "ADMIN",
          nickname: "배포 확인",
        },
      };
    else if (path.endsWith("/server-status"))
      json = { enabled: false, allowed: true };
    else if (path.endsWith("/admin/cosmetics"))
      json = {
        items: [
          {
            id: "readonly-emote",
            type: "IMAGE_EMOTE",
            name: "옵션 표시 확인",
            description: "",
            targetId: null,
            imageAssets: {
              art: "/api/storage/objects/uploads/cosmetics/read-only-missing.png",
            },
            isActive: true,
            sortOrder: 0,
          },
        ],
        cards: [],
        champions: [],
      };
    else if (path.includes("/storage/")) return r.abort();
    return r.fulfill({ json });
  });
  await p.goto("https://ko-card-game-vr69.onrender.com/admin/cosmetics");
  await p
    .locator(".cosmetics-editor aside button")
    .filter({ hasText: "옵션 표시 확인" })
    .click();
  const check = p.getByRole("checkbox", {
    name: "이모티콘 기본 지급",
    exact: true,
  });
  await check.waitFor();
  assert.equal(await check.isChecked(), false);
  await check.check();
  assert.equal(await check.isChecked(), true);
  await p.screenshot({
    path: "docs/qa/20261102-default-emotes/deployed-option.png",
    fullPage: true,
  });
  await check.uncheck();
  await p.getByLabel("아이템 유형").selectOption("CARD_BACK");
  assert.equal(await check.count(), 0);
  assert.deepEqual(errors, []);
  assert.ok(writes.every((path) => path.endsWith("/ws-ticket")));
  await writeFile(
    "docs/qa/20261102-default-emotes/deployed-browser.json",
    JSON.stringify(
      {
        deployedBundle: true,
        checkboxDisplayedAndToggles: true,
        emotesOnly: true,
        accountAndCatalogIntercepted: true,
        productionWritesSent: 0,
        blockedRequests: writes,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
  console.log("PASS deployed default-emote checkbox; no production writes");
} finally {
  await browser.close();
}
