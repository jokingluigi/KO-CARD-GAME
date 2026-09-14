import fs from "node:fs/promises";

const list = await (await fetch("http://127.0.0.1:9223/json/list")).json();
const page = list.find((item) => item.type === "page");
if (!page) throw new Error("No Chromium page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});
let nextId = 0;
const pending = new Map();
ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const settle = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) settle.reject(new Error(JSON.stringify(message.error)));
  else settle.resolve(message.result);
});
function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function evaluate(expression) {
  const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? "browser evaluation failed");
  return result.result?.value;
}
async function goto(url) {
  await command("Page.navigate", { url });
  await sleep(900);
}
async function body() {
  return String(await evaluate("document.body.innerText"));
}
async function clickExact(label) {
  const ok = await evaluate(`(() => {
    const node = [...document.querySelectorAll("button,a")].find((item) => (item.innerText || item.textContent || "").trim() === ${JSON.stringify(label)});
    if (!node) return false;
    node.click();
    return true;
  })()`);
  if (!ok) throw new Error(`control not found: ${label}`);
  await sleep(700);
}
async function setInputByLabel(labelText, value) {
  const ok = await evaluate(`(() => {
    const label = [...document.querySelectorAll("label")].find((item) => item.innerText.includes(${JSON.stringify(labelText)}));
    const input = label?.querySelector("input,textarea");
    if (!input) return false;
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    setter?.call(input, ${JSON.stringify(String(value))});
    input.dispatchEvent(new Event("input", {bubbles: true}));
    input.dispatchEvent(new Event("change", {bubbles: true}));
    return true;
  })()`);
  if (!ok) throw new Error(`field not found: ${labelText}`);
}
async function setSelectByLabel(labelText, value) {
  const ok = await evaluate(`(() => {
    const label = [...document.querySelectorAll("label")].find((item) => item.innerText.includes(${JSON.stringify(labelText)}));
    const select = label?.querySelector("select");
    if (!select) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    setter?.call(select, ${JSON.stringify(value)});
    select.dispatchEvent(new Event("change", {bubbles: true}));
    return true;
  })()`);
  if (!ok) throw new Error(`select not found: ${labelText}`);
}
async function setSelectByValue(value) {
  const ok = await evaluate(`(() => {
    const select = [...document.querySelectorAll("select")].find((item) => [...item.options].some((option) => option.value === ${JSON.stringify(value)}));
    if (!select) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    setter?.call(select, ${JSON.stringify(value)});
    select.dispatchEvent(new Event("change", {bubbles: true}));
    return true;
  })()`);
  if (!ok) throw new Error(`select value not found: ${value}`);
}
async function setInputByPlaceholder(placeholder, value) {
  const ok = await evaluate(`(() => {
    const input = [...document.querySelectorAll("input")].find((item) => item.placeholder === ${JSON.stringify(placeholder)});
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, ${JSON.stringify(String(value))});
    input.dispatchEvent(new Event("input", {bubbles: true}));
    input.dispatchEvent(new Event("change", {bubbles: true}));
    return true;
  })()`);
  if (!ok) throw new Error(`input placeholder not found: ${placeholder}`);
}
async function api(path, options = {}) {
  return evaluate(`fetch(${JSON.stringify(path)}, ${JSON.stringify({ credentials: "include", ...options })}).then(async (response) => ({status: response.status, body: await response.json().catch(() => null)}))`);
}

await command("Page.enable");
await command("Runtime.enable");
await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await goto("http://127.0.0.1:80/");

const adminLogin = await evaluate(`fetch("/api/test-auth/login", {
  method: "POST", credentials: "include", headers: {"Content-Type": "application/json"},
  body: JSON.stringify({role: "ADMIN"})
}).then((response) => response.json())`);
if (adminLogin.user?.role !== "ADMIN") throw new Error("admin login failed");

const adminPacks = await api("/api/admin/packs");
const publishedPack = adminPacks.body.packs.find((pack) => pack.status === "PUBLISHED");
if (!publishedPack) throw new Error("no published pack available");
await goto("http://127.0.0.1:80/admin/shop");
await clickExact("새 상품 만들기");
const listingName = `Browser Shop Credit ${Date.now()}`;
await setInputByLabel("상품명", listingName);
await setInputByLabel("설명", "Real shop credit purchase smoke test");
await setSelectByLabel("연결 Pack", publishedPack.id);
await setInputByLabel("지급 Pack 수량", 5);
await setInputByLabel("가격 (크레딧)", 4500);
await setInputByLabel("표시 순서", 0);
await evaluate(`(() => {
  const label = [...document.querySelectorAll("label")].find((item) => item.innerText.includes("판매 ON"));
  const checkbox = label?.querySelector('input[type="checkbox"]');
  if (checkbox && !checkbox.checked) checkbox.click();
  return Boolean(checkbox);
})()`);
await clickExact("상품 저장");
if (!(await body()).includes("상품을 저장했습니다")) throw new Error("shop listing was not saved from UI");

const adminShop = await api("/api/admin/shop");
const listing = adminShop.body.listings.find((item) => item.name === listingName);
if (!listing || !listing.isSaleable || listing.price !== 4500 || listing.quantity !== 5) throw new Error("saved listing did not match server values");
const disabledName = `${listingName} Disabled`;
const expiredName = `${listingName} Expired`;
for (const payload of [
  { name: disabledName, enabled: false, isActive: 0 },
  { name: expiredName, enabled: true, isActive: 1, endsAt: new Date(Date.now() - 60_000).toISOString() },
]) {
  const created = await api("/api/admin/shop", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      name: payload.name,
      description: "visibility filter smoke test",
      imageAssetId: null,
      productType: "PACK",
      packDefinitionId: publishedPack.id,
      quantity: 1,
      price: 1,
      enabled: payload.enabled,
      displayOrder: 99,
      startsAt: null,
      endsAt: payload.endsAt ?? null,
    }),
  });
  if (created.status !== 201) throw new Error(`could not create ${payload.name}`);
}

