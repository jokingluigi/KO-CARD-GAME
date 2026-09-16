import { ArrowRight, Bot, CheckCircle2, ShieldAlert } from "lucide-react";
import type { Deck } from "@/lib/decks-client";

type AiMatchSetupProps = {
  decks: Deck[] | null;
  error?: string | null;
  onStart: (deckId: string) => void;
  onBack: () => void;
};

export function AiMatchSetup({ decks, error, onStart, onBack }: AiMatchSetupProps) {
  const validDecks = decks?.filter((deck) => deck.isValid) ?? [];

  return (
    <main className="min-h-screen bg-[#080808] px-5 py-10 text-white sm:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-4xl flex-col justify-center">
        <div className="mb-8 text-center">
          <p className="font-display text-xs font-black tracking-[0.45em] text-amber-400">KO · AI MATCH</p>
          <h1 className="mt-4 text-3xl font-black sm:text-4xl">사용할 덱을 선택하세요</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-neutral-400">
            유효한 덱만 AI 매치에 사용할 수 있습니다. AI도 같은 카드와 게임 규칙으로 플레이합니다.
          </p>
        </div>

        {error && (
          <div className="mx-auto mb-5 flex w-full max-w-2xl items-center gap-3 rounded-lg border border-red-900/70 bg-red-950/30 px-4 py-3 text-sm text-red-200">
            <ShieldAlert className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {decks === null ? (
          <div className="mx-auto w-full max-w-2xl rounded-xl border border-neutral-800 bg-neutral-950 p-8 text-center text-sm text-neutral-400">
            내 덱과 공개 카드 데이터를 불러오는 중입니다…
          </div>
        ) : validDecks.length === 0 ? (
          <div className="mx-auto w-full max-w-2xl rounded-xl border border-amber-900/60 bg-amber-950/20 p-8 text-center">
            <p className="text-lg font-black text-amber-200">사용할 수 있는 덱이 없습니다.</p>
            <p className="mt-2 text-sm leading-6 text-neutral-400">
              Champion을 포함하고 공개 카드 20~30장으로 구성된 유효한 덱을 먼저 만들어 주세요.
            </p>
            <button type="button" onClick={onBack} className="mt-6 rounded-lg bg-amber-400 px-5 py-3 text-sm font-black text-black hover:bg-amber-300">
              메인 메뉴로
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {validDecks.map((deck) => (
              <button
                key={deck.id}
                type="button"
                onClick={() => onStart(deck.id)}
                className="group rounded-xl border border-neutral-800 bg-neutral-950 p-5 text-left transition hover:border-amber-400/70 hover:bg-amber-950/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-black text-white">{deck.name}</p>
                    <p className="mt-1 text-xs font-bold text-neutral-500">
                      {deck.cards.length}장 · {deck.champion?.name ?? "Champion 없음"}
                    </p>
                  </div>
                  <Bot className="h-6 w-6 text-amber-400" aria-hidden="true" />
                </div>
                <div className="mt-5 flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-1.5 text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> 사용 가능
                  </span>
                  <span className="flex items-center gap-1 text-amber-300 transition group-hover:translate-x-1">
                    AI 매치 시작 <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}