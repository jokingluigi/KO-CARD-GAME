import { createHash, randomBytes } from "node:crypto";
import type { PublicUser } from "../lib/auth";

export const WEBSOCKET_AUTH_TICKET_TTL_SECONDS = 30;
const WEBSOCKET_AUTH_TICKET_TTL_MS = WEBSOCKET_AUTH_TICKET_TTL_SECONDS * 1000;

type TicketRecord = {
  userId: string;
  expiresAt: number;
};

const tickets = new Map<string, TicketRecord>();

function hashTicket(ticket: string): string {
  return createHash("sha256").update(ticket).digest("hex");
}

function removeExpiredTickets(now: number): void {
  for (const [ticketHash, ticket] of tickets) {
    if (ticket.expiresAt <= now) tickets.delete(ticketHash);
  }
}

export function createWebSocketAuthTicket(userId: string, now = Date.now()): string {
  removeExpiredTickets(now);
  const ticket = randomBytes(32).toString("base64url");
  tickets.set(hashTicket(ticket), {
    userId,
    expiresAt: now + WEBSOCKET_AUTH_TICKET_TTL_MS,
  });
  return ticket;
}

export async function consumeWebSocketAuthTicket(
  ticket: string,
  resolveUser: (userId: string) => Promise<PublicUser | null>,
  now = Date.now(),
): Promise<PublicUser | null> {
  if (!ticket || ticket.length > 128) return null;

  const ticketHash = hashTicket(ticket);
  const record = tickets.get(ticketHash);
  tickets.delete(ticketHash);
  if (!record || record.expiresAt <= now) return null;

  return resolveUser(record.userId);
}