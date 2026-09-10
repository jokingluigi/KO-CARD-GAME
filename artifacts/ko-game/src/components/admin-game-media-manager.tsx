import { useEffect, useMemo, useRef, useState } from "react";
import { Image as ImageIcon, Music2, Play, Power, Square, Trash2, Upload } from "lucide-react";
import { audioManager } from "../audio/audio-manager";

type MediaType = "BACKGROUND" | "BGM";

type MediaRecord = {
  id: string;
  mediaType: MediaType;
  name: string;
  assetId: string;
  assetUrl: string;
  fileName: string;
  contentType: string;
  width: number | null;
  height: number | null;
  volume: number;
  enabled: boolean;
};

type Props = {
  onUnauthorized: () => void;
};

const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/admin`;
const imageAccept = ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp";
const audioAccept = ".mp3,.ogg,.wav,audio/mpeg,audio/ogg,audio/wav,audio/x-wav";

async function readMessage(response: Response) {
  try {
    return ((await response.json()) as { message?: string }).message ?? "요청을 처리하지 못했습니다.";
  } catch {
    return "요청을 처리하지 못했습니다.";
  }
}

function isImage(file: File) {
  return ["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    /\.(png|jpe?g|webp)$/i.test(file.name);
}

function isAudio(file: File) {
  return ["audio/mpeg", "audio/ogg", "audio/wav", "audio/x-wav"].includes(file.type) ||
    /\.(mp3|ogg|wav)$/i.test(file.name);
}

function useViewportInfo() {
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === "undefined" ? 0 : window.innerWidth,
    height: typeof window === "undefined" ? 0 : window.innerHeight,
  }));

  useEffect(() => {
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return viewport;
}

export function AdminGameMediaManager({ onUnauthorized }: Props) {
  const [media, setMedia] = useState<MediaRecord[]>([]);
  const [backgroundName, setBackgroundName] = useState("");
  const [bgmName, setBgmName] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<MediaType | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [message, setMessage] = useState("");
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const bgmInputRef = useRef<HTMLInputElement>(null);
  const viewport = useViewportInfo();

  const backgrounds = media.filter((item) => item.mediaType === "BACKGROUND");
  const bgms = media.filter((item) => item.mediaType === "BGM");
  const viewportRatio = viewport.height > 0 ? viewport.width / viewport.height : 1;
  const viewportRatioLabel = viewport.height > 0
    ? `${viewport.width} × ${viewport.height}px / ${viewportRatio.toFixed(2)}:1`
    : "현재 viewport 확인 중";

  const backgroundGuidance = useMemo(() => ({
    recommended: viewport.height > 0
      ? `${viewport.width} × ${viewport.height}px 이상`
      : "현재 viewport 이상",
    ratio: viewport.height > 0
      ? `${viewportRatio.toFixed(2)}:1 (현재 viewport 기준)`
      : "100vw / 100dvh",
  }), [viewport.height, viewport.width, viewportRatio]);

  useEffect(() => {
    void loadMedia();
    return () => audioManager.stopBgm();
  }, []);

  async function loadMedia() {
    setLoading(true);
    try {
      const response = await fetch(`${apiBase}/game-media`, { credentials: "include" });
      if (response.status === 401) {
        onUnauthorized();
        return;
      }
      if (!response.ok) throw new Error(await readMessage(response));
      const body = (await response.json()) as { media?: MediaRecord[] };
      setMedia(body.media ?? []);
    } catch (reason) {
      setErrorMessage(reason instanceof Error ? reason.message : "백그라운드 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function upload(file: File, mediaType: MediaType) {
    const valid = mediaType === "BACKGROUND" ? isImage(file) : isAudio(file);
    if (!valid) {
      setErrorMessage(mediaType === "BACKGROUND"
        ? "PNG, JPG, JPEG, WEBP 파일만 선택할 수 있습니다."
        : "MP3, OGG, WAV 파일만 선택할 수 있습니다.");
      return;
    }

    setUploading(mediaType);
    setErrorMessage("");
    setMessage("");
    let pending: { mediaType: MediaType; assetId: string; uploadToken: string } | null = null;
    try {
      let width: number | null = null;
      let height: number | null = null;
      if (mediaType === "BACKGROUND") {
        const objectUrl = URL.createObjectURL(file);
        try {
          const image = new window.Image();
          await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error("이미지 크기를 확인하지 못했습니다."));
            image.src = objectUrl;
          });
          width = image.naturalWidth;
          height = image.naturalHeight;
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      }

      const requestResponse = await fetch(`${apiBase}/game-media/uploads/request-url`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaType,
          name: file.name,
          size: file.size,
          contentType: file.type,
        }),
      });
      if (requestResponse.status === 401) {
        onUnauthorized();
        return;
      }
      if (!requestResponse.ok) throw new Error(await readMessage(requestResponse));
      const uploadInfo = await requestResponse.json() as {
        uploadURL: string;
        objectPath: string;
        contentType: string;
      };
      const uploadResponse = await fetch(uploadInfo.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": uploadInfo.contentType },
        body: file,
      });
      if (!uploadResponse.ok) throw new Error("파일 저장에 실패했습니다.");

      const completeResponse = await fetch(`${apiBase}/game-media/uploads/complete`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaType,
          objectPath: uploadInfo.objectPath,
          contentType: uploadInfo.contentType,
        }),
      });
      if (!completeResponse.ok) throw new Error(await readMessage(completeResponse));
      const completed = await completeResponse.json() as {
        mediaType: MediaType;
        assetId: string;
        assetUrl: string;
        uploadToken: string;
      };
      pending = completed;

      const name = (mediaType === "BACKGROUND" ? backgroundName : bgmName).trim() || file.name;
      const saveResponse = await fetch(`${apiBase}/game-media`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaType,
          name,
          assetId: completed.assetId,
          assetUrl: completed.assetUrl,
          fileName: file.name,
          contentType: uploadInfo.contentType,
          width,
          height,
          volume: 100,
          enabled: true,
          uploadToken: completed.uploadToken,
        }),
      });
      if (!saveResponse.ok) throw new Error(await readMessage(saveResponse));
      if (mediaType === "BACKGROUND") setBackgroundName("");
      else setBgmName("");
      setMessage(`${mediaType === "BACKGROUND" ? "배경 이미지" : "BGM"}을 등록했습니다.`);
      await loadMedia();
      pending = null;
    } catch (reason) {
      setErrorMessage(reason instanceof Error ? reason.message : "파일을 등록하지 못했습니다.");
    } finally {
      if (pending) {
        await fetch(`${apiBase}/game-media/uploads/discard`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pending),
        });
      }
      setUploading(null);
    }
  }

  async function patchItem(item: MediaRecord, patch: Partial<Pick<MediaRecord, "name" | "enabled" | "volume">>) {
    const response = await fetch(`${apiBase}/game-media/${encodeURIComponent(item.id)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (response.status === 401) {
      onUnauthorized();
      return;
    }
    if (!response.ok) {
      setErrorMessage(await readMessage(response));
      return;
    }
    const body = await response.json() as { media: MediaRecord };
    setMedia((current) => current.map((entry) => entry.id === item.id ? body.media : entry));
  }

  async function deleteItem(item: MediaRecord) {
    audioManager.stopBgm();
    const response = await fetch(`${apiBase}/game-media/${encodeURIComponent(item.id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (response.status === 401) {
      onUnauthorized();
      return;
    }
    if (!response.ok) {
      setErrorMessage(await readMessage(response));
      return;
    }
    setMedia((current) => current.filter((entry) => entry.id !== item.id));
    setMessage(`${item.mediaType === "BACKGROUND" ? "배경 이미지" : "BGM"}을 삭제했습니다.`);
  }

  const ratioWarning = (item: MediaRecord) => {
    if (!item.width || !item.height || viewport.height === 0) return null;
    const ratio = item.width / item.height;
    return Math.abs(ratio - viewportRatio) / viewportRatio > 0.12;
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="font-display text-xs font-bold tracking-[0.2em] text-primary">GAME MEDIA</div>
        <h2 className="mt-1 text-2xl font-black">백그라운드 관리</h2>
        <p className="mt-2 text-sm text-neutral-500">게임 시작 시 활성 배경 1개와 BGM 1개를 각각 독립적으로 랜덤 선택합니다.</p>
      </div>

      <section className="rounded-lg border border-primary/30 bg-primary/5 p-4">
        <h3 className="text-sm font-black text-primary">현재 게임 화면 기준 권장 배경 이미지 규격</h3>
        <div className="mt-3 grid gap-3 text-xs text-neutral-300 md:grid-cols-2">
          <p><strong className="text-neutral-500">게임 컨테이너</strong><br />전체 viewport `w-full min-h-[100dvh]`, desktop은 `md:h-[100dvh]`, 내부 플레이 영역은 `max-w-5xl`</p>
          <p><strong className="text-neutral-500">현재 viewport / 비율</strong><br />{viewportRatioLabel}</p>
          <p><strong className="text-neutral-500">권장 해상도</strong><br />{backgroundGuidance.recommended} 이상, 현재 브라우저 viewport와 같은 비율 권장</p>
          <p><strong className="text-neutral-500">권장 aspect ratio</strong><br />{backgroundGuidance.ratio} — 고정 1920×1080 기준이 아니라 실제 viewport 기준</p>
          <p><strong className="text-neutral-500">최소 권장 해상도</strong><br />현재 CSS는 고정 최소 해상도를 강제하지 않으며, 모바일 `100dvh` layout과 desktop `md` layout을 사용합니다.</p>
          <p><strong className="text-neutral-500">모바일 safe area</strong><br />현재 게임 shell에는 별도 safe-area inset padding이 없으므로 주요 피사체는 이미지 가장자리 10% 안쪽을 비워두는 것을 권장합니다.</p>
          <p className="md:col-span-2"><strong className="text-neutral-500">crop 방식</strong><br /><code>background-size: cover</code> 권장. 세로·가로 viewport 차이로 일부 crop되며, `contain`은 게임 배경에 빈 여백이 생길 수 있습니다.</p>
        </div>
      </section>

      {(errorMessage || message) && (
        <div className={`rounded border px-3 py-2 text-xs font-bold ${errorMessage ? "border-red-900 bg-red-950/50 text-red-300" : "border-emerald-900 bg-emerald-950/40 text-emerald-300"}`}>
          {errorMessage || message}
        </div>
      )}

      <MediaSection
        title="배경 이미지"
        description="PNG / JPG / JPEG / WEBP · 권장 비율이 달라도 업로드할 수 있으며 경고만 표시합니다."
        icon={<ImageIcon className="h-5 w-5" />}
        items={backgrounds}
        name={backgroundName}
        setName={setBackgroundName}
        accept={imageAccept}
        uploading={uploading === "BACKGROUND"}
        inputRef={backgroundInputRef}
        onUpload={(file) => void upload(file, "BACKGROUND")}
        onPatch={patchItem}
        onDelete={deleteItem}
        ratioWarning={ratioWarning}
        viewportRatio={viewportRatio}
      />

      <MediaSection
        title="배경 음악"
        description="MP3 / OGG / WAV · 활성 BGM은 매치 시작 시 1개를 선택하고 매치 동안 반복 재생합니다."
        icon={<Music2 className="h-5 w-5" />}
        items={bgms}
        name={bgmName}
        setName={setBgmName}
        accept={audioAccept}
        uploading={uploading === "BGM"}
        inputRef={bgmInputRef}
        onUpload={(file) => void upload(file, "BGM")}
        onPatch={patchItem}
        onDelete={deleteItem}
        ratioWarning={() => null}
        viewportRatio={viewportRatio}
      />

      {loading && <p className="text-xs text-neutral-500">게임 미디어를 불러오는 중...</p>}
    </div>
  );
}

function MediaSection({
  title,
  description,
  icon,
  items,
  name,
  setName,
  accept,
  uploading,
  inputRef,
  onUpload,
  onPatch,
  onDelete,
  ratioWarning,
  viewportRatio,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  items: MediaRecord[];
  name: string;
  setName: (value: string) => void;
  accept: string;
  uploading: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onUpload: (file: File) => void;
  onPatch: (item: MediaRecord, patch: Partial<Pick<MediaRecord, "name" | "enabled" | "volume">>) => Promise<void>;
  onDelete: (item: MediaRecord) => Promise<void>;
  ratioWarning: (item: MediaRecord) => boolean | null;
  viewportRatio: number;
}) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-black/20 p-4">
      <div className="flex items-start gap-3">
        <div className="rounded border border-primary/40 bg-primary/10 p-2 text-primary">{icon}</div>
        <div>
          <h3 className="text-lg font-black">{title}</h3>
          <p className="mt-1 text-xs text-neutral-500">{description}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={`${title} 이름`}
          className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          disabled={uploading}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            inputRef.current?.click();
          }}
          className="flex items-center justify-center gap-2 rounded border border-primary/60 px-4 py-2 text-xs font-black text-primary hover:bg-primary/10 disabled:opacity-50"
        >
          <Upload className="h-4 w-4" /> {uploading ? "업로드 중..." : "파일 업로드"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onUpload(file);
            event.currentTarget.value = "";
          }}
        />
      </div>

      {items.length === 0 ? (
        <p className="mt-5 rounded border border-dashed border-neutral-800 px-3 py-6 text-center text-xs text-neutral-600">
          등록된 {title}이 없습니다. 활성 항목이 없으면 기존 게임 설정을 사용합니다.
        </p>
      ) : (
        <div className="mt-5 grid gap-3">
          {items.map((item) => {
            const warning = ratioWarning(item);
            return (
              <article key={item.id} className="grid gap-4 rounded border border-neutral-800 bg-neutral-950/70 p-3 md:grid-cols-[180px_1fr]">
                {item.mediaType === "BACKGROUND" ? (
                  <div className="aspect-video overflow-hidden rounded border border-neutral-800 bg-black">
                    <img src={item.assetUrl} alt={item.name} className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div className="flex aspect-video items-center justify-center rounded border border-neutral-800 bg-neutral-900 text-neutral-600">
                    <Music2 className="h-8 w-8" />
                  </div>
                )}
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <input
                        defaultValue={item.name}
                        onBlur={(event) => {
                          if (event.target.value.trim() && event.target.value.trim() !== item.name) {
                            void onPatch(item, { name: event.target.value.trim() });
                          }
                        }}
                        className="w-full min-w-0 rounded border border-transparent bg-transparent px-1 py-1 text-sm font-black outline-none hover:border-neutral-700 focus:border-primary"
                      />
                      <p className="truncate px-1 text-[10px] text-neutral-600">{item.fileName}</p>
                    </div>
                    <label className="flex shrink-0 items-center gap-2 text-xs font-bold text-neutral-300">
                      <input
                        type="checkbox"
                        checked={item.enabled}
                        onChange={(event) => void onPatch(item, { enabled: event.target.checked })}
                      />
                      <Power className="h-3.5 w-3.5" /> 활성
                    </label>
                  </div>
                  {item.mediaType === "BACKGROUND" && (
                    <p className={`text-[11px] ${warning ? "text-amber-300" : "text-neutral-500"}`}>
                      {item.width}×{item.height}px · {(item.width! / item.height!).toFixed(2)}:1
                      {warning ? ` · 현재 viewport ${viewportRatio.toFixed(2)}:1과 달라 cover crop 경고` : " · 현재 viewport 비율과 유사"}
                    </p>
                  )}
                  {item.mediaType === "BGM" && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => audioManager.previewBgm(item.assetUrl, item.volume)} className="flex items-center gap-1.5 rounded border border-emerald-800 px-2.5 py-1.5 text-[11px] font-bold text-emerald-300">
                        <Play className="h-3.5 w-3.5" /> 미리듣기
                      </button>
                      <button type="button" onClick={() => audioManager.stopBgm()} className="flex items-center gap-1.5 rounded border border-neutral-700 px-2.5 py-1.5 text-[11px] font-bold text-neutral-300">
                        <Square className="h-3.5 w-3.5" /> 정지
                      </button>
                      <label className="flex min-w-[180px] flex-1 items-center gap-2 text-[11px] text-neutral-400">
                        볼륨 {item.volume}%
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={item.volume}
                          onChange={(event) => void onPatch(item, { volume: Number(event.target.value) })}
                          className="min-w-0 flex-1 accent-primary"
                        />
                      </label>
                    </div>
                  )}
                  <button type="button" onClick={() => void onDelete(item)} className="flex items-center gap-1.5 text-[11px] font-bold text-red-400 hover:text-red-300">
                    <Trash2 className="h-3.5 w-3.5" /> 삭제
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}