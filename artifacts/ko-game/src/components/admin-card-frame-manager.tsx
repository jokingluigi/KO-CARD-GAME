import { useEffect, useMemo, useState } from "react";
import { CardRenderer } from "./card-renderer";
import { refreshCardFrames, type CardFrameCardType, type CardFrameDefinition } from "../lib/card-frames-client";
import { allowedCardRarities, type CardRarity } from "../game/cards/types";
import { adminFetch, Button, EditorPane, errorText, Field, ImagePick, ListPane, ListRow, Notice, Panel, RARITY_KO, SaveLine, Split, Toggle, uploadAdminImage, useAutosave, useMobileEditing } from "./admin-kit";

type StoredFrame = CardFrameDefinition & { id: string; frameAssetId: string | null; frameUrl: string | null; updatedAt?: string };
type Form = { key: string; frameAssetId: string | null; frameUrl: string | null; frameUploadToken: string | null; enabled: boolean; frameScale: number; frameOffsetX: number; frameOffsetY: number };

const TYPE_KO: Record<string, string> = { WRESTLER: "선수 카드", TECHNIQUE: "기술 카드" };
const cardTypes: CardFrameCardType[] = ["WRESTLER", "TECHNIQUE"];
const keyOf = (t: string, r: string) => `${t}:${r}`;
const formOf = (k: string, f?: StoredFrame): Form => ({ key: k, frameAssetId: f?.frameAssetId ?? null, frameUrl: f?.frameUrl ?? null, frameUploadToken: null, enabled: f?.enabled ?? true, frameScale: f?.frameScale ?? 1.1, frameOffsetX: f?.frameOffsetX ?? 0, frameOffsetY: f?.frameOffsetY ?? 0 });

function Range({ label, value, min, max, step, show, onChange }: { label: string; value: number; min: number; max: number; step: number; show: string; onChange: (v: number) => void }) {
  return <Field label={<span style={{ display: "flex", justifyContent: "space-between" }}>{label}<em style={{ fontStyle: "normal", color: "#e3b341" }}>{show}</em></span>}><input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ accentColor: "#e3b341", minHeight: 0, padding: 0 }} /></Field>;
}

/** 카드 프레임 — 카드 종류·등급별 테두리 그림. 고치면 바로 저장돼요. */
export function AdminCardFrameManager({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [frames, setFrames] = useState<StoredFrame[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const mobile = useMobileEditing();
  const keys = useMemo(() => cardTypes.flatMap((t) => allowedCardRarities(t).map((r) => keyOf(t, r))), []);

  useEffect(() => { adminFetch<{ frames?: StoredFrame[] }>("/card-frames", undefined, onUnauthorized).then((b) => setFrames(b.frames ?? [])).catch((e) => setError(errorText(e, "프레임을 불러오지 못했어요."))); }, []);
  const frameFor = (k: string) => frames?.find((f) => keyOf(f.cardType, f.rarity) === k);

  const autosave = useAutosave(form?.key ?? null, form, async (next) => {
    const [t, r] = next.key.split(":");
    const { key: _k, ...body } = next;
    const saved = await adminFetch<{ frame: StoredFrame }>(`/card-frames/${t}/${r}`, { method: "PUT", json: body }, onUnauthorized);
    setFrames((list) => [...(list ?? []).filter((f) => keyOf(f.cardType, f.rarity) !== next.key), saved.frame]);
    await refreshCardFrames();
    return "저장됨 · 게임에도 바로 반영돼요";
  }, 700);

  function select(k: string) { void autosave.flush(); setSelected(k); setForm(formOf(k, frameFor(k))); mobile.open(); }
  async function upload(file: File) {
    if (!form) return;
    setUploading(true);
    try { const a = await uploadAdminImage(file, onUnauthorized); setForm({ ...form, frameAssetId: a.imageAssetId, frameUrl: a.imageUrl, frameUploadToken: a.imageUploadToken }); }
    catch (e) { autosave.setState({ kind: "error", message: errorText(e, "그림을 올리지 못했어요.") }); }
    finally { setUploading(false); }
  }
  async function reset() {
    if (!form || !window.confirm("이 테두리를 기본 그림으로 되돌릴까요?")) return;
    const [t, r] = form.key.split(":");
    try {
      await adminFetch(`/card-frames/${t}/${r}`, { method: "DELETE" }, onUnauthorized);
      setFrames((list) => (list ?? []).filter((f) => keyOf(f.cardType, f.rarity) !== form.key));
      const fresh = formOf(form.key); autosave.markSaved(fresh); setForm(fresh);
      await refreshCardFrames();
      autosave.setState({ kind: "saved", message: "기본 테두리로 되돌렸어요" });
    } catch (e) { autosave.setState({ kind: "error", message: errorText(e, "되돌리지 못했어요.") }); }
  }

  if (!frames) return error ? <Notice tone="error">{error}</Notice> : <p className="text-sm text-neutral-400">불러오는 중…</p>;
  const set = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const [type, rarity] = (form?.key ?? "WRESTLER:NORMAL").split(":") as [CardFrameCardType, CardRarity];

  return (
    <div className="ak-page">
      <p className="ak-hint">여기서 바꾼 테두리는 게임, 덱, 컬렉션, 카드팩, 상점 등 카드가 나오는 모든 곳에 함께 적용돼요.</p>
      <Split editing={mobile.editing}
        list={<ListPane count="카드 종류 · 등급">
          {keys.map((k) => { const [t, r] = k.split(":"); const f = frameFor(k); const custom = Boolean(f?.enabled && f.frameAssetId); return <ListRow key={k} thumb={f?.frameUrl ?? null} selected={k === selected} onClick={() => select(k)} title={`${TYPE_KO[t!]} · ${RARITY_KO[r!] ?? r}`} badge={custom ? "내 그림" : "기본"} tone={custom ? "on" : "off"} />; })}
        </ListPane>}
        editor={<EditorPane onBack={() => { void autosave.flush(); mobile.back(); }} status={<SaveLine state={autosave.state} />} right={form && (frameFor(form.key) ? <Button onClick={() => void reset()}>기본으로 되돌리기</Button> : null)}>
          {form && <div className="ak-frame-layout">
            <div className="ak-panel-body">
              <Panel title={`${TYPE_KO[type]} · ${RARITY_KO[rarity] ?? rarity} 테두리`}>
                <Toggle checked={form.enabled} onChange={(enabled) => set({ enabled })} label={form.enabled ? "이 테두리 쓰는 중" : "꺼짐 (기본 테두리 사용)"} />
                <div className="ak-row-actions" style={{ alignItems: "center" }}>
                  {form.frameUrl ? <img src={form.frameUrl} alt="" style={{ width: 64, height: 90, objectFit: "contain", borderRadius: 6, background: "#07090c" }} /> : <span className="ak-hint" style={{ margin: 0 }}>아직 기본 테두리예요.</span>}
                  <ImagePick label={form.frameUrl ? "다른 그림으로 바꾸기" : "테두리 그림 올리기"} busy={uploading} onFile={(f) => void upload(f)} />
                  {form.frameUrl && <Button kind="ghost" onClick={() => set({ frameAssetId: null, frameUrl: null, frameUploadToken: null })}>그림 빼기</Button>}
                </div>
                <p className="ak-hint" style={{ margin: 0 }}>배경이 투명한 PNG·WEBP가 좋아요.</p>
              </Panel>
              <Panel title="크기 · 위치 맞추기">
                <Range label="크기" value={form.frameScale} min={0.75} max={1.5} step={0.01} show={`${Math.round(form.frameScale * 100)}%`} onChange={(frameScale) => set({ frameScale })} />
                <Range label="좌우" value={form.frameOffsetX} min={-15} max={15} step={0.5} show={`${form.frameOffsetX.toFixed(1)}%`} onChange={(frameOffsetX) => set({ frameOffsetX })} />
                <Range label="위아래" value={form.frameOffsetY} min={-15} max={15} step={0.5} show={`${form.frameOffsetY.toFixed(1)}%`} onChange={(frameOffsetY) => set({ frameOffsetY })} />
                <div><Button kind="ghost" onClick={() => set({ frameScale: 1.1, frameOffsetX: 0, frameOffsetY: 0 })}>크기·위치 처음대로</Button></div>
              </Panel>
            </div>
            <div className="ak-frame-preview">
              <CardRenderer name={type === "TECHNIQUE" ? "샘플 기술 카드" : "샘플 선수 카드"} cardType={type} cost={4} attack={type === "TECHNIQUE" ? 0 : 7} health={type === "TECHNIQUE" ? 0 : 8}
                rulesText={type === "TECHNIQUE" ? "대상에게 효과를 줍니다." : "등장:상대 선수 하나에게 2 데미지를 줍니다."} rarity={rarity}
                frameOverride={{ cardType: type, frameUrl: form.frameUrl, enabled: form.enabled, frameScale: form.frameScale, frameOffsetX: form.frameOffsetX, frameOffsetY: form.frameOffsetY }} size="admin" className="mx-auto w-full max-w-[230px]" />
              <p className="ak-hint" style={{ textAlign: "center" }}>게임에 보이는 모습 그대로예요</p>
            </div>
          </div>}
        </EditorPane>}
      />
    </div>
  );
}
