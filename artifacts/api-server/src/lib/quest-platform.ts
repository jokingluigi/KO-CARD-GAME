
import type { GameEvent, GameState } from "@workspace/game-engine";
import { questEventIncrement, validateQuestCondition, QUEST_CONDITION_SCHEMA_VERSION } from "@workspace/game-engine";
import { isRewardType } from "./reward-service";
export const QUEST_MODES = ["AI", "PVP", "TOWER", "DRAFT"] as const;
export type QuestMode = typeof QUEST_MODES[number];
export type QuestReward = { rewardType: string; rewardAmount: number; rewardTargetId: string | null };
export type QuestPlatform = {
 questType: "DAILY" | "SEASON"; version: number; seasonId: string | null;
 archived: boolean; weight: number; modes: QuestMode[]; rarity: string | null;
 result: "ANY" | "WIN" | "LOSS"; activationAt: string | null; rewards: QuestReward[];
};
export const QUEST_OBJECTIVES = ["PLAY_MATCH", "WIN_MATCH", "LOSS_MATCH", "CARD_PLAYED", "TECHNIQUE_PLAYED", "WRESTLER_PLAYED", "CARD_RETIRED", "CARD_DESTROYED", "DAMAGE_DEALT", "CHAMPION_ABILITY_USED", "FUSION", "ATTACK_DECLARED"];
export function readPlatform(record: { platform?: unknown; rewardType: string; rewardAmount: number; rewardTargetId?: string | null }): QuestPlatform {
 const p = record.platform as Partial<QuestPlatform> | null | undefined;
 return { questType: p?.questType ?? "DAILY", version: p?.version ?? 1, seasonId: p?.seasonId ?? null,
 archived: p?.archived ?? false, weight: p?.weight ?? 100, modes: p?.modes ?? [...QUEST_MODES],
 rarity: p?.rarity ?? null, result: p?.result ?? "ANY", activationAt: p?.activationAt ?? null,
 rewards: p?.rewards ?? [{ rewardType: record.rewardType, rewardAmount: record.rewardAmount, rewardTargetId: record.rewardTargetId ?? null }] };
}
export function validatePlatform(input: Record<string, unknown>, previousVersion = 0): QuestPlatform | null {
 const p = (input.platform ?? {}) as Partial<QuestPlatform>;
 if (!p || typeof p !== "object" || Array.isArray(p)) return null;
 const rewards = p.rewards ?? [{ rewardType: (input.rewardType ?? "CURRENCY") as string, rewardAmount: input.rewardAmount as number, rewardTargetId: input.rewardTargetId as string | null }];
 if (!Array.isArray(rewards) || !rewards.length || rewards.length > 10 || rewards.some(r => !r || !isRewardType(r.rewardType) || !Number.isSafeInteger(r.rewardAmount) || r.rewardAmount < 1 || r.rewardAmount > 100000000 || (r.rewardType === "CHAMPION" && r.rewardAmount !== 1) || (r.rewardType === "CURRENCY" ? Boolean(r.rewardTargetId) : typeof r.rewardTargetId !== "string" || !r.rewardTargetId.trim()))) return null;
 const questType = p.questType ?? "DAILY", modes = p.modes ?? [...QUEST_MODES], weight = p.weight ?? 100;
 if (!["DAILY", "SEASON"].includes(questType) || (questType === "SEASON" && (!p.seasonId || typeof p.seasonId !== "string")) ||
 !Array.isArray(modes) || !modes.length || modes.some(m => !QUEST_MODES.includes(m)) ||
 !Number.isSafeInteger(weight) || weight < 1 || weight > 100000 ||
 (p.rarity != null && !["NORMAL", "EPIC", "LEGENDARY", "CHAMPION"].includes(p.rarity)) ||
 (p.result != null && !["ANY", "WIN", "LOSS"].includes(p.result)) ||
 (p.activationAt != null && !Number.isFinite(Date.parse(p.activationAt)))) return null;
 return { questType, version: previousVersion + 1, seasonId: questType === "SEASON" ? p.seasonId! : null,
 modes: [...new Set(modes)], weight, archived: p.archived === true, rarity: p.rarity ?? null,
 result: p.result ?? "ANY", activationAt: p.activationAt ?? null, rewards };
}
export function questDiagnostic(record: { objectiveType: string; cardType: string | null; schemaVersion?: string; condition?: unknown; platform?: unknown; rewardType: string; rewardAmount: number; rewardTargetId?: string | null },
 event: GameEvent, playerId: string, mode: QuestMode, result: "WIN" | "LOSS" | null, rarity: string | null = null) {
 const p = readPlatform(record);
 if (event.type === "FUSION" && event.reason === "FUSION_TARGET") return {increment:0,reason:"동일 합체의 대상 이벤트 중복 제외"};
 if (!p.modes.includes(mode)) return { increment: 0, reason: "모드 제외" };
 if (p.result !== "ANY" && p.result !== result) return { increment: 0, reason: "경기 결과 제외" };
 if (p.rarity && p.rarity !== rarity) return { increment: 0, reason: "등급 제외" };
 if (record.schemaVersion === QUEST_CONDITION_SCHEMA_VERSION) {
 const condition = validateQuestCondition(record.condition);
 const increment = condition ? questEventIncrement(condition, event, playerId, {cardMetadataAvailable: Boolean(event.tags), cardTags: event.tags ?? []}) : 0;
 return { increment, reason: increment ? "조건 일치" : "이벤트 또는 추가 조건 제외" };
 }
 if (event.playerId !== playerId) return { increment: 0, reason: "이벤트 소유자 제외" };
 let increment = 0;
 if (record.objectiveType === "PLAY_MATCH") increment = event.reason === "QUEST_MATCH_FINISHED" ? 1 : 0;
 else if (record.objectiveType === "WIN_MATCH" || record.objectiveType === "LOSS_MATCH") increment = event.reason === "QUEST_MATCH_FINISHED" && result === (record.objectiveType === "WIN_MATCH" ? "WIN" : "LOSS") ? 1 : 0;
 else if (record.objectiveType === "TECHNIQUE_PLAYED" || record.objectiveType === "WRESTLER_PLAYED") increment = event.type === "CARD_PLAYED" && event.cardType === (record.objectiveType === "TECHNIQUE_PLAYED" ? "TECHNIQUE" : "WRESTLER") ? 1 : 0;
 else if (event.type === record.objectiveType && (!record.cardType || record.cardType === event.cardType)) increment = record.objectiveType === "DAMAGE_DEALT" ? Math.max(0, event.amount ?? 0) : 1;
 return { increment, reason: increment ? "조건 일치" : "이벤트 또는 카드 종류 제외" };
}
export function cardRarity(state: GameState, event: GameEvent): string | null {
 if (event.cardDefinitionId) return state.cardPool?.find(c=>c.id===event.cardDefinitionId)?.rarity ?? null;
 const id = event.cardInstanceId ?? event.sourceSnapshot?.cardInstanceId ?? event.targetSnapshot?.cardInstanceId;
 const instance = state.players.flatMap(p => [...p.deck, ...p.hand, ...p.board.filter(Boolean), ...p.graveyard, ...p.removedFromGame]).find(c => c?.instanceId === id);
 return instance ? state.cardPool?.find(c => c.id === instance.definitionId)?.rarity ?? null : null;
}
