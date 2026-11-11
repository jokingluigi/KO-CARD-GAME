import { useEffect, useState, type CSSProperties } from "react";
import { nextSecondDelay, secondsUntil } from "../lib/battle-clock";

/** Only this small HUD subtree re-renders when an online second elapses. */
export function BattleTurnClock({
  seconds,
  deadline,
  offset = 0,
  compact = false,
}: {
  seconds: number;
  deadline?: number | null;
  offset?: number;
  compact?: boolean;
}) {
  const [, setNow] = useState(Date.now);
  useEffect(() => {
    if (deadline == null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      if (timer !== undefined) clearTimeout(timer);
      const current = Date.now();
      setNow(current);
      const delay = nextSecondDelay(deadline, offset, current);
      if (delay !== null) timer = setTimeout(update, delay);
    };
    update();
    const visible = () => {
      if (!document.hidden) update();
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", update);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", update);
    };
  }, [deadline, offset]);
  const remaining = secondsUntil(deadline, offset, Date.now(), seconds);
  if (compact)
    return (
      <span
        className={remaining <= 10 ? "text-red-300" : "text-amber-300"}
        data-testid="text-online-turn-timer"
      >
        {remaining}s
      </span>
    );
  return (
    <div
      data-time-pressure={
        remaining <= 5 ? "critical" : remaining <= 10 ? "warning" : "normal"
      }
      data-testid="battle-turn-timer"
      style={
        {
          "--timer-remaining": Math.max(0, Math.min(1, remaining / 10)),
        } as CSSProperties
      }
      className={`ko-battle-time rounded border px-2 py-1 text-center font-display text-sm font-black md:text-lg ${remaining <= 10 ? "border-red-500 bg-red-950/80 text-red-300" : "border-neutral-700 bg-neutral-900/90 text-primary"}`}
      aria-label={`남은 턴 시간 ${Math.floor(remaining / 60)}분 ${remaining % 60}초`}
    >
      {String(Math.floor(remaining / 60)).padStart(2, "0")}:
      {String(remaining % 60).padStart(2, "0")}
    </div>
  );
}
