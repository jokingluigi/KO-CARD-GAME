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
async function evaluate(expression) {
  const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? "browser evaluation failed");
  return result.result?.value;
}
async function api(path, options = {}) {
  return evaluate(`fetch(${JSON.stringify(path)}, ${JSON.stringify({ credentials: "include", ...options })}).then(async (response) => ({status: response.status, body: await response.json().catch(() => null)}))`);
}

await command("Runtime.enable");
await evaluate(`fetch("/api/test-auth/login", {
  method: "POST", credentials: "include", headers: {"Content-Type": "application/json"},
  body: JSON.stringify({role: "USER"})
}).then((response) => response.json())`);
const created = await api("/api/decks", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({name: "Ownership Isolation Smoke", championDefinitionId: null, cardDefinitionIds: []}),
});
if (created.status !== 201 || !created.body?.deck?.id) throw new Error(`could not create owner test deck: ${JSON.stringify(created)}`);
const deckId = created.body.deck.id;
console.log("user A created deck:", deckId);
const aPacks = await api("/api/packs");
const ownedPack = aPacks.body.packs.find((pack) => pack.quantity > 0);
if (!ownedPack) throw new Error("user A has no owned pack for isolation test");

const suffix = Date.now();
const email = `ko-owner-test-b-${suffix}@localhost.test`;
const registered = await api("/api/auth/register", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({
    email,
    nickname: `Owner B ${String(suffix).slice(-6)}`,
    password: "OwnerTest123!",
    passwordConfirmation: "OwnerTest123!",
  }),
});
if (registered.status !== 201 || registered.body?.user?.role !== "USER") throw new Error(`user B registration failed: ${JSON.stringify(registered)}`);

const bDecks = await api("/api/decks");
if (bDecks.status !== 200 || bDecks.body.decks.some((deck) => deck.id === deckId)) throw new Error("user B can see user A deck");
const bPatch = await api(`/api/decks/${deckId}`, {
  method: "PATCH",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({name: "Should Not Update", championDefinitionId: null, cardDefinitionIds: []}),
});
if (bPatch.status !== 404) throw new Error(`user B deck patch was not denied: ${bPatch.status}`);
const bDelete = await api(`/api/decks/${deckId}`, {method: "DELETE"});
if (bDelete.status !== 404) throw new Error(`user B deck delete was not denied: ${bDelete.status}`);
const bPacks = await api("/api/packs");
if (bPacks.status !== 200 || bPacks.body.packs.some((pack) => pack.quantity > 0)) throw new Error("user B can see user A pack inventory");
const bOpen = await api(`/api/packs/${ownedPack.id}/open`, {method: "POST"});
if (bOpen.status === 200) throw new Error("user B opened user A pack");
const bAdmin = await api("/api/admin/packs");
if (bAdmin.status !== 403) throw new Error(`user B admin API was not denied: ${bAdmin.status}`);

await evaluate(`fetch("/api/auth/logout", {method: "POST", credentials: "include"})`);
const reloginA = await evaluate(`fetch("/api/test-auth/login", {
  method: "POST", credentials: "include", headers: {"Content-Type": "application/json"},
  body: JSON.stringify({role: "USER"})
}).then((response) => response.json())`);
if (reloginA.user?.email !== "ko-test-user@localhost.test") throw new Error("user A relogin failed");
const aDecks = await api("/api/decks");
if (!aDecks.body.decks.some((deck) => deck.id === deckId)) throw new Error("user A cannot see own deck after relogin");
console.log("user ownership isolation and user/admin role boundary: PASS");
ws.close();