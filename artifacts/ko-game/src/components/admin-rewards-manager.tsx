import { useEffect, useMemo, useState } from "react";
import { CalendarCheck2, ListChecks, Save, Settings2 } from "lucide-react";
import {
  createDailyQuest,
  fetchRewardAdminData,
  saveMatchRewardSettings,
  updateAttendanceReward,
  updateDailyQuest,
  upsertAttendanceReward,
  fetchRewardCatalogs,
  type RewardCatalogCard,
  type RewardCatalogPack,
  type RewardAdminData,
} from "@/lib/rewards-client";

const emptyQuest = {
  title: "",
  description: "",
  objectiveType: "PLAY_MATCH",
  cardType: "",
  targetValue: "1",
  rewardType: "CURRENCY",
  rewardTargetId: "",
  rewardAmount: "",
  enabled: true,
};

export function AdminRewardsManager({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [data, setData] = useState<RewardAdminData | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [match, setMatch] = useState({ winAmount: "", lossAmount: "", enabled: false });
  const [quest, setQuest] = useState(emptyQuest);
  const [editingQuestId, setEditingQuestId] = useState<string | null>(null);
  const [attendanceDay, setAttendanceDay] = useState("1");
  const [attendanceAmount, setAttendanceAmount] = useState("");
  const [attendanceEnabled, setAttendanceEnabled] = useState(true);
  const [attendanceRewardType, setAttendanceRewardType] = useState("CURRENCY");
  const [attendanceTargetId, setAttendanceTargetId] = useState("");
  const [catalog, setCatalog] = useState<{ cards: RewardCatalogCard[]; packs: RewardCatalogPack[] }>({ cards: [], packs: [] });

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

  const objectiveOptions = useMemo(() => data?.objectiveTypes ?? ["PLAY_MATCH", "WIN_MATCH", "CARD_PLAYED", "TECHNIQUE_PLAYED", "ATTACK_DECLARED", "DAMAGE_DEALT"], [data]);

  async function saveMatch() {
    setSaving(true);
    try {
      await saveMatchRewardSettings({ winAmount: Number(match.winAmount), lossAmount: Number(match.lossAmount), enabled: match.enabled });
      setMessage("온라인 매치 보상 설정을 저장했습니다.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "설정을 저장하지 못했습니다."); } finally { setSaving(false); }
  }

  function editQuest(item: NonNullable<RewardAdminData>["dailyQuests"][number]) {
    setEditingQuestId(item.id);
    setQuest({
      title: item.title,
      description: item.description,
      objectiveType: item.objectiveType,
      cardType: item.cardType ?? "",
      targetValue: String(item.targetValue),
      rewardType: item.rewardType,
      rewardTargetId: item.rewardTargetId ?? "",
      rewardAmount: String(item.rewardAmount),
      enabled: item.enabled,
    });
  }

  async function saveQuest() {
    setSaving(true);
    const body = {
      ...quest,
      targetValue: Number(quest.targetValue),
      rewardAmount: Number(quest.rewardAmount),
      rewardTargetId: quest.rewardType === "CURRENCY" ? null : quest.rewardTargetId || null,
      cardType: quest.cardType || null,
    };
    try {
      if (editingQuestId) await updateDailyQuest(editingQuestId, body);
      else await createDailyQuest(body);
      setQuest(emptyQuest);
      setEditingQuestId(null);
      setMessage("일일 퀘스트를 저장했습니다.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "일일 퀘스트를 저장하지 못했습니다."); } finally { setSaving(false); }
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

  const rewardTargetOptions = quest.rewardType === "CARD"
    ? catalog.cards.filter((card) => !card.isToken && !card.isChampionToken)
    : catalog.packs;
  const attendanceTargetOptions = attendanceRewardType === "CARD"
    ? catalog.cards.filter((card) => !card.isToken && !card.isChampionToken)
    : catalog.packs;
  const rewardLabel = (type: string, targetId: string | null, amount: number) => {
    if (type === "CARD") return `카드 ${catalog.cards.find((card) => card.id === targetId)?.name ?? targetId ?? "—"} ×${amount}`;
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

      <section className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-5">
        <div className="flex items-center gap-2"><ListChecks className="h-4 w-4 text-amber-400" /><h3 className="font-black">일일 퀘스트 관리</h3></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input value={quest.title} onChange={(event) => setQuest({ ...quest, title: event.target.value })} placeholder="퀘스트 제목" className="rounded border border-neutral-700 bg-black px-3 py-2 text-sm text-white" />
          <select value={quest.objectiveType} onChange={(event) => setQuest({ ...quest, objectiveType: event.target.value, cardType: event.target.value === "CARD_PLAYED" ? quest.cardType : "" })} className="rounded border border-neutral-700 bg-black px-3 py-2 text-sm text-white">{objectiveOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <textarea value={quest.description} onChange={(event) => setQuest({ ...quest, description: event.target.value })} placeholder="설명" className="min-h-20 rounded border border-neutral-700 bg-black px-3 py-2 text-sm text-white sm:col-span-2" />
          {quest.objectiveType === "CARD_PLAYED" && <select value={quest.cardType} onChange={(event) => setQuest({ ...quest, cardType: event.target.value })} className="rounded border border-neutral-700 bg-black px-3 py-2 text-sm text-white"><option value="">모든 카드</option><option value="WRESTLER">WRESTLER</option><option value="TECHNIQUE">TECHNIQUE</option></select>}
          <input type="number" min="1" value={quest.targetValue} onChange={(event) => setQuest({ ...quest, targetValue: event.target.value })} placeholder="목표 수치" className="rounded border border-neutral-700 bg-black px-3 py-2 text-sm text-white" />
           <select value={quest.rewardType} onChange={(event) => setQuest({ ...quest, rewardType: event.target.value, rewardTargetId: "" })} className="rounded border border-neutral-700 bg-black px-3 py-2 text-sm text-white"><option value="CURRENCY">CURRENCY</option><option value="CARD">CARD</option><option value="PACK">PACK</option></select>
           {quest.rewardType !== "CURRENCY" && <select value={quest.rewardTargetId} onChange={(event) => setQuest({ ...quest, rewardTargetId: event.target.value })} className="rounded border border-neutral-700 bg-black px-3 py-2 text-sm text-white"><option value="">보상 대상 선택</option>{rewardTargetOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
           <input type="number" min="1" value={quest.rewardAmount} onChange={(event) => setQuest({ ...quest, rewardAmount: event.target.value })} placeholder="보상 수량" className="rounded border border-neutral-700 bg-black px-3 py-2 text-sm text-white" />
          <label className="flex items-center gap-2 text-xs font-bold text-neutral-300"><input type="checkbox" checked={quest.enabled} onChange={(event) => setQuest({ ...quest, enabled: event.target.checked })} /> 활성화</label>
        </div>
        <div className="mt-4 flex gap-2"><button type="button" disabled={saving} onClick={() => void saveQuest()} className="rounded bg-amber-400 px-4 py-2.5 text-xs font-black text-black disabled:opacity-50">{editingQuestId ? "퀘스트 수정" : "퀘스트 추가"}</button>{editingQuestId && <button type="button" onClick={() => { setEditingQuestId(null); setQuest(emptyQuest); }} className="rounded border border-neutral-700 px-4 py-2.5 text-xs font-black text-neutral-300">취소</button>}</div>
         <div className="mt-5 space-y-2">{data?.dailyQuests.map((item) => <button key={item.id} type="button" onClick={() => editQuest(item)} className="flex w-full items-center justify-between gap-3 rounded border border-neutral-800 px-3 py-3 text-left hover:border-amber-700"><span><strong className="text-sm text-white">{item.title}</strong><span className="ml-2 text-[10px] text-neutral-500">{item.objectiveType} · {item.targetValue}회 · {rewardLabel(item.rewardType, item.rewardTargetId, item.rewardAmount)}</span></span><span className={item.enabled ? "text-emerald-400" : "text-neutral-600"}>{item.enabled ? "활성" : "비활성"}</span></button>)}</div>
      </section>

      <section className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-5">
        <div className="flex items-center gap-2"><CalendarCheck2 className="h-4 w-4 text-amber-400" /><h3 className="font-black">출석 보드 관리</h3></div>
         <div className="mt-4 grid gap-3 sm:grid-cols-3"><input type="number" min="1" max="365" value={attendanceDay} onChange={(event) => setAttendanceDay(event.target.value)} placeholder="Day" className="rounded border border-neutral-700 bg-black px-3 py-2 text-sm text-white" /><select value={attendanceRewardType} onChange={(event) => { setAttendanceRewardType(event.target.value); setAttendanceTargetId(""); }} className="rounded border border-neutral-700 bg-black px-3 py-2 text-sm text-white"><option value="CURRENCY">CURRENCY</option><option value="CARD">CARD</option><option value="PACK">PACK</option></select>{attendanceRewardType !== "CURRENCY" ? <select value={attendanceTargetId} onChange={(event) => setAttendanceTargetId(event.target.value)} className="rounded border border-neutral-700 bg-black px-3 py-2 text-sm text-white"><option value="">보상 대상 선택</option>{attendanceTargetOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select> : <span />}</div>
         <div className="mt-3 grid gap-3 sm:grid-cols-3"><input type="number" min="1" value={attendanceAmount} onChange={(event) => setAttendanceAmount(event.target.value)} placeholder="보상 수량" className="rounded border border-neutral-700 bg-black px-3 py-2 text-sm text-white" /><label className="flex items-center gap-2 text-xs font-bold text-neutral-300"><input type="checkbox" checked={attendanceEnabled} onChange={(event) => setAttendanceEnabled(event.target.checked)} /> 활성화</label></div>
        <button type="button" disabled={saving} onClick={() => void saveAttendance()} className="mt-4 rounded bg-amber-400 px-4 py-2.5 text-xs font-black text-black disabled:opacity-50">Day 저장</button>
         <div className="mt-5 grid gap-2 sm:grid-cols-4">{data?.attendance.map((item) => <button key={item.dayIndex} type="button" onClick={() => { setAttendanceDay(String(item.dayIndex)); setAttendanceAmount(String(item.rewardAmount)); setAttendanceRewardType(item.rewardType); setAttendanceTargetId(item.rewardTargetId ?? ""); setAttendanceEnabled(item.enabled); }} className="rounded border border-neutral-800 px-3 py-3 text-left hover:border-amber-700"><strong className="text-sm text-white">Day {item.dayIndex}</strong><p className="mt-1 text-xs text-amber-200">{rewardLabel(item.rewardType, item.rewardTargetId, item.rewardAmount)}</p><p className="mt-1 text-[10px] text-neutral-500">{item.enabled ? "활성" : "비활성"}</p></button>)}</div>
      </section>
    </section>
  );
}