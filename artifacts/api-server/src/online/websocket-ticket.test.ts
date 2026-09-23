import assert from "node:assert/strict";
import test from "node:test";
import {
  consumeWebSocketAuthTicket,
  createWebSocketAuthTicket,
  WEBSOCKET_AUTH_TICKET_TTL_SECONDS,
} from "./websocket-ticket";
import type { PublicUser } from "../lib/auth";

function testUser(id: string): PublicUser {
  return {
    id,
    email: `${id}@example.com`,
    nickname: id,
    role: "USER",
    currency: 0,
    currencyBalance: 0,
    prismBalance: 0,
    championPrismBalance: 0,
    isTestAccount: false,
  };
}

test("WebSocket auth tickets are random, short-lived, and single-use", async () => {
  const now = 1_000_000;
  const ticket = createWebSocketAuthTicket("user-1", now);

  assert.notEqual(ticket, createWebSocketAuthTicket("user-1", now));
  assert.ok(ticket.length >= 40);

  const resolveUser = async (userId: string) => testUser(userId);
  assert.equal(
    (await consumeWebSocketAuthTicket(ticket, resolveUser, now))?.id,
    "user-1",
  );
  assert.equal(await consumeWebSocketAuthTicket(ticket, resolveUser, now), null);
});

test("expired WebSocket auth tickets cannot be consumed", async () => {
  const now = 2_000_000;
  const ticket = createWebSocketAuthTicket("user-2", now);
  const resolveUser = async () => testUser("user-2");

  assert.equal(
    await consumeWebSocketAuthTicket(
      ticket,
      resolveUser,
      now + WEBSOCKET_AUTH_TICKET_TTL_SECONDS * 1000,
    ),
    null,
  );
});