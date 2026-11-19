import { useEffect, useRef } from "react";
import type { GameState } from "@/game";
import "./messenger-revelation.css";

const FEATHER = "data:image/svg+xml," + encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 60'><path d='M10 0 C17 14 18 32 12 48 L10 60 L8 48 C2 32 3 14 10 0 Z' fill='white'/><path d='M10 6 L10 56' stroke='rgba(200,190,160,.8)' stroke-width='1'/></svg>",
);

function isMessengerGrant(event: GameState["events"][number]): boolean {
  return event.type === "CARD_TEXT_GRANTED" && /messenger/i.test(String((event as { grantedFromDefinitionId?: string }).grantedFromDefinitionId ?? ""));
}

/** A revelation from above: a shaft of light falls on the appointed card, feathers drift, the halo settles. */
export function spawnRevelation(card: Element) {
  const r = card.getBoundingClientRect();
  if (!r.width) return;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const root = document.createElement("div");
  root.className = "ko-revelation";
  root.setAttribute("aria-hidden", "true");
  const cx = r.left + r.width / 2;
  root.style.setProperty("--x", `${cx}px`);
  root.style.setProperty("--top", `${r.top}px`);
  root.style.setProperty("--w", `${r.width}px`);
  root.style.setProperty("--h", `${r.height}px`);
  root.innerHTML = `<i class="ko-revelation__veil"></i><i class="ko-revelation__sky"></i><i class="ko-revelation__beam"></i><i class="ko-revelation__glow"></i><i class="ko-revelation__ring"></i>`;
  if (!reduced) for (let i = 0; i < 6; i += 1) {
    const f = document.createElement("i");
    f.className = "ko-revelation__feather";
    f.style.setProperty("--fx", `${(Math.random() - 0.5) * r.width * 1.3}px`);
    f.style.setProperty("--fd", `${i * 140 + Math.random() * 120}ms`);
    f.style.setProperty("--fr", `${(Math.random() - 0.5) * 140}deg`);
    f.style.setProperty("--feather", `url("${FEATHER}")`);
    root.append(f);
  }
  document.body.append(root);
  window.setTimeout(() => root.remove(), reduced ? 900 : 2600);
}

export function MessengerRevelation({ state }: { state: GameState }) {
  const seen = useRef<{ gameId?: string; length: number }>({ gameId: state.gameId, length: state.events.length });
  useEffect(() => {
    const prev = seen.current;
    if (prev.gameId !== state.gameId || state.events.length < prev.length) { seen.current = { gameId: state.gameId, length: state.events.length }; return; }
    const fresh = state.events.slice(prev.length).filter(isMessengerGrant);
    seen.current = { gameId: state.gameId, length: state.events.length };
    if (!fresh.length || document.hidden) return;
    fresh.forEach((event, index) => {
      const id = event.cardInstanceId ?? (event.target?.type === "CARD" ? event.target.cardInstanceId : undefined);
      if (!id) return;
      window.setTimeout(() => {
        const node = document.querySelector(`[data-card-instance-id="${CSS.escape(id)}"]`);
        if (node) spawnRevelation(node);
      }, 180 + index * 400);
    });
  }, [state.events, state.gameId]);
  return null;
}
