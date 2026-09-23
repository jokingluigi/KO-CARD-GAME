const base = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(body.message ?? "요청을 처리하지 못했습니다.");
  }
  return response.status === 204 ? undefined as T : await response.json() as T;
}

export type DailyQuest = {
  id: string;
  definitionId: string;
  assignmentDate: string;
  slot: number;
  title: string;
  description: string;
  objectiveType: string;
  cardType: string | null;
  targetValue: number;
  rewardType: string;
  rewardAmount: number;
  rewardTargetId: string | null;
  progress: number;
  status: "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "CLAIMED";
  claimedAt: string | null;
};

export type AttendanceDay = {
  dayIndex: number;
  rewardType: string;
  rewardAmount: number;
  rewardTargetId: string | null;
  enabled: boolean;
  state: "CLAIMED" | "AVAILABLE" | "LOCKED";
};

export type AttendanceData = {
  today: string;
  nextDayIndex: number;
  definitions: AttendanceDay[];
  claims: Array<{
    id: string;
    claimDate: string;
    dayIndex: number;
    rewardType: string;
    rewardAmount: number;
    rewardTargetId: string | null;
    claimedAt: string;
  }>;
};

export type RewardAdminData = {
  settings: Array<{ key: string; rewardType: string; amount: number; enabled: boolean }>;
  dailyQuests: Array<{
    id: string;
    title: string;
    description: string;
    objectiveType: string;
    cardType: string | null;
    targetValue: number;
    rewardType: string;
    rewardAmount: number;
    rewardTargetId: string | null;
    enabled: boolean;
  }>;
  attendance: Array<{ dayIndex: number; rewardType: string; rewardAmount: number; rewardTargetId: string | null; enabled: boolean }>;
  rewardType: string;
  rewardTypes: string[];
  objectiveTypes: string[];
};

export const fetchDailyQuests = () => request<{ assignments: DailyQuest[] }>("/daily-quests");
export const claimDailyQuest = (id: string) => request<{ assignment: DailyQuest; reward: { amount: number; balanceAfter: number } | null; alreadyClaimed: boolean }>(`/daily-quests/${encodeURIComponent(id)}/claim`, { method: "POST" });
export const fetchAttendance = () => request<AttendanceData>("/attendance");
export const claimAttendance = () => request<{ attendance: AttendanceData; reward: { amount: number; balanceAfter: number } | null; alreadyClaimed: boolean }>("/attendance/claim", { method: "POST" });
export const fetchRewardAdminData = () => request<RewardAdminData>("/admin/rewards");
export type RewardCatalogCard = { id: string; name: string; imageUrl: string | null; status: string; isToken: boolean; isChampionToken: boolean };
export type RewardCatalogPack = { id: string; name: string; imageUrl: string | null; status: string; deletedAt: string | null };
export const fetchRewardCatalogs = () => Promise.all([
  request<{ cards: RewardCatalogCard[] }>("/cards"),
  request<{ packs: RewardCatalogPack[] }>("/packs"),
]).then(([cards, packs]) => ({ cards: cards.cards, packs: packs.packs }));
export const saveMatchRewardSettings = (body: { winAmount: number; lossAmount: number; enabled: boolean }) => request<{ updated: boolean }>("/admin/rewards/match", { method: "PATCH", body: JSON.stringify(body) });
export const createDailyQuest = (body: object) => request("/admin/rewards/daily-quests", { method: "POST", body: JSON.stringify(body) });
export const updateDailyQuest = (id: string, body: object) => request(`/admin/rewards/daily-quests/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
export const upsertAttendanceReward = (body: object) => request("/admin/rewards/attendance", { method: "POST", body: JSON.stringify(body) });
export const updateAttendanceReward = (dayIndex: number, body: object) => request(`/admin/rewards/attendance/${dayIndex}`, { method: "PATCH", body: JSON.stringify(body) });
export const fetchOnlineMatchRewards = (matchId: string) => request<{
  status: string;
  winnerUserId: string | null;
  grants: Array<{ sourceType: string; amount: number; rewardType: string; balanceAfter: number; createdAt: string }>;
}>(`/online-matches/${encodeURIComponent(matchId)}/rewards`);