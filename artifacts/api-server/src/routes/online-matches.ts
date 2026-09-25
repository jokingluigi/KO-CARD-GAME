import { Router, type Request, type Response } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db, onlineMatchesTable, rewardGrantsTable } from "@workspace/db";
import { getAuthenticatedUser } from "../lib/auth";
import {
  applyMatchAction,
  abandonOnlineMatch,
  attachConnection,
  broadcastExecution,
  createWaitingMatch,
  detachConnection,
  getRuntime,
  getActiveMatchForUser,
  joinWaitingMatch,
  matchSeat,
  messageForViewer,
  endedMessageForViewer,
  rejectionMessage,
  snapshotMessage,
  type OnlineMatchConnection,
} from "../online/service";
import type { OnlineActionPayload } from "../online/protocol";
import {
  createWebSocketAuthTicket,
  WEBSOCKET_AUTH_TICKET_TTL_SECONDS,
} from "../online/websocket-ticket";

const router = Router();

async function requireUser(request: Request, response: Response) {
  const user = request.authUser ?? await getAuthenticatedUser(request);
  if (!user) {
    response.status(401).json({ message: "로그인이 필요합니다." });
    return null;
  }
  return user;
}

router.post("/ws-ticket", async (request, response) => {
  const user = await requireUser(request, response);
  if (!user) return;
  response.json({
    ticket: createWebSocketAuthTicket(user.id),
    expiresIn: WEBSOCKET_AUTH_TICKET_TTL_SECONDS,
  });
});

router.post("/", async (request, response) => {
  const user = await requireUser(request, response);
  if (!user) return;
  const deckId = typeof request.body?.deckId === "string" ? request.body.deckId : "";
  if (!deckId) {
    response.status(400).json({ message: "deckId가 필요합니다." });
    return;
  }
  try {
    const match = await createWaitingMatch(user.id, deckId, user.isTestAccount);
    response.status(201).json({
      match: {
        id: match.id,
        status: match.status,
        player1UserId: match.player1UserId,
      },
    });
  } catch (error) {
    response.status(400).json({ message: error instanceof Error ? error.message : "매치를 생성하지 못했습니다." });
  }
});

router.get("/active", async (request, response) => {
  const user = await requireUser(request, response);
  if (!user) return;
  try {
    const match = await getActiveMatchForUser(user.id);
    response.json({
      match: match
        ? { id: match.id, status: match.status, stateVersion: match.stateVersion }
        : null,
    });
  } catch {
    response.status(503).json({ message: "진행 중인 매치 상태를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요." });
  }
});

router.post("/:matchId/abandon", async (request, response) => {
  const user = await requireUser(request, response);
  if (!user) return;
  try {
    const result = await abandonOnlineMatch(request.params.matchId, user.id);
    if (result === "FORBIDDEN") {
      response.status(404).json({ message: "매치를 찾을 수 없습니다." });
      return;
    }
    response.json({ status: result });
  } catch {
    response.status(503).json({ message: "매치 상태를 확인하거나 종료하지 못했습니다. 다시 시도해 주세요." });
  }
});

router.get("/:matchId/rewards", async (request, response) => {
  const user = await requireUser(request, response);
  if (!user) return;
  const [match] = await db.select({
    player1UserId: onlineMatchesTable.player1UserId,
    player2UserId: onlineMatchesTable.player2UserId,
    status: onlineMatchesTable.status,
    winnerUserId: onlineMatchesTable.winnerUserId,
  }).from(onlineMatchesTable)
    .where(eq(onlineMatchesTable.id, request.params.matchId))
    .limit(1);
  if (!match || (match.player1UserId !== user.id && match.player2UserId !== user.id)) {
    response.status(404).json({ message: "매치를 찾을 수 없습니다." });
    return;
  }
  if (match.status === "ENDED") {
    await getRuntime(request.params.matchId);
  }
  const grants = await db.select({
    sourceType: rewardGrantsTable.sourceType,
    amount: rewardGrantsTable.amount,
    rewardType: rewardGrantsTable.rewardType,
    balanceAfter: rewardGrantsTable.balanceAfter,
    createdAt: rewardGrantsTable.createdAt,
  }).from(rewardGrantsTable)
    .where(and(
      eq(rewardGrantsTable.userId, user.id),
      eq(rewardGrantsTable.sourceId, request.params.matchId),
      inArray(rewardGrantsTable.sourceType, ["MATCH_ONLINE_WIN", "MATCH_ONLINE_LOSS"]),
    ));
  response.json({ status: match.status, winnerUserId: match.winnerUserId, grants });
});

router.post("/:matchId/join", async (request, response) => {
  const user = await requireUser(request, response);
  if (!user) return;
  const deckId = typeof request.body?.deckId === "string" ? request.body.deckId : "";
  if (!deckId) {
    response.status(400).json({ message: "deckId가 필요합니다." });
    return;
  }
  try {
    const runtime = await joinWaitingMatch(request.params.matchId, user.id, deckId, user.isTestAccount);
    response.status(201).json(snapshotMessage(runtime, user.id));
  } catch (error) {
    response.status(400).json({ message: error instanceof Error ? error.message : "매치에 참가하지 못했습니다." });
  }
});

router.get("/:matchId", async (request, response) => {
  const user = await requireUser(request, response);
  if (!user) return;
  const runtime = await getRuntime(request.params.matchId);
  if (!runtime || !matchSeat(runtime, user.id)) {
    response.status(404).json({ message: "매치를 찾을 수 없습니다." });
    return;
  }
  response.json(snapshotMessage(runtime, user.id));
});

router.post("/:matchId/action", async (request, response) => {
  const user = await requireUser(request, response);
  if (!user) return;
  const requestId = typeof request.body?.requestId === "string" ? request.body.requestId : "";
  const expectedVersion = request.body?.expectedVersion;
  const action = request.body?.action as OnlineActionPayload;
   if (!requestId || requestId.length > 128 || !Number.isInteger(expectedVersion) || expectedVersion < 0) {
    response.status(400).json({ message: "requestId와 expectedVersion이 필요합니다." });
    return;
  }
  try {
    const result = await applyMatchAction(
      request.params.matchId,
      user.id,
      requestId,
      expectedVersion,
      action,
    );
     const message = result.ok
       ? result.runtime.state.status === "FINISHED"
         ? endedMessageForViewer(result, user.id)
         : messageForViewer(result, user.id)
       : rejectionMessage(result);
    if (result.ok) broadcastExecution(result);
    response.status(result.ok ? 200 : 409).json(message);
  } catch (error) {
    response.status(404).json({ message: error instanceof Error ? error.message : "매치 action을 처리하지 못했습니다." });
  }
});

export { requireUser };
export default router;