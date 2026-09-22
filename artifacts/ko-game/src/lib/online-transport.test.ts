import assert from "node:assert/strict";
import test from "node:test";
import {
  ONLINE_WS_PATH,
  ONLINE_WS_TICKET_PATH,
  onlineApiUrl,
  onlineWebSocketUrl,
} from "./online-transport";

test("production ticket requests stay on the authenticated frontend origin", () => {
  assert.equal(
    onlineApiUrl(ONLINE_WS_TICKET_PATH, "/"),
    "/api/online-matches/ws-ticket",
  );
  assert.equal(
    onlineApiUrl(ONLINE_WS_TICKET_PATH, "/ko-game/"),
    "/ko-game/api/online-matches/ws-ticket",
  );
});

test("production WebSockets use the direct API service with a secure scheme", () => {
  assert.equal(
    onlineWebSocketUrl("ticket+/=", {
      production: true,
      baseUrl: "/",
      protocol: "https:",
      host: "ko-card-game-vr69.onrender.com",
    }),
    "wss://ko-card-game.onrender.com/api/online-matches/ws?ticket=ticket%2B%2F%3D",
  );
});

test("development WebSockets stay on the proxied frontend host", () => {
  assert.equal(
    onlineWebSocketUrl(undefined, {
      production: false,
      baseUrl: "/ko-game/",
      protocol: "http:",
      host: "localhost:24268",
    }),
    `ws://localhost:24268/ko-game${ONLINE_WS_PATH}`,
  );
});