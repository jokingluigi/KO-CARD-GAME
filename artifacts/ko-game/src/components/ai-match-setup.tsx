import { useEffect, useState } from "react";
import { ArrowRight, Bot, CheckCircle2, Dices, ShieldAlert } from "lucide-react";
import type { AIDeck } from "@/lib/ai-decks-client";
import type { Deck } from "@/lib/decks-client";

type AiMatchSetupProps = {
  decks: Deck[] | null;
  aiDecks: AIDeck[] | null;
  initialAiDeckId?: string | null;
  error?: string | null;
  onStart: (deckId: string, aiDeckId: string | null) => void;
  onBack: () => void;
};

export function AiMatchSetup({ decks, aiDecks, initialAiDeckId, error, onStart, onBack }: AiMatchSetupProps) {
  const validDecks = decks?.filter((deck) => deck.isValid) ?? [];
  const validAIDecks = aiDecks?.filter((deck) => deck.isValid && (deck.enabled || deck.id === initialAiDeckId)) ?? [];
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [selectedAIDeckId, setSelectedAIDeckId] = useState<string | null>(initialAiDeckId ?? null);

  useEffect(() => {
    if (!selectedDeckId && validDecks.length === 1) setSelectedDeckId(validDecks[0]!.id);
  }, [selectedDeckId, validDecks]);

  useEffect(() => {
    if (initialAiDeckId && validAIDecks.some((deck) => deck.id === initialAiDeckId)) {
      setSelectedAIDeckId(initialAiDeckId);
    }
  }, [initialAiDeckId, validAIDecks]);

  function start() {
    if (selectedDeckId) onStart(selectedDeckId, selectedAIDeckId);
  }

  return (
    <main className="min-h-screen bg-[#080808] px-5 py-10 text-white sm:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl flex-col justify-center">
        <div className="mb-8 text-center">
          <p className="font-display text-xs font-black tracking-[0.45em] text-amber-400">KO · AI MATCH</p>
          <h1 className="mt-4 text-3xl font-black sm:text-4xl">AI 상대와 매치 시작</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-neutral-400">내 덱과 활성화된 AI 덱을 선택합니다. 매치 시작 시 두 덱의 Definition을 스냅샷으로 고정합니다.</p>
        </div>

        {error && <div className="mx-auto mb-5 flex w-full max-w-3xl items-center gap-3 rounded-lg border border-red-900/70 bg-red-950/30 px-4 py-3 text-sm text-red-200"><ShieldAlert className="h-5 w-5 shrink-0" aria-hidden="true" /><span>{error}</span></div>}

        {decks === null || aiDecks === null ? (
          <div className="mx-auto w-full max-w-2xl rounded-xl border border-neutral-800 bg-neutral-950 p-8 text-center text-sm text-neutral-400">내 덱과 AI 덱을 불러오는 중입니다…</div>
        ) : validDecks.length === 0 ? (
           <div className="mx-auto w-full max-w-2xl rounded-xl border border-amber-900/60 bg-amber-950/20 p-8 text-center"><p className="text-lg font-black text-amber-200">사용할 수 있는 내 덱이 없습니다.</p><p className="mt-2 text-sm leading-6 text-neutral-400">챔피언을 포함하고 공개 카드 20~30장으로 구성된 사용 가능한 덱을 먼저 만들어 주세요.</p><button type="button" onClick={onBack} className="mt-6 rounded-lg bg-amber-400 px-5 py-3 text-sm font-black text-black hover:bg-amber-300">메인 메뉴로</button></div>
        ) : validAIDecks.length === 0 ? (
          <div className="mx-auto w-full max-w-2xl rounded-xl border border-amber-900/60 bg-amber-950/20 p-8 text-center"><p className="text-lg font-black text-amber-200">사용 가능한 AI 덱이 없습니다.</p><p className="mt-2 text-sm leading-6 text-neutral-400">관리자가 유효한 AI 덱을 활성화해야 AI 매치를 시작할 수 있습니다.</p><button type="button" onClick={onBack} className="mt-6 rounded-lg bg-amber-400 px-5 py-3 text-sm font-black text-black hover:bg-amber-300">메인 메뉴로</button></div>
        ) : (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              <section>
                <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-black tracking-wider text-neutral-300">1. 내 덱</h2><span className="text-xs text-neutral-500">{selectedDeckId ? "선택됨" : "선택 필요"}</span></div>
                <div className="grid gap-3">
                   {validDecks.map((deck) => <button key={deck.id} type="button" onClick={() => setSelectedDeckId(deck.id)} className={`rounded-xl border p-4 text-left transition ${selectedDeckId === deck.id ? "border-amber-400 bg-amber-950/30" : "border-neutral-800 bg-neutral-950 hover:border-neutral-600"}`}><div className="flex items-start justify-between gap-4"><div><p className="font-black">{deck.name}</p><p className="mt-1 text-xs font-bold text-neutral-500">{deck.cards.length}장 · {deck.champion?.name ?? "챔피언 없음"}</p></div>{selectedDeckId === deck.id && <CheckCircle2 className="h-5 w-5 text-emerald-300" />}</div></button>)}
                </div>
              </section>
              <section>
                <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-black tracking-wider text-neutral-300">2. AI 상대 덱</h2><span className="text-xs text-neutral-500">{selectedAIDeckId ? "선택됨" : "랜덤 선택"}</span></div>
                <div className="grid gap-3">
                  <button type="button" onClick={() => setSelectedAIDeckId(null)} className={`flex items-center gap-3 rounded-xl border p-4 text-left transition ${selectedAIDeckId === null ? "border-amber-400 bg-amber-950/30" : "border-neutral-800 bg-neutral-950 hover:border-neutral-600"}`}><Dices className="h-5 w-5 text-amber-300" /><span><span className="block font-black">랜덤 상대</span><span className="mt-1 block text-xs text-neutral-500">활성화된 유효 AI 덱 중 하나를 선택</span></span></button>
                   {validAIDecks.map((deck) => <button key={deck.id} type="button" onClick={() => setSelectedAIDeckId(deck.id)} className={`rounded-xl border p-4 text-left transition ${selectedAIDeckId === deck.id ? "border-amber-400 bg-amber-950/30" : "border-neutral-800 bg-neutral-950 hover:border-neutral-600"}`}><div className="flex items-start justify-between gap-4"><div><p className="font-black">{deck.name}</p><p className="mt-1 text-xs font-bold text-neutral-500">{deck.cards.length}장 · {deck.champion?.name ?? "챔피언 없음"}</p><p className="mt-2 line-clamp-2 text-xs leading-5 text-neutral-500">{deck.description || "설명이 없는 AI 덱입니다."}</p></div>{selectedAIDeckId === deck.id && <CheckCircle2 className="h-5 w-5 text-emerald-300" />}</div></button>)}
                </div>
              </section>
            </div>
            <div className="mt-7 flex flex-wrap justify-center gap-3"><button type="button" onClick={onBack} className="rounded-lg border border-neutral-700 px-5 py-3 text-sm font-black text-neutral-300 hover:border-neutral-500">메인 메뉴</button><button type="button" disabled={!selectedDeckId} onClick={start} className="flex items-center gap-2 rounded-lg bg-amber-400 px-6 py-3 text-sm font-black text-black hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"><Bot className="h-4 w-4" /> 매치 시작 <ArrowRight className="h-4 w-4" /></button></div>
          </>
        )}
      </section>
    </main>
  );
}