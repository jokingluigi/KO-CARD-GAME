import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { SPRITE_EXPRESSIONS } from "@workspace/cosmetics";
import type { BossDialogueLine, BossPhase } from "@/game";
import { createAdminBoss, deleteAdminBoss, fetchAdminBosses, saveAdminBoss, startBoss, storeBossHandoff, type AdminBoss } from "@/lib/boss-client";
import { fetchAdminAIDeckOptions, fetchAdminAIDecks, setAdminAIDeckEnabled, type AIDeck, type AIDeckOptions } from "@/lib/ai-decks-client";
import { fetchDecks, type Deck } from "@/lib/decks-client";
import { BossDialogue } from "./boss-dialogue";
import {
  Button, EditorPane, errorText, Field, Grid, ImagePick, ListPane, ListRow, Notice, NumberInput, Panel, SaveLine, Split, Tabs, Toggle,
  uploadAdminImage, useAutosave, useMobileEditing,
} from "./admin-kit";
import "./admin-boss-manager.css";

const SPEAKER_KO = { BOSS: "보스", PLAYER: "내 챔피언", NARRATOR: "나레이션" } as const;
const EFFECT_KO = { "": "효과 없음", SHAKE: "화면 흔들림", FLASH: "번쩍" } as const;
const newPhase = (index: number): BossPhase => ({ name: `${index + 1}페이즈`, health: 30, portraitUrl: null, addToHand: [], addToDeck: [], clearBoard: false, goldPerTurn: 0, dialogue: [] });
const newLine = (speaker: BossDialogueLine["speaker"] = "BOSS"): BossDialogueLine => ({ speaker, expression: null, text: "", effect: null });

/** 게임 모드 › 보스전 — 보스·페이즈·대화 장면을 만들고 고치면 바로 저장돼요. */
export function AdminBossManager({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [, navigate] = useLocation();
  const [bosses, setBosses] = useState<AdminBoss[] | null>(null);
  const [aiDecks, setAiDecks] = useState<AIDeck[]>([]);
  const [options, setOptions] = useState<AIDeckOptions | null>(null);
  const [myDecks, setMyDecks] = useState<Deck[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AdminBoss | null>(null);
  const [tab, setTab] = useState<"basic" | "phases" | "story">("basic");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ lines: BossDialogueLine[]; banner?: { title: string; subtitle?: string }; portrait?: string | null } | null>(null);
  const [testDeckId, setTestDeckId] = useState("");
  const [testPhase, setTestPhase] = useState(0);
  const [testing, setTesting] = useState(false);
  const mobile = useMobileEditing();

  useEffect(() => {
    void (async () => {
      try {
        const [list, decks, opts, mine] = await Promise.all([fetchAdminBosses(), fetchAdminAIDecks(), fetchAdminAIDeckOptions(), fetchDecks().catch(() => [] as Deck[])]);
        setBosses(list.bosses); setAiDecks(decks.decks); setOptions(opts);
        const valid = mine.filter((d) => d.isValid); setMyDecks(valid); setTestDeckId(valid.find((d) => d.isSelected)?.id ?? valid[0]?.id ?? "");
      } catch (e) { if (/로그인|관리자/.test(errorText(e))) onUnauthorized(); setError(errorText(e, "보스를 불러오지 못했어요.")); setBosses([]); }
    })();
  }, []);

  const autosave = useAutosave(draft?.id ?? null, draft, async (next) => {
    const { id, updatedAt: _u, ...body } = next;
    const result = await saveAdminBoss(id, body);
    setBosses((list) => list?.map((b) => (b.id === id ? result.boss : b)) ?? list);
  });

  function select(boss: AdminBoss) { void autosave.flush(); setSelectedId(boss.id); setDraft(boss); setTestPhase(0); mobile.open(); }
  const set = (patch: Partial<AdminBoss>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  async function create(copyFrom?: AdminBoss) {
    try {
      const firstDeck = aiDecks.find((d) => d.isValid && !d.enabled) ?? aiDecks.find((d) => d.isValid);
      const body: Partial<AdminBoss> = copyFrom
        ? { ...copyFrom, name: `${copyFrom.name} (복사)`, status: "DRAFT" }
        : { name: "새 보스", aiDeckId: firstDeck?.id ?? null, phases: [newPhase(0)], status: "DRAFT" };
      delete (body as { id?: string }).id; delete (body as { updatedAt?: string }).updatedAt;
      if (copyFrom) delete (body as { stageOrder?: number }).stageOrder;
      const result = await createAdminBoss(body);
      setBosses((list) => [...(list ?? []), result.boss]); select(result.boss); setTab("basic");
      if (copyFrom) window.setTimeout(() => autosave.setState({ kind: "saved", message: "복제했어요 (미공개)" }), 50);
    } catch (e) { setError(errorText(e, "보스를 만들지 못했어요.")); }
  }
  async function remove() {
    if (!draft || !window.confirm(`'${draft.name}' 보스를 지울까요? 유저 클리어 기록은 남아요.`)) return;
    try { await deleteAdminBoss(draft.id); setBosses((l) => l?.filter((b) => b.id !== draft.id) ?? l); setDraft(null); setSelectedId(null); mobile.back(); }
    catch (e) { autosave.setState({ kind: "error", message: errorText(e, "지우지 못했어요.") }); }
  }
  async function upload(file: File, apply: (url: string) => void, key: string) {
    setUploading(key);
    try { const asset = await uploadAdminImage(file, onUnauthorized); apply(asset.imageUrl); }
    catch (e) { autosave.setState({ kind: "error", message: errorText(e, "그림을 올리지 못했어요.") }); }
    finally { setUploading(null); }
  }
  async function test() {
    if (!draft || !testDeckId) return;
    await autosave.flush();
    setTesting(true);
    try { const handoff = await startBoss(draft.id, testDeckId, testPhase); storeBossHandoff(handoff); navigate(`/ai-match?boss=${encodeURIComponent(handoff.matchId)}`); }
    catch (e) { autosave.setState({ kind: "error", message: errorText(e, "테스트를 시작하지 못했어요.") }); setTesting(false); }
  }
  async function makeBossOnly(deck: AIDeck) {
    try { const r = await setAdminAIDeckEnabled(deck.id, false); setAiDecks((l) => l.map((d) => (d.id === deck.id ? r.deck : d))); autosave.setState({ kind: "saved", message: "일반 AI 대전에서 뺐어요" }); }
    catch (e) { autosave.setState({ kind: "error", message: errorText(e, "바꾸지 못했어요.") }); }
  }

  const cards = useMemo(() => (options?.cards ?? []).filter((c) => c.status !== "DISABLED").sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name, "ko")), [options]);
  const cardName = (id: string) => cards.find((c) => c.id === id)?.name ?? "없는 카드";

  if (!bosses) return <p className="text-sm text-neutral-400">불러오는 중…</p>;
  const deck = aiDecks.find((d) => d.id === draft?.aiDeckId);
  const phases = draft?.phases?.length ? draft.phases : [newPhase(0)];
  const setPhase = (index: number, patch: Partial<BossPhase>) => set({ phases: phases.map((p, i) => (i === index ? { ...p, ...patch } : p)) });
  const movePhase = (index: number, dir: -1 | 1) => { const to = index + dir; if (to < 0 || to >= phases.length) return; const next = [...phases]; [next[index], next[to]] = [next[to]!, next[index]!]; set({ phases: next }); };
  const bossImage = draft?.imageUrl ?? deck?.champion?.imageUrl ?? null;

  return (
    <div className="ak-page">
      {error && <Notice tone="error">{error}</Notice>}
      <Split editing={mobile.editing}
        list={<ListPane actions={<button type="button" onClick={() => void create()}>+ 새 보스</button>} count={`${bosses.length}명 · 공개 ${bosses.filter((b) => b.status === "PUBLISHED").length}명`}>
          {bosses.map((b, i) => <ListRow key={b.id} thumb={b.imageUrl} selected={b.id === selectedId} onClick={() => select(b)} title={`${i + 1}. ${b.name}`} sub={`스테이지 ${b.stageOrder} · ${b.phases.length}페이즈 · 첫 클리어 ${b.firstClearReward}`} badge={b.status === "PUBLISHED" ? "공개" : "미공개"} tone={b.status === "PUBLISHED" ? "on" : "off"} />)}
          {!bosses.length && <p className="ak-hint" style={{ margin: 8 }}>아직 보스가 없어요. ‘+ 새 보스’를 눌러 만들어 보세요.</p>}
        </ListPane>}
        editor={<EditorPane onBack={() => { void autosave.flush(); mobile.back(); }} status={<SaveLine state={autosave.state} />}
          empty={<p className="ak-hint">왼쪽에서 보스를 고르거나 새로 만드세요.</p>}
          right={draft && <><Button onClick={() => void create(draft)}>복제</Button><Button kind="danger" onClick={() => void remove()}>지우기</Button></>}>
          {draft && <>
            <Panel>
              <Toggle checked={draft.status === "PUBLISHED"} onChange={(v) => set({ status: v ? "PUBLISHED" : "DRAFT" })} label={draft.status === "PUBLISHED" ? "공개 중 (유저 보스전 목록에 나와요)" : "미공개 (관리자만 테스트할 수 있어요)"} />
              {!deck && <Notice tone="warn">보스 덱을 아직 안 골랐어요. ‘기본’ 탭에서 골라 주세요.</Notice>}
              {deck && !deck.isValid && <Notice tone="warn">보스 덱이 아직 완성되지 않았어요: {deck.invalidReasons.join(" ")}</Notice>}
              <div className="kbm-test">
                <b>테스트 대전</b>
                <select value={testDeckId} onChange={(e) => setTestDeckId(e.target.value)} aria-label="내 덱">
                  {myDecks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  {!myDecks.length && <option value="">완성된 내 덱이 없어요</option>}
                </select>
                <select value={testPhase} onChange={(e) => setTestPhase(Number(e.target.value))} aria-label="시작 페이즈">
                  {phases.map((p, i) => <option key={i} value={i}>{i === 0 ? "처음부터" : `${p.name}부터`}</option>)}
                </select>
                <Button kind="primary" disabled={!testDeckId || !deck || testing} onClick={() => void test()}>{testing ? "준비 중…" : "시작"}</Button>
              </div>
              <p className="ak-hint">미공개 보스나 중간 페이즈부터 하는 테스트는 클리어 보상이 없어요.</p>
            </Panel>

            <Tabs<"basic" | "phases" | "story"> value={tab} onChange={setTab} tabs={[["basic", "기본"], ["phases", `페이즈 ${phases.length}개`], ["story", "시작 · 클리어 대사"]] as const} />

            {tab === "basic" && <Panel title="보스 기본 정보">
              <div className="kbm-portrait">
                <span className="kbm-portrait__img" style={bossImage ? { backgroundImage: `url(${bossImage})` } : undefined} />
                <div>
                  <ImagePick label={draft.imageUrl ? "보스 그림 바꾸기" : "보스 그림 올리기"} busy={uploading === "boss"} onFile={(f) => void upload(f, (url) => set({ imageUrl: url }), "boss")} />
                  {draft.imageUrl && <Button kind="ghost" onClick={() => set({ imageUrl: null })}>그림 빼기 (챔피언 그림 사용)</Button>}
                  <p className="ak-hint">비워 두면 보스 덱 챔피언 그림을 써요.</p>
                </div>
              </div>
              <Grid>
                <Field label="보스 이름"><input value={draft.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} /></Field>
                <Field label="칭호 (선택)" hint="예: 어둠의 군주"><input value={draft.subtitle} maxLength={80} onChange={(e) => set({ subtitle: e.target.value })} /></Field>
              </Grid>
              <Field label="설명 (선택)"><textarea rows={3} value={draft.description} maxLength={500} onChange={(e) => set({ description: e.target.value })} /></Field>
              <Grid cols={3}>
                <Field label="스테이지 순서" hint="작을수록 먼저 · 앞 보스를 깨야 열려요"><NumberInput value={draft.stageOrder} min={1} max={999} onChange={(stageOrder) => set({ stageOrder })} /></Field>
                <Field label="첫 클리어 보상"><NumberInput value={draft.firstClearReward} min={0} max={100000} step={50} suffix="크레딧" onChange={(firstClearReward) => set({ firstClearReward })} /></Field>
                <Field label="내 체력 보너스" hint="도전자 시작 체력 +"><NumberInput value={draft.playerHealthBonus} min={0} max={100} onChange={(playerHealthBonus) => set({ playerHealthBonus })} /></Field>
              </Grid>
              <Field label="보스 덱" hint="AI 대전 화면에서 만든 덱 중에서 골라요. 보스 체력은 ‘페이즈’에서 정해요.">
                <select value={draft.aiDeckId ?? ""} onChange={(e) => set({ aiDeckId: e.target.value || null })}>
                  <option value="">고르기</option>
                  {aiDecks.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.champion?.name ?? "챔피언 없음"}{d.enabled ? " (일반 AI 대전에도 나옴)" : " (보스 전용)"}{d.isValid ? "" : " · 미완성"}</option>)}
                </select>
              </Field>
              {deck?.enabled && <Notice tone="warn">이 덱은 일반 AI 대전에도 나와요. <button type="button" className="kbm-inline" onClick={() => void makeBossOnly(deck)}>보스 전용으로 바꾸기 (일반 대전에서 빼기)</button></Notice>}
              <Button onClick={() => navigate("/admin/ai-decks")}>AI 덱 고치러 가기 ›</Button>
            </Panel>}

            {tab === "phases" && <>
              <Notice>보스 체력이 0이 되면 경기가 끝나지 않고 다음 페이즈로 넘어가요. 마지막 페이즈에서 쓰러뜨리면 클리어예요.</Notice>
              {phases.map((phase, index) => (
                <Panel key={index} title={<span className="kbm-phase-title"><em>{index + 1}</em>{phase.name || `${index + 1}페이즈`}{index === 0 && <small>시작 상태</small>}</span>}
                  right={<span className="kbm-row-btns">
                    <button type="button" disabled={index === 0} onClick={() => movePhase(index, -1)} aria-label="위로">▲</button>
                    <button type="button" disabled={index === phases.length - 1} onClick={() => movePhase(index, 1)} aria-label="아래로">▼</button>
                    <button type="button" disabled={phases.length === 1} onClick={() => { if (window.confirm(`'${phase.name}'을 지울까요?`)) set({ phases: phases.filter((_, i) => i !== index) }); }} aria-label="지우기">✕</button>
                  </span>}>
                  <Grid cols={3}>
                    <Field label="페이즈 이름" hint="전환 때 크게 나와요"><input value={phase.name} maxLength={40} onChange={(e) => setPhase(index, { name: e.target.value })} /></Field>
                    <Field label="보스 체력"><NumberInput value={phase.health} min={1} max={999} onChange={(health) => setPhase(index, { health })} /></Field>
                    <Field label="보스 턴마다 추가 골드"><NumberInput value={phase.goldPerTurn ?? 0} min={0} max={10} onChange={(goldPerTurn) => setPhase(index, { goldPerTurn })} /></Field>
                  </Grid>
                  {index > 0 && <Toggle checked={Boolean(phase.clearBoard)} onChange={(clearBoard) => setPhase(index, { clearBoard })} label="이 페이즈 시작 때 보스 필드 비우기" />}
                  <div className="kbm-portrait kbm-portrait--small">
                    <span className="kbm-portrait__img" style={(phase.portraitUrl || bossImage) ? { backgroundImage: `url(${phase.portraitUrl || bossImage})` } : undefined} />
                    <div>
                      <ImagePick label={phase.portraitUrl ? "이 페이즈 그림 바꾸기" : "이 페이즈 전용 그림 (선택)"} busy={uploading === `p${index}`} onFile={(f) => void upload(f, (url) => setPhase(index, { portraitUrl: url }), `p${index}`)} />
                      {phase.portraitUrl && <Button kind="ghost" onClick={() => setPhase(index, { portraitUrl: null })}>빼기</Button>}
                      <p className="ak-hint">대화 장면에서 보스 그림으로 써요.</p>
                    </div>
                  </div>
                  <CardPicker label="시작할 때 보스 손패에 넣을 카드" ids={phase.addToHand ?? []} cards={cards} cardName={cardName} onChange={(addToHand) => setPhase(index, { addToHand })} />
                  <CardPicker label="시작할 때 보스 덱 맨 위에 넣을 카드" ids={phase.addToDeck ?? []} cards={cards} cardName={cardName} onChange={(addToDeck) => setPhase(index, { addToDeck })} />
                  <DialogueEditor title={index === 0 ? "1페이즈 대사 (안 써도 돼요 · 시작 대사는 ‘시작 · 클리어 대사’ 탭)" : "페이즈 전환 대사"} lines={phase.dialogue ?? []} onChange={(dialogue) => setPhase(index, { dialogue })}
                    onPreview={() => setPreview({ lines: phase.dialogue ?? [], banner: index > 0 ? { title: phase.name, subtitle: "보스가 다시 일어섰다!" } : undefined, portrait: phase.portraitUrl || bossImage })} />
                </Panel>
              ))}
              <Button kind="primary" disabled={phases.length >= 6} onClick={() => set({ phases: [...phases, newPhase(phases.length)] })}>+ 페이즈 추가 (최대 6개)</Button>
            </>}

            {tab === "story" && <>
              <Panel title="시작 대사" hint="경기 시작 화면이 끝나면 나와요.">
                <DialogueEditor lines={draft.introDialogue ?? []} onChange={(introDialogue) => set({ introDialogue })} onPreview={() => setPreview({ lines: draft.introDialogue ?? [], banner: { title: draft.name, subtitle: draft.subtitle || "보스전" }, portrait: bossImage })} />
              </Panel>
              <Panel title="클리어 대사" hint="보스를 마지막으로 쓰러뜨리면 결과 화면 전에 나와요.">
                <DialogueEditor lines={draft.clearDialogue ?? []} onChange={(clearDialogue) => set({ clearDialogue })} onPreview={() => setPreview({ lines: draft.clearDialogue ?? [], banner: { title: "보스 격파!", subtitle: draft.name }, portrait: phases[phases.length - 1]?.portraitUrl || bossImage })} />
              </Panel>
            </>}
          </>}
        </EditorPane>}
      />
      {preview && <BossDialogue lines={preview.lines} banner={preview.banner}
        player={{ name: "내 챔피언", image: () => null }}
        boss={{ name: draft?.name ?? "보스", image: () => preview.portrait ?? null }}
        onDone={() => setPreview(null)} />}
    </div>
  );
}

