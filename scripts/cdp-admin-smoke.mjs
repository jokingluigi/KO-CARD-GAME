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
  const result = await command("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? "browser evaluation failed");
  return result.result?.value;
}

async function goto(url) {
  await command("Page.navigate", { url });
  await sleep(900);
}

async function pageText(label) {
  const text = await evaluate("document.body.innerText");
  console.log(`\n===== ${label} =====\n${String(text).slice(0, 2600)}`);
  return String(text);
}

async function clickText(label) {
  const clicked = await evaluate(`(() => {
    const node = [...document.querySelectorAll("button,a")].find((item) =>
      (item.innerText || item.textContent || "").includes(${JSON.stringify(label)}));
    if (!node) return false;
    node.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Could not find visible control: ${label}`);
  await sleep(500);
}

await command("Page.enable");
await command("Runtime.enable");
await command("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});

await goto("http://127.0.0.1:80/");
const login = await evaluate(`fetch("/api/test-auth/login", {
  method: "POST",
  credentials: "include",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({role: "ADMIN"})
}).then(async (response) => ({status: response.status, body: await response.json()}))`);
console.log("ADMIN browser login:", JSON.stringify(login));
if (login.status !== 200 || login.body?.user?.role !== "ADMIN") throw new Error("ADMIN browser login failed");

await goto("http://127.0.0.1:80/admin");
await pageText("admin shell");
for (const section of ["카드 관리", "챔피언 관리", "카드팩 관리", "Card Skin 관리", "상점 관리", "카드 제작 설정"]) {
  await clickText(section);
  await pageText(section);
}

await goto("http://127.0.0.1:80/admin/packs");
await pageText("admin packs route");
await command("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
});
await sleep(300);
await pageText("admin packs mobile");
const screenshot = await command("Page.captureScreenshot", { format: "png" });
await fs.writeFile("screenshots/ko-admin-packs-test-auth-mobile.png", Buffer.from(screenshot.data, "base64"));
console.log("saved screenshots/ko-admin-packs-test-auth-mobile.png");
ws.close();