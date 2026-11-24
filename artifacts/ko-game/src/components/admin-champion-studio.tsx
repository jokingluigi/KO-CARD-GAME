import { useEffect, useMemo, useRef, useState } from "react";
import { championRecordToDefinition, type PublishedChampionRecord } from "../game/champions/published-champions";
import { CardArtwork } from "./card-artwork";
import "./admin-card-studio.css";
import { ChampionIntroInteractions } from "./admin-champion-intros";
import { CHAMPION_EMOTES, CHAMPION_EMOTE_LABELS, type ChampionPresentationLines } from "../game/champions/types";
import { checkCardText } from "@/lib/card-text-spelling";
import { autoFixedText, SpellingHelper, useSpellingAuto } from "./spelling-helper";
import {
  adminFetch, Button, Chip, EditorPane, errorText, Field, Grid, ImagePick, ListPane, ListRow, Notice, NumberInput, Panel,
  SaveLine, Split, STATUS_KO, statusTone, Tabs, uploadAdminImage, useMobileEditing, type SaveState,
} from "./admin-kit";

type Champion = PublishedChampionRecord & { [key: string]: unknown; status: "DRAFT" | "PUBLISHED" | "DISABLED"; version: number; updatedAt?: string };

/** Keys that are only words on screen — everything else in the built champion is "what it does". */
const WORDS = new Set(["name", "description", "rewardText", "introLineOne", "introLineTwo", "presentationLines", "imageUrl", "imageAssetId", "questCompletedPortraitUrl", "questCompletedPortraitAssetId", "version", "status", "imageDisplayMode", "imageScale", "imagePositionX", "imagePositionY", "questCompleteAudioUrl", "questCompleteAudioAssetId", "questCompleteAudioVolume", "questCompleteAudioEnabled", "questCompletedPortraitEnabled"]);
function behaviour(c: Champion) {
  try { return JSON.stringify(championRecordToDefinition(c), (k, v) => (WORDS.has(k) ? undefined : v)); } catch { return "error"; }
}
const TEXT_FIELDS = ["name", "abilityText", "questText", "upgradedAbilityText", "gameStartAbilityText"] as const;

