import { DailyQuestEditor } from './daily-quest-editor';
import { useEffect, useState } from "react";
import { CalendarCheck2, Save, Settings2 } from "lucide-react";
import {
  fetchRewardAdminData,
  saveMatchRewardSettings,
  updateAttendanceReward,
  upsertAttendanceReward,
  fetchRewardCatalogs,
  type RewardCatalogCard,
  type RewardCatalogChampion,
  type RewardCatalogPack,
  type RewardAdminData,
} from "@/lib/rewards-client";
export function AdminRewardsManager({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [data, setData] = useState<RewardAdminData | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [match, setMatch] = useState({ winAmount: "", lossAmount: "", enabled: false });
  const [attendanceDay, setAttendanceDay] = useState("1");
  const [attendanceAmount, setAttendanceAmount] = useState("");
  const [attendanceEnabled, setAttendanceEnabled] = useState(true);
  const [attendanceRewardType, setAttendanceRewardType] = useState("CURRENCY");
  const [attendanceTargetId, setAttendanceTargetId] = useState("");
  const [catalog, setCatalog] = useState<{ cards: RewardCatalogCard[]; champions: RewardCatalogChampion[]; packs: RewardCatalogPack[] }>({ cards: [], champions: [], packs: [] });
  async function load() {
    try {
      const next = await fetchRewardAdminData();
      setData(next);
      setCatalog(await fetchRewardCatalogs());
      const win = next.settings.find((setting) => setting.key === "MATCH_ONLINE_WIN");
      const loss = next.settings.find((setting) => setting.key === "MATCH_ONLINE_LOSS");
      setMatch({
        winAmount: win ? String(win.amount) : "",
        lossAmount: loss ? String(loss.amount) : "",
        enabled: Boolean(win?.enabled && loss?.enabled),
      });
    } catch (error) {
      if (error instanceof Error && /권한|로그인/.test(error.message)) onUnauthorized();
      setMessage(error instanceof Error ? error.message : "보상 설정을 불러오지 못했습니다.");
    }
  }
  useEffect(() => { void load(); }, []);


  async function saveMatch() {
    setSaving(true);
    try {
      await saveMatchRewardSettings({ winAmount: Number(match.winAmount), lossAmount: Number(match.lossAmount), enabled: match.enabled });
      setMessage("온라인 매치 보상 설정을 저장했습니다.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "설정을 저장하지 못했습니다."); } finally { setSaving(false); }
  }

  async function saveAttendance() {
    setSaving(true);
    const body = {
      dayIndex: Number(attendanceDay),
      rewardType: attendanceRewardType,
      rewardTargetId: attendanceRewardType === "CURRENCY" ? null : attendanceTargetId || null,
      rewardAmount: Number(attendanceAmount),
      enabled: attendanceEnabled,
    };
    try {
      const exists = data?.attendance.some((item) => item.dayIndex === body.dayIndex);
      if (exists) await updateAttendanceReward(body.dayIndex, body);
      else await upsertAttendanceReward(body);
       setMessage("출석 보상을 저장했습니다.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "출석 보상을 저장하지 못했습니다."); } finally { setSaving(false); }
  }

  const attendanceTargetOptions = attendanceRewardType === "CARD"
    ? catalog.cards.filter((card) => !card.isToken && !card.isChampionToken)
    : catalog.packs;
  const rewardLabel = (type: string, targetId: string | null, amount: number) => {
    if (type === "CARD") return `카드 ${catalog.cards.find((card) => card.id === targetId)?.name ?? targetId ?? "—"} ×${amount}`;
    if (type === "CHAMPION") return `챔피언 ${catalog.champions.find(c => c.id === targetId)?.name ?? targetId ?? "—"}`;
    if (type === "PACK") return `팩 ${catalog.packs.find((pack) => pack.id === targetId)?.name ?? targetId ?? "—"} ×${amount}`;
    return `+${amount} 크레딧`;
  };

  return (
    <section className="space-y-6 rounded-xl border border-neutral-800 bg-black/40 p-5 sm:p-8">
      <div><p className="font-display text-xs font-bold tracking-[0.25em] text-primary">REWARDS & PROGRESS</p><h2 className="mt-2 text-2xl font-black">보상 · 일일 퀘스트 · 출석</h2><p className="mt-2 text-sm leading-6 text-neutral-500">모든 지급량은 서버가 검증하며, 이미 지급된 보상은 설정 변경으로 소급되지 않습니다.</p></div>
      {message && <p role="status" className="rounded border border-amber-800/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">{message}</p>}

      <section className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-5">
        <div className="flex items-center gap-2"><Settings2 className="h-4 w-4 text-amber-400" /><h3 className="font-black">온라인 매치 보상</h3></div>
        <p className="mt-2 text-xs leading-5 text-neutral-500">온라인 매치의 canonical FINISHED 결과에만 적용됩니다. AI 로컬 매치는 서버 검증 결과가 없어 자동 지급하지 않습니다.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-bold text-neutral-400">승리 보상<input type="number" min="1" value={match.winAmount} onChange={(event) => setMatch({ ...match, winAmount: event.target.value })} className="mt-1 w-full rounded border border-neutral-700 bg-black px-3 py-2 text-sm text-white" /></label>
          <label className="text-xs font-bold text-neutral-400">패배 보상<input type="number" min="1" value={match.lossAmount} onChange={(event) => setMatch({ ...match, lossAmount: event.target.value })} className="mt-1 w-full rounded border border-neutral-700 bg-black px-3 py-2 text-sm text-white" /></label>
          <label className="flex items-end gap-2 pb-2 text-xs font-bold text-neutral-300"><input type="checkbox" checked={match.enabled} onChange={(event) => setMatch({ ...match, enabled: event.target.checked })} /> 지급 활성화</label>
        </div>
        <button type="button" disabled={saving} onClick={() => void saveMatch()} className="mt-4 flex items-center gap-2 rounded bg-amber-400 px-4 py-2.5 text-xs font-black text-black disabled:opacity-50"><Save className="h-3.5 w-3.5" /> 저장</button>
      </section>

      <DailyQuestEditor definitions={data?.dailyQuests??[]} catalog={catalog} onSaved={load} />

      <section className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-5">
        <div className="flex items-center gap-2"><CalendarCheck2 className="h-4 w-4 text-amber-400" /><h3 className="font-black">출석 보드 관리</h3></div>
         <div className="mt-4 grid gap-3 sm:grid-cols-3"><input type="number" min="1" max="365" value={attendanceDay} onChange={(event) => setAttendanceDay(event.target.value)} placeholder="Day" className="rounded border border-neutral-700 bg-black px-3 py-2 text-sm text-white" /><select value={attendanceRewardType} onChange={(event) => { setAttendanceRewardType(event.target.value); setAttendanceTargetId(""); }} className="rounded border border-neutral-700 bg-black px-3 py-2 text-sm text-white"><option value="CURRENCY">CURRENCY</option><option value="CARD">CARD</option><option value="CHAMPION">CHAMPION</option><option value="PACK">PACK</option></select>{attendanceRewardType !== "CURRENCY" ? <select value={attendanceTargetId} onChange={(event) => setAttendanceTargetId(event.target.value)} className="rounded border border-neutral-700 bg-black px-3 py-2 text-sm text-white"><option value="">보상 대상 선택</option>{attendanceTargetOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : <span />}</div>
         <div className="mt-3 grid gap-3 sm:grid-cols-3"><input type="number" min="1" value={attendanceAmount} onChange={(event) => setAttendanceAmount(event.target.value)} placeholder="보상 수량" className="rounded border border-neutral-700 bg-black px-3 py-2 text-sm text-white" /><label className="flex items-center gap-2 text-xs font-bold text-neutral-300"><input type="checkbox" checked={attendanceEnabled} onChange={(event) => setAttendanceEnabled(event.target.checked)} /> 활성화</label></div>
        <button type="button" disabled={saving} onClick={() => void saveAttendance()} className="mt-4 rounded bg-amber-400 px-4 py-2.5 text-xs font-black text-black disabled:opacity-50">Day 저장</button>
         <div className="mt-5 grid gap-2 sm:grid-cols-4">{data?.attendance.map((item) => <button key={item.dayIndex} type="button" onClick={() => { setAttendanceDay(String(item.dayIndex)); setAttendanceAmount(String(item.rewardAmount)); setAttendanceRewardType(item.rewardType); setAttendanceTargetId(item.rewardTargetId ?? ""); setAttendanceEnabled(item.enabled); }} className="rounded border border-neutral-800 px-3 py-3 text-left hover:border-amber-700"><strong className="text-sm text-white">Day {item.dayIndex}</strong><p className="mt-1 text-xs text-amber-200">{rewardLabel(item.rewardType, item.rewardTargetId, item.rewardAmount)}</p><p className="mt-1 text-[10px] text-neutral-500">{item.enabled ? "활성" : "비활성"}</p></button>)}</div>
      </section>
    </section>
  );
}