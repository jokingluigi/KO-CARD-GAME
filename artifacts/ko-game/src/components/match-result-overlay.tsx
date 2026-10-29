import {
  buildMatchRecap,
  type MatchRecap,
} from "../../../../lib/game-engine/src/match-recap";
import { MatchRecapPanel } from "./match-recap-panel";
import { useEffect, useRef, useState } from "react";
import { CardArtwork } from "./card-artwork";
import { questPortrait } from "./quest-media";
import {
  cosmeticImage,
  cosmeticImageSettings,
  type MatchCosmetics,
} from "@workspace/cosmetics";
import { optionalCosmetics } from "@/lib/cosmetics-client";
import { matchTurnNumber } from "../../../../lib/game-engine/src/rules";
import "./match-result.css";
import { getCardDefinition, type GameState } from "@/game";
import { matchEndReason, matchSummary } from "@/lib/match-summary";
import { audioManager } from "@/audio/audio-manager";
import type { GameMediaCatalog } from "@/game/media";
import "./cinematic-presentation.css";

export function MatchResultOverlay({
  state,
  cosmetics: providedCosmetics,
  onReturnToMainMenu,
  reward,
  rewardStatus,
  rewardError,
  onRetryReward,
  questError,
  onRetryQuest,
  recap,
  mediaCatalog,
  opponentNickname,
  continueLabel = "메인 화면으로",
}: {
  continueLabel?: string;
  recap?: MatchRecap | null;
  mediaCatalog?: GameMediaCatalog;
  opponentNickname?: string;
  state: GameState;
  cosmetics?: MatchCosmetics;
  onReturnToMainMenu: () => void;
  reward?: { amount: number; sourceType: string } | null;
  rewardStatus?: "pending" | "success" | "error";
  rewardError?: string | null;
  onRetryReward?: () => void;
  questError?: string | null;
  onRetryQuest?: () => void;
}) {
  const [details, setDetails] = useState(false);
  const [bellCenter, setBellCenter] = useState<number>();
  useEffect(()=>{
    const measure=()=>{const r=document.querySelector(".ko-game-controls")?.getBoundingClientRect();setBellCenter(r ? r.top+r.height/2 : undefined);};
    measure();window.addEventListener("resize",measure);return()=>window.removeEventListener("resize",measure);
  },[state.gameId]);
  useEffect(()=>setDetails(false),[state.gameId]);
  const player = state.players[0];
  const isVictory = state.winnerId === player?.id;
  const isDefeat = state.loserId === player?.id;
  const resultMusic =
    mediaCatalog?.resultMusic?.[isVictory ? "VICTORY_BGM" : "DEFEAT_BGM"];
  useEffect(() => {
    if (
      state.status !== "FINISHED" ||
      (!isVictory && !isDefeat) ||
      !resultMusic
    )
      return;
    // Run after the parents' normal battle-audio shutdown effects.
    const timer = window.setTimeout(
      () =>
        audioManager.playResultMusic(resultMusic.assetUrl, resultMusic.volume),
      0,
    );
    return () => {
      window.clearTimeout(timer);
      audioManager.stopResultMusic();
    };
  }, [
    state.gameId,
    state.status,
    isVictory,
    isDefeat,
    resultMusic?.id,
    resultMusic?.assetUrl,
    resultMusic?.volume,
  ]);
  const title = isVictory ? "승리" : isDefeat ? "패배" : "매치 종료";
  const subtitle = isVictory
    ? "VICTORY"
    : isDefeat
      ? "DEFEAT"
      : "MATCH COMPLETE";
  const reason = matchEndReason(state, player?.id ?? "");
  const [ownSummary, opponentSummary] = matchSummary(state);
  const winner = state.players.find(
    (candidate) => candidate.id === state.winnerId,
  );
  const resolvedRecap = recap ?? buildMatchRecap(state);
  const finisher = resolvedRecap.highlights.find((h) => h.kind === "FINISHER");
  const finishingHit = finisher
    ? state.events[finisher.eventIndex]
    : [...state.events]
        .reverse()
        .find(
          (event) =>
            event.type === "DAMAGE_DEALT" &&
            event.target?.type === "PLAYER" &&
            event.target.playerId === state.loserId &&
            event.reason !== "FATIGUE",
        );
  const finishingSourceId =
    finishingHit?.source?.type === "CARD"
      ? finishingHit.source.cardInstanceId
      : null;
  const finishingCard = finishingSourceId
    ? state.players
        .flatMap((participant) => [
          ...participant.board,
          ...participant.graveyard,
          ...participant.removedFromGame,
          ...participant.hand,
        ])
        .find((card) => card?.instanceId === finishingSourceId)
    : null;
  const finishingName =
    finishingCard &&
    (
      state.cardPool?.find((card) => card.id === finishingCard.definitionId) ??
      getCardDefinition(finishingCard.definitionId)
    )?.name;
  const [localCosmetics, setLocalCosmetics] = useState<MatchCosmetics>({});
  useEffect(() => {
    if (providedCosmetics !== undefined || !player) return;
    let cancelled = false;
    void optionalCosmetics().then((loadout) => {
      if (!cancelled) setLocalCosmetics({ [player.id]: loadout });
    });
    return () => {
      cancelled = true;
    };
  }, [state.gameId, providedCosmetics === undefined, player?.id]);
  const cosmetics = providedCosmetics ?? localCosmetics;
  const champion = player?.champion;
  const originalPortrait = questPortrait(champion);
  const portrait = cosmeticImage(
    cosmetics[player?.id ?? ""],
    "CHAMPION_SKIN",
    champion?.id ?? "",
    champion?.questCompleted ? "awakened" : "portrait",
    originalPortrait,
  );
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    root.current?.focus({ preventScroll: true });
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, [state.gameId]);

  return (
    <div
      ref={root}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="매치 결과"
      data-testid="match-result-overlay"
      className="ko-result-overlay"
      data-view={details ? "details" : "battlefield"}
      style={bellCenter === undefined ? undefined : {"--result-bell-center":`${bellCenter}px`} as React.CSSProperties}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const nodes = Array.from(
          root.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), summary, [tabindex="0"]',
          ) ?? [],
        ).filter((node) => node.getClientRects().length > 0);
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (!first) return;
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === root.current)
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === root.current)
        ) {
          event.preventDefault();
          first.focus();
        }
      }}
    >
      <article
        data-result={isVictory ? "victory" : isDefeat ? "defeat" : "complete"}
        className="ko-result-poster"
      >
        <div className="ko-result-scroll">
          <header className="ko-result-hero">
            <div className="ko-result-verdict">
              <p className="ko-result-eyebrow">
                <span>KO / FINAL BELL</span>
                <span>{matchTurnNumber(state.turn)}턴 종료</span>
              </p>
              <h1>
                <span className="ko-result-english">{subtitle}</span>
                <span className="ko-result-korean">{title}</span>
              </h1>
              <p className="ko-result-reason">{reason}</p>
              {champion && (
                <p className="ko-result-champion-name">
                  {champion.name}
                  <span>
                    {champion.questCompleted ? "각성" : "MY CHAMPION"}
                  </span>
                </p>
              )}
            </div>
            {portrait && (
              <div className="ko-result-portrait">
                <CardArtwork
                  src={portrait}
                  fallbackSrc={originalPortrait}
                  displayOverride={cosmeticImageSettings(
                    cosmetics[player?.id ?? ""],
                    "CHAMPION_SKIN",
                    champion?.id ?? "",
                    champion?.questCompleted ? "awakened" : "portrait",
                  )}
                  alt={champion?.name ?? "내 챔피언"}
                  imageDisplayMode="CONTAIN"
                  className="h-full w-full"
                />
              </div>
            )}
            <span className="ko-result-corner" aria-hidden="true">
              KO
            </span>
          </header>
          <div className="ko-result-content">
            <div className="ko-result-analysis">
              {finishingHit && (
                <div className="ko-result-finisher">
                  <span>LAST HIT / 마지막 일격</span>
                  <strong>
                    {finisher?.sourceName ??
                      finishingName ??
                      winner?.champion?.name ??
                      "효과"}
                  </strong>
                  <b>
                    {finishingHit.amount ?? 0}
                    <small>피해</small>
                  </b>
                </div>
              )}
              {ownSummary && opponentSummary && (
                <section
                  className="ko-result-scoreboard"
                  aria-label="경기 기록"
                >
                  <h2>
                    매치 리포트 <span>MATCH REPORT</span>
                  </h2>
                  <div className="ko-result-score-row ko-result-score-heading">
                    <span>기록</span>
                    <span>나</span>
                    <span>{opponentNickname || "상대"}</span>
                  </div>
                  <div className="ko-result-score-row">
                    <span>준 피해</span>
                    <strong>{ownSummary.damageDealt}</strong>
                    <strong>{opponentSummary.damageDealt}</strong>
                  </div>
                  <div className="ko-result-score-row">
                    <span>사용한 카드</span>
                    <b>{ownSummary.cardsPlayed}</b>
                    <b>{opponentSummary.cardsPlayed}</b>
                  </div>
                  <div className="ko-result-score-row">
                    <span>챔피언 퀘스트</span>
                    {[ownSummary, opponentSummary].map((summary) => (
                      <b key={summary.playerId} className="ko-result-quest">
                        {summary.questRequired === null
                          ? "없음"
                          : summary.questCompleted
                            ? "완료"
                            : `${summary.questProgress}/${summary.questRequired}`}
                      </b>
                    ))}
                  </div>
                </section>
              )}
            </div>
            <MatchRecapPanel
              recap={resolvedRecap}
              viewerId={player?.id ?? ""}
              variant="result"
              cosmetics={cosmetics}
            />
          </div>
          <div className="ko-result-notices">
            {questError && (
              <div role="alert" data-testid="quest-progress-error">
                <p>일반 퀘스트 진행도를 저장하지 못했습니다. {questError}</p>
                {onRetryQuest && (
                  <button type="button" onClick={onRetryQuest}>
                    퀘스트 다시 저장
                  </button>
                )}
              </div>
            )}
            {rewardStatus === "error" && !reward && (
              <div role="alert">
                <p>경기 보상 지급에 실패했습니다. {rewardError}</p>
                {onRetryReward && (
                  <button type="button" onClick={onRetryReward}>
                    다시 시도
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        <footer className="ko-result-footer">
        <button type="button" className="ko-result-details" aria-expanded={details} onClick={()=>setDetails(v=>!v)}>{details ? "전장과 챔피언 보기" : "상세 결과 · 경기 기록 보기"}</button>

          <div className="ko-result-reward" data-testid="match-reward" aria-live="polite">
            {reward ? (
              <>
                <span>경기 보상 · 지급 완료</span>
                <strong>
                  +{reward.amount.toLocaleString()}
                  <small>크레딧</small>
                </strong>
              </>
            ) : rewardStatus === "pending" ? (
              <p role="status">경기 결과와 크레딧 지급을 확인하는 중입니다…</p>
            ) : (
              <span>경기 종료 · GG</span>
            )}
          </div>
          <button
            type="button"
            onClick={onReturnToMainMenu}
            data-testid="button-return-to-main-menu"
            className="ko-result-continue"
          >
            {continueLabel}
            <span aria-hidden="true">↗</span>
          </button>
        </footer>
      </article>
    </div>
  );
}