/** 챔피언 편집 — 카드 편집처럼 고치면 바로 저장돼요. 글을 바꿔 능력이 달라지면 먼저 물어봐요. */
export function AdminChampionStudio({ onUnauthorized, onOpenAdvanced, onTestGame }: { onUnauthorized: () => void; onOpenAdvanced: (id: string) => void; onTestGame: (id: string) => void }) {
  const [list, setList] = useState<Champion[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Champion | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [decision, setDecision] = useState(false);
  const [draftHidden, setDraftHidden] = useState<string[] | null>(null);
  const [q, setQ] = useState("");
  const [uploading, setUploading] = useState(false);
  const saved = useRef<Champion | null>(null);
  const timer = useRef<number | null>(null);
  const mobile = useMobileEditing();
  const [spellAuto, setSpellAuto] = useSpellingAuto();
  const [spellUndo, setSpellUndo] = useState<{ field: string; label: string; onUndo: () => void } | null>(null);
  const [linePhase, setLinePhase] = useState<"BEFORE_QUEST" | "AFTER_QUEST">("BEFORE_QUEST");
  const [rival, setRival] = useState("");
  const spellNames = useMemo(() => (list ?? []).map((c) => c.name), [list]);

  /** Effect-text box with the spelling helper under it (shown only when there is something to fix). */
  function TextBox({ field, label, rows = 3 }: { field: "abilityText" | "questText" | "questRewardText" | "upgradedAbilityText" | "gameStartAbilityText"; label: string; rows?: number }) {
    const value = String(draft?.[field] ?? "");
    const fixes = checkCardText(value, spellNames).length;
    return (
      <>
        <Field label={label}><textarea rows={rows} value={value} onChange={(e) => { setSpellUndo(null); change({ [field]: e.target.value } as Partial<Champion>, 1100); }}
          onBlur={() => { if (!spellAuto) return; const fixed = autoFixedText(value, spellNames); if (fixed === null) return; change({ [field]: fixed } as Partial<Champion>, 300); setSpellUndo({ field, label: "맞춤법을 자동으로 고쳤어요.", onUndo: () => { setSpellUndo(null); change({ [field]: value } as Partial<Champion>, 300); } }); }} /></Field>
        {(fixes > 0 || spellUndo?.field === field) && <SpellingHelper text={value} names={spellNames} onApply={(text) => { setSpellUndo(null); change({ [field]: text } as Partial<Champion>, 300); }} auto={spellAuto} onAutoChange={setSpellAuto} undo={spellUndo?.field === field ? spellUndo : null} />}
      </>
    );
  }

  async function load() {
    try {
      const body = await adminFetch<{ champions: Champion[] }>("/champions", undefined, onUnauthorized);
      setList(body.champions);
      return body.champions;
    } catch (e) { setSave({ kind: "error", message: errorText(e, "챔피언을 불러오지 못했어요.") }); setList([]); return []; }
  }
  useEffect(() => {
    void load().then((all) => {
      const wanted = new URLSearchParams(window.location.search).get("champion");
      const c = wanted ? all.find((x) => x.id === wanted) : undefined;
      if (c) { select(c); history.replaceState(history.state, "", window.location.pathname); }
    });
    adminFetch<{ excludedChampionIds: string[] }>("/draft/champion-selection", { cache: "no-store" }).then((b) => setDraftHidden(b.excludedChampionIds)).catch(() => setDraftHidden(null));
  }, []);

  function flush() { if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } }
  function select(c: Champion) { flushNow(); setSelectedId(c.id); setDraft(c); saved.current = c; setDecision(false); setSave({ kind: "idle" }); mobile.open(); }

  async function persist(next: Champion, label = "저장됨") {
    setSave({ kind: "saving" });
    try {
      const { status: _s, createdAt: _c, updatedAt: _u, ...body } = next as Champion & { createdAt?: string };
      const res = await adminFetch<{ champion: Champion }>(`/champions/${encodeURIComponent(next.id)}`, { method: "PATCH", json: { ...body, version: saved.current?.version ?? next.version } }, onUnauthorized);
      saved.current = res.champion;
      setList((l) => l?.map((c) => (c.id === res.champion.id ? res.champion : c)) ?? l);
      setDraft((d) => (d && d.id === res.champion.id ? { ...d, version: res.champion.version } : d));
      setSave({ kind: "saved", message: label });
      return true;
    } catch (e) { setSave({ kind: "error", message: errorText(e, "저장하지 못했어요. 값을 확인해 주세요.") }); return false; }
  }
  function check(next: Champion) {
    const before = saved.current;
    if (!before || before.id !== next.id) return;
    const textChanged = TEXT_FIELDS.some((k) => (next[k] ?? "") !== (before[k] ?? ""));
    if (!textChanged || behaviour(next) === behaviour(before)) { void persist(next); return; }
    setDecision(true);
    setSave({ kind: "dirty", message: "능력이 달라져요 — 아래에서 골라 주세요" });
  }
  const pending = useRef<Champion | null>(null);
  function flushNow() { if (timer.current && pending.current) { flush(); check(pending.current); } }
  function change(patch: Partial<Champion>, delay = 900) {
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d, ...patch } as Champion;
      flush(); setDecision(false); setSave({ kind: "dirty" }); pending.current = next;
      timer.current = window.setTimeout(() => { timer.current = null; check(next); }, delay);
      return next;
    });
  }

  async function setStatus(status: Champion["status"]) {
    if (!draft) return;
    flushNow();
    try {
      const res = await adminFetch<{ champion?: Champion }>(`/champions/${encodeURIComponent(draft.id)}/status`, { method: "POST", json: { status } }, onUnauthorized);
      const updated = res.champion ?? (await load()).find((c) => c.id === draft.id);
      if (updated) { saved.current = updated; setDraft((d) => d && ({ ...d, status: updated.status, version: updated.version })); setList((l) => l?.map((c) => (c.id === updated.id ? updated : c)) ?? l); }
      setSave({ kind: "saved", message: `${STATUS_KO[status]}로 바꿨어요` });
    } catch (e) { setSave({ kind: "error", message: errorText(e, "상태를 바꾸지 못했어요.") }); }
  }
  async function create() {
    try {
      const res = await adminFetch<{ champion: Champion }>("/champions", { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, json: { name: "새 챔피언", description: "", maxHealth: 20, abilityName: "고유 능력", abilityCost: 1, abilityText: "", abilityEffects: {}, hasQuest: false, imageDisplayMode: "cover", imageScale: 1, imagePositionX: 50, imagePositionY: 50, isCraftable: true, isStarterGrant: false } }, onUnauthorized);
      await load(); select(res.champion);
      setSave({ kind: "saved", message: "새 챔피언을 미공개로 만들었어요. 능력 효과는 '자세히 편집'에서 정해요." });
    } catch (e) { setSave({ kind: "error", message: errorText(e, "챔피언을 만들지 못했어요.") }); }
  }
  async function duplicate() {
    if (!draft) return;
    flushNow();
    try {
      await adminFetch(`/champions/${encodeURIComponent(draft.id)}/duplicate`, { method: "POST" }, onUnauthorized);
      const all = await load();
      const copy = all.filter((c) => c.id !== draft.id && c.name.startsWith(draft.name)).sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")))[0];
      if (copy) select(copy);
      window.setTimeout(() => setSave({ kind: "saved", message: "복제했어요 (미공개)" }), 30);
    } catch (e) { setSave({ kind: "error", message: errorText(e, "복제하지 못했어요.") }); }
  }
  async function remove() {
    if (!draft || !window.confirm(`"${draft.name}" 챔피언을 지울까요?\n되살릴 수 없어요. 잠깐 숨기려면 "미공개"나 "비활성"을 쓰세요.`)) return;
    flush();
    try { await adminFetch(`/champions/${encodeURIComponent(draft.id)}`, { method: "DELETE" }, onUnauthorized); setList((l) => l?.filter((c) => c.id !== draft.id) ?? l); setDraft(null); setSelectedId(null); saved.current = null; mobile.back(); setSave({ kind: "saved", message: "지웠어요" }); }
    catch (e) { setSave({ kind: "error", message: errorText(e, "지우지 못했어요.") }); }
  }
  async function toggleDraft() {
    if (!draft || draftHidden === null) return;
    const excluded = !draftHidden.includes(draft.id);
    try { const b = await adminFetch<{ excludedChampionIds: string[] }>(`/draft/champions/${encodeURIComponent(draft.id)}/selection`, { method: "PATCH", json: { excluded } }, onUnauthorized); setDraftHidden(b.excludedChampionIds); setSave({ kind: "saved", message: excluded ? "드래프트에서 숨겼어요" : "드래프트에 다시 보여요" }); }
    catch (e) { setSave({ kind: "error", message: errorText(e) }); }
  }
  async function upload(file: File) {
    if (!draft) return;
    setUploading(true);
    try { const a = await uploadAdminImage(file, onUnauthorized); flush(); const next = { ...draft, imageAssetId: a.imageAssetId, imageUrl: a.imageUrl, imageUploadToken: a.imageUploadToken } as Champion; setDraft(next); await persist(next, "초상화를 바꿨어요"); }
    catch (e) { setSave({ kind: "error", message: errorText(e, "그림을 올리지 못했어요.") }); }
    finally { setUploading(false); }
  }

  const shown = useMemo(() => (list ?? []).filter((c) => !q.trim() || c.name.includes(q.trim())).sort((a, b) => (a.status === "PUBLISHED" ? 0 : 1) - (b.status === "PUBLISHED" ? 0 : 1) || a.name.localeCompare(b.name, "ko")), [list, q]);
  if (!list) return <p className="text-sm text-neutral-400">불러오는 중…</p>;
  const d = draft;

  return (
    <div className="ak-page">
      <Split editing={mobile.editing}
        list={<ListPane actions={<button type="button" onClick={() => void create()}>+ 새 챔피언</button>} search={q} onSearch={setQ} count={`${list.length}명 · 공개 ${list.filter((c) => c.status === "PUBLISHED").length}명`}>
          {shown.map((c) => <ListRow key={c.id} thumb={c.imageUrl} selected={c.id === selectedId} onClick={() => select(c)} title={c.name} sub={`체력 ${c.maxHealth} · ${c.abilityName}`} badge={STATUS_KO[c.status]} tone={statusTone(c.status)} />)}
        </ListPane>}
        editor={<EditorPane onBack={() => { flushNow(); mobile.back(); }} status={<SaveLine state={save} />}
          right={d && <div style={{ display: "flex", gap: 4 }}>{(["DRAFT", "PUBLISHED", "DISABLED"] as const).map((s) => <Chip key={s} on={d.status === s} onClick={() => void setStatus(s)}>{STATUS_KO[s]}</Chip>)}</div>}
          empty='왼쪽에서 챔피언을 고르거나 "+ 새 챔피언"으로 만들어 보세요. 고친 내용은 바로 저장돼요.'>
          {d && <div className="ak-frame-layout">
            <div className="ak-panel-body">
              {decision && saved.current && (
                <div className="kst-decision">
                  <b>이 글로 바꾸면 챔피언 능력이 달라져요</b>
                  <p className="ak-hint" style={{ margin: 0 }}>이 챔피언은 글(또는 이름)을 읽어서 작동하는 능력이 있어요. 글만 바꾸면 게임에서 능력이 바뀌거나 사라질 수 있어요.</p>
                  <div className="kst-decide">
                    <button type="button" onClick={() => { const back = { ...d }; TEXT_FIELDS.forEach((k) => { (back as Record<string, unknown>)[k] = saved.current![k]; }); setDraft(back); setDecision(false); setSave({ kind: "idle", message: "원래 글로 되돌렸어요" }); }}>원래 글로 되돌리기</button>
                    <button type="button" onClick={() => { setDecision(false); void persist(d, "능력도 새 글대로 바꿨어요"); }}>그래도 바꾸기</button>
                  </div>
                  <p className="kst-note">능력 효과를 직접 고치려면 '자세히 편집'에서 해요.</p>
                </div>
              )}
              <Panel>
                <Grid>
                  <Field label="이름"><input value={d.name} onChange={(e) => change({ name: e.target.value })} /></Field>
                  <Field label="최대 체력"><NumberInput value={d.maxHealth} min={1} max={99} onChange={(maxHealth) => change({ maxHealth }, 500)} /></Field>
                </Grid>
                <Field label="소개 글"><textarea rows={2} value={d.description} onChange={(e) => change({ description: e.target.value })} /></Field>
              </Panel>
              <Panel title="고유 능력">
                <Grid>
                  <Field label="능력 이름"><input value={d.abilityName} onChange={(e) => change({ abilityName: e.target.value })} /></Field>
                  <Field label="비용 (골드)"><NumberInput value={d.abilityCost} min={0} max={20} onChange={(abilityCost) => change({ abilityCost }, 500)} /></Field>
                </Grid>
                {TextBox({ field: "abilityText", label: "능력 글" })}
              </Panel>
              {(d.gameStartAbilityName || d.gameStartAbilityText) && <Panel title="게임 시작 능력">
                <Field label="이름"><input value={d.gameStartAbilityName ?? ""} onChange={(e) => change({ gameStartAbilityName: e.target.value })} /></Field>
                {TextBox({ field: "gameStartAbilityText", label: "글", rows: 2 })}
              </Panel>}
              {d.hasQuest && <Panel title="퀘스트 (피니셔 준비)" hint="조건·보상 효과는 '자세히 편집'에서 정해요.">
                <Field label="퀘스트 이름"><input value={d.questName ?? ""} onChange={(e) => change({ questName: e.target.value })} /></Field>
                {TextBox({ field: "questText", label: "퀘스트 글", rows: 2 })}
                {TextBox({ field: "questRewardText", label: "보상 글", rows: 2 })}
              </Panel>}
              {d.upgradedAbilityName !== null && d.upgradedAbilityName !== undefined && <Panel title="강화된 능력 (퀘스트 완료 후)">
                <Grid>
                  <Field label="이름"><input value={d.upgradedAbilityName ?? ""} onChange={(e) => change({ upgradedAbilityName: e.target.value })} /></Field>
                  <Field label="비용 (골드)"><NumberInput value={d.upgradedAbilityCost ?? d.abilityCost} min={0} max={20} onChange={(upgradedAbilityCost) => change({ upgradedAbilityCost }, 500)} /></Field>
                </Grid>
                {TextBox({ field: "upgradedAbilityText", label: "글", rows: 2 })}
              </Panel>}
              <Panel title="대전 시작 대사 (기본)" hint="특수 대사가 없는 상대를 만나면 이 대사가 나와요.">
                <Grid>
                  <Field label="첫 줄"><input value={d.introLineOne ?? ""} maxLength={80} onChange={(e) => change({ introLineOne: e.target.value })} /></Field>
                  <Field label="둘째 줄"><input value={d.introLineTwo ?? ""} maxLength={80} onChange={(e) => change({ introLineTwo: e.target.value })} /></Field>
                </Grid>
              </Panel>
              <ChampionIntroInteractions key={d.id} champion={{ id: d.id, name: d.name, status: d.status }} champions={list.map((c) => ({ id: c.id, name: c.name, status: c.status }))} onUnauthorized={onUnauthorized} />
              {(() => {
                const lines = (d.presentationLines ?? {}) as ChampionPresentationLines;
                const setLines = (next: ChampionPresentationLines) => change({ presentationLines: next } as Partial<Champion>);
                const phase = d.hasQuest ? linePhase : "BEFORE_QUEST";
                const rivals = list.filter((c) => c.id !== d.id);
                return <>
                  <Panel title="감정표현 · 승패 대사" hint="게임 중 감정표현을 누르거나 이기고 질 때 나오는 말이에요. 빈칸이면 말하지 않아요.">
                    {d.hasQuest && <Tabs<"BEFORE_QUEST" | "AFTER_QUEST"> value={linePhase} onChange={setLinePhase} tabs={[["BEFORE_QUEST", "피니셔 준비 전"], ["AFTER_QUEST", "피니셔 준비 후"]] as const} />}
                    {d.hasQuest && phase === "AFTER_QUEST" && <p className="ak-hint" style={{ margin: 0 }}>‘준비 후’ 칸이 비어 있으면 ‘준비 전’ 대사를 써요.</p>}
                    <Grid>
                      {[...CHAMPION_EMOTES, "VICTORY", "DEFEAT"].map((key) => (
                        <Field key={phase + key} label={key === "VICTORY" ? "이겼을 때" : key === "DEFEAT" ? "졌을 때" : CHAMPION_EMOTE_LABELS[key as (typeof CHAMPION_EMOTES)[number]]}>
                          <input maxLength={120} value={(lines[phase] as Record<string, string> | undefined)?.[key] ?? ""} onChange={(e) => setLines({ ...lines, [phase]: { ...lines[phase], [key]: e.target.value } })} />
                        </Field>
                      ))}
                    </Grid>
                    {d.hasQuest && <Field label="피니셔 준비가 끝나는 순간 대사"><input maxLength={120} value={lines.QUEST_COMPLETE ?? ""} onChange={(e) => setLines({ ...lines, QUEST_COMPLETE: e.target.value })} /></Field>}
                  </Panel>
                  <Panel title="상대별 승리 · 패배 대사" hint="특정 상대에게 이기거나 졌을 때만 다르게 말하게 해요. 빈칸이면 위의 기본 승패 대사를 써요.">
                    <div className="ak-row-actions">
                      <select className="ak-search" style={{ flex: 1, minWidth: 160 }} value={rival} onChange={(e) => setRival(e.target.value)}>
                        <option value="">상대 챔피언 고르기</option>
                        {rivals.map((c) => { const set = lines.MATCHUPS?.[c.id]; const used = set && Object.values(set).some((v) => v && Object.values(v).some(Boolean)); return <option key={c.id} value={c.id}>{c.name}{used ? " ✓" : ""}</option>; })}
                      </select>
                    </div>
                    {rival && (d.hasQuest ? (["BEFORE_QUEST", "AFTER_QUEST"] as const) : (["BEFORE_QUEST"] as const)).map((ph) => (
                      <Grid key={ph}>
                        {(["VICTORY", "DEFEAT"] as const).map((kind) => (
                          <Field key={kind} label={`${d.hasQuest ? (ph === "BEFORE_QUEST" ? "준비 전 · " : "준비 후 · ") : ""}${kind === "VICTORY" ? "이겼을 때" : "졌을 때"}`}>
                            <input maxLength={120} value={lines.MATCHUPS?.[rival]?.[ph]?.[kind] ?? ""} onChange={(e) => setLines({ ...lines, MATCHUPS: { ...lines.MATCHUPS, [rival]: { ...lines.MATCHUPS?.[rival], [ph]: { ...lines.MATCHUPS?.[rival]?.[ph], [kind]: e.target.value } } } })} />
                          </Field>
                        ))}
                      </Grid>
                    ))}
                  </Panel>
                </>;
              })()}
            </div>
            <div className="ak-frame-preview" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {d.imageUrl ? <CardArtwork src={d.imageUrl} alt="" className="aspect-[3/4] w-full rounded-lg" imageDisplayMode={d.imageDisplayMode} imageScale={d.imageScale} imagePositionX={d.imagePositionX} imagePositionY={d.imagePositionY} /> : <div className="ak-empty" style={{ padding: 30, border: "1px dashed #333944", borderRadius: 8 }}>초상화 없음</div>}
              <ImagePick label="초상화 바꾸기" busy={uploading} onFile={(f) => void upload(f)} />
              <Button onClick={() => { flushNow(); onOpenAdvanced(d.id); }}>자세히 편집 (효과·퀘스트·피니셔·음성)</Button>
              <div className="kst-tools">
                <button type="button" onClick={() => { flushNow(); onTestGame(d.id); }}>테스트 게임</button>
                <button type="button" onClick={() => void duplicate()}>복제</button>
                {draftHidden !== null && <button type="button" aria-pressed={draftHidden.includes(d.id)} onClick={() => void toggleDraft()}>{draftHidden.includes(d.id) ? "드래프트에 다시 보이기" : "드래프트에서 숨기기"}</button>}
                <button type="button" className="is-danger" onClick={() => void remove()}>지우기</button>
              </div>
            </div>
          </div>}
        </EditorPane>}
      />
    </div>
  );
}
