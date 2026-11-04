import { useEffect, useRef, useState } from "react";
import type { GameState } from "@/game/types/game-state";
import { CardRenderer } from "./card-renderer";

/** State is already committed. This sequential public reveal never gates the engine. */
export function OverdrawReveal({ state }: { state: GameState }) {
  const cursor = useRef({ game: state.gameId, count: state.events.length });
  const [queue, setQueue] = useState<
    Array<{ key: string; definitionId: string; instanceId?: string; playerId?: string }>
  >([]);
  useEffect(() => {
    const prior = cursor.current;
    cursor.current = { game: state.gameId, count: state.events.length };
    if (prior.game !== state.gameId || prior.count > state.events.length) {
      setQueue([]);
      return;
    }
    const fresh = state.events.slice(prior.count).flatMap((e, i) =>
      e.type === "CARD_REVEALED" &&
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
  useEffect(() => {
    if (!current) return;
    const timer = window.setTimeout(() => setQueue((q) => q.slice(1)), 1200);
    return () => window.clearTimeout(timer);
  }, [current?.key]);
  const d = state.cardPool?.find((d) => d.id === current?.definitionId);
  if (!current || state.status==='FINISHED') return null;
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
        {d ? (
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
        ) : (
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