function CardPicker({ label, ids, cards, cardName, onChange }: { label: string; ids: string[]; cards: AIDeckOptions["cards"]; cardName: (id: string) => string; onChange: (ids: string[]) => void }) {
  const [q, setQ] = useState("");
  const found = q.trim() ? cards.filter((c) => c.name.includes(q.trim())).slice(0, 8) : [];
  return (
    <Field label={label} hint="최대 10장 · 토큰 카드도 넣을 수 있어요">
      <div className="kbm-cards">
        {ids.map((id, i) => <button key={`${id}-${i}`} type="button" className="kbm-chip" onClick={() => onChange(ids.filter((_, j) => j !== i))} title="눌러서 빼기">{cardName(id)} ✕</button>)}
        {!ids.length && <span className="ak-hint">없음</span>}
      </div>
      {ids.length < 10 && <div className="kbm-find">
        <input placeholder="카드 이름으로 찾아서 넣기" value={q} onChange={(e) => setQ(e.target.value)} />
        {found.length > 0 && <div className="kbm-find__list">{found.map((c) => <button key={c.id} type="button" onClick={() => { onChange([...ids, c.id]); setQ(""); }}><em>{c.cost}</em>{c.name}{c.isToken ? " · 토큰" : ""}</button>)}</div>}
      </div>}
    </Field>
  );
}

