import { useEffect, useRef, useState } from "react";
import type { GameState } from "@/game/types/game-state";
import { CardRenderer } from "./card-renderer";
import { spawnSpellDissolve, spellBurnFrames } from "./spell-dissolve";
import { audioManager } from "../audio/audio-manager";
import { prefersReducedMotion } from "./presentation-config";
import "./battle-moments.css";

/** State is already committed. This sequential public reveal never gates the engine. */
export function OverdrawReveal({ state }: { state: GameState }) {
  const cursor = useRef({ game: state.gameId, count: state.events.length });
  const [queue, setQueue] = useState<
    Array<{ key: string; definitionId: string; instanceId?: string; playerId?: string; fatigue?: number }>
  >([]);
  useEffect(() => {
    const prior = cursor.current;
    cursor.current = { game: state.gameId, count: state.events.length };
    if (prior.game !== state.gameId || prior.count > state.events.length) {
      setQueue([]);
      return;
    }
    type Item = { key: string; definitionId: string; instanceId?: string; playerId?: string; fatigue?: number };
    const fresh = state.events.slice(prior.count).flatMap((e, i): Item[] =>
      e.type === "DAMAGE_DEALT" && e.reason === "FATIGUE" && e.playerId
        ? [{ key: `${state.gameId}:${prior.count + i}`, definitionId: "", playerId: e.playerId, fatigue: Number(e.amount ?? 0) }]
        : e.type === "CARD_REVEALED" &&
      e.reason === "OVERDRAW" &&
      e.cardDefinitionId
        ? [
            {
              key: `${state.gameId}:${prior.count + i}`,
              definitionId: e.cardDefinitionId,
              instanceId: e.cardInstanceId,
              playerId: e.playerId,
            },
          ]
        : [],
    );
    if (fresh.length) setQueue((q) => [...q, ...fresh]);
  }, [state.gameId, state.events]);
  const current = queue[0];
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!current) return;
    const timer = window.setTimeout(() => setQueue((q) => q.slice(1)), 1200);
    // An overdrawn card burns away; fatigue thumps like a blow from the empty deck.
    const reduced = prefersReducedMotion();
    let burn: Animation | undefined;
    const fx = window.setTimeout(() => {
      if (document.hidden) return;
      if (current.fatigue !== undefined) { audioManager.playImpactOverlay(import.meta.env.BASE_URL + "sfx/impact-heavy.wav", 50, 6); return; }
      const node = cardRef.current; if (!node || reduced) return;
      const r = node.getBoundingClientRect();
      spawnSpellDissolve({ left: r.left, top: r.top, width: r.width, height: r.height, finisher: true });
      node.classList.add("ko-spell-burning");
      try { burn = node.animate(spellBurnFrames(true), { duration: 420, easing: "cubic-bezier(.4,0,.8,.6)", fill: "forwards" }); } catch { /* visual only */ }
      audioManager.playImpactOverlay(import.meta.env.BASE_URL + "sfx/card-burn.wav", 40, 5);
    }, current.fatigue !== undefined ? 120 : 650);
    return () => { window.clearTimeout(timer); window.clearTimeout(fx); burn?.cancel(); cardRef.current?.classList.remove("ko-spell-burning"); };
  }, [current?.key]);
  const d = state.cardPool?.find((d) => d.id === current?.definitionId);
  if (!current || state.status==='FINISHED') return null;
  if (current.fatigue !== undefined) return (
    <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center" role="status" aria-live="polite">
      <div className="ko-fatigue">
        <div className="ko-fatigue__card"><span>피로</span><b>{current.fatigue}</b></div>
        <p>{current.playerId === state.players[0]?.id ? "덱이 비었어요!" : "상대 덱이 비었어요!"} 피로 피해 {current.fatigue}</p>
      </div>
    </div>
  );
  const instance = state.players
    .find((p) => p.id === current.playerId)
    ?.removedFromGame.find((c) => c.instanceId === current.instanceId);
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <div className="rounded-xl border border-amber-700 bg-neutral-950/95 p-4 text-center shadow-2xl">
        <p className="mb-2 font-bold text-amber-200">
          손패 초과 · 공개 후 제외
        </p>
        {d ? (<div ref={cardRef}>
          <CardRenderer
            cardId={d.id}
            cosmeticOwnerId={current.playerId}
            name={d.name}
            cardType={d.cardType}
            cost={instance?.currentCost ?? d.cost}
            attack={instance?.currentAttack ?? d.attack}
            health={instance?.currentHealth ?? d.health}
            rulesText={d.rulesText}
            rarity={d.rarity}
            imageUrl={d.imageUrl}
            imageDisplaySettings={{
              imageDisplayMode: d.imageDisplayMode ?? "CONTAIN",
              imageScale: d.imageScale ?? 1,
              imagePositionX: d.imagePositionX ?? 50,
              imagePositionY: d.imagePositionY ?? 50,
            }}
            size="hand"
            className="mx-auto !h-[224px] !w-[160px]"
          />
        </div>) : (
          <p>{current.definitionId}</p>
        )}
        <p className="mt-2 text-sm">
          {d?.name ?? "카드"} · 묘지에 들어가지 않아요
        </p>
        {queue.length > 1 && (
          <p className="text-xs">다음 공개 {queue.length - 1}장</p>
        )}
      </div>
    </div>
  );
}
