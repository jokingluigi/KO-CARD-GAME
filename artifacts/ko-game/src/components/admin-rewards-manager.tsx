import { useEffect, useMemo, useState } from "react";
import { TutorialRewardsAdmin } from "./tutorial/tutorial-rewards-admin";
import { Button, errorText, Field, Grid, Notice, NumberInput, Panel, SaveLine, Toggle, useAutosave } from "./admin-kit";
import {
  fetchRewardAdminData, fetchRewardCatalogs, saveMatchRewardSettings, updateAttendanceReward, upsertAttendanceReward,
  type RewardAdminData, type RewardCatalogCard, type RewardCatalogChampion, type RewardCatalogPack,
} from "@/lib/rewards-client";

type Day = { dayIndex: number; rewardType: string; rewardAmount: number; rewardTargetId: string | null; enabled: boolean };
const TYPE_KO: Record<string, string> = { CURRENCY: "크레딧", CARD: "카드", CHAMPION: "챔피언", PACK: "카드팩" };

/** 경기 보상 · 출석 — 고치면 바로 저장돼요. */
export function AdminRewardsManager({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [data, setData] = useState<RewardAdminData | null>(null);
  const [catalog, setCatalog] = useState<{ cards: RewardCatalogCard[]; champions: RewardCatalogChampion[]; packs: RewardCatalogPack[] }>({ cards: [], champions: [], packs: [] });
  const [error, setError] = useState("");
  const [match, setMatch] = useState<{ winAmount: number; lossAmount: number; enabled: boolean } | null>(null);
  const [days, setDays] = useState<Day[]>([]);
  const [dayIndex, setDayIndex] = useState<number | null>(null);

  async function load() {
    try {
      const next = await fetchRewardAdminData();
      setData(next);
      const win = next.settings.find((s) => s.key === "MATCH_ONLINE_WIN"), loss = next.settings.find((s) => s.key === "MATCH_ONLINE_LOSS");
      setMatch({ winAmount: win?.amount ?? 50, lossAmount: loss?.amount ?? 20, enabled: Boolean(win?.enabled && loss?.enabled) });
      setDays(next.attendance.map((d) => ({ ...d })));
      setCatalog(await fetchRewardCatalogs());
    } catch (e) {
      if (/권한|로그인/.test(errorText(e))) onUnauthorized();
      setError(errorText(e, "보상 설정을 불러오지 못했어요."));
    }
  }
  useEffect(() => { void load(); }, []);

  const matchSave = useAutosave("match", match, async (next) => {
    if (next.winAmount < 1 || next.lossAmount < 1) throw new Error("승리·패배 보상은 1 이상이어야 해요.");
    await saveMatchRewardSettings(next);
  });

  const day = days.find((d) => d.dayIndex === dayIndex) ?? null;
  const daySave = useAutosave(day ? `day-${day.dayIndex}` : null, day, async (next) => {
    if (next.rewardType !== "CURRENCY" && !next.rewardTargetId) throw new Error(`어떤 ${TYPE_KO[next.rewardType]} 줄지 골라 주세요.`);
    if (next.rewardAmount < 1) throw new Error("수량은 1 이상이어야 해요.");
    const body = { ...next, rewardTargetId: next.rewardType === "CURRENCY" ? null : next.rewardTargetId };
    if (data?.attendance.some((d) => d.dayIndex === next.dayIndex)) await updateAttendanceReward(next.dayIndex, body);
    else { await upsertAttendanceReward(body); setData((d) => d && ({ ...d, attendance: [...d.attendance, body] })); }
    return `${next.dayIndex}일차 저장됨`;
  });

  const setDay = (patch: Partial<Day>) => setDays((list) => list.map((d) => (d.dayIndex === dayIndex ? { ...d, ...patch } : d)));
  async function addDay() {
    const next = (days.reduce((m, d) => Math.max(m, d.dayIndex), 0) || 0) + 1;
    if (next > 365) return;
    const fresh: Day = { dayIndex: next, rewardType: "CURRENCY", rewardAmount: 100, rewardTargetId: null, enabled: true };
    try {
      await upsertAttendanceReward(fresh);
      setData((d) => d && ({ ...d, attendance: [...d.attendance, fresh] }));
      setDays((list) => [...list, fresh]);
      setDayIndex(next);
    } catch (e) { setError(errorText(e, "출석 날을 추가하지 못했어요.")); }
  }

  const targetOptions = useMemo(() => {
    if (!day) return [];
    if (day.rewardType === "CARD") return catalog.cards.filter((c) => !c.isToken && !c.isChampionToken);
    if (day.rewardType === "CHAMPION") return catalog.champions;
    if (day.rewardType === "PACK") return catalog.packs.filter((p) => !p.deletedAt);
    return [];
  }, [day?.rewardType, catalog]);
  const label = (d: Day) => d.rewardType === "CURRENCY" ? `크레딧 ${d.rewardAmount}`
    : `${TYPE_KO[d.rewardType]} ${(d.rewardType === "CARD" ? catalog.cards : d.rewardType === "PACK" ? catalog.packs : catalog.champions).find((x) => x.id === d.rewardTargetId)?.name ?? "고르기 전"}${d.rewardType === "CHAMPION" ? "" : ` ×${d.rewardAmount}`}`;

  if (error) return <Notice tone="error">{error}</Notice>;
  if (!data || !match) return <p className="text-sm text-neutral-400">불러오는 중…</p>;

  return (
    <div className="ak-page">
      <Panel title="튜토리얼 보상" hint="튜토리얼을 처음 끝낸 계정에게 한 번만 줘요.">
        <TutorialRewardsAdmin />
      </Panel>

      <Panel title="온라인 대전 보상" right={<SaveLine state={matchSave.state} idle="" />} hint="온라인 대전이 끝나면 크레딧을 줘요. AI 대전에는 주지 않아요. 바꿔도 이미 받은 보상은 그대로예요.">
        <Toggle checked={match.enabled} onChange={(enabled) => setMatch({ ...match, enabled })} label={match.enabled ? "보상 주는 중" : "보상 꺼짐"} />
        <Grid>
          <Field label="이기면 (크레딧)"><NumberInput value={match.winAmount} min={1} step={5} onChange={(winAmount) => setMatch({ ...match, winAmount })} /></Field>
          <Field label="지면 (크레딧)"><NumberInput value={match.lossAmount} min={1} step={5} onChange={(lossAmount) => setMatch({ ...match, lossAmount })} /></Field>
        </Grid>
      </Panel>

      <Panel title="출석 보상" right={<Button onClick={() => void addDay()}>+ 하루 추가</Button>} hint="날짜를 누르면 아래에서 보상을 고칠 수 있어요. 고치면 바로 저장돼요.">
        <div className="ak-days">
          {[...days].sort((a, b) => a.dayIndex - b.dayIndex).map((d) => (
            <button key={d.dayIndex} type="button" aria-pressed={d.dayIndex === dayIndex} data-off={!d.enabled || undefined} onClick={() => { void daySave.flush(); setDayIndex(d.dayIndex); }}>
              <b>{d.dayIndex}일차</b><small>{d.enabled ? label(d) : "꺼짐"}</small>
            </button>
          ))}
          {!days.length && <p className="ak-hint">아직 출석 보상이 없어요. "+ 하루 추가"를 눌러 보세요.</p>}
        </div>
        {day && (
          <div className="ak-panel" style={{ background: "#0f1216" }}>
            <header style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}><h3 style={{ margin: 0 }}>{day.dayIndex}일차</h3><SaveLine state={daySave.state} idle="" /></header>
            <div className="ak-panel-body">
              <Toggle checked={day.enabled} onChange={(enabled) => setDay({ enabled })} label={day.enabled ? "이 날 보상 줌" : "이 날 보상 꺼짐"} />
              <Grid>
                <Field label="보상 종류">
                  <select value={day.rewardType} onChange={(e) => setDay({ rewardType: e.target.value, rewardTargetId: null, rewardAmount: e.target.value === "CHAMPION" ? 1 : day.rewardAmount })}>
                    {Object.entries(TYPE_KO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </Field>
                {day.rewardType !== "CURRENCY" && (
                  <Field label={`줄 ${TYPE_KO[day.rewardType]}`}>
                    <select value={day.rewardTargetId ?? ""} onChange={(e) => setDay({ rewardTargetId: e.target.value || null })}>
                      <option value="">고르기</option>
                      {targetOptions.map((o) => <option key={o.id} value={o.id}>{o.name}{o.status && o.status !== "PUBLISHED" ? " (미공개)" : ""}</option>)}
                    </select>
                  </Field>
                )}
                {day.rewardType !== "CHAMPION" && <Field label="수량"><NumberInput value={day.rewardAmount} min={1} step={day.rewardType === "CURRENCY" ? 10 : 1} onChange={(rewardAmount) => setDay({ rewardAmount })} /></Field>}
              </Grid>
            </div>
          </div>
        )}
      </Panel>
      <p className="ak-hint">일일·시즌 퀘스트는 ‘퀘스트’ 화면에서 정해요.</p>
    </div>
  );
}
