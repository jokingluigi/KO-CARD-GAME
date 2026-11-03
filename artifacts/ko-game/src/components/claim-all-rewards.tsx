import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Gift, CheckCircle2, Coins, LoaderCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import {
  fetchCurrentUser,
  refreshCurrentUser,
  type AuthUser,
} from "@/lib/auth-client";
import {
  collectAllRewards,
  readAvailableRewards,
  signalRewardsUpdated,
  type ClaimAllResult,
  type RewardBalances,
} from "@/lib/claim-all-client";
import { MotionNumber } from "./presentation-motion";
import "./claim-all-rewards.css";
export function ClaimAllRewardsButton({
  accountId,
  disabled = false,
  onCompleted,
  onUserChanged,
}: {
  accountId?: string;
  disabled?: boolean;
  onCompleted?: (result: ClaimAllResult) => void;
  onUserChanged?: (user: AuthUser) => void;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<ClaimAllResult | null>(null),
    [error, setError] = useState(""),
    [checked, setChecked] = useState<{
      count: number;
      incomplete: boolean;
      balances: RewardBalances | null;
    } | null>(null);
  const lock = useRef(false),
    alive = useRef(true),
    account = useRef<string | null>(null),
    trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function identity() {
    if (accountId) return accountId;
    const response = await fetchCurrentUser();
    if (!response.authenticated || !response.user)
      throw Error("로그인 후 보상을 받을 수 있어요.");
    return response.user.id;
  }
  async function run() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setOpen(true);
    setError("");
    setChecked(null);
    setResult(null);
    try {
      const id = await identity();
      account.current = id;
      const response = await collectAllRewards(id);
      signalRewardsUpdated(id);
      if (alive.current) {
        setResult(response);
        onCompleted?.(response);
      }
      void refreshCurrentUser()
        .then((auth) => {
          if (alive.current && auth.authenticated && auth.user?.id === id)
            onUserChanged?.(auth.user);
        })
        .catch(() => {});
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "보상을 확인하지 못했어요.");
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function check() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const id = account.current ?? (await identity());
      const data = await readAvailableRewards(id);
      signalRewardsUpdated(id);
      if (alive.current)
        setChecked({
          count: data.items.length + data.pendingTutorialCount,
          incomplete: data.issues.length > 0,
          balances: data.balances,
        });
      void refreshCurrentUser()
        .then((auth) => {
          if (alive.current && auth.authenticated && auth.user?.id === id)
            onUserChanged?.(auth.user);
        })
        .catch(() => {});
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error ? e.message : "지급 상태를 확인하지 못했어요.",
        );
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const partial = Boolean(result?.failedCount);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="ko-claim-all-button"
        data-testid="button-claim-all-rewards"
        disabled={disabled || busy}
        onClick={() => void run()}
      >
        <Gift size={16} aria-hidden="true" />
        {busy ? "보상 받는 중…" : "보상 모두 받기"}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="ko-claim-all-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus({ preventScroll: true });
          }}
        >
          <DialogTitle>
            {busy
              ? "보상을 모으고 있어요"
              : error
                ? "지급 상태를 확인해 주세요"
                : partial
                  ? "받은 보상과 남은 보상"
                  : result?.claimedCount
                    ? "보상을 받았어요"
                    : "보상 확인"}
          </DialogTitle>
          <DialogDescription>
            퀘스트·일일 추가 보상·출석·튜토리얼 미수령 기록을 한 번에 확인해요.
            이미 지급된 보상은 다시 지급하지 않아요.
          </DialogDescription>
          {busy && (
            <p role="status" className="ko-claim-all-progress">
              <LoaderCircle className="animate-spin" size={22} />
              지금 받을 수 있는 보상을 처리하고 있어요…
            </p>
          )}
          {result && (
            <>
              <p role="status" className="ko-claim-all-summary">
                <CheckCircle2 size={20} />
                {result.claimedCount
                  ? `${result.claimedCount}건 수령 완료`
                  : result.failedCount
                    ? "확인하지 못한 보상이 있어요."
                    : "지금 받을 수 있는 미수령 보상이 없어요."}
                {partial && ` · ${result.failedCount}건 다시 확인`}
              </p>
              {result.totals.length > 0 && (
                <ul
                  className="ko-claim-all-totals"
                  aria-label="이번에 받은 보상"
                >
                  {result.totals.map((t) => (
                    <li key={t.rewardType + ":" + t.rewardTargetId}>
                      {t.rewardType === "CURRENCY" ? (
                        <Coins size={20} />
                      ) : (
                        <Gift size={20} />
                      )}
                      <span>{t.label}</span>
                      <strong>
                        +
                        <MotionNumber
                          value={t.rewardAmount}
                          format={(n) => n.toLocaleString()}
                        />
                        {t.rewardType === "CURRENCY" ? "" : "개"}
                      </strong>
                    </li>
                  ))}
                </ul>
              )}
              {partial && (
                <div className="ko-claim-all-issues" role="alert">
                  <p>
                    받은 보상은 유지돼요. 남은 항목만 다시 확인할 수 있어요.
                  </p>
                  <ul>
                    {[
                      ...result.items.filter((i) => i.status === "FAILED"),
                      ...result.issues,
                    ].map((i, n) => (
                      <li key={i.kind + i.id + n}>{i.label} · 확인 필요</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="ko-claim-all-issues">
              {error} 일부 보상은 이미 지급됐을 수 있어요. 다시 받기 전에 지급
              상태를 확인하세요.
            </p>
          )}
          {checked && (
            <p role="status">
              {checked.incomplete
                ? "아직 확인하지 못한 보상이 있어요."
                : checked.count
                  ? `현재 받을 수 있는 보상 ${checked.count}건`
                  : "현재 받을 수 있는 미수령 보상이 없어요."}
            </p>
          )}
          {(checked?.balances ?? result?.balances) && (
            <p className="ko-claim-all-balance">
              보유 크레딧{" "}
              {(checked?.balances ?? result?.balances)!.isTestAccount
                ? "∞"
                : (checked?.balances ??
                    result?.balances)!.currencyBalance.toLocaleString()}
            </p>
          )}
          <div className="ko-claim-all-actions">
            {error && !checked && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void check()}
              >
                지급 상태 다시 확인
              </button>
            )}
            {(partial ||
              Boolean(checked && (checked.count || checked.incomplete))) && (
              <button type="button" disabled={busy} onClick={() => void run()}>
                남은 보상 모두 받기
              </button>
            )}
            <Link href="/packs" onClick={() => setOpen(false)}>
              내 팩 확인
            </Link>
            <button type="button" onClick={() => setOpen(false)}>
              확인
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