function DialogueEditor({ title, lines, onChange, onPreview }: { title?: string; lines: BossDialogueLine[]; onChange: (lines: BossDialogueLine[]) => void; onPreview: () => void }) {
  const setLine = (i: number, patch: Partial<BossDialogueLine>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const move = (i: number, dir: -1 | 1) => { const to = i + dir; if (to < 0 || to >= lines.length) return; const next = [...lines]; [next[i], next[to]] = [next[to]!, next[i]!]; onChange(next); };
  return (
    <div className="kbm-dialogue">
      {title && <h4>{title}</h4>}
      {lines.map((line, i) => (
        <div key={i} className={`kbm-line is-${line.speaker.toLowerCase()}`}>
          <div className="kbm-line__top">
            <select value={line.speaker} onChange={(e) => setLine(i, { speaker: e.target.value as BossDialogueLine["speaker"] })} aria-label="누가 말해요">
              {Object.entries(SPEAKER_KO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {line.speaker !== "NARRATOR" && <select value={line.expression ?? ""} onChange={(e) => setLine(i, { expression: e.target.value || null })} aria-label="표정">
              <option value="">표정: 기본</option>
              {Object.entries(SPRITE_EXPRESSIONS).filter(([k]) => k !== "default").map(([k, v]) => <option key={k} value={k}>표정: {v}</option>)}
            </select>}
            <select value={line.effect ?? ""} onChange={(e) => setLine(i, { effect: (e.target.value || null) as BossDialogueLine["effect"] })} aria-label="효과">
              {Object.entries(EFFECT_KO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <span className="kbm-row-btns">
              <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label="위로">▲</button>
              <button type="button" disabled={i === lines.length - 1} onClick={() => move(i, 1)} aria-label="아래로">▼</button>
              <button type="button" onClick={() => onChange(lines.filter((_, j) => j !== i))} aria-label="지우기">✕</button>
            </span>
          </div>
          <textarea rows={2} maxLength={300} placeholder="대사를 적어 주세요" value={line.text} onChange={(e) => setLine(i, { text: e.target.value })} />
        </div>
      ))}
      <div className="kbm-dialogue__actions">
        <Button onClick={() => onChange([...lines, newLine(lines.at(-1)?.speaker === "BOSS" ? "PLAYER" : "BOSS")])}>+ 대사 추가</Button>
        <Button kind="ghost" onClick={onPreview}>▶ 미리 보기</Button>
      </div>
      <p className="ak-hint">표정은 ‘대전 스프라이트’에 그 표정 그림이 있을 때만 바뀌어요. 없으면 기본 그림이 나와요.</p>
    </div>
  );
}