const testUser = adminShop.body.users.find((user) => user.email === "ko-test-user@localhost.test");
if (!testUser) throw new Error("test user missing");
await setSelectByValue(testUser.id);
await setInputByPlaceholder("지급량", 5000);
await evaluate(`window.confirm = (message) => { window.__lastConfirm = message; return true; }`);
await clickExact("크레딧 지급");
if (!(await body()).includes("크레딧을 지급했습니다")) throw new Error("admin credit grant did not complete");

await goto("http://127.0.0.1:80/");
const userLogin = await evaluate(`fetch("/api/test-auth/login", {
  method: "POST", credentials: "include", headers: {"Content-Type": "application/json"},
  body: JSON.stringify({role: "USER"})
}).then((response) => response.json())`);
if (userLogin.user?.role !== "USER") throw new Error("user login failed");
const beforeMe = await api("/api/auth/me");
const beforeShop = await api("/api/shop");
if (beforeShop.body.listings.some((item) => item.name === disabledName || item.name === expiredName)) throw new Error("disabled or expired shop listing was visible");
const beforeListing = beforeShop.body.listings.find((item) => item.id === listing.id);
if (!beforeListing || beforeListing.ownedQuantity < 0) throw new Error("shop listing was not visible to user");
if (beforeShop.body.currencyDisplayName !== "크레딧") throw new Error("shop currency display name is wrong");
const beforeCurrency = beforeMe.body.user.currency;
const beforePrism = beforeMe.body.user.prismBalance;
const beforeShopBalance = beforeMe.body.user.currencyBalance;
if (beforeShopBalance < listing.price) throw new Error(`test user did not have enough starter/granted credits: ${beforeShopBalance}`);

await goto("http://127.0.0.1:80/shop");
const shopPage = await body();
if (!shopPage.includes(listingName) || !shopPage.includes("크레딧") || !shopPage.includes("보유")) throw new Error("user shop did not render the sale");
await evaluate(`window.confirm = (message) => { window.__lastConfirm = message; return true; }`);
const clicked = await evaluate(`(() => {
  const article = [...document.querySelectorAll("article")].find((item) => item.innerText.includes(${JSON.stringify(listingName)}));
  const button = [...(article?.querySelectorAll("button") ?? [])].find((item) => (item.innerText || "").includes("크레딧로 구매"));
  if (!button) return false;
  button.click();
  return true;
})()`);
if (!clicked) throw new Error("purchase button not found");
await sleep(1100);
const purchasePage = await body();
const confirmMessage = await evaluate("window.__lastConfirm");
if (!String(confirmMessage).replaceAll(",", "").includes("4500 크레딧") || !String(confirmMessage).includes("×5")) throw new Error(`purchase confirmation was wrong: ${confirmMessage}`);
if (!purchasePage.includes("팩 5개를 획득했습니다")) throw new Error("purchase success was not shown");

const afterMe = await api("/api/auth/me");
const afterShop = await api("/api/shop");
const afterListing = afterShop.body.listings.find((item) => item.id === listing.id);
if (afterMe.body.user.currencyBalance !== beforeShopBalance - 4500) throw new Error("credit balance did not decrease by server price");
if (afterListing.ownedQuantity !== beforeListing.ownedQuantity + 5) throw new Error("pack inventory did not increase by server quantity");
if (afterMe.body.user.prismBalance !== beforePrism || afterMe.body.user.currency !== beforeCurrency) throw new Error("Prism or battle Gold changed during shop purchase");

await goto("http://127.0.0.1:80/packs");
if (!(await body()).includes(listing.pack.name)) throw new Error("purchased pack was not visible in /packs");

const insufficient = await api(`/api/shop/${listing.id}/purchase`, { method: "POST", body: JSON.stringify({price: 1, quantity: 999}) });
if (insufficient.status !== 422) throw new Error(`insufficient credit purchase was not rejected: ${insufficient.status}`);
await goto("http://127.0.0.1:80/shop");
if (!(await body()).includes("크레딧 부족")) throw new Error("insufficient credit UI state was not shown");

for (const [width, height, file] of [[390, 844, "screenshots/ko-shop-mobile-390.png"], [430, 932, "screenshots/ko-shop-mobile-430.png"]]) {
  await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: true });
  await goto("http://127.0.0.1:80/shop");
  const mobileText = await body();
  if (!mobileText.includes("KO SHOP") || !mobileText.includes("크레딧")) throw new Error(`mobile shop failed at ${width}x${height}`);
  const screenshot = await command("Page.captureScreenshot", { format: "png" });
  await fs.writeFile(file, Buffer.from(screenshot.data, "base64"));
}

const userAdmin = await api("/api/admin/shop/currency/grant", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({userId: testUser.id, amount: 1}),
});
if (userAdmin.status !== 403) throw new Error(`USER could access credit grant API: ${userAdmin.status}`);
console.log("admin listing/grant, user purchase, server price/quantity authority, insufficient credits, ownership, and currency separation: PASS");
ws.close();