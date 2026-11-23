import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CardRenderer } from "./card-renderer";
import { cardRecordToDefinition, type PublishedCardRecord } from "../game/cards/published-cards";
import { sameCardEffects, summarizeCardEffects } from "../lib/card-effect-summary";
import { useTagLabels } from "../lib/tag-labels";
import "./admin-card-studio.css";

/**
 * 카드 빠른 편집 — one screen to make and tidy cards. Every change saves by itself a moment after
 * you stop typing. A text change that would change what the card does in a match is held back
 * until the administrator picks "효과도 바꾸기" or "글만 바꾸기 (효과 그대로)"; the latter keeps
 * the old wording as the card's effect source (effectConfig.effectText).
 */

const base = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/admin`;
type Status = "DRAFT" | "PUBLISHED" | "DISABLED";
type CardRow = PublishedCardRecord & {
  status: Status; version: number; updatedAt: string; tags?: string[];
  imageAssetId: string | null; imageUrl: string | null; [key: string]: unknown;
};
type SaveState = { kind: "idle" | "saving" | "saved" | "error" | "check"; message?: string };

const QUICK_KEYWORDS: Array<[string, string]> = [
  ["TAUNT", "도발"], ["RUSH", "러쉬"], ["SURPRISE", "기습"], ["DODGE", "회피"], ["DEFENSE", "방어"],
  ["LIFESTEAL", "흡혈"], ["REGEN", "치유"], ["IMMUNE", "면역"], ["MULTI_STRIKE", "연타"],
  ["ARMOR", "아머"], ["WANTED", "수배"], ["CANNOT_ATTACK", "공격불가"],
];
const ADVANCED_KEYWORDS = new Set(["PROGRAM", "CONDITION", "COUNTDOWN", "FUSION"]);
const RARITIES: Array<[string, string]> = [["NORMAL", "일반"], ["EPIC", "에픽"], ["LEGENDARY", "레전더리"]];
const SNIPPETS = ["등장:", "퇴장:", "턴 종료:", "턴 시작:", "업그레이드:", "콤보:", "데미지", "묘지", "+1/+1"];
const STATUS_LABEL: Record<Status, string> = { PUBLISHED: "공개", DRAFT: "미공개", DISABLED: "비활성" };

function rieul(ch: string) { const o = ch.charCodeAt(0) - 0xac00; return o >= 0 && o < 11172 && o % 28 === 8; }
/** House style (2026-11-20 tidy-up): 데미지, 묘지, 깎다, "~할 때", "등장:효과". */
export function tidyCardText(text: string): { text: string; fixes: string[] } {
  let s = text; const fixes: string[] = [];
  const sub = (re: RegExp, to: string, label: string) => { const n = s.replace(re, to); if (n !== s) { fixes.push(label); s = n; } };
  sub(/(^|\n)(\s*)(등장|퇴장|턴 종료|턴 시작|콤보|업그레이드|액티브|합체|공격 시)\s*:\s+/g, "$1$2$3:", "\"등장: \" → \"등장:\"");
  sub(/피해/g, "데미지", "피해 → 데미지");
  sub(/무덤/g, "묘지", "무덤 → 묘지");
  sub(/깍/g, "깎", "깍 → 깎");
  sub(/(['’])태그/g, "$1 태그", "태그 앞 띄어쓰기");
  const spaced = [...s].map((ch, i, all) => (all[i + 1] === "때" && rieul(ch) ? `${ch} ` : ch)).join("");
  if (spaced !== s) { fixes.push("\"~할때\" → \"~할 때\""); s = spaced; }
  sub(/[ \t]{2,}/g, " ", "공백 두 칸");
  sub(/[ \t]+(\n|$)/g, "$1", "줄 끝 공백");
  return { text: s, fixes };
}

function definitionOf(card: CardRow) {
  try { return cardRecordToDefinition(card); } catch { return null; }
}

export function AdminCardStudio({ onUnauthorized, onOpenAdvanced }: { onUnauthorized: () => void; onOpenAdvanced?: (id: string) => void }) {
  const [cards, setCards] = useState<CardRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CardRow | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "WRESTLER" | "TECHNIQUE">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | Status>("ALL");
  const [decision, setDecision] = useState<{ before: string[]; after: string[]; text: string } | null>(null);
  const [mobileEditing, setMobileEditing] = useState(false);
  const tagLabels = useTagLabels();
  const timer = useRef<number | null>(null);
  const saved = useRef<CardRow | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    const response = await fetch(`${base}/cards`, { credentials: "include" });
    if (response.status === 401) { onUnauthorized(); return; }
    if (!response.ok) { setSave({ kind: "error", message: "카드 목록을 불러오지 못했어요." }); return; }
    const list = ((await response.json()) as { cards: CardRow[] }).cards;
    setCards(list);
    return list;
  }, [onUnauthorized]);
  useEffect(() => { void load(); }, [load]);

  const select = (card: CardRow) => {
    flush();
    setSelectedId(card.id); setDraft(card); saved.current = card; setDecision(null);
    setSave({ kind: "idle" }); setMobileEditing(true);
  };

  /** Sends the whole card, exactly as the full editor does; the server replaces it and bumps its version. */
  const persist = useCallback(async (next: CardRow, label = "저장됨") => {
    setSave({ kind: "saving" });
    const { status: _s, version: _v, updatedAt: _u, createdAt: _c, ...body } = next as CardRow & { createdAt?: string };
    const response = await fetch(`${base}/cards/${encodeURIComponent(next.id)}`, {
      method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (response.status === 401) { onUnauthorized(); return false; }
    if (!response.ok) {
      const message = await response.json().then((b: { message?: string }) => b.message).catch(() => undefined);
      setSave({ kind: "error", message: message ?? "저장하지 못했어요. 값을 확인해 주세요." });
      return false;
    }
    const card = ((await response.json()) as { card: CardRow }).card;
    saved.current = card;
    setCards((list) => list?.map((c) => (c.id === card.id ? card : c)) ?? list);
    setDraft((d) => (d && d.id === card.id ? { ...card, ...pendingChanges(d, next) } : d));
    setSave({ kind: "saved", message: label });
    return true;
  }, [onUnauthorized]);

  /** Fields typed while a save was in flight stay in the draft. */
  function pendingChanges(current: CardRow, sent: CardRow) {
    const out: Partial<CardRow> = {};
    for (const key of Object.keys(current)) if (JSON.stringify(current[key]) !== JSON.stringify(sent[key])) (out as Record<string, unknown>)[key] = current[key];
    return out;
  }

  const check = useCallback((next: CardRow) => {
    const before = saved.current;
    if (!before || before.id !== next.id) return;
    if (next.text === before.text) { void persist(next); return; }
    // Text changed: does it change what the card does?
    const { effectText: _keep, ...configWithoutSource } = (next.effectConfig ?? {}) as Record<string, unknown>;
    const followText = { ...next, effectConfig: configWithoutSource } as CardRow;
    const current = definitionOf(before), proposed = definitionOf(followText);
    if (current && proposed && sameCardEffects(current, proposed)) { void persist(followText); return; }
    setDecision({ before: current ? summarizeCardEffects(current) : [], after: proposed ? summarizeCardEffects(proposed) : ["효과를 읽지 못했어요"], text: next.text });
    setSave({ kind: "check", message: "효과가 달라져요 — 아래에서 골라 주세요" });
  }, [persist]);

  function flush() { if (timer.current) { window.clearTimeout(timer.current); timer.current = null; } }
  function change(patch: Partial<CardRow>, delay = 800) {
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d, ...patch } as CardRow;
      flush(); setDecision(null); setSave({ kind: "idle", message: "입력 중…" });
      timer.current = window.setTimeout(() => { timer.current = null; check(next); }, delay);
      return next;
    });
  }

  async function decide(mode: "follow" | "keep") {
    if (!draft || !saved.current) return;
    const config = { ...(draft.effectConfig ?? {}) } as Record<string, unknown>;
    if (mode === "follow") delete config.effectText;
    else config.effectText = typeof config.effectText === "string" && config.effectText ? config.effectText : saved.current.text;
    const ok = await persist({ ...draft, effectConfig: config } as CardRow, mode === "keep" ? "글만 바꿨어요 (효과 그대로)" : "효과도 새 글대로 바꿨어요");
    if (ok) setDecision(null);
  }

  async function setStatus(status: Status) {
    if (!draft) return;
    setSave({ kind: "saving" });
    const response = await fetch(`${base}/cards/${encodeURIComponent(draft.id)}/status`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    });
    if (response.status === 401) { onUnauthorized(); return; }
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { message?: string; referenceErrors?: string[] };
      setSave({ kind: "error", message: [body.message ?? "상태를 바꾸지 못했어요.", ...(body.referenceErrors ?? [])].join(" ") });
      return;
    }
    const card = ((await response.json()) as { card?: CardRow }).card ?? { ...draft, status };
    saved.current = { ...saved.current!, status: card.status, version: card.version };
    setDraft((d) => (d ? { ...d, status: card.status, version: card.version } : d));
    setCards((list) => list?.map((c) => (c.id === card.id ? { ...c, status: card.status, version: card.version } : c)) ?? list);
    setSave({ kind: "saved", message: `${STATUS_LABEL[card.status]}로 바꿨어요` });
  }

  async function createCard(cardType: "WRESTLER" | "TECHNIQUE") {
    flush();
    const response = await fetch(`${base}/cards`, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: cardType === "WRESTLER" ? "새 선수" : "새 기술", cardType, rarity: "NORMAL", cost: 1, attack: cardType === "WRESTLER" ? 1 : 0, health: cardType === "WRESTLER" ? 1 : 0, text: "", lore: "", keywords: [], tags: [], isToken: false, isChampionToken: false, effectId: null, effectConfig: {}, imageAssetId: null, imageUrl: null, entranceAudioAssetId: null, entranceAudioUrl: null, entranceAudioVolume: 100, entranceAudioEnabled: false }),
    });
    if (response.status === 401) { onUnauthorized(); return; }
    if (!response.ok) { setSave({ kind: "error", message: "새 카드를 만들지 못했어요." }); return; }
    const card = ((await response.json()) as { card: CardRow }).card;
    setCards((list) => [card, ...(list ?? [])]);
    select(card);
    setSave({ kind: "saved", message: "새 카드를 미공개로 만들었어요. 이름부터 바꿔 주세요." });
  }

  async function uploadImage(file: File) {
    if (!draft) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setSave({ kind: "error", message: "PNG, JPG, WEBP 그림만 올릴 수 있어요." }); return; }
    setSave({ kind: "saving", message: "그림 올리는 중…" });
    try {
      const ask = await fetch(`${base}/cards/images/upload-url`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }) });
      if (ask.status === 401) { onUnauthorized(); return; }
      if (!ask.ok) throw new Error();
      const upload = (await ask.json()) as { uploadURL: string; objectPath: string };
      const put = await fetch(upload.uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error();
      const done = await fetch(`${base}/cards/images/complete`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ objectPath: upload.objectPath, contentType: file.type }) });
      if (!done.ok) throw new Error();
      const asset = (await done.json()) as { imageAssetId: string; imageUrl: string; imageUploadToken: string };
      flush();
      const next = { ...draft, imageAssetId: asset.imageAssetId, imageUrl: asset.imageUrl, imageUploadToken: asset.imageUploadToken } as CardRow;
      setDraft(next);
      await persist(next, "그림을 바꿨어요");
    } catch { setSave({ kind: "error", message: "그림을 올리지 못했어요." }); }
  }

  const names = useMemo(() => new Set((cards ?? []).map((c) => c.name)), [cards]);
  const filtered = useMemo(() => (cards ?? [])
    .filter((c) => (typeFilter === "ALL" || c.cardType === typeFilter) && (statusFilter === "ALL" || c.status === statusFilter))
    .filter((c) => !query.trim() || c.name.includes(query.trim()) || (c.text ?? "").includes(query.trim()))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))), [cards, query, typeFilter, statusFilter]);

  const tidy = draft ? tidyCardText(draft.text ?? "") : null;
  const unknownRefs = draft
    ? [...(draft.text ?? "").matchAll(/['‘]([^'’\n]{2,24})['’]/g)].map((m) => m[1]!.trim())
      .filter((x) => !names.has(x) && !Object.values(tagLabels).includes(x) && !Object.keys(tagLabels).includes(x) && !QUICK_KEYWORDS.some(([, l]) => l === x) && !/^(어둠|파괴|지식)의 사자$|^무적$|^회피\(\d+\)$|^아머\(\d+\)$/.test(x))
    : [];
  const effectSource = draft && typeof (draft.effectConfig as Record<string, unknown> | undefined)?.effectText === "string" ? String((draft.effectConfig as Record<string, unknown>).effectText) : null;

  function insert(snippet: string) {
    const area = textRef.current; if (!draft) return;
    const text = draft.text ?? "";
    const at = area ? area.selectionStart ?? text.length : text.length;
    const next = text.slice(0, at) + snippet + text.slice(area?.selectionEnd ?? at);
    change({ text: next });
    window.requestAnimationFrame(() => { area?.focus(); area?.setSelectionRange(at + snippet.length, at + snippet.length); });
  }

  if (!cards) return <p className="text-sm text-neutral-400">카드를 불러오는 중…</p>;

  return (
    <div className="kst" data-mobile-editing={mobileEditing || undefined}>
      <aside className="kst-list">
        <div className="kst-new">
          <button type="button" onClick={() => void createCard("WRESTLER")}>+ 새 선수</button>
          <button type="button" onClick={() => void createCard("TECHNIQUE")}>+ 새 기술</button>
        </div>
        <input className="kst-search" placeholder="이름이나 효과 글로 찾기" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="kst-filters">
          {(["ALL", "WRESTLER", "TECHNIQUE"] as const).map((t) => <button key={t} type="button" aria-pressed={typeFilter === t} onClick={() => setTypeFilter(t)}>{t === "ALL" ? "전체" : t === "WRESTLER" ? "선수" : "기술"}</button>)}
          <span />
          {(["ALL", "PUBLISHED", "DRAFT"] as const).map((t) => <button key={t} type="button" aria-pressed={statusFilter === t} onClick={() => setStatusFilter(t)}>{t === "ALL" ? "모든 상태" : STATUS_LABEL[t]}</button>)}
        </div>
        <ul>
          {filtered.map((c) => (
            <li key={c.id}>
              <button type="button" aria-current={c.id === selectedId || undefined} onClick={() => select(c)}>
                <span className="kst-thumb" style={c.imageUrl ? { backgroundImage: `url(${c.imageUrl})` } : undefined} />
                <span className="kst-row-main"><b>{c.name}</b><small>{c.cardType === "WRESTLER" ? `${c.cost} · ${c.attack}/${c.health}` : `기술 · ${c.cost}`}{c.isToken ? " · 토큰" : ""}</small></span>
                <span className="kst-status" data-status={c.status}>{STATUS_LABEL[c.status]}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="kst-edit">
        {!draft ? <div className="kst-empty">왼쪽에서 카드를 고르거나 "+ 새 선수"로 만들어 보세요. 고친 내용은 손을 멈추면 바로 저장돼요.</div> : <>
          <header className="kst-head">
            <button type="button" className="kst-back" onClick={() => { flush(); if (draft) check(draft); setMobileEditing(false); }}>← 목록</button>
            <div className="kst-save" data-kind={save.kind}>{save.kind === "saving" ? (save.message ?? "저장 중…") : save.kind === "saved" ? `✓ ${save.message ?? "저장됨"}` : save.kind === "error" ? `⚠ ${save.message}` : save.kind === "check" ? `● ${save.message}` : (save.message ?? "고치면 바로 저장돼요")}</div>
            <div className="kst-status-switch">
              {(["DRAFT", "PUBLISHED"] as const).map((s) => <button key={s} type="button" aria-pressed={draft.status === s} onClick={() => void setStatus(s)}>{STATUS_LABEL[s]}</button>)}
            </div>
          </header>

          <div className="kst-body">
            <div className="kst-preview">
              <CardRenderer name={draft.name || "카드 이름"} cardType={draft.cardType} cost={draft.cost} attack={draft.attack} health={draft.health}
                rulesText={draft.text || "효과 없음"} imageUrl={draft.imageUrl} rarity={draft.rarity as never} size="detail" className="w-full" imageDisplaySettings={draft as never} />
              <label className="kst-image">그림 바꾸기<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadImage(f); e.target.value = ""; }} /></label>
              {onOpenAdvanced && <button type="button" className="kst-advanced" onClick={() => onOpenAdvanced(draft.id)}>자세히 편집 (대사·음악·특수 효과)</button>}
            </div>

            <div className="kst-fields">
              <label className="kst-field"><span>이름</span><input value={draft.name} onChange={(e) => change({ name: e.target.value })} /></label>
              <div className="kst-row">
                <label className="kst-field"><span>종류</span><select value={draft.cardType} onChange={(e) => change({ cardType: e.target.value as CardRow["cardType"] }, 0)}><option value="WRESTLER">선수</option><option value="TECHNIQUE">기술</option></select></label>
                <label className="kst-field"><span>등급</span><select value={String(draft.rarity ?? "NORMAL")} onChange={(e) => change({ rarity: e.target.value as never }, 0)}>{RARITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              </div>
              <div className="kst-row kst-stats">
                {(draft.cardType === "WRESTLER" ? (["cost", "attack", "health"] as const) : (["cost"] as const)).map((key) => (
                  <div key={key} className="kst-stepper">
                    <span>{key === "cost" ? "비용" : key === "attack" ? "공격력" : "체력"}</span>
                    <div>
                      <button type="button" onClick={() => change({ [key]: Math.max(0, Number(draft[key]) - 1) } as Partial<CardRow>, 500)}>−</button>
                      <input inputMode="numeric" value={String(draft[key])} onChange={(e) => change({ [key]: Math.max(0, Math.min(999, Number(e.target.value.replace(/\D/g, "")) || 0)) } as Partial<CardRow>)} />
                      <button type="button" onClick={() => change({ [key]: Math.min(999, Number(draft[key]) + 1) } as Partial<CardRow>, 500)}>+</button>
                    </div>
                  </div>
                ))}
              </div>

              <label className="kst-field"><span>효과 글</span>
                <textarea ref={textRef} rows={5} value={draft.text ?? ""} onChange={(e) => change({ text: e.target.value }, 1100)} placeholder="예) 등장:상대 선수 하나에게 2 데미지를 줍니다." />
              </label>
              <div className="kst-snippets">{SNIPPETS.map((s) => <button key={s} type="button" onClick={() => insert(s)}>{s}</button>)}</div>
              {tidy && tidy.fixes.length > 0 && <div className="kst-hint"><span>맞춤법·용어: {tidy.fixes.join(", ")}</span><button type="button" onClick={() => change({ text: tidy.text }, 300)}>한 번에 고치기</button></div>}
              {unknownRefs.length > 0 && <div className="kst-hint" data-tone="warn"><span>이런 이름의 카드나 태그가 없어요: {unknownRefs.map((r) => `'${r}'`).join(", ")}</span></div>}
              {effectSource && <div className="kst-hint" data-tone="info"><span>이 카드는 글만 바꾼 상태예요. 효과는 예전 글 기준으로 작동해요.</span><button type="button" onClick={() => { const { effectText: _e, ...rest } = draft.effectConfig as Record<string, unknown>; const followed = { ...draft, effectConfig: rest } as CardRow; setDraft(followed); check({ ...followed, text: draft.text }); }}>지금 글 기준으로 효과 맞추기</button></div>}

              {decision && <div className="kst-decision">
                <b>이 글로 바꾸면 카드가 하는 일이 달라져요</b>
                <div className="kst-diff">
                  <div><small>지금 효과</small>{decision.before.length ? decision.before.map((l, i) => <p key={i}>{l}</p>) : <p>효과 없음</p>}</div>
                  <div><small>새 글대로 하면</small>{decision.after.length ? decision.after.map((l, i) => <p key={i}>{l}</p>) : <p>효과 없음</p>}</div>
                </div>
                <div className="kst-decide">
                  <button type="button" onClick={() => void decide("keep")}>글만 바꾸기 (효과 그대로)</button>
                  <button type="button" onClick={() => void decide("follow")}>효과도 새 글대로</button>
                </div>
                <p className="kst-note">잘 모르겠으면 "글만 바꾸기"를 고르세요. 게임은 지금과 똑같이 작동해요.</p>
              </div>}

              <div className="kst-field"><span>키워드</span>
                <div className="kst-chips">{QUICK_KEYWORDS.map(([k, l]) => { const on = draft.keywords.includes(k as never); return <button key={k} type="button" aria-pressed={on} onClick={() => {
                  const keywords = on ? draft.keywords.filter((x) => x !== k) : [...draft.keywords, k];
                  const config = { ...(draft.effectConfig ?? {}) } as Record<string, unknown>;
                  if (k === "ARMOR") { if (on) delete config.armor; else config.armor = config.armor ?? 1; }
                  change({ keywords: keywords as never, effectConfig: config }, 300);
                }}>{l}</button>; })}</div>
                {draft.keywords.includes("ARMOR" as never) && <label className="kst-inline">아머 수치 <input inputMode="numeric" value={String((draft.effectConfig as Record<string, unknown>)?.armor ?? 1)} onChange={(e) => change({ effectConfig: { ...(draft.effectConfig ?? {}), armor: Math.max(0, Math.min(999, Number(e.target.value.replace(/\D/g, "")) || 0)) } })} /></label>}
                {draft.keywords.some((k) => ADVANCED_KEYWORDS.has(k)) && <small className="kst-note">업그레이드·조건·카운트다운·합체는 "자세히 편집"에서 바꿀 수 있어요.</small>}
              </div>

              <div className="kst-field"><span>태그</span>
                <div className="kst-chips">{Object.entries(tagLabels).map(([id, label]) => { const on = (draft.tags ?? []).some((t) => t === id || t === label); return <button key={id} type="button" aria-pressed={on} onClick={() => change({ tags: on ? (draft.tags ?? []).filter((t) => t !== id && t !== label) : [...(draft.tags ?? []), id] }, 300)}>{label}</button>; })}</div>
              </div>

              <label className="kst-field"><span>카드 소개 (선택)</span><textarea rows={3} value={String(draft.lore ?? "")} onChange={(e) => change({ lore: e.target.value } as Partial<CardRow>, 1100)} /></label>
            </div>
          </div>
        </>}
      </section>
    </div>
  );
}
