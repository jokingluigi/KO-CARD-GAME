import { useEffect, useState } from "react";
import { ArrowLeft, CalendarCheck2, Check } from "lucide-react";
import { useLocation } from "wouter";
import { claimAttendance, fetchAttendance, fetchRewardCatalogs, type AttendanceData, type RewardCatalogCard, type RewardCatalogPack } from "@/lib/rewards-client";
import { ROUTES } from "@/lib/routes";

export default function AttendancePage() {
  const [, navigate] = useLocation();
  const [data, setData] = useState<AttendanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [catalog, setCatalog] = useState<{ cards: RewardCatalogCard[]; packs: RewardCatalogPack[] }>({ cards: [], packs: [] });

  async function load() {
    setLoading(true);
    try {
      const [nextData, nextCatalog] = await Promise.all([fetchAttendance(), fetchRewardCatalogs()]);
      setData(nextData);
      setCatalog(nextCatalog);
    } catch (error) { setMessage(error instanceof Error ? error.message : "출석 보드를 불러오지 못했습니다."); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function claim() {
    if (busy || data?.definitions.find((day) => day.state === "AVAILABLE") === undefined) return;
    setBusy(true);
    try {
      const result = await claimAttendance();
      setData(result.attendance);
      const claimed = data?.definitions.find((day) => day.state === "AVAILABLE");
      setMessage(result.alreadyClaimed ? "오늘 출석은 이미 완료했습니다." : claimed ? rewardText(claimed) : "출석 보상을 받았습니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "출석 보상을 받을 수 없습니다."); } finally { setBusy(false); }
  }

  function rewardText(day: AttendanceData["definitions"][number]) {
    if (day.rewardType === "CARD") return `카드 ${catalog.cards.find((card) => card.id === day.rewardTargetId)?.name ?? "보상 카드"} ×${day.rewardAmount}을 받았습니다.`;
    if (day.rewardType === "PACK") return `팩 ${catalog.packs.find((pack) => pack.id === day.rewardTargetId)?.name ?? "보상 팩"} ×${day.rewardAmount}을 받았습니다.`;
    return `${day.rewardAmount.toLocaleString()} 크레딧을 받았습니다.`;
  }

  function rewardLabel(day: AttendanceData["definitions"][number]) {
    if (day.rewardType === "CARD" || day.rewardType === "PACK") {
      const item = day.rewardType === "CARD"
        ? catalog.cards.find((card) => card.id === day.rewardTargetId)
        : catalog.packs.find((pack) => pack.id === day.rewardTargetId);
      return (
        <span className="flex min-h-12 items-center justify-center gap-2 text-left">
          {item?.imageUrl ? (
            <img src={item.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
          ) : (
            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-neutral-800 text-[9px] font-black text-neutral-400">
              {day.rewardType === "CARD" ? "CARD" : "PACK"}
            </span>
          )}
          <span className="min-w-0 truncate">{day.rewardType === "CARD" ? "카드" : "팩"} · {item?.name ?? day.rewardTargetId ?? "알 수 없음"} ×{day.rewardAmount}</span>
        </span>
      );
    }
    return `+${day.rewardAmount.toLocaleString()} 크레딧`;
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-6 text-neutral-100 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-4xl">
        <button type="button" onClick={() => navigate(ROUTES.MAIN_MENU)} className="mb-6 flex items-center gap-2 text-sm font-bold text-neutral-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> 메인 메뉴</button>
        <header className="mb-6 flex items-end justify-between gap-4 border-b border-neutral-800 pb-5"><div><p className="font-display text-xs font-bold tracking-[0.25em] text-primary">ATTENDANCE BOARD</p><h1 className="mt-2 text-3xl font-black">출석 보드</h1><p className="mt-2 text-sm text-neutral-500">오늘: {data?.today ?? "—"}</p></div><CalendarCheck2 className="h-9 w-9 text-amber-400" /></header>
        {message && <p role="status" className="mb-5 rounded border border-amber-800/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">{message}</p>}
        {loading ? <p className="rounded border border-neutral-800 p-8 text-center text-neutral-500">출석 보드를 불러오는 중...</p> : !data || data.definitions.length === 0 ? <p className="rounded border border-dashed border-neutral-800 p-8 text-center text-neutral-500">등록된 출석 보상이 없습니다.</p> : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
               {data.definitions.map((day) => <article key={day.dayIndex} className={`rounded-xl border p-4 text-center ${day.state === "AVAILABLE" ? "border-amber-400 bg-amber-950/30" : day.state === "CLAIMED" ? "border-emerald-800 bg-emerald-950/20" : "border-neutral-800 bg-black/30"}`}><p className="text-[10px] font-black tracking-[0.2em] text-neutral-500">DAY</p><p className="mt-1 text-2xl font-black">{day.dayIndex}</p><p className="mt-3 text-sm font-black text-amber-200">{rewardLabel(day)}</p>{day.state === "CLAIMED" && <Check className="mx-auto mt-3 h-4 w-4 text-emerald-400" />}</article>)}
            </div>
            <button type="button" disabled={busy || !data.definitions.some((day) => day.state === "AVAILABLE")} onClick={() => void claim()} className="mt-6 w-full rounded bg-amber-400 px-5 py-3.5 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-40">{busy ? "처리 중..." : data.definitions.some((day) => day.state === "AVAILABLE") ? "오늘 출석하고 보상 받기" : "오늘 출석 완료"}</button>
          </>
        )}
      </div>
    </main>
  );
}