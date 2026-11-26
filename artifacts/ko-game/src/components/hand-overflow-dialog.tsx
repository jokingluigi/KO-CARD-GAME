import React, { useEffect, useState } from "react";
import type { GameState } from "@/game/types/game-state";
import { CardRenderer } from "./card-renderer";
import { CardDetailDialog, type CardDetailRecord } from "./card-detail-dialog";
import { audioManager } from "../audio/audio-manager";
import { prefersReducedMotion } from "./presentation-config";
import "./mulligan-stage.css";
import "./hand-overflow-dialog.css";

const SFX = (name: string) => `${import.meta.env.BASE_URL}vendor/hs-mixes/${name}`;
const SYNTH = (name: string) => `${import.meta.env.BASE_URL}vendor/ko-synth/${name}`;
const sound = (url: string, volume: number, pitch?: number) => {
  try { audioManager.playImpactOverlay(url, volume, 2, pitch ? { pitch } : undefined); } catch { /* 소리는 연출 */ }
};

/**
 * 손패가 가득 찼을 때 버릴 카드 고르기 — 멀리건과 같은 검정·금색 무대.
 * 위에는 새로 들어올 카드가 빛나며 떠 있고, 아래 손패에서 한 장을 고르면 '버림' 도장이 찍힌다.
 * 확정하면 고른 카드는 불타며 묘지로 떨어지고 새 카드가 손패로 내려간 뒤에 서버에 보낸다.
 * 고르는 동안에는 화면에서만 바뀌고, 확정 버튼을 눌러야 실제 행동이 보내진다.
 */
