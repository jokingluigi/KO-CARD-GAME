import { Router, type Request, type Response } from "express";
import { getAuthenticatedUser } from "../lib/auth";
import {
  applyMatchAction,
  attachConnection,
  broadcastExecution,
  createWaitingMatch,
  detachConnection,
  getRuntime,
  joinWaitingMatch,
  matchSeat,
  messageForViewer,
  rejectionMessage,
  snapshotMessage,
  type OnlineMatchConnection,
} from "../online/service";
import type { OnlineActionPayload } from "../online/protocol";

const router = Router();

async function requireUser(request: Request, response: Response) {
  const user = request.authUser ?? await getAuthenticatedUser(request);
  if (!user) {
    response.status(401).json({ message: "로그인이 필요합니다." });
    return null;
  }
  return user;
}

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
  if (!requestId || !Number.isInteger(expectedVersion)) {
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
    const message = result.ok ? messageForViewer(result, user.id) : rejectionMessage(result);
    if (result.ok) broadcastExecution(result);
    response.status(result.ok ? 200 : 409).json(message);
  } catch (error) {
    response.status(404).json({ message: error instanceof Error ? error.message : "매치 action을 처리하지 못했습니다." });
  }
});

export { requireUser };
export default router;