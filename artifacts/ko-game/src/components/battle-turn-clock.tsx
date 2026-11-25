import { useEffect, useRef, useState, type CSSProperties } from "react";
import "./battle-juice.css";
import { createPortal } from "react-dom";
import { audioManager } from "../audio/audio-manager";
import "./turn-rope.css";
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
  const rope=!compact&&deadline!=null&&remaining<=ROPE_SECONDS&&remaining>0;
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
      {rope&&<TurnRope remaining={remaining}/>}
    </div>
  );
}

const ROPE_SECONDS = 15;

/** Hearthstone's burning rope: in the last seconds a fuse burns along the battle controls. Visual only. */
function TurnRope({ remaining }: { remaining: number }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const lit = useRef(false);
  useEffect(() => {
    const measure = () => setRect(document.querySelector('.ko-game-controls')?.getBoundingClientRect() ?? null);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  useEffect(() => {
    if (document.hidden) return;
    if (!lit.current) { lit.current = true; audioManager.playImpactOverlay(import.meta.env.BASE_URL + 'sfx/rope-ignite.wav', 34, 3); }
    else if (remaining <= 5) audioManager.playImpactOverlay(import.meta.env.BASE_URL + 'sfx/rope-tick.wav', remaining <= 3 ? 34 : 26, 2);
    // 16. 시간이 얼마 안 남으면 심장박동
    if (remaining > 0 && remaining <= 10 && remaining % (remaining <= 5 ? 1 : 2) === 0) audioManager.playImpactOverlay(import.meta.env.BASE_URL + 'sfx/heartbeat.wav', remaining <= 5 ? 30 : 20, 1);
  }, [remaining]);
  if (!rect) return null;
  // The fuse is the full width at ROPE_SECONDS and burns towards the left edge; one second of burn per tick.
  const fraction = Math.max(0, (remaining - 1) / ROPE_SECONDS);
  return createPortal(
    <div className="ko-turn-rope" aria-hidden="true" style={{ left: rect.left + 8, top: rect.top - 6, width: rect.width - 16 } as CSSProperties}>
      <div className="ko-turn-rope__cord" style={{ width: `${fraction * 100}%` }}>
        <span className="ko-turn-rope__flame" />
      </div>
      {remaining <= 10 && <div className={`kj-time-pulse ${remaining <= 5 ? 'kj-time-pulse--hard' : ''}`} />}
    </div>,
    document.body,
  );
}
