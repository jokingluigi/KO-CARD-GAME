import { useEffect, useMemo, useState } from "react";
import { fetchRewardCatalogs, type RewardCatalogCard, type RewardCatalogChampion, type RewardCatalogPack } from "@/lib/rewards-client";
import {
  adminFetch, Button, Chip, EditorPane, errorText, Field, fromLocalInput, Grid, ListPane, ListRow, Notice, NumberInput, Panel,
  SaveLine, Split, Tabs, toLocalInput, Toggle, useAutosave, useMobileEditing,
} from "./admin-kit";

type Reward = { rewardType: string; rewardAmount: number; rewardTargetId: string | null };
type Platform = { questType: "DAILY" | "SEASON"; seasonId: string | null; weight: number; modes: string[]; rarity: string | null; result: string; activationAt: string | null; archived: boolean; version?: number; rewards: Reward[] };
type Definition = { id?: string; title: string; description: string; objectiveType: string; cardType: string | null; targetValue: number; enabled: boolean; condition?: unknown; schemaVersion?: string; platform: Platform };
type Season = { id: string; name: string; startsAt: string; endsAt: string; status: string };
type Bonus = Reward & { enabled: boolean };
type Data = { dailyCompletionBonus?: Bonus; definitions: Definition[]; seasons: Season[]; settings: { dailyCount: number; timezone: string }; objectives: string[]; modes: string[] };
type Catalog = { cards: RewardCatalogCard[]; packs: RewardCatalogPack[]; champions: RewardCatalogChampion[] };

const OBJECTIVE_KO: Record<string, string> = {
  PLAY_MATCH: "경기 하기", WIN_MATCH: "경기 이기기", LOSS_MATCH: "경기 지기", CARD_PLAYED: "카드 내기", WRESTLER_PLAYED: "선수 카드 내기",
  TECHNIQUE_PLAYED: "기술 카드 쓰기", CARD_RETIRED: "선수 리타이어시키기", CARD_DESTROYED: "선수 파괴하기", DAMAGE_DEALT: "데미지 주기",
  CHAMPION_ABILITY_USED: "챔피언 고유 능력 쓰기", FUSION: "합체하기", ATTACK_DECLARED: "공격하기",
};
const MODE_KO: Record<string, string> = { AI: "AI 대전", PVP: "온라인 대전", DRAFT: "드래프트" };
const REWARD_KO: Record<string, string> = { CURRENCY: "크레딧", PACK: "카드팩", CARD: "카드", CHAMPION: "챔피언" };
const SEASON_STATUS_KO: Record<string, string> = { ACTIVE: "진행", DISABLED: "꺼짐", ARCHIVED: "보관" };

const fresh = (questType: "DAILY" | "SEASON", seasonId: string | null): Definition => ({
  title: questType === "DAILY" ? "새 일일 퀘스트" : "새 시즌 퀘스트", description: "", objectiveType: "PLAY_MATCH", cardType: null, targetValue: 1, enabled: false,
  platform: { questType, seasonId, weight: 100, modes: ["AI", "PVP", "DRAFT"], rarity: null, result: "ANY", activationAt: null, archived: false, rewards: [{ rewardType: "CURRENCY", rewardAmount: 100, rewardTargetId: null }] },
});

