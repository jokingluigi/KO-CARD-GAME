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
async function body(label) {
  const text = String(await evaluate("document.body.innerText"));
  console.log(`\n===== ${label} =====\n${text.slice(0, 2200)}`);
  return text;
}
async function assertContains(label, text, fragments) {
  for (const fragment of fragments) {
    if (!text.includes(fragment)) throw new Error(`${label}: missing visible text ${fragment}`);
  }
  console.log(`${label}: PASS`);
}

await command("Page.enable");
await command("Runtime.enable");
await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await goto("http://127.0.0.1:80/");
const login = await evaluate(`fetch("/api/test-auth/login", {
  method: "POST",
  credentials: "include",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({role: "USER"})
}).then(async (response) => ({status: response.status, body: await response.json()}))`);
console.log("USER browser login:", JSON.stringify(login));
if (login.status !== 200 || login.body?.user?.role !== "USER") throw new Error("USER browser login failed");

await goto("http://127.0.0.1:80/admin");
const adminText = await body("user admin denial");
await assertContains("user admin denial", adminText, ["관리자 권한이 필요합니다"]);

for (const [path, label, fragments] of [
  ["/decks", "decks", ["덱"]],
  ["/collection", "collection", ["컬렉션"]],
  ["/packs", "packs", ["팩"]],
]) {
  await goto(`http://127.0.0.1:80${path}`);
  const text = await body(label);
  await assertContains(label, text, fragments);
}

await goto("http://127.0.0.1:80/collection");
const beforeReload = await evaluate("document.body.innerText");
await goto("http://127.0.0.1:80/collection");
const afterReload = await evaluate("document.body.innerText");
if (!afterReload.includes("컬렉션")) throw new Error("collection did not survive reload");
console.log("user session after reload: PASS");

await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
for (const path of ["/collection", "/decks", "/packs"]) {
  await goto(`http://127.0.0.1:80${path}`);
  const text = await body(`mobile ${path}`);
  if (text.length < 20) throw new Error(`mobile ${path} rendered no usable content`);
}
const screenshot = await command("Page.captureScreenshot", { format: "png" });
await fs.writeFile("screenshots/ko-user-packs-test-auth-mobile.png", Buffer.from(screenshot.data, "base64"));
console.log("saved screenshots/ko-user-packs-test-auth-mobile.png");
ws.close();