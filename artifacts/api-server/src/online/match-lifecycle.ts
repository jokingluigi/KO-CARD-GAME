export type ActiveMatchDisposition = "RESUMABLE" | "FINISHED" | "UNRESUMABLE";

export function classifyActiveMatch(
  matchStatus: string,
  gameStateStatus: unknown,
): ActiveMatchDisposition {
  if (matchStatus !== "ACTIVE") return "UNRESUMABLE";
  if (gameStateStatus === "FINISHED") return "FINISHED";
  if (gameStateStatus === "IN_PROGRESS") return "RESUMABLE";
  return "UNRESUMABLE";
}