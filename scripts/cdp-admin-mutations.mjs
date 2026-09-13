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
async function text() {
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

await command("Page.enable");
await command("Runtime.enable");
await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await goto("http://127.0.0.1:80/");
const login = await evaluate(`fetch("/api/test-auth/login", {
  method: "POST", credentials: "include", headers: {"Content-Type": "application/json"},
  body: JSON.stringify({role: "ADMIN"})
}).then((response) => response.json())`);
if (login.user?.role !== "ADMIN") throw new Error("admin login failed");

await goto("http://127.0.0.1:80/admin");
await clickExact("카드 관리");
await clickExact("수정");
if (!(await text()).includes("수정 저장")) throw new Error("card editor did not open");
await evaluate(`document.querySelector('[data-testid="button-save-card"]')?.click()`);
await sleep(900);
if (!(await text()).includes("카드를 수정했습니다")) throw new Error("card save did not complete");
console.log("card edit/save and Token/Champion Token form: PASS");

await clickExact("챔피언 관리");
await clickExact("수정");
if (!(await text()).includes("DRAFT 저장")) throw new Error("champion editor did not open");
await clickExact("DRAFT 저장");
await sleep(900);
if (!(await text()).includes("챔피언을 수정했습니다")) throw new Error("champion save did not complete");
console.log("champion edit/save and quest/effect form: PASS");

await goto("http://127.0.0.1:80/admin/prism");
if (!(await text()).includes("NORMAL") || !(await text()).includes("LEGENDARY")) throw new Error("prism settings did not load");
await setInputByLabel("제작 비용", 25);
await setInputByLabel("분해 획득량", 5);
await clickExact("설정 저장");
await sleep(700);
if (!(await text()).includes("프리즘 설정을 저장했습니다")) throw new Error("prism setting save did not complete");
console.log("prism settings save: PASS");

const packs = await evaluate(`fetch("/api/admin/packs", {credentials: "include"}).then((response) => response.json())`);
const publishedPack = packs.packs?.find((pack) => pack.status === "PUBLISHED");
if (!publishedPack) throw new Error("published pack not available for shop test");
await goto("http://127.0.0.1:80/admin/shop");
await clickExact("새 상품 만들기");
await setInputByLabel("상품명", `Browser Auth Listing ${Date.now()}`);
await setInputByLabel("설명", "Browser-auth shop smoke test");
await setSelectByLabel("연결 Pack", publishedPack.id);
await setInputByLabel("지급 Pack 수량", 1);
await setInputByLabel("가격 (Gold)", 1);
await setInputByLabel("표시 순서", 0);
await clickExact("상품 저장");
await sleep(900);
let shopText = await text();
if (!shopText.includes("상품을 저장했습니다")) throw new Error("shop listing save did not complete");
await clickExact("판매 ON");
await sleep(700);
if (!(await text()).includes("판매 OFF")) throw new Error("shop listing toggle did not turn on");
console.log("shop listing create, pack selection, price/quantity/order, ON/OFF: PASS");
ws.close();