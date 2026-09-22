import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, ListChecks } from "lucide-react";
import { useLocation } from "wouter";
import { fetchDailyQuests, claimDailyQuest, type DailyQuest } from "@/lib/rewards-client";
import { ROUTES } from "@/lib/routes";

function objectiveLabel(objective: string) {
  return ({
    PLAY_MATCH: "경기 플레이",
    WIN_MATCH: "경기 승리",
    CARD_PLAYED: "카드 플레이",
    TECHNIQUE_PLAYED: "Technique 사용",
    ATTACK_DECLARED: "공격 선언",
    DAMAGE_DEALT: "피해 주기",
  } as Record<string, string>)[objective] ?? objective;
}

export default function DailyQuestsPage() {
  const [, navigate] = useLocation();
  const [quests, setQuests] = useState<DailyQuest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    try {
      const result = await fetchDailyQuests();
      setQuests(result.assignments);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "일일 퀘스트를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function claim(quest: DailyQuest) {
    if (quest.status !== "COMPLETED" || busyId) return;
    setBusyId(quest.id);
    try {
      const result = await claimDailyQuest(quest.id);
      setQuests((current) => current.map((item) => item.id === quest.id ? result.assignment : item));
      setMessage(result.alreadyClaimed ? "이미 받은 보상입니다." : `${result.reward?.amount.toLocaleString() ?? 0} 크레딧을 받았습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "보상을 받을 수 없습니다.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-6 text-neutral-100 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-4xl">
        <button type="button" onClick={() => navigate(ROUTES.MAIN_MENU)} className="mb-6 flex items-center gap-2 text-sm font-bold text-neutral-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> 메인 메뉴</button>
        <header className="mb-6 border-b border-neutral-800 pb-5">
          <p className="font-display text-xs font-bold tracking-[0.25em] text-primary">DAILY QUESTS</p>
          <h1 className="mt-2 text-3xl font-black">일일 퀘스트</h1>
          <p className="mt-2 text-sm text-neutral-500">오늘 배정된 퀘스트는 하루 동안 고정됩니다.</p>
        </header>
        {message && <p role="status" className="mb-5 rounded border border-amber-800/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">{message}</p>}
        {loading ? <p className="rounded border border-neutral-800 p-8 text-center text-neutral-500">퀘스트를 불러오는 중...</p> : quests.length === 0 ? <p className="rounded border border-dashed border-neutral-800 p-8 text-center text-neutral-500">활성화된 일일 퀘스트가 없습니다.</p> : (
          <div className="grid gap-4 md:grid-cols-3">
            {quests.map((quest) => {
              const percent = Math.min(100, Math.round((quest.progress / quest.targetValue) * 100));
              return (
                <article key={quest.id} className="rounded-xl border border-neutral-800 bg-black/40 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="text-[10px] font-black tracking-[0.2em] text-primary">QUEST {quest.slot + 1}</p><h2 className="mt-2 font-black text-white">{quest.title}</h2></div>
                    {quest.status === "CLAIMED" ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" /> : <ListChecks className="h-5 w-5 shrink-0 text-amber-400" />}
                  </div>
                  <p className="mt-4 min-h-12 text-sm leading-6 text-neutral-400">{quest.description}</p>
                  <p className="mt-4 text-xs font-bold text-neutral-300">{objectiveLabel(quest.objectiveType)} · {quest.progress}/{quest.targetValue}</p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-800"><div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${percent}%` }} /></div>
                  <div className="mt-5 flex items-center justify-between gap-3"><span className="text-sm font-black text-amber-200">+{quest.rewardAmount.toLocaleString()} 크레딧</span><button type="button" disabled={quest.status !== "COMPLETED" || Boolean(busyId)} onClick={() => void claim(quest)} className="rounded bg-amber-400 px-3 py-2 text-xs font-black text-black disabled:cursor-not-allowed disabled:opacity-40">{quest.status === "CLAIMED" ? "수령 완료" : quest.status === "COMPLETED" ? "보상 받기" : "진행 중"}</button></div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}