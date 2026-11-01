import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
const b = await chromium.launch(),
  out = "qa-results/launch-deck",
  results = [];
await mkdir(out, { recursive: true });
try {
  const p = await b.newPage({ viewport: { width: 320, height: 568 } }),
    errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  let fail = true,
    account = "one",
    ack,
    requests = [];
  const deck = {
    id: "current",
    name: "현재 출전 덱 이름",
    isSelected: true,
    isValid: true,
    championDefinitionId: "hero",
    champion: { id: "hero", name: "챔피언", imageUrl: null },
    cardDefinitionIds: [],
    cards: [],
    invalidReasons: [],
    validationReasons: [],
  };
  await p.route("**/api/**", (r) => {
    const path = new URL(r.request().url()).pathname;
    let json = {};
    if (path.endsWith("/auth/me"))
      json = {
        authenticated: true,
        user: {
          id: account,
          nickname: "검증",
          role: "USER",
          currencyBalance: 0,
          prismBalance: 0,
        },
      };
    else if (path.endsWith("/server-status"))
      json = { enabled: false, allowed: true };
    else if (path.endsWith("/ws-ticket")) json = { ticket: "edge" };
    else if (path.endsWith("/decks")) {
      if (fail)
        return r.fulfill({
          status: 503,
          json: { message: "출전 덱 확인 실패" },
        });
      json = { decks: account === "one" ? [deck] : [] };
    }
    return r.fulfill({ json });
  });
  await p.goto("http://127.0.0.1:5186/");
  const banner = p.getByTestId("launch-deck-banner");
  await banner
    .getByRole("button", { name: "다시 확인", exact: true })
    .waitFor();
  assert.equal(await banner.getByRole("button").count(), 1);
  fail = false;
  await banner.getByRole("button", { name: "다시 확인", exact: true }).click();
  await banner.getByText(deck.name, { exact: true }).waitFor();
  account = "two";
  await p.reload();
  await banner.getByText("출전 덱을 지정하세요", { exact: true }).waitFor();
  assert.equal(await banner.getByText(deck.name, { exact: true }).count(), 0);
  account = "one";
  await p.routeWebSocket("**/api/online-matches/ws**", (ws) =>
    ws.onMessage((raw) => {
      const m = JSON.parse(String(raw));
      requests.push(m);
      if (m.type === "PING") ws.send(JSON.stringify({ type: "PONG" }));
      if (m.type === "JOIN_QUICK_QUEUE")
        ack = () =>
          ws.send(
            JSON.stringify({
              type: "QUICK_QUEUE_JOINED",
              deck: {
                deckId: "previous",
                deckName: "서버에서 확정한 이전 출전 덱",
                championName: "기존 챔피언",
              },
            }),
          );
    }),
  );
  await p.goto("http://127.0.0.1:5186/online/quick");
  await p
    .getByTestId("status-quick-searching")
    .filter({ hasText: "입장을 확인" })
    .waitFor();
  assert.equal(requests.filter((m) => m.type === "JOIN_QUICK_QUEUE").length, 1);
  await p.getByRole("button", { name: "검색 취소", exact: true }).click();
  ack();
  await p.waitForTimeout(150);
  assert.equal(await p.getByTestId("status-quick-searching").count(), 0);
  assert.equal(requests.filter((m) => m.type === "JOIN_QUICK_QUEUE").length, 1);
  await p.getByTestId("button-quick-search").click();
  ack();
  await p
    .getByTestId("status-online-selected-deck")
    .getByText("서버에서 확정한 이전 출전 덱", { exact: true })
    .waitFor();
  assert.equal(requests.filter((m) => m.type === "JOIN_QUICK_QUEUE").length, 2);
  assert.deepEqual(errors, []);
  results.push({
    retryAfter503: true,
    noStaleSelectionAcrossAccounts: true,
    cancelBeforeAcknowledgement: true,
    lateAcknowledgementIgnored: true,
    serverFrozenDeckShown: true,
    noDuplicateQueueIntent: true,
    errors,
  });
  await writeFile(out + "/edge-results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await b.close();
}
