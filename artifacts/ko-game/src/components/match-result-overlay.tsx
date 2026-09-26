import type { GameState } from "@/game";

function resultReason(state: GameState, playerId: string) {
  const terminalEvent = [...state.events].reverse().find((event) =>
    event.type === "SURRENDER" ||
    event.reason === "FATIGUE" ||
    (event.type === "CARD_RETIRED" && event.reason === "RETIRE") ||
    (event.type === "DAMAGE_DEALT" &&
      (event.reason === "BASIC_ATTACK" || event.reason === "CARD_EFFECT")),
  );

  switch (terminalEvent?.reason) {
    case "SURRENDER":
      return terminalEvent.playerId === playerId
        ? "항복으로 매치가 종료되었습니다."
        : "상대의 항복으로 매치가 종료되었습니다.";
    case "FATIGUE":
      return "덱 소진으로 매치가 종료되었습니다.";
    case "RETIRE":
      return "챔피언이 퇴장해 매치가 종료되었습니다.";
    case "BASIC_ATTACK":
      return "직접 공격으로 매치가 종료되었습니다.";
    case "CARD_EFFECT":
      return "카드 효과로 매치가 종료되었습니다.";
    default:
      return "매치 결과가 확정되었습니다.";
  }
}

export function MatchResultOverlay({
  state,
  onReturnToMainMenu,
  reward,
}: {
  state: GameState;
  onReturnToMainMenu: () => void;
  reward?: { amount: number; sourceType: string } | null;
}) {
  const player = state.players[0];
  const isVictory = state.winnerId === player?.id;
  const isDefeat = state.loserId === player?.id;
  const title = isVictory ? "승리" : isDefeat ? "패배" : "매치 종료";
  const subtitle = isVictory ? "VICTORY" : isDefeat ? "DEFEAT" : "MATCH COMPLETE";
  const reason = resultReason(state, player?.id ?? "");
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
      className="match-result-enter fixed inset-0 z-[300] flex min-h-screen items-center justify-center bg-black/90 px-5 py-8 backdrop-blur-sm"
    >
      <section className={`w-full max-w-lg rounded-2xl border p-7 text-center md:p-12 ${accentClass}`}>
        <p className="font-display text-[10px] font-bold tracking-[0.5em] text-primary md:text-xs">KO MATCH RESULT</p>
        <h1 className="mt-6 text-5xl font-black tracking-tight md:text-7xl">{title}</h1>
        <p className="mt-3 font-display text-xl font-black tracking-[0.35em] md:text-2xl">{subtitle}</p>
        <p className="mt-6 text-sm leading-6 text-neutral-300">
          {reason}
        </p>
        {reward && (
          <p className="mt-5 rounded border border-amber-300/30 bg-black/30 px-4 py-3 text-sm font-black text-amber-200">
            +{reward.amount.toLocaleString()} 크레딧 지급
          </p>
        )}
        <button
          type="button"
          onClick={onReturnToMainMenu}
          data-testid="button-return-to-main-menu"
          className="mt-8 w-full rounded-lg bg-primary px-5 py-3.5 text-sm font-black text-black transition hover:bg-yellow-300 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-black md:w-auto md:min-w-52"
        >
          메인 화면으로
        </button>
      </section>
    </div>
  );
}
