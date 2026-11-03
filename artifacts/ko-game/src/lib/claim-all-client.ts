import { requestJson } from "./client-request";
import {
  readPendingTutorialProofs,
  discardPaidTutorialProof,
} from "@/components/tutorial/tutorial-rewards";
import { LESSONS } from "@workspace/game-engine";
export const REWARDS_UPDATED_EVENT = "ko-rewards-updated";
export type RewardBalances = {
  currencyBalance: number;
  prismBalance: number;
  championPrismBalance: number;
  isTestAccount: boolean;
};
export type RewardIssue = {
  kind: string;
  id: string;
  label: string;
  message: string;
};
export type ClaimAllResult = {
  accountId: string;
  items: Array<{
    id: string;
    kind: string;
    label: string;
    status: "CLAIMED" | "ALREADY_CLAIMED" | "FAILED";
    message?: string;
  }>;
  totals: Array<{
    rewardType: string;
    rewardAmount: number;
    rewardTargetId: string | null;
    label: string;
  }>;
  issues: RewardIssue[];
  claimedCount: number;
  failedCount: number;
  balances: RewardBalances | null;
};
export type AvailableRewards = {
  accountId: string;
  items: Array<{ id: string; kind: string; label: string }>;
  issues: RewardIssue[];
  tutorialClaimed: string[];
  balances: RewardBalances | null;
};
const base = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api/rewards";
const active = new Map<string, Promise<ClaimAllResult>>();
function validAccount(account: string, value: { accountId: string }) {
  if (value.accountId !== account)
    throw Error("현재 계정의 보상 기록을 다시 확인해 주세요.");
}
export function signalRewardsUpdated(accountId: string) {
  window.dispatchEvent(
    new CustomEvent(REWARDS_UPDATED_EVENT, { detail: { accountId } }),
  );
}
export async function readAvailableRewards(accountId: string) {
  const data = await requestJson<AvailableRewards>(
    base + "/available",
    {},
    { label: "보상 상태 확인" },
  );
  validAccount(accountId, data);
  if (
    !Array.isArray(data.items) ||
    !Array.isArray(data.issues) ||
    !Array.isArray(data.tutorialClaimed)
  )
    throw Error("보상 상태를 확인하지 못했어요.");
  for (const id of data.tutorialClaimed)
    if (LESSONS.some((l) => l.id === id))
      discardPaidTutorialProof(accountId, id as (typeof LESSONS)[number]["id"]);
  return {
    ...data,
    pendingTutorialCount: readPendingTutorialProofs(accountId).filter(
      (p) => !data.tutorialClaimed.includes(p.lessonId),
    ).length,
  };
}
export function collectAllRewards(accountId: string): Promise<ClaimAllResult> {
  const prior = active.get(accountId);
  if (prior) return prior;
  const operation = requestJson<ClaimAllResult>(
    base + "/claim-all",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId,
        tutorialProofs: readPendingTutorialProofs(accountId),
      }),
    },
    { label: "보상 모두 받기", timeoutMs: 45000 },
  )
    .then((data) => {
      validAccount(accountId, data);
      if (
        !Array.isArray(data.items) ||
        !Array.isArray(data.totals) ||
        !Array.isArray(data.issues) ||
        !Number.isInteger(data.claimedCount) ||
        !Number.isInteger(data.failedCount)
      )
        throw Error(
          "보상 결과를 확인하지 못했어요. 이미 지급됐을 수 있으니 상태를 다시 확인해 주세요.",
        );
      for (const item of data.items)
        if (
          item.kind === "TUTORIAL" &&
          item.status !== "FAILED" &&
          LESSONS.some((l) => l.id === item.id)
        )
          discardPaidTutorialProof(
            accountId,
            item.id as (typeof LESSONS)[number]["id"],
          );
      return data;
    })
    .finally(() => {
      if (active.get(accountId) === operation) active.delete(accountId);
    });
  active.set(accountId, operation);
  return operation;
}
