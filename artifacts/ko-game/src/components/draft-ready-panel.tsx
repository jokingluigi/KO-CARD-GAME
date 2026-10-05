import { Check, Shield, Swords, UserRound } from "lucide-react";
import type { DraftView } from "@/lib/draft-client";

export function DraftReadyPanel({ view, busy, onReady }: { view: DraftView; busy: boolean; onReady: () => void }) {
  const champion = view.champions.find(c => c.id === view.own.championId);
  const cardMap = new Map(view.cards.map(c => [c.id, c]));
  const average = view.own.deck.reduce((sum, id, index) => sum + Math.max(0, (cardMap.get(id)?.cost ?? 0) + (view.own.cards?.[index]?.mutation?.cost ?? 0)), 0) / Math.max(1, view.own.deck.length);
  const members = [
    { label: "나", name: view.own.name, ready: view.own.ready, picks: view.own.deck.length, detail: champion?.name ?? "챔피언 선택 완료" },
    { label: view.mode === "AI" ? "AI 상대" : "상대", name: view.opponent.name, ready: view.opponent.ready, picks: view.opponent.picks, detail: view.opponent.picks === 25 ? "드래프트 덱 편성 완료" : "카드 선택 중" },
  ];
  return <section className="space-y-6" aria-label="드래프트 대전 준비" data-testid="panel-draft-ready">
    <div className="ko-online-panel rounded-xl p-6">
      <p className="text-xs font-black tracking-[0.2em] text-amber-400">MATCH READY</p>
      <h3 className="mt-2 text-2xl font-black">대전 준비</h3>
      <p className="mt-2 text-sm leading-6 text-neutral-400">완성된 덱을 확인하고 준비를 눌러 주세요.</p>
    </div>
    <div className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
      {members.map((member, index) => <div key={member.label} className="contents">
        {index === 1 && <div className="text-center font-display text-2xl font-black text-amber-400">VS</div>}
        <div className="min-w-0 rounded-lg border border-neutral-800 bg-black/25 p-5">
          <div className="flex items-center justify-between gap-3"><span className="text-xs font-black text-amber-400">{member.label}</span><span className={`inline-flex items-center gap-1 text-xs font-black ${member.ready ? "text-emerald-400" : "text-neutral-500"}`}>{member.ready && <Check className="h-3.5 w-3.5" />}{member.ready ? "준비 완료" : "준비 중"}</span></div>
          <p className="mt-5 flex items-center gap-2 break-words text-lg font-black"><UserRound className="h-4 w-4 shrink-0 text-neutral-500" />{member.name}</p>
          <p className="mt-2 text-xs text-neutral-400">{member.detail} · {member.picks}/25장</p>
        </div>
      </div>)}
    </div>
    <div className="ko-online-panel rounded-xl p-5 sm:p-6">
      <div className="flex items-center gap-3"><Shield className="h-5 w-5 text-amber-400" /><div><p className="font-black">{champion?.name ?? "내 드래프트 덱"}</p><p className="mt-1 text-xs text-neutral-400">25장 · 평균 비용 {average.toFixed(2)} · 변이 {view.own.cards?.filter(c => c.mutation).length ?? 0}장</p></div></div>
      <div className="mt-5 grid grid-cols-3 gap-2">{([['NORMAL', '일반'], ['EPIC', '에픽'], ['LEGENDARY', '레전더리']] as const).map(([rarity, label]) => <div key={rarity} className="rounded-lg border border-neutral-800 bg-black/25 p-3 text-center"><p className="text-xs text-neutral-500">{label}</p><p className="mt-1 text-lg font-black">{view.own.deck.filter(id => cardMap.get(id)?.rarity === rarity).length}<span className="ml-1 text-xs text-neutral-400">장</span></p></div>)}</div>
    </div>
    <div className="flex flex-col items-center gap-3">
      <button type="button" disabled={busy || view.own.ready} onClick={onReady} data-testid="button-draft-ready" className="ko-online-action inline-flex min-h-12 w-full items-center justify-center gap-2 rounded bg-amber-400 px-7 py-3 text-sm font-black text-black hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-400 sm:w-auto">{view.own.ready ? <Check className="h-4 w-4" /> : <Swords className="h-4 w-4" />}{view.own.ready ? "상대 준비를 기다리는 중" : "준비 완료"}</button>
      <p className="text-center text-xs leading-5 text-neutral-500">{view.mode === "PVP" ? "양쪽 모두 준비하면 대전이 시작됩니다. 상대에게 내 카드 목록은 공개되지 않습니다." : "준비가 끝나면 AI와 대전을 시작합니다."}</p>
    </div>
  </section>;
}
