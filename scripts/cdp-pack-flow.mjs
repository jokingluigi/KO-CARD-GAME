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
  console.log(`\n===== ${label} =====\n${text.slice(0, 2600)}`);
  return text;
}
async function clickText(text) {
  const clicked = await evaluate(`(() => {
    const nodes = [...document.querySelectorAll("button,a")];
    const node = nodes.find((item) => (item.innerText || item.textContent || "").trim() === ${JSON.stringify(text)})
      ?? nodes.find((item) => (item.innerText || item.textContent || "").trim().includes(${JSON.stringify(text)}));
    if (!node) return false;
    node.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Could not find control: ${text}`);
  await sleep(700);
}
async function clickPackOpen(packName) {
  const clicked = await evaluate(`(() => {
    const article = [...document.querySelectorAll("article")].find((item) => item.innerText.includes(${JSON.stringify(packName)}));
    const button = [...(article?.querySelectorAll("button") ?? [])].find((item) => (item.innerText || "").includes("개봉"));
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Could not find opening control for ${packName}`);
  await sleep(900);
}
async function setInput(index, value) {
  const ok = await evaluate(`(() => {
    const input = [...document.querySelectorAll("input")][${index}];
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, ${JSON.stringify(String(value))});
    input.dispatchEvent(new Event("input", {bubbles: true}));
    input.dispatchEvent(new Event("change", {bubbles: true}));
    return true;
  })()`);
  if (!ok) throw new Error(`input ${index} not found`);
}
async function setSelect(value, index = 0) {
  const ok = await evaluate(`(() => {
    const select = [...document.querySelectorAll("select")][${index}];
    if (!select) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    setter?.call(select, ${JSON.stringify(value)});
    select.dispatchEvent(new Event("change", {bubbles: true}));
    return true;
  })()`);
  if (!ok) throw new Error(`select ${index} not found`);
}

await command("Page.enable");
await command("Runtime.enable");
await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await goto("http://127.0.0.1:80/");
const adminLogin = await evaluate(`fetch("/api/test-auth/login", {
  method: "POST", credentials: "include", headers: {"Content-Type": "application/json"},
  body: JSON.stringify({role: "ADMIN"})
}).then(async (response) => ({status: response.status, body: await response.json()}))`);
if (adminLogin.status !== 200) throw new Error("admin login failed");

await goto("http://127.0.0.1:80/admin/packs");
const packName = `Browser Auth Pack ${Date.now()}`;
await setInput(0, packName);
await setInput(1, 1);
await setInput(2, 100);
await setInput(3, 0);
await setInput(4, 0);
await setInput(5, 0);
const checked = await evaluate(`(() => {
  const fieldset = [...document.querySelectorAll("fieldset")].find((item) => item.innerText.includes("NORMAL 카드 Pool"));
  const checkbox = fieldset?.querySelector('input[type="checkbox"]');
  if (!checkbox) return false;
  if (!checkbox.checked) checkbox.click();
  return true;
})()`);
if (!checked) throw new Error("No NORMAL pool card available");
await clickText("저장");
let savedText = await body("pack saved from admin UI");
if (!savedText.includes(packName)) throw new Error("saved pack not visible after UI save");

await clickText("PUBLISH");
savedText = await body("pack published from admin UI");
if (!savedText.includes("PUBLISHED")) throw new Error("pack did not show PUBLISHED after UI action");

const users = await evaluate(`fetch("/api/admin/packs/options", {credentials: "include"}).then((response) => response.json())`);
const testUser = users.users?.find((user) => user.email === "ko-test-user@localhost.test");
if (!testUser) throw new Error("test user missing from admin options");
await setSelect(testUser.id, 0);
await clickText("지급");
await body("pack granted from admin UI");

await clickText("팩 개봉 테스트");
await sleep(300);
await body("pack preview controls");
await clickText("테스트 시작");
await sleep(900);
let previewText = await body("random pack preview");
if (!previewText.includes("PACK PREVIEW")) throw new Error("random preview did not open");
await clickText("모두 공개");
previewText = await body("random pack preview revealed");
if (!previewText.includes("팩 선택으로 돌아가기")) throw new Error("random preview did not reveal");
await clickText("팩 선택으로 돌아가기");
await sleep(500);
await clickText("결과 강제 지정");
await clickText("테스트 시작");
await sleep(900);
previewText = await body("forced NORMAL pack preview");
if (!previewText.includes("PACK PREVIEW")) throw new Error("forced preview did not open");
await clickText("모두 공개");
await body("forced NORMAL pack preview revealed");
await clickText("팩 선택으로 돌아가기");

await goto("http://127.0.0.1:80/");
const userLogin = await evaluate(`fetch("/api/test-auth/login", {
  method: "POST", credentials: "include", headers: {"Content-Type": "application/json"},
  body: JSON.stringify({role: "USER"})
}).then(async (response) => ({status: response.status, body: await response.json()}))`);
if (userLogin.status !== 200) throw new Error("user login failed");
await goto("http://127.0.0.1:80/packs");
let userPacks = await body("user pack inventory after admin grant");
if (!userPacks.includes(packName)) throw new Error("granted pack not visible to TEST USER");
if (!userPacks.includes("×1")) throw new Error("granted quantity not visible");
await clickPackOpen(packName);
let opening = await body("real user pack opening");
if (!opening.includes("PACK OPENING")) throw new Error("real user pack opening did not open");
await clickText("모두 공개");
opening = await body("real user pack reward revealed");
if (!opening.includes("확인")) throw new Error("real user pack reward did not reveal");
await clickText("확인");
await sleep(700);
await goto("http://127.0.0.1:80/packs");
userPacks = await body("user pack inventory after opening");
if (userPacks.includes("1개")) throw new Error("pack quantity did not decrease after opening");
console.log("admin create/publish/grant, preview random/forced, and user opening: PASS");
ws.close();