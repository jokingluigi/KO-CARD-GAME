/** Real admin save/upload + user grant/equip against isolated HTTP and database. */
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const fixture = JSON.parse(
    await readFile("qa-results/cosmetics/fixture.json", "utf8"),
  ),
  origin = process.env.KO_COSMETICS_FRONTEND;
if (!origin || new URL(origin).hostname !== "127.0.0.1")
  throw Error("Local fixture only");
const out = "qa-results/default-emotes";
await mkdir(out, { recursive: true });
const b = await chromium.launch(),
  results = [];
async function client(user, width, height) {
  const c = await b.newContext({
    viewport: { width, height },
    isMobile: width < 600,
    hasTouch: width < 600,
  });
  const [name, ...value] = fixture.cookies[user].split("=");
  await c.addCookies([{ name, value: value.join("="), url: origin }]);
  const p = await c.newPage();
  return { c, p };
}
try {
  for (const [width, height] of [
    [390, 844],
    [1440, 900],
  ]) {
    const admin = await client("admin", width, height),
      user = await client("player-b", width, height),
      p = admin.p,
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    user.p.on("pageerror", (e) => errors.push(e.message));
    const before = await user.c.request
      .get(origin + "/api/cosmetics")
      .then((r) => r.json());
    await p.goto(origin + "/admin/cosmetics");
    await p.getByRole("button", { name: "새 아이템", exact: true }).click();
    await p.getByLabel("아이템 유형").selectOption("IMAGE_EMOTE");
    const name = "기본 지급 브라우저 " + width;
    await p.getByLabel("아이템 이름", { exact: true }).fill(name);
    const check = p.getByRole("checkbox", {
      name: "이모티콘 기본 지급",
      exact: true,
    });
    assert.equal(await check.isChecked(), false);
    await check.check();
    await p
      .getByLabel("art 이미지 업로드")
      .setInputFiles({
        name: "default-emote.png",
        mimeType: "image/png",
        buffer: await readFile("qa-results/cosmetics/upload-fixture.png"),
      });
    await p
      .getByRole("status")
      .filter({ hasText: "이미지 검증 완료" })
      .waitFor();
    await p.getByRole("button", { name: "아이템 저장", exact: true }).click();
    await p.getByRole("status").filter({ hasText: "저장했어" }).waitFor();
    const item = await admin.c.request
      .get(origin + "/api/admin/cosmetics")
      .then((r) => r.json())
      .then((d) => d.items.find((i) => i.name === name));
    assert.equal(item.imageAssets.__defaultGrant, "true");
    await p.reload();
    await p
      .locator(".cosmetics-editor aside button")
      .filter({ hasText: name })
      .click();
    assert.equal(await check.isChecked(), true);
    const box = await p.locator(".cosmetic-default-grant").boundingBox();
    assert.ok(box.height >= 44);
    await p.screenshot({ path: `${out}/admin-${width}.png`, fullPage: true });
    await user.p.goto(origin + "/cosmetics");
    await user.p.getByRole("button", { name: "이모티콘", exact: true }).click();
    const tile = user.p
      .locator("article")
      .filter({ has: user.p.getByRole("heading", { name, exact: true }) });
    await tile.getByText("기본 지급 이모티콘", { exact: true }).waitFor();
    const granted = await user.c.request
      .get(origin + "/api/cosmetics")
      .then((r) => r.json());
    assert.equal(granted.owned.filter((o) => o.item.id === item.id).length, 1);
    assert.deepEqual(
      granted.loadout.emotes.map((i) => i?.id ?? null),
      before.loadout.emotes.map((i) => i?.id ?? null),
    );
    await user.p.getByRole("button", { name: /^슬롯 3:/ }).click();
    await tile
      .getByRole("button", { name: "장착 · 슬롯 3", exact: true })
      .click();
    await tile.getByText("장착 중", { exact: true }).waitFor();
    await user.p.reload();
    await user.p.getByRole("button", { name: "이모티콘", exact: true }).click();
    await tile.getByText("장착 중", { exact: true }).waitFor();
    await user.p.screenshot({
      path: `${out}/owned-${width}.png`,
      fullPage: true,
    });
    await check.uncheck();
    await p.getByRole("button", { name: "아이템 저장", exact: true }).click();
    await p.getByRole("status").filter({ hasText: "저장했어" }).waitFor();
    await user.p.reload();
    await user.p.getByRole("button", { name: "이모티콘", exact: true }).click();
    await tile.waitFor();
    assert.equal(
      await tile.getByText("기본 지급 이모티콘", { exact: true }).count(),
      0,
    );
    const revoke = await admin.c.request.post(
      origin + "/api/admin/cosmetics/users/player-b/grants",
      { data: { cosmeticId: item.id, action: "REVOKE" } },
    );
    assert.equal(revoke.status(), 200);
    await user.p.reload();
    await user.p.getByRole("button", { name: "이모티콘", exact: true }).click();
    assert.equal(
      (
        await user.c.request
          .get(origin + "/api/cosmetics")
          .then((r) => r.json())
      ).owned.some((o) => o.item.id === item.id),
      false,
    );
    await p.getByRole("button", { name: "새 아이템", exact: true }).click();
    await p.getByLabel("아이템 유형").selectOption("CARD_BACK");
    assert.equal(await check.count(), 0);
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      adminCheckbox: true,
      uploadSaveReentry: true,
      existingUserAutoGrant: true,
      noAutoEquip: true,
      userEquipPersists: true,
      flagOffPreservesGift: true,
      revokeAfterOffPersists: true,
      emotesOnly: true,
      min44Label: true,
      errors,
    });
    await user.c.close();
    await admin.c.close();
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await b.close();
}
