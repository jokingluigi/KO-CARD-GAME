import { useEffect, useMemo, useRef, useState } from "react";
import { Image as ImageIcon, RotateCcw, Save, Trash2, Upload } from "lucide-react";
import { CardRenderer } from "./card-renderer";
import { refreshCardFrames, type CardFrameCardType, type CardFrameDefinition } from "../lib/card-frames-client";
import type { CardRarity } from "../game/cards/types";

const adminBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/admin`;
const imageAccept = ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp";
const cardTypes: CardFrameCardType[] = ["WRESTLER", "TECHNIQUE"];
const rarities: CardRarity[] = ["NORMAL", "LEGENDARY", "CHAMPION", "TOKEN"];
const defaultScale = 1.1;

type StoredFrame = CardFrameDefinition & { id: string; frameAssetId: string | null; frameUrl: string | null };
type Form = {
  frameAssetId: string | null;
  frameUrl: string | null;
  frameUploadToken: string | null;
  enabled: boolean;
  frameScale: number;
  frameOffsetX: number;
  frameOffsetY: number;
};

function key(cardType: CardFrameCardType, rarity: CardRarity) {
  return `${cardType}:${rarity}`;
}

function blankForm(): Form {
  return {
    frameAssetId: null,
    frameUrl: null,
    frameUploadToken: null,
    enabled: true,
    frameScale: defaultScale,
    frameOffsetX: 0,
    frameOffsetY: 0,
  };
}

function formFromFrame(frame?: StoredFrame): Form {
  if (!frame) return blankForm();
  return {
    frameAssetId: frame.frameAssetId,
    frameUrl: frame.frameUrl,
    frameUploadToken: null,
    enabled: frame.enabled,
    frameScale: frame.frameScale,
    frameOffsetX: frame.frameOffsetX,
    frameOffsetY: frame.frameOffsetY,
  };
}

async function readMessage(response: Response) {
  const body = await response.json().catch(() => ({})) as { message?: string };
  return body.message ?? "요청을 처리하지 못했습니다.";
}

export function AdminCardFrameManager({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [frames, setFrames] = useState<StoredFrame[]>([]);
  const [selectedKey, setSelectedKey] = useState(key("WRESTLER", "NORMAL"));
  const [form, setForm] = useState<Form>(blankForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedType = selectedKey.split(":")[0] as CardFrameCardType;
  const selectedRarity = selectedKey.split(":")[1] as CardRarity;
  const selectedFrame = frames.find((frame) => key(frame.cardType, frame.rarity) === selectedKey);
  const availableKeys = useMemo(
    () => cardTypes.flatMap((cardType) => rarities.map((rarity) => key(cardType, rarity))),
    [],
  );

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(`${adminBase}/card-frames`, { credentials: "include" });
      if (response.status === 401 || response.status === 403) {
        onUnauthorized();
        return;
      }
      if (!response.ok) throw new Error(await readMessage(response));
      const body = await response.json() as { frames?: StoredFrame[] };
      setFrames(body.frames ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "카드 프레임을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setForm(formFromFrame(selectedFrame));
  }, [selectedKey, selectedFrame?.id, selectedFrame?.updatedAt]);

  async function discardPending() {
    if (!form.frameAssetId || !form.frameUploadToken) return;
    await fetch(`${adminBase}/cards/images/discard`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageAssetId: form.frameAssetId,
        imageUploadToken: form.frameUploadToken,
      }),
    });
  }

  async function upload(file: File) {
    const extension = file.name.toLowerCase().split(".").pop() ?? "";
    const valid = (file.type === "image/png" && extension === "png")
      || (file.type === "image/jpeg" && ["jpg", "jpeg"].includes(extension))
      || (file.type === "image/webp" && extension === "webp");
    if (!valid) {
      setError("PNG, JPG, JPEG, WEBP 이미지만 업로드할 수 있습니다.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await discardPending();
      const requestResponse = await fetch(`${adminBase}/cards/images/upload-url`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (requestResponse.status === 401 || requestResponse.status === 403) {
        onUnauthorized();
        return;
      }
      if (!requestResponse.ok) throw new Error(await readMessage(requestResponse));
      const uploadInfo = await requestResponse.json() as { uploadURL: string; objectPath: string };
      const putResponse = await fetch(uploadInfo.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putResponse.ok) throw new Error("프레임 파일 업로드에 실패했습니다.");
      const completeResponse = await fetch(`${adminBase}/cards/images/complete`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectPath: uploadInfo.objectPath, contentType: file.type }),
      });
      if (!completeResponse.ok) throw new Error(await readMessage(completeResponse));
      const asset = await completeResponse.json() as {
        imageAssetId: string;
        imageUrl: string;
        imageUploadToken: string;
      };
      setForm((current) => ({
        ...current,
        frameAssetId: asset.imageAssetId,
        frameUrl: asset.imageUrl,
        frameUploadToken: asset.imageUploadToken,
      }));
      setMessage("프레임을 업로드했습니다. 저장을 눌러 적용하세요.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "프레임을 업로드하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${adminBase}/card-frames/${selectedType}/${selectedRarity}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (response.status === 401 || response.status === 403) {
        onUnauthorized();
        return;
      }
      if (!response.ok) throw new Error(await readMessage(response));
      const body = await response.json() as { frame: StoredFrame };
      setFrames((current) => [
        ...current.filter((frame) => key(frame.cardType, frame.rarity) !== selectedKey),
        body.frame,
      ]);
      setForm(formFromFrame(body.frame));
      await refreshCardFrames();
      setMessage("카드 프레임을 저장했습니다. 게임과 모든 카드 화면에 반영됩니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "카드 프레임을 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!window.confirm("이 프레임을 기본값으로 복원할까요?")) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${adminBase}/card-frames/${selectedType}/${selectedRarity}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (response.status === 401 || response.status === 403) {
        onUnauthorized();
        return;
      }
      if (!response.ok) throw new Error(await readMessage(response));
      setFrames((current) => current.filter((frame) => key(frame.cardType, frame.rarity) !== selectedKey));
      setForm(blankForm());
      await refreshCardFrames();
      setMessage("기본 카드 프레임으로 복원했습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "기본값을 복원하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const preview = {
    cardType: selectedType,
    frameUrl: form.frameUrl,
    enabled: form.enabled,
    frameScale: form.frameScale,
    frameOffsetX: form.frameOffsetX,
    frameOffsetY: form.frameOffsetY,
  } satisfies Partial<CardFrameDefinition>;

  return (
    <section className="space-y-5">
      <div>
        <div className="font-display text-xs font-bold tracking-[0.2em] text-primary">CARD FRAME</div>
        <h2 className="mt-1 text-2xl font-black">카드 프레임 관리</h2>
        <p className="mt-2 text-sm leading-6 text-neutral-500">
          카드 종류와 희귀도별 프레임을 한 곳에서 관리합니다. 저장된 프레임은 게임, 덱, 컬렉션, 팩 공개, 상점, 카드 미리보기에서 공통으로 사용됩니다.
        </p>
      </div>

      {(error || message) && (
        <div className={`rounded border px-3 py-2 text-xs font-bold ${error ? "border-red-900 bg-red-950/50 text-red-300" : "border-emerald-900 bg-emerald-950/40 text-emerald-300"}`}>
          {error || message}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)_250px]">
        <aside className="rounded-xl border border-neutral-800 bg-black/30 p-3">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-black">프레임 종류</h3>
            <ImageIcon className="h-4 w-4 text-primary" />
          </div>
          <div className="space-y-2">
            {availableKeys.map((frameKey) => {
              const [cardType, rarity] = frameKey.split(":") as [CardFrameCardType, CardRarity];
              const frame = frames.find((item) => key(item.cardType, item.rarity) === frameKey);
              return (
                <button
                  type="button"
                  key={frameKey}
                  onClick={() => setSelectedKey(frameKey)}
                  className={`w-full rounded border px-3 py-3 text-left transition-colors ${selectedKey === frameKey ? "border-primary bg-primary/10" : "border-neutral-800 hover:border-neutral-600"}`}
                >
                  <div className="font-black">{cardType}</div>
                  <div className="mt-1 text-xs text-neutral-500">{rarity}</div>
                  <div className={`mt-2 text-[10px] font-bold ${frame?.enabled && frame.frameAssetId ? "text-emerald-300" : "text-neutral-600"}`}>
                    {frame?.enabled && frame.frameAssetId ? "커스텀 프레임" : "기본 프레임"}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="rounded-xl border border-neutral-800 bg-black/30 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-xl font-black">{selectedType} · {selectedRarity}</h3>
              <p className="mt-1 text-xs text-neutral-500">투명 배경 PNG/WEBP 권장 · 프레임 외곽선은 이미지 자체가 담당합니다.</p>
            </div>
            <label className="flex items-center gap-2 text-xs font-bold text-neutral-300">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
                className="accent-primary"
              />
              활성화
            </label>
          </div>

          <div className="mt-5 rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
            <div className="flex flex-wrap items-center gap-3">
              {form.frameUrl ? (
                <img src={form.frameUrl} alt="" className="h-28 w-20 rounded border border-neutral-700 object-contain" />
              ) : (
                <div className="flex h-28 w-20 items-center justify-center rounded border border-dashed border-neutral-700 text-center text-[10px] text-neutral-600">기본 프레임 사용</div>
              )}
              <div className="space-y-2">
                <button type="button" disabled={busy} onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 rounded border border-neutral-700 px-3 py-2 text-sm font-bold hover:border-primary disabled:opacity-50">
                  <Upload className="h-4 w-4" /> {busy ? "처리 중..." : "프레임 업로드/교체"}
                </button>
                {form.frameUrl && (
                  <button type="button" disabled={busy} onClick={() => { void discardPending(); setForm((current) => ({ ...current, frameAssetId: null, frameUrl: null, frameUploadToken: null })); }} className="flex items-center gap-2 rounded border border-red-900 px-3 py-2 text-xs font-bold text-red-300 disabled:opacity-50">
                    <Trash2 className="h-3.5 w-3.5" /> 커스텀 이미지 제거
                  </button>
                )}
                <p className="text-[10px] text-neutral-600">카드 이미지 업로드와 같은 안전한 저장소/검증 흐름을 사용합니다.</p>
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept={imageAccept} className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }} />
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <RangeField label="프레임 크기" value={form.frameScale} min={0.75} max={1.5} step={0.01} suffix={`${Math.round(form.frameScale * 100)}%`} onChange={(value) => setForm((current) => ({ ...current, frameScale: value }))} />
            <RangeField label="가로 위치" value={form.frameOffsetX} min={-15} max={15} step={0.5} suffix={`${form.frameOffsetX.toFixed(1)}%`} onChange={(value) => setForm((current) => ({ ...current, frameOffsetX: value }))} />
            <RangeField label="세로 위치" value={form.frameOffsetY} min={-15} max={15} step={0.5} suffix={`${form.frameOffsetY.toFixed(1)}%`} onChange={(value) => setForm((current) => ({ ...current, frameOffsetY: value }))} />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" disabled={busy || loading} onClick={() => void save()} className="flex items-center gap-2 rounded bg-primary px-4 py-2.5 text-sm font-black text-black disabled:opacity-50">
              <Save className="h-4 w-4" /> 저장
            </button>
            <button type="button" disabled={busy} onClick={() => void reset()} className="flex items-center gap-2 rounded border border-neutral-700 px-4 py-2.5 text-sm font-bold text-neutral-300 disabled:opacity-50">
              <RotateCcw className="h-4 w-4" /> 기본값 복원
            </button>
          </div>
        </div>

        <aside className="rounded-xl border border-neutral-800 bg-black/30 p-4">
          <div className="mb-3">
            <div className="text-[10px] font-black tracking-[0.18em] text-neutral-500">LIVE CARD PREVIEW</div>
            <p className="mt-1 text-xs text-neutral-500">실제 공통 Card Renderer</p>
          </div>
          <CardRenderer
            name={selectedType === "TECHNIQUE" ? "샘플 기술 카드" : "샘플 선수 카드"}
            cardType={selectedType}
            cost={4}
            attack={selectedType === "TECHNIQUE" ? 0 : 7}
            health={selectedType === "TECHNIQUE" ? 0 : 8}
            rulesText={selectedType === "TECHNIQUE" ? "대상에게 효과를 적용합니다." : "필드에 등장하면 다음 효과를 적용합니다."}
            rarity={selectedRarity}
            frameOverride={preview}
            size="admin"
            className="mx-auto w-full max-w-[220px] shadow-[0_15px_40px_rgba(0,0,0,0.7)]"
          />
          <p className="mt-4 text-center text-[10px] leading-relaxed text-neutral-600">
            TECHNIQUE는 공격력/체력 영역을 표시하지 않습니다.<br />
            카드별 Artwork 위치 조절값은 이 설정과 독립적으로 유지됩니다.
          </p>
        </aside>
      </div>
    </section>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-xs font-bold text-neutral-400">
      <span className="flex items-center justify-between gap-2">
        {label}
        <span className="text-primary">{suffix}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 w-full accent-primary" />
    </label>
  );
}