import React from "react";
import type { CardInstance } from "../game/cards/types";
import { audioManager } from "../audio/audio-manager";
import { prefersReducedMotion } from "./presentation-config";
import "./mulligan-stage.css";

/**
 * 시작 손패 교체(멀리건) 연출.
 *
 * 1) 카드가 덱에서 한 장씩 날아와 뒤집히며 펼쳐진다.
 * 2) 바꿀 카드를 누르면 '교체' 도장이 찍히고 카드가 살짝 가라앉는다.
 * 3) 확정하면 바꾼 카드는 뒤집혀 덱으로 돌아가고, 새 카드가 그 자리에서 뒤집혀 나온다.
 * 4) 모든 카드가 손패 쪽으로 내려가며 화면이 걷힌다.
 *
 * 게임 규칙·순서에는 관여하지 않는 화면 연출 전용이다.
 */

const SFX = (name: string) => `${import.meta.env.BASE_URL}vendor/hs-mixes/${name}`;
const SYNTH = (name: string) => `${import.meta.env.BASE_URL}vendor/ko-synth/${name}`;
const sound = (url: string, volume: number, priority = 2, pitch?: number) => {
  try {
    audioManager.playImpactOverlay(url, volume, priority, pitch ? { pitch } : undefined);
  } catch {
    /* 소리는 연출일 뿐 */
  }
};

function CardBackFace({ back }: { back?: React.ReactNode }) {
  return (
    <div className="ko-mull-face ko-mull-face--back" aria-hidden="true">
      {back ?? (
        <div className="ko-mull-back-art">
          <i />
          <b>KO</b>
        </div>
      )}
    </div>
  );
}

export type MulliganExit = {
  /** 확정 직전 손패 (화면 순서 그대로) */
  hand: CardInstance[];
  selected: string[];
  startedAt: number;
};

/** 확정 후 연출에 걸리는 시간 (교체가 있으면 더 길다) */
export function mulliganExitDuration(exit: MulliganExit) {
  if (prefersReducedMotion()) return 250;
  return exit.selected.length ? 1850 : 700;
}

export function MulliganStage({
  hand,
  seconds,
  selection,
  onToggle,
  onKeep,
  onConfirm,
  confirmDisabled,
  renderCard,
  nameOf,
  back,
}: {
  hand: CardInstance[];
  nameOf: (card: CardInstance) => string;
  seconds: number;
  selection: string[];
  onToggle: (id: string) => void;
  onKeep: () => void;
  onConfirm: () => void;
  confirmDisabled: boolean;
  renderCard: (card: CardInstance) => React.ReactNode;
  back?: React.ReactNode;
}) {
  const reduced = prefersReducedMotion();
  const [dealt, setDealt] = React.useState(reduced);
  React.useEffect(() => {
    if (reduced) return;
    const timers = hand.map((_, i) =>
      window.setTimeout(() => sound(SFX("card-draw.wav"), 34, 2, 0.94 + i * 0.04), 260 + i * 170),
    );
    timers.push(window.setTimeout(() => setDealt(true), 420 + hand.length * 170 + 520));
    return () => timers.forEach((t) => window.clearTimeout(t));
    // 처음 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const urgent = seconds <= 5;
  const ring = Math.max(0, Math.min(1, seconds / 20));
  return (
    <div
      className="ko-mull-stage fixed inset-0 z-[205]"
      role="dialog"
      aria-label="시작 손패 교체"
      data-dealt={dealt}
      data-count={hand.length}
    >
      <div className="ko-mull-backdrop" aria-hidden="true">
        <span className="ko-mull-rays" />
        <span className="ko-mull-dust" />
      </div>
      <div className="ko-mulligan-sheet ko-mull-sheet">
        <header className="ko-mull-head">
          <div className="ko-mull-title">
            <span className="ko-mull-title__line" aria-hidden="true" />
            <h2>시작 손패</h2>
            <span className="ko-mull-title__line" aria-hidden="true" />
          </div>
          <p>바꾸고 싶은 카드를 누르세요. 고른 카드만 덱의 카드와 바뀝니다.</p>
          <div
            className="ko-mull-timer"
            data-urgent={urgent}
            style={{ "--ring": ring } as React.CSSProperties}
            aria-label={`남은 시간 ${seconds}초`}
          >
            <svg viewBox="0 0 40 40" aria-hidden="true">
              <circle cx="20" cy="20" r="17" className="ko-mull-timer__track" />
              <circle cx="20" cy="20" r="17" className="ko-mull-timer__fill" pathLength={1} />
            </svg>
            <b>{seconds}</b>
          </div>
        </header>
        <div className="ko-mull-row">
          {hand.map((card, i) => {
            const picked = selection.includes(card.instanceId);
            const name = nameOf(card);
            return (
              <button
                key={card.instanceId}
                type="button"
                className="ko-mull-card"
                style={{ "--i": i, "--n": hand.length } as React.CSSProperties}
                aria-pressed={picked}
                data-picked={picked}
                onClick={() => {
                  onToggle(card.instanceId);
                  sound(picked ? SYNTH("stat-up.mp3") : SYNTH("button-clunk.mp3"), picked ? 22 : 34, 2);
                }}
                aria-label={`${name} ${picked ? "교체 선택됨" : "교체 선택"}`}
              >
                <span className="ko-mull-flip">
                  <span className="ko-mull-face ko-mull-face--front">{renderCard(card)}</span>
                  <CardBackFace back={back} />
                </span>
                <span className="ko-mull-stamp" aria-hidden="true">
                  <i>✕</i>
                  <em>교체</em>
                </span>
              </button>
            );
          })}
        </div>
        <footer className="ko-mull-actions">
          <button type="button" className="ko-mull-btn ko-mull-btn--ghost" onClick={onKeep}>
            그대로 시작
          </button>
          <button
            type="button"
            className="ko-mull-btn ko-mull-btn--gold"
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {selection.length}장 교체
          </button>
        </footer>
      </div>
    </div>
  );
}

/** 확정 후: 바꾼 카드는 덱으로, 새 카드는 그 자리에서 뒤집혀 나오고, 전부 손패로 내려간다. */
export function MulliganExitStage({
  exit,
  hand,
  renderCard,
  back,
}: {
  exit: MulliganExit;
  hand: CardInstance[];
  renderCard: (card: CardInstance) => React.ReactNode;
  back?: React.ReactNode;
}) {
  const swapping = exit.selected.length > 0;
  const fresh = hand.filter((c) => !exit.hand.some((o) => o.instanceId === c.instanceId));
  let next = 0;
  const slots = exit.hand.map((card) =>
    exit.selected.includes(card.instanceId) ? { old: card, fresh: fresh[next++] } : { old: card },
  );
  React.useEffect(() => {
    if (prefersReducedMotion()) return;
    const timers: number[] = [];
    if (swapping) {
      timers.push(window.setTimeout(() => sound(SFX("card-lift.wav"), 30, 2), 40));
      exit.selected.forEach((_, i) =>
        timers.push(window.setTimeout(() => sound(SFX("card-draw.wav"), 34, 2, 1 + i * 0.05), 700 + i * 120)),
      );
    }
    timers.push(window.setTimeout(() => sound(SYNTH("coin-tick.mp3"), 20, 1), swapping ? 1300 : 220));
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="ko-mull-stage ko-mull-stage--exit fixed inset-0 z-[205]" role="status" aria-label="손패 정리 중" data-swapping={swapping}>
      <div className="ko-mull-backdrop" aria-hidden="true">
        <span className="ko-mull-rays" />
      </div>
      <div className="ko-mull-sheet">
        <header className="ko-mull-head">
          <div className="ko-mull-title">
            <span className="ko-mull-title__line" aria-hidden="true" />
            <h2>{swapping ? `${exit.selected.length}장 교체!` : "이대로 간다!"}</h2>
            <span className="ko-mull-title__line" aria-hidden="true" />
          </div>
        </header>
        <div className="ko-mull-row">
          {slots.map((slot, i) => (
            <span
              key={slot.old.instanceId}
              className="ko-mull-card ko-mull-card--exit"
              data-swap={Boolean(slot.fresh)}
              style={{ "--i": i, "--n": slots.length } as React.CSSProperties}
            >
              <span className="ko-mull-flip ko-mull-flip--old">
                <span className="ko-mull-face ko-mull-face--front">{renderCard(slot.old)}</span>
                <CardBackFace back={back} />
              </span>
              {slot.fresh && (
                <span className="ko-mull-flip ko-mull-flip--new">
                  <span className="ko-mull-face ko-mull-face--front">{renderCard(slot.fresh)}</span>
                  <CardBackFace back={back} />
                  <span className="ko-mull-new-glow" aria-hidden="true" />
                </span>
              )}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
