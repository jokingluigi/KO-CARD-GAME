import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { getPublicUser, type PublicUser } from "../lib/auth";
import { consumeWebSocketAuthTicket } from "./websocket-ticket";

export async function getUserFromWebSocketAuthTicket(
  ticket: string,
): Promise<PublicUser | null> {
  return consumeWebSocketAuthTicket(ticket, async (userId) => {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    return user ? getPublicUser(user) : null;
  });
}