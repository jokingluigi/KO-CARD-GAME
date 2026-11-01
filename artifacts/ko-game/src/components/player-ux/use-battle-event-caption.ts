import { useEffect, useRef, useState } from "react";
import type { GameState } from "@/game";
import { battleEventCaption } from "./battle-event-caption-policy";
export function useBattleEventCaption(state: GameState, enabled: boolean) {
  const previous = useRef(state),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const old = previous.current;
    previous.current = state;
    if (!enabled || old.gameId !== state.gameId || document.hidden) {
      clearTimeout(timer.current);
      setMessage(null);
      return;
    }
    const next = battleEventCaption(old, state);
    if (!next) return;
    clearTimeout(timer.current);
    setMessage(next);
    if (state.status !== "FINISHED")
      timer.current = setTimeout(() => setMessage(null), 2200);
  }, [state, enabled]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return enabled ? message : null;
}