export function HandOverflowDialog({
  state,
  playerId,
  onConfirm,
}: {
  state: GameState;
  playerId: string;
  onConfirm: (id: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null),
    [detail, setDetail] = useState<CardDetailRecord | null>(null),
    [leaving, setLeaving] = useState(false);
  const owner = state.players.find((p) => p.id === playerId)!,
    pending = state.targetingState?.handAddition;
  const incoming = pending?.cards[0]?.card;
  const definitions = state.cardPool ?? [];
  const reduced = prefersReducedMotion();
  const [dealt, setDealt] = useState(reduced);
  useEffect(() => {
    if (reduced) return;
    const timers = [
      window.setTimeout(() => sound(SYNTH("button-clunk.mp3"), 30), 120),
      window.setTimeout(() => sound(SFX("card-draw.wav"), 34), 320),
      window.setTimeout(() => setDealt(true), 420 + owner.hand.length * 60 + 500),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
    // 처음 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const describe = (card: { instanceId: string; definitionId: string; cardType?: string; currentCost: number; currentAttack: number; currentHealth: number; keywords?: string[]; isToken?: boolean; isChampionToken?: boolean }) => {
    const d = definitions.find((x) => x.id === card.definitionId);
    return {
      id: card.definitionId,
      name: d?.name ?? card.definitionId,
      cardType: card.cardType ?? "WRESTLER",
      cost: card.currentCost,
      attack: card.currentAttack,
      health: card.currentHealth,
      text: d?.rulesText ?? "",
      lore: d?.lore,
      rarity: d?.rarity ?? "NORMAL",
      imageUrl: d?.imageUrl ?? null,
      imageDisplayMode: d?.imageDisplayMode ?? "CONTAIN",
      imageScale: d?.imageScale ?? 1,
      imagePositionX: d?.imagePositionX ?? 50,
      imagePositionY: d?.imagePositionY ?? 50,
      keywords: card.keywords,
      isToken: card.isToken,
      isChampionToken: card.isChampionToken,
    } as CardDetailRecord & { text: string; imageDisplayMode: string; imageScale: number; imagePositionX: number; imagePositionY: number };
  };
  const render = (card: Parameters<typeof describe>[0]) => {
    const d = describe(card);
    return (
      <CardRenderer
        {...d}
        cardId={d.id}
        cosmeticOwnerId={playerId}
        imageDisplaySettings={{ imageDisplayMode: d.imageDisplayMode as never, imageScale: d.imageScale, imagePositionX: d.imagePositionX, imagePositionY: d.imagePositionY }}
        rulesText={d.text}
        cardType={card.cardType as never}
        rarity={d.rarity as never}
        size="hand"
        className="pointer-events-none !h-full !w-full"
      />
    );
  };
  const incomingName = incoming ? describe(incoming).name : "새 카드";
  const selectedCard = owner.hand.find((c) => c.instanceId === selected);
  const confirm = () => {
    if (!selected || leaving) return;
    if (reduced) { onConfirm(selected); return; }
    setLeaving(true);
    sound(SYNTH("armor-shatter.mp3"), 26, .8);
    window.setTimeout(() => sound(SFX("card-draw.wav"), 36, 1.05), 380);
    window.setTimeout(() => onConfirm(selected), 820);
  };

  return (
    <>
      <div
        className="ko-mull-stage ko-overflow-stage fixed inset-0 z-[205]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ko-overflow-title"
        data-dealt={dealt}
        data-leaving={leaving}
        data-count={owner.hand.length}
      >
        <div className="ko-mull-backdrop" aria-hidden="true">
          <span className="ko-mull-rays" />
          <span className="ko-mull-dust" />
        </div>
        <div className="ko-mull-sheet ko-overflow-sheet">
          <header className="ko-mull-head">
            <div className="ko-mull-title">
              <span className="ko-mull-title__line" aria-hidden="true" />
              <h2 id="ko-overflow-title">손패가 가득 찼어요</h2>
              <span className="ko-mull-title__line" aria-hidden="true" />
            </div>
            <p>‘{incomingName}’를 받으려면 기존 손패에서 1장을 골라 버리세요. 버린 카드는 묘지로 이동해요.</p>
          </header>

          {incoming && (
            <div className="ko-overflow-incoming" aria-label={`새로 들어올 카드 ${incomingName}`}>
              <span className="ko-overflow-incoming__card">
                <span className="ko-overflow-incoming__glow" aria-hidden="true" />
                {render(incoming)}
              </span>
              <span className="ko-overflow-incoming__label">
                새 카드
                {(pending?.cards.length ?? 0) > 1 && <em>추가 대기 {(pending?.cards.length ?? 1) - 1}장 · 한 장씩 순서대로 받아요</em>}
              </span>
            </div>
          )}

          <div className="ko-mull-row ko-overflow-row" aria-label="버릴 손패 선택">
            {owner.hand.map((card, i) => {
              const d = describe(card);
              const picked = selected === card.instanceId;
              return (
                <div key={card.instanceId} className="ko-overflow-slot" style={{ "--i": i, "--n": owner.hand.length } as React.CSSProperties}>
                  <button
                    type="button"
                    className="ko-mull-card ko-overflow-card"
                    aria-label={`${d.name} 선택`}
                    aria-pressed={picked}
                    data-picked={picked}
                    style={{ "--i": i, "--n": owner.hand.length } as React.CSSProperties}
                    onClick={() => {
                      if (leaving) return;
                      setSelected(picked ? null : card.instanceId);
                      sound(picked ? SYNTH("stat-up.mp3") : SYNTH("button-clunk.mp3"), picked ? 22 : 34);
                    }}
                  >
                    <span className="ko-mull-flip">
                      <span className="ko-mull-face ko-mull-face--front">{render(card)}</span>
                    </span>
                    <span className="ko-mull-stamp ko-overflow-stamp" aria-hidden="true">
                      <i>✕</i>
                      <em>버림</em>
                    </span>
                    <span className="ko-overflow-embers" aria-hidden="true" />
                  </button>
                  <button type="button" className="ko-overflow-detail" onClick={() => setDetail(d)}>
                    확대·상세
                  </button>
                </div>
              );
            })}
          </div>

          <p role="status" className="ko-overflow-status">
            {selectedCard ? `‘${describe(selectedCard).name}’ 1장을 버리고 새 카드를 받아요.` : "버릴 카드 한 장을 선택하세요."}
          </p>
          <footer className="ko-mull-actions">
            <button type="button" disabled={!selected || leaving} className="ko-mull-btn ko-mull-btn--gold" onClick={confirm}>
              선택한 카드 버리고 받기
            </button>
          </footer>
        </div>
      </div>
      <CardDetailDialog
        card={detail}
        open={!!detail}
        onOpenChange={(v) => {
          if (!v) setDetail(null);
        }}
      />
    </>
  );
}