function RewardEditor({ reward, catalog, onChange }: { reward: Reward; catalog: Catalog; onChange: (patch: Partial<Reward>) => void }) {
  const options = reward.rewardType === "PACK" ? catalog.packs.filter((p) => !p.deletedAt) : reward.rewardType === "CARD" ? catalog.cards.filter((c) => !c.isToken && !c.isChampionToken) : catalog.champions;
  return (
    <Grid cols={3}>
      <Field label="보상 종류"><select value={reward.rewardType} onChange={(e) => onChange({ rewardType: e.target.value, rewardTargetId: null, rewardAmount: e.target.value === "CHAMPION" ? 1 : reward.rewardAmount })}>{Object.entries(REWARD_KO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
      {reward.rewardType !== "CURRENCY" && <Field label={`어떤 ${REWARD_KO[reward.rewardType]}`}><select value={reward.rewardTargetId ?? ""} onChange={(e) => onChange({ rewardTargetId: e.target.value || null })}><option value="">고르기</option>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>}
      {reward.rewardType !== "CHAMPION" && <Field label="수량"><NumberInput value={reward.rewardAmount} min={1} step={reward.rewardType === "CURRENCY" ? 10 : 1} onChange={(rewardAmount) => onChange({ rewardAmount })} /></Field>}
    </Grid>
  );
}

/** 퀘스트 — 일일·시즌 퀘스트와 배정 설정. 고치면 바로 저장돼요. */
export function AdminQuestManager({ onUnauthorized }: { onUnauthorized?: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [catalog, setCatalog] = useState<Catalog>({ cards: [], packs: [], champions: [] });
  const [tab, setTab] = useState<"DAILY" | "SEASON" | "SETTINGS">("DAILY");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Definition | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const mobile = useMobileEditing();

  async function load() {
    try { setData(await adminFetch<Data>("/quests", undefined, onUnauthorized)); }
    catch (e) { setError(errorText(e, "퀘스트를 불러오지 못했어요.")); }
  }
  useEffect(() => { void load(); void fetchRewardCatalogs().then(setCatalog).catch(() => {}); }, []);

  const autosave = useAutosave(draft?.id ?? null, draft, async (next) => {
    if (!next.title.trim()) throw new Error("이름을 써 주세요.");
    if (next.platform.questType === "SEASON" && !next.platform.seasonId) throw new Error("시즌을 골라 주세요.");
    if (!next.platform.modes.length) throw new Error("어느 대전에서 셀지 하나 이상 골라 주세요.");
    const payload = { ...next, schemaVersion: next.condition ? next.schemaVersion ?? "QUEST_CONDITION_V2" : "QUEST_CONDITION_V1", condition: next.condition ?? null };
    const body = await adminFetch<{ definition: Definition & { platform: Platform } }>("/quests/definitions", { method: "POST", json: payload }, onUnauthorized);
    setData((d) => d && ({ ...d, definitions: d.definitions.map((x) => (x.id === next.id ? { ...x, ...next, platform: { ...next.platform, version: body.definition.platform?.version ?? x.platform.version } } : x)) }));
  }, 1200);

  function select(d: Definition) { void autosave.flush(); setSelectedId(d.id ?? null); setDraft(structuredClone(d)); mobile.open(); }

  async function create() {
    if (tab === "SETTINGS" || !data) return;
    const seasonId = tab === "SEASON" ? data.seasons.find((s) => s.status === "ACTIVE")?.id ?? data.seasons[0]?.id ?? null : null;
    if (tab === "SEASON" && !seasonId) { setTab("SETTINGS"); setError("시즌 퀘스트를 만들려면 먼저 '설정' 탭에서 시즌을 만들어 주세요."); return; }
    try {
      const body = await adminFetch<{ definition: Definition }>("/quests/definitions", { method: "POST", json: { ...fresh(tab, seasonId), schemaVersion: "QUEST_CONDITION_V1", condition: null } }, onUnauthorized);
      await load();
      select({ ...fresh(tab, seasonId), ...body.definition });
    } catch (e) { setError(errorText(e, "퀘스트를 만들지 못했어요.")); }
  }

  async function remove() {
    if (!draft?.id || !window.confirm(`"${draft.title}" 퀘스트를 지울까요?\n새로 배정되지 않아요. 이미 받은 퀘스트와 보상 기록은 남아요.`)) return;
    try {
      await adminFetch(`/quests/definitions/${encodeURIComponent(draft.id)}`, { method: "DELETE" }, onUnauthorized);
      setData((d) => d && ({ ...d, definitions: d.definitions.filter((x) => x.id !== draft.id) }));
      setDraft(null); setSelectedId(null); mobile.back();
    } catch (e) { autosave.setState({ kind: "error", message: errorText(e, "지우지 못했어요.") }); }
  }

  const list = useMemo(() => (data?.definitions ?? [])
    // System quests (e.g. 드래프트 도전자) are built into the game and not edited here.
    .filter((d) => d.platform.questType === tab && !d.platform.archived && (data?.objectives ?? []).includes(d.objectiveType))
    .filter((d) => !search.trim() || `${d.title} ${d.description}`.includes(search.trim()))
    .sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.title.localeCompare(b.title, "ko")), [data, tab, search]);

  if (error && !data) return <Notice tone="error">{error}</Notice>;
  if (!data) return <p className="text-sm text-neutral-400">불러오는 중…</p>;

  const set = (patch: Partial<Definition>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setPlatform = (patch: Partial<Platform>) => setDraft((d) => (d ? { ...d, platform: { ...d.platform, ...patch } } : d));
  const rewardText = (r: Reward) => r.rewardType === "CURRENCY" ? `${r.rewardAmount} 크레딧` : `${((r.rewardType === "PACK" ? catalog.packs : r.rewardType === "CARD" ? catalog.cards : catalog.champions) as Array<{ id: string; name: string }>).find((x) => x.id === r.rewardTargetId)?.name ?? REWARD_KO[r.rewardType]}${r.rewardType === "CHAMPION" ? "" : ` ×${r.rewardAmount}`}`;

  return (
    <div className="ak-page">
      <Tabs value={tab} onChange={(t) => { void autosave.flush(); setTab(t); setDraft(null); setSelectedId(null); mobile.back(); setError(""); }} tabs={[["DAILY", "일일 퀘스트"], ["SEASON", "시즌 퀘스트"], ["SETTINGS", "설정 · 시즌"]] as const} />
      {error && <Notice tone="warn">{error}</Notice>}
      {tab === "SETTINGS" ? <QuestSettings data={data} catalog={catalog} onUnauthorized={onUnauthorized} reload={load} /> : (
        <Split editing={mobile.editing}
          list={<ListPane actions={<button type="button" onClick={() => void create()}>+ 새 퀘스트</button>} search={search} onSearch={setSearch} count={`${list.length}개 · 켜진 것 ${list.filter((d) => d.enabled).length}개`}>
            {list.map((d) => <ListRow key={d.id} selected={d.id === selectedId} onClick={() => select(d)} title={d.title} sub={`${OBJECTIVE_KO[d.objectiveType] ?? d.objectiveType} ${d.targetValue}번 · ${d.platform.rewards.map(rewardText).join(", ")}`} badge={d.enabled ? "켜짐" : "꺼짐"} tone={d.enabled ? "on" : "off"} />)}
            {!list.length && <p className="ak-hint" style={{ margin: 8 }}>퀘스트가 없어요. "+ 새 퀘스트"로 만들어 보세요.</p>}
          </ListPane>}
          editor={<EditorPane onBack={() => { void autosave.flush(); mobile.back(); }} status={<SaveLine state={autosave.state} idle="고치면 바로 저장돼요 · 이미 받은 퀘스트는 안 바뀌어요" />} right={draft && <Button kind="danger" onClick={() => void remove()}>지우기</Button>}>
            {draft && <>
              <Panel>
                <Toggle checked={draft.enabled} onChange={(enabled) => set({ enabled })} label={draft.enabled ? "켜짐 (게이머에게 배정돼요)" : "꺼짐 (배정 안 돼요)"} />
                <Field label="이름"><input value={draft.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} /></Field>
                <Field label="설명 (선택)"><textarea rows={2} value={draft.description} onChange={(e) => set({ description: e.target.value })} /></Field>
              </Panel>
              <Panel title="무엇을 하면 되나요?">
                <Grid>
                  <Field label="할 일"><select value={draft.objectiveType} onChange={(e) => set({ objectiveType: e.target.value })}>{data.objectives.map((o) => <option key={o} value={o}>{OBJECTIVE_KO[o] ?? o}</option>)}</select></Field>
                  <Field label="몇 번"><NumberInput value={draft.targetValue} min={1} onChange={(targetValue) => set({ targetValue })} /></Field>
                </Grid>
                <Field label="어느 대전에서 셀까요?"><div className="ak-chips">{data.modes.map((m) => <Chip key={m} on={draft.platform.modes.includes(m)} onClick={() => setPlatform({ modes: draft.platform.modes.includes(m) ? draft.platform.modes.filter((x) => x !== m) : [...draft.platform.modes, m] })}>{MODE_KO[m] ?? m}</Chip>)}</div></Field>
                <Grid cols={3}>
                  <Field label="카드 종류"><select value={draft.cardType ?? ""} onChange={(e) => set({ cardType: e.target.value || null })}><option value="">상관없음</option><option value="WRESTLER">선수</option><option value="TECHNIQUE">기술</option></select></Field>
                  <Field label="카드 등급"><select value={draft.platform.rarity ?? ""} onChange={(e) => setPlatform({ rarity: e.target.value || null })}><option value="">상관없음</option><option value="NORMAL">일반</option><option value="EPIC">에픽</option><option value="LEGENDARY">레전더리</option><option value="CHAMPION">챔피언</option></select></Field>
                  <Field label="경기 결과"><select value={draft.platform.result} onChange={(e) => setPlatform({ result: e.target.value })}><option value="ANY">상관없음</option><option value="WIN">이겼을 때만</option><option value="LOSS">졌을 때만</option></select></Field>
                </Grid>
                <ConditionEditor key={draft.id} value={draft.condition} onChange={(condition) => set({ condition: condition ?? undefined, schemaVersion: condition ? "QUEST_CONDITION_V2" : "QUEST_CONDITION_V1" })} />
              </Panel>
              <Panel title="보상" right={draft.platform.rewards.length < 10 && <Button onClick={() => setPlatform({ rewards: [...draft.platform.rewards, { rewardType: "CURRENCY", rewardAmount: 100, rewardTargetId: null }] })}>+ 보상 추가</Button>}>
                {draft.platform.rewards.map((r, i) => (
                  <div key={i} style={{ display: "grid", gap: 6 }}>
                    <RewardEditor reward={r} catalog={catalog} onChange={(patch) => setPlatform({ rewards: draft.platform.rewards.map((x, n) => (n === i ? { ...x, ...patch } : x)) })} />
                    {draft.platform.rewards.length > 1 && <div><Button kind="ghost" onClick={() => setPlatform({ rewards: draft.platform.rewards.filter((_, n) => n !== i) })}>이 보상 빼기</Button></div>}
                  </div>
                ))}
              </Panel>
              <Panel title="언제 · 얼마나 자주">
                <Grid>
                  {draft.platform.questType === "DAILY"
                    ? <Field label="나올 확률 (가중치)" hint="숫자가 클수록 자주 배정돼요. 보통 100."><NumberInput value={draft.platform.weight} min={1} max={100000} step={10} onChange={(weight) => setPlatform({ weight })} /></Field>
                    : <Field label="시즌"><select value={draft.platform.seasonId ?? ""} onChange={(e) => setPlatform({ seasonId: e.target.value || null })}><option value="">시즌 고르기</option>{data.seasons.map((s) => <option key={s.id} value={s.id}>{s.name} ({SEASON_STATUS_KO[s.status] ?? s.status})</option>)}</select></Field>}
                  <Field label="시작 시간 (선택)" hint="비워 두면 바로 시작해요."><input type="datetime-local" value={toLocalInput(draft.platform.activationAt)} onChange={(e) => setPlatform({ activationAt: fromLocalInput(e.target.value) })} /></Field>
                </Grid>
              </Panel>
            </>}
          </EditorPane>}
        />
      )}
    </div>
  );
}

/** 고급: 태그·소유자·수치 같은 특수 조건 (JSON). 잘 모르면 비워 두세요. */
function ConditionEditor({ value, onChange }: { value: unknown; onChange: (value: unknown | null) => void }) {
  const [text, setText] = useState(value ? JSON.stringify(value, null, 2) : "");
  const [bad, setBad] = useState(false);
  return (
    <details className="ak-advanced" open={Boolean(value) || undefined}>
      <summary>고급: 특수 조건 {value ? "(사용 중)" : "(없음)"}</summary>
      <Field label="특수 조건 (JSON)" hint="태그·주인·수치 조건을 쓸 때만 넣어요. 비워 두면 위에서 고른 조건만 써요. 'required' 값은 '몇 번'과 같아야 해요.">
        <textarea rows={8} style={{ fontFamily: "monospace", fontSize: 13 }} value={text} onChange={(e) => { setText(e.target.value); setBad(false); }}
          onBlur={() => { if (!text.trim()) { onChange(null); return; } try { onChange(JSON.parse(text)); } catch { setBad(true); } }} />
      </Field>
      {bad && <Notice tone="error">JSON 모양이 틀렸어요. 괄호나 따옴표를 확인해 주세요. (저장 안 됨)</Notice>}
    </details>
  );
}

function QuestSettings({ data, catalog, onUnauthorized, reload }: { data: Data; catalog: Catalog; onUnauthorized?: () => void; reload: () => Promise<void> }) {
  const [settings, setSettings] = useState(data.settings);
  const [bonus, setBonus] = useState<Bonus>(data.dailyCompletionBonus ?? { enabled: false, rewardType: "CURRENCY", rewardAmount: 200, rewardTargetId: null });
  const [season, setSeason] = useState<Season | null>(null);
  const [seasonMsg, setSeasonMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const settingsSave = useAutosave("quest-settings", settings, async (next) => { await adminFetch("/quests/settings", { method: "PUT", json: next }, onUnauthorized); });
  const bonusSave = useAutosave("quest-bonus", bonus, async (next) => {
    if (next.rewardType !== "CURRENCY" && !next.rewardTargetId) throw new Error("줄 보상을 골라 주세요.");
    await adminFetch("/quests/completion-bonus", { method: "PUT", json: next }, onUnauthorized);
  });

  async function saveSeason() {
    if (!season) return;
    if (!season.name.trim() || !season.startsAt || !season.endsAt) { setSeasonMsg({ tone: "error", text: "이름, 시작, 끝 시간을 모두 넣어 주세요." }); return; }
    try {
      await adminFetch("/quests/seasons", { method: "POST", json: { ...season, id: season.id || undefined } }, onUnauthorized);
      setSeasonMsg({ tone: "ok", text: "시즌을 저장했어요." }); setSeason(null); await reload();
    } catch (e) { setSeasonMsg({ tone: "error", text: errorText(e, "시즌을 저장하지 못했어요.") }); }
  }
  async function deleteSeason() {
    if (!season?.id || !window.confirm(`"${season.name}" 시즌을 지울까요?\n연결된 퀘스트나 기록이 있으면 지울 수 없어요.`)) return;
    try { await adminFetch(`/quests/seasons/${encodeURIComponent(season.id)}`, { method: "DELETE" }, onUnauthorized); setSeason(null); setSeasonMsg({ tone: "ok", text: "시즌을 지웠어요." }); await reload(); }
    catch (e) { setSeasonMsg({ tone: "error", text: errorText(e, "시즌을 지우지 못했어요.") }); }
  }

  return (
    <>
      <Panel title="일일 퀘스트 배정" right={<SaveLine state={settingsSave.state} idle="" />}>
        <Grid>
          <Field label="하루에 받는 퀘스트 수"><NumberInput value={settings.dailyCount} min={1} max={20} onChange={(dailyCount) => setSettings({ ...settings, dailyCount })} /></Field>
          <Field label="새 퀘스트가 나오는 기준 시간"><select value={settings.timezone} onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}><option value="Asia/Seoul">한국 시간 자정</option><option value="UTC">세계 표준시 자정 (한국 오전 9시)</option></select></Field>
        </Grid>
      </Panel>
      <Panel title="일일 퀘스트 다 깨면 주는 추가 보상" right={<SaveLine state={bonusSave.state} idle="" />} hint="그날 받은 일일 퀘스트를 모두 끝내면 하루 한 번 더 받아요.">
        <Toggle checked={bonus.enabled} onChange={(enabled) => setBonus({ ...bonus, enabled })} label={bonus.enabled ? "추가 보상 켜짐" : "추가 보상 꺼짐"} />
        <RewardEditor reward={bonus} catalog={catalog} onChange={(patch) => setBonus({ ...bonus, ...patch })} />
      </Panel>
      <Panel title="시즌" right={<Button onClick={() => { const now = new Date(); const end = new Date(now.getTime() + 30 * 864e5); setSeason({ id: "", name: "새 시즌", startsAt: now.toISOString(), endsAt: end.toISOString(), status: "ACTIVE" }); setSeasonMsg(null); }}>+ 새 시즌</Button>} hint="시즌 퀘스트는 시즌 기간에만 나와요.">
        <div className="ak-days">
          {data.seasons.map((s) => <button key={s.id} type="button" aria-pressed={season?.id === s.id} data-off={s.status !== "ACTIVE" || undefined} onClick={() => { setSeason({ ...s }); setSeasonMsg(null); }}><b>{s.name}</b><small>{SEASON_STATUS_KO[s.status] ?? s.status} · {new Date(s.startsAt).toLocaleDateString("ko-KR")} ~ {new Date(s.endsAt).toLocaleDateString("ko-KR")}</small></button>)}
          {!data.seasons.length && <p className="ak-hint">아직 시즌이 없어요.</p>}
        </div>
        {season && (
          <div className="ak-panel" style={{ background: "#0f1216" }}><div className="ak-panel-body">
            <Grid>
              <Field label="시즌 이름"><input value={season.name} onChange={(e) => setSeason({ ...season, name: e.target.value })} /></Field>
              <Field label="상태"><select value={season.status} onChange={(e) => setSeason({ ...season, status: e.target.value })}>{Object.entries(SEASON_STATUS_KO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
              <Field label="시작"><input type="datetime-local" value={toLocalInput(season.startsAt)} onChange={(e) => setSeason({ ...season, startsAt: fromLocalInput(e.target.value) ?? "" })} /></Field>
              <Field label="끝"><input type="datetime-local" value={toLocalInput(season.endsAt)} onChange={(e) => setSeason({ ...season, endsAt: fromLocalInput(e.target.value) ?? "" })} /></Field>
            </Grid>
            <div className="ak-row-actions"><Button kind="primary" onClick={() => void saveSeason()}>시즌 저장</Button>{season.id && <Button kind="danger" onClick={() => void deleteSeason()}>시즌 지우기</Button>}<Button kind="ghost" onClick={() => setSeason(null)}>닫기</Button></div>
          </div></div>
        )}
        {seasonMsg && <Notice tone={seasonMsg.tone}>{seasonMsg.text}</Notice>}
      </Panel>
    </>
  );
}
