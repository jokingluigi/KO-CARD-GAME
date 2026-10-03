import { buildMatchRecap, type MatchRecap } from '../../../../lib/game-engine/src/match-recap';
import { MatchRecapPanel } from './match-recap-panel';
import { useEffect, useState } from 'react';
import { getCardDefinition, type GameState } from "@/game";
import { matchEndReason, matchSummary } from '@/lib/match-summary';
import { championVoiceLine } from '@/game/champions/types';
import { audioManager } from '@/audio/audio-manager';

export function MatchResultOverlay({
  state,
  onReturnToMainMenu,
  reward,
  rewardStatus,
  rewardError,
  onRetryReward,
  recap,
}: {
  recap?: MatchRecap | null;
  state: GameState;
  onReturnToMainMenu: () => void;
  reward?: { amount: number; sourceType: string } | null;
  rewardStatus?: 'pending' | 'success' | 'error';
  rewardError?: string | null;
  onRetryReward?: () => void;
}) {
  const player = state.players[0];
  const isVictory = state.winnerId === player?.id;
  const isDefeat = state.loserId === player?.id;
  const title = isVictory ? "승리" : isDefeat ? "패배" : "매치 종료";
  const subtitle = isVictory ? "VICTORY" : isDefeat ? "DEFEAT" : "MATCH COMPLETE";
  const reason = matchEndReason(state, player?.id ?? "");
  const [ownSummary, opponentSummary] = matchSummary(state);
  const winner = state.players.find((candidate) => candidate.id === state.winnerId);
  const loser = state.players.find((candidate) => candidate.id === state.loserId);
  const resolvedRecap = recap ?? buildMatchRecap(state);
  const finisher = resolvedRecap.highlights.find(h => h.kind === 'FINISHER');
  const lethal = Boolean(finisher);
  const finishingHit = finisher ? state.events[finisher.eventIndex] : undefined;
  const finishingSourceId = finishingHit?.source?.type === 'CARD' ? finishingHit.source.cardInstanceId : null;
  const finishingCard = finishingSourceId
    ? state.players.flatMap((participant) => [...participant.board, ...participant.graveyard, ...participant.removedFromGame, ...participant.hand])
      .find((card) => card?.instanceId === finishingSourceId)
    : null;
  const finishingName = finishingCard &&
    (state.cardPool?.find((card) => card.id === finishingCard.definitionId) ?? getCardDefinition(finishingCard.definitionId))?.name;
  const [cinematic, setCinematic] = useState(lethal);
  useEffect(() => {
    if (!lethal) return;
    audioManager.playAttack('/sfx/combat-finisher.wav?v=1', 92);
    audioManager.playImpactOverlay('/sfx/champion-glass-shatter.wav?v=1', 95);
    const timeout = window.setTimeout(() => setCinematic(false), 1650);
    return () => window.clearTimeout(timeout);
  }, [lethal]);
  const winnerLine = winner && championVoiceLine(winner.champion?.presentationLines, Boolean(winner.champion?.questCompleted), 'VICTORY', loser?.champion?.id);
  const loserLine = loser && championVoiceLine(loser.champion?.presentationLines, Boolean(loser.champion?.questCompleted), 'DEFEAT', winner?.champion?.id);
  const accentClass = isVictory
    ? "border-amber-300/70 bg-amber-950/80 text-amber-100 shadow-[0_0_70px_rgba(234,179,8,0.28)]"
    : isDefeat
      ? "border-red-400/70 bg-red-950/80 text-red-100 shadow-[0_0_70px_rgba(239,68,68,0.24)]"
      : "border-neutral-500/70 bg-neutral-950/90 text-neutral-100";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="매치 결과"
      data-testid="match-result-overlay"
      className="match-result-enter fixed inset-0 z-[300] flex min-h-screen items-center justify-center bg-black/90 px-4 py-5 backdrop-blur-sm"
    >
      {cinematic && loser ? <div className="champion-defeat-cinematic" role="status" aria-label={`${loser.champion?.name} 패배`}>
        <div className="champion-defeat-cinematic__portrait" style={{ backgroundImage: `url(${loser.champion?.questCompleted && loser.champion?.questCompletedPortraitUrl ? loser.champion?.questCompletedPortraitUrl : loser.champion?.imageUrl ?? ''})` }}>
          <div className="champion-defeat-cinematic__fracture" />
        </div>
        <strong className="champion-defeat-cinematic__ko">K.O.</strong>
        {loserLine && <p className="champion-defeat-cinematic__line">“{loserLine}”</p>}
        {winnerLine && <p className="champion-defeat-cinematic__victory">{winner.champion?.name}: “{winnerLine}”</p>}
      </div> :
      <section className={`max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border p-6 text-center md:p-10 ${accentClass}`}>
        <p className="font-display text-[10px] font-bold tracking-[0.5em] text-primary md:text-xs">KO MATCH RESULT</p>
        <h1 className="mt-6 text-5xl font-black tracking-tight md:text-7xl">{title}</h1>
        <p className="mt-3 font-display text-xl font-black tracking-[0.35em] md:text-2xl">{subtitle}</p>
        <p className="mt-6 text-sm leading-6 text-neutral-300">
          {reason}
        </p>
        {finishingHit && <p className="mt-3 text-sm font-black text-amber-200">
          마지막 일격 · {finisher?.sourceName ?? finishingName ?? winner?.champion?.name ?? '효과'} · {finishingHit.amount ?? 0} 피해
        </p>}
        {winnerLine && <p className="mt-4 text-base font-bold text-amber-200">{winner?.champion?.name}: “{winnerLine}”</p>}
        {loserLine && <p className="mt-2 text-sm text-neutral-300">{loser?.champion?.name}: “{loserLine}”</p>}
        {ownSummary && opponentSummary && (
          <section className="mt-6 rounded-xl border border-white/15 bg-black/35 p-4 text-left" aria-label="경기 기록">
            <h2 className="text-xs font-black tracking-widest text-amber-200">이번 경기 기록</h2>
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-2 text-xs sm:text-sm">
              <span className="text-neutral-400">기록</span>
              <span className="text-center font-bold text-blue-200">나</span>
              <span className="text-center font-bold text-red-200">상대</span>
              <span className="border-t border-white/10 pt-2">사용한 카드</span>
              <span className="border-t border-white/10 pt-2 text-center font-bold">{ownSummary.cardsPlayed}</span>
              <span className="border-t border-white/10 pt-2 text-center font-bold">{opponentSummary.cardsPlayed}</span>
              <span>준 피해</span>
              <span className="text-center font-bold">{ownSummary.damageDealt}</span>
              <span className="text-center font-bold">{opponentSummary.damageDealt}</span>
              <span>챔피언 퀘스트</span>
              {[ownSummary, opponentSummary].map((summary) => <span key={summary.playerId} className="text-center text-[11px] font-bold sm:text-xs">
                {summary.questRequired === null ? '없음' : summary.questCompleted ? '완료' : `${summary.questProgress}/${summary.questRequired}`}
              </span>)}
            </div>
          </section>
        )}
        <MatchRecapPanel recap={resolvedRecap} viewerId={player?.id ?? ""} />
        {reward && (
          <p className="mt-5 rounded border border-amber-300/30 bg-black/30 px-4 py-3 text-sm font-black text-amber-200">
            +{reward.amount.toLocaleString()} 크레딧 지급
          </p>
        )}
        {rewardStatus === 'pending' && <p role="status" className="mt-5 text-sm text-amber-200">경기 결과와 크레딧 지급을 확인하는 중입니다…</p>}
        {rewardStatus === 'error' && <div role="alert" className="mt-5 rounded border border-red-400/40 p-3 text-sm text-red-200">
          <p>경기 보상 지급에 실패했습니다. {rewardError}</p>
          {onRetryReward && <button type="button" onClick={onRetryReward} className="mt-2 rounded border border-red-300 px-3 py-1 font-bold">다시 시도</button>}
        </div>}
        <button
          type="button"
          onClick={onReturnToMainMenu}
          data-testid="button-return-to-main-menu"
          className="mt-8 w-full rounded-lg bg-primary px-5 py-3.5 text-sm font-black text-black transition hover:bg-yellow-300 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-black md:w-auto md:min-w-52"
        >
          메인 화면으로
        </button>
      </section>
      }
    </div>
  );
}
