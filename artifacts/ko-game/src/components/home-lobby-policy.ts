import type { MainNotice } from "@/lib/main-content-client";
/** Invalid or partial responses never invent a reward count. */
export function claimableHomeRewards(
  quests: unknown,
  attendance: unknown,
): { quests: number; attendance: number; total: number } | null {
  const q = quests as {
    assignments?: Array<{ id?: string; status?: string }>;
    completionBonus?: { enabled?: boolean; status?: string };
  } | null;
  const a = attendance as {
    definitions?: Array<{
      dayIndex?: number;
      enabled?: boolean;
      state?: string;
    }>;
  } | null;
  if (!Array.isArray(q?.assignments) || !Array.isArray(a?.definitions))
    return null;
  const questIds = new Set(
    q.assignments
      .filter((x) => x && x.status === "COMPLETED" && typeof x.id === "string")
      .map((x) => x.id),
  );
  const days = new Set(
    a.definitions
      .filter(
        (x) =>
          x &&
          x.enabled === true &&
          x.state === "AVAILABLE" &&
          typeof x.dayIndex === "number",
      )
      .map((x) => x.dayIndex),
  );
  const count =
    questIds.size +
    (q.completionBonus?.enabled === true &&
    q.completionBonus.status === "COMPLETED"
      ? 1
      : 0);
  return { quests: count, attendance: days.size, total: count + days.size };
}
export function latestHomeNotice(
  notices: MainNotice[],
): MainNotice | undefined {
  return notices.reduce<MainNotice | undefined>(
    (best, n) =>
      !best ||
      (Date.parse(n.createdAt) || 0) > (Date.parse(best.createdAt) || 0)
        ? n
        : best,
    undefined,
  );
}
export function homeNoticeVersion(n: MainNotice | undefined) {
  return n ? `${n.id}:${n.updatedAt ?? n.createdAt ?? ""}` : "";
}
