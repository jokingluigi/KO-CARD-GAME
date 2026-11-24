import type { BossDialogueLine, BossPhase, GameState } from '@/game';
import type { CosmeticLoadout } from '@workspace/cosmetics';

const base = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/api`;
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, { ...init, credentials: 'include', cache: 'no-store', headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } });
  const body = await response.json().catch(() => ({})) as T & { message?: string };
  if (!response.ok) throw new Error(body.message ?? '요청을 처리하지 못했어요.');
  return body;
}

export type BossSummary = { id: string; name: string; subtitle: string; description: string; imageUrl: string | null; stageOrder: number; firstClearReward: number; phaseCount: number; cleared: boolean; clearCount: number; locked: boolean };
export type BossInfo = { id: string; name: string; subtitle: string; imageUrl: string | null; introDialogue: BossDialogueLine[]; clearDialogue: BossDialogueLine[]; firstClearReward: number };
export type BossHandoff = {
  matchId: string; deckId: string; aiDeckId: string; difficulty: 'NORMAL' | 'HARD' | 'BOSS'; state: GameState; test: boolean;
  opponentName: string; opponentCosmetics?: CosmeticLoadout;
  selfChampion: { name: string; imageUrl: string | null }; opponentChampion: { name: string; imageUrl: string | null };
  boss: BossInfo;
};
export type BossResult = { cleared: boolean; firstClear: boolean; reward: { amount: number } | null; test: boolean };
export type AdminBoss = {
  id: string; name: string; subtitle: string; description: string; imageUrl: string | null; status: 'DRAFT' | 'PUBLISHED';
  stageOrder: number; aiDeckId: string | null; firstClearReward: number; playerHealthBonus: number;
  phases: BossPhase[]; introDialogue: BossDialogueLine[]; clearDialogue: BossDialogueLine[]; updatedAt: string;
};

export const fetchBosses = () => request<{ bosses: BossSummary[] }>('/bosses');
export const startBoss = (bossId: string, deckId: string, startPhase = 0) =>
  request<BossHandoff>(`/bosses/${encodeURIComponent(bossId)}/start`, { method: 'POST', body: JSON.stringify({ deckId, startPhase }) });
export const completeBoss = (matchId: string, actions: unknown[]) =>
  request<BossResult>(`/bosses/matches/${encodeURIComponent(matchId)}/complete`, { method: 'POST', body: JSON.stringify({ actions }) });

export const fetchAdminBosses = () => request<{ bosses: AdminBoss[] }>('/admin/bosses');
export const createAdminBoss = (body: Partial<AdminBoss>) => request<{ boss: AdminBoss }>('/admin/bosses', { method: 'POST', body: JSON.stringify(body) });
export const saveAdminBoss = (id: string, body: Partial<AdminBoss>) => request<{ boss: AdminBoss }>(`/admin/bosses/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteAdminBoss = (id: string) => request<{ deleted: boolean }>(`/admin/bosses/${encodeURIComponent(id)}`, { method: 'DELETE' });

const KEY = 'ko-boss-handoff:';
export function storeBossHandoff(handoff: BossHandoff) {
  try { sessionStorage.setItem(KEY + handoff.matchId, JSON.stringify(handoff)); } catch { /* 저장 공간이 없으면 메모리로 */ }
  memory.set(handoff.matchId, handoff);
}
const memory = new Map<string, BossHandoff>();
export function readBossHandoff(matchId: string): BossHandoff {
  const kept = memory.get(matchId);
  if (kept) return kept;
  try {
    const raw = sessionStorage.getItem(KEY + matchId);
    if (raw) return JSON.parse(raw) as BossHandoff;
  } catch { /* 무시 */ }
  throw new Error('보스전 준비 기록이 없어요. 보스전 화면에서 다시 시작해 주세요.');
}
