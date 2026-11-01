import {AdminHomeBackground} from "./admin-home-background";
import { useEffect, useRef, useState } from "react";
import {
  defaultHomeMenuLayout,
  parseHomeMenuLayout,
  type HomeMenuLayout,
  type HomeArtPlacement,
} from "@workspace/cosmetics";
import { cosmeticsRequest } from "@/lib/cosmetics-client";
import { BattleModeButton } from "./battle-mode-button";
type ImageRecord = {
  id: string;
  name: string;
  assetUrl: string;
  width: number | null;
  height: number | null;
};
export function AdminHomeMenuArt({
  onUnauthorized,
}: {
  onUnauthorized: () => void;
}) {
  const [layout, setLayout] = useState(defaultHomeMenuLayout),
    [saved, setSaved] = useState<HomeMenuLayout | null>(null),
    [images, setImages] = useState<ImageRecord[]>([]),
    [device, setDevice] = useState<"desktop" | "mobile">("mobile"),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [reload, setReload] = useState(0),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [deleting, setDeleting] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const controller = new AbortController();
    void cosmeticsRequest<{ layout: HomeMenuLayout; images: ImageRecord[] }>(
      "/admin/home-menu",
      { signal: controller.signal, cache: "no-store" },
      { timeoutMs: 15000, label: "홈 메뉴 설정 불러오기" },
    )
      .then((v) => {
        if (active) {
          if (!parseHomeMenuLayout(v.layout) || !Array.isArray(v.images))
            throw Error("홈 메뉴 설정 형식을 확인해 주세요.");
          setLayout(v.layout);
          setSaved(v.layout);
          setImages(v.images);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
      const pending = request.current;
      request.current = null;
      pending?.abort();
    };
  }, [reload]);
  const image = images.find((i) => i.id === layout.imageId),
    dirty = JSON.stringify(layout) !== JSON.stringify(saved);
  const patch = (p: Partial<HomeArtPlacement>) =>
    setLayout((x) => ({ ...x, [device]: { ...x[device], ...p } }));
  async function save() {
    if (request.current || !saved) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const v = await cosmeticsRequest<{ layout: HomeMenuLayout }>(
        "/admin/home-menu",
        {
          method: "PUT",
          signal: controller.signal,
          body: JSON.stringify(layout),
        },
        { timeoutMs: 30000, label: "홈 메뉴 배치 저장" },
      );
      if (controller.signal.aborted) return;
      setLayout(v.layout);
      setSaved(v.layout);
      setMessage("홈 메뉴 이미지와 배치를 저장했습니다.");
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }
  async function upload(file: File) {
    if (request.current) return;
    if (
      !["image/png", "image/webp"].includes(file.type) ||
      file.size > 10 * 1024 * 1024
    ) {
      setError("PNG 또는 WebP 이미지를 선택하세요. 최대 10MB입니다.");
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setMessage("이미지를 업로드하고 있어요.");
    let pending: Record<string, unknown> | null = null;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      const objectURL = URL.createObjectURL(file);
      let width = 0,
        height = 0;
      try {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(Error("이미지를 읽지 못했습니다."));
          img.src = objectURL;
        });
        width = img.naturalWidth;
        height = img.naturalHeight;
      } finally {
        URL.revokeObjectURL(objectURL);
      }
      if (controller.signal.aborted) return;
      const start = await cosmeticsRequest<{
        uploadURL: string;
        objectPath: string;
      }>(
        "/admin/game-media/uploads/request-url",
        {
          method: "POST",
          signal: controller.signal,
          body: JSON.stringify({
            mediaType: "HOME_MENU_ART",
            name: file.name,
            size: file.size,
            contentType: file.type,
          }),
        },
        { timeoutMs: 30000 },
      );
      deadline = setTimeout(() => controller.abort(), 120000);
      const put = await fetch(start.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
        signal: controller.signal,
      });
      clearTimeout(deadline);
      if (!put.ok) throw Error("이미지 파일 전송에 실패했습니다.");
      pending = await cosmeticsRequest<Record<string, unknown>>(
        "/admin/game-media/uploads/complete",
        {
          method: "POST",
          signal: controller.signal,
          body: JSON.stringify({
            mediaType: "HOME_MENU_ART",
            objectPath: start.objectPath,
            contentType: file.type,
          }),
        },
        { timeoutMs: 30000 },
      );
      const result = await cosmeticsRequest<{ media: ImageRecord }>(
        "/admin/game-media",
        {
          method: "POST",
          signal: controller.signal,
          body: JSON.stringify({
            ...pending,
            name: file.name,
            fileName: file.name,
            contentType: file.type,
            width,
            height,
            volume: 100,
            gameEnabled: false,
            titleEnabled: false,
          }),
        },
        { timeoutMs: 30000 },
      );
      pending = null;
      if (controller.signal.aborted) return;
      setImages((x) => [result.media, ...x]);
      setLayout((x) => ({ ...x, imageId: result.media.id }));
      setMessage(
        "이미지를 등록했습니다. 배치를 확인하고 저장하면 홈에 반영됩니다.",
      );
    } catch (e) {
      if (pending)
        void cosmeticsRequest("/admin/game-media/uploads/discard", {
          method: "POST",
          body: JSON.stringify(pending),
        }).catch(() => {});
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "업로드 실패");
      else if (request.current === controller)
        setMessage(
          "업로드 대기를 취소했습니다. 등록 이미지를 다시 확인해 주세요.",
        );
    } finally {
      clearTimeout(deadline);
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }
  async function remove(id: string) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    try {
      await cosmeticsRequest("/admin/game-media/" + encodeURIComponent(id), {
        method: "DELETE",
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setImages((x) => x.filter((i) => i.id !== id));
      setLayout((x) => (x.imageId === id ? { ...x, imageId: null } : x));
      setDeleting(null);
      setMessage("사용하지 않는 이미지를 삭제했습니다.");
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <section
      className="space-y-4 border border-neutral-700 bg-neutral-950 p-4"
      aria-label="홈 메뉴 이미지 관리"
    >
      <header>
        <h3 className="text-xl text-amber-200">홈 메뉴 이미지 · 대전 모드</h3>
        <p className="mt-2 text-sm text-neutral-300">
          버튼 오른쪽에 넣을 캐릭터 그림을 등록합니다. 제목·버튼 프레임은
          이미지에 넣지 마세요. 투명 PNG·WebP 권장. 기본 그림 한 장으로 PC와
          모바일을 각각 조정합니다.
        </p>
      </header>
      {loading ? (
        <p role="status">설정 확인 중…</p>
      ) : (
        <>
          <fieldset disabled={busy || !saved} className="space-y-4">
            <legend className="sr-only">등록과 배치</legend>
            <label className="block">
              그림 업로드{" "}
              <input
                type="file"
                accept="image/png,image/webp,.png,.webp"
                aria-label="홈 메뉴 그림 업로드"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                  e.target.value = "";
                }}
              />
            </label>
            <label className="block">
              등록 이미지
              <select
                aria-label="홈 메뉴 등록 이미지"
                className="ml-3 min-h-11 max-w-full border border-neutral-600 bg-black p-2"
                value={layout.imageId ?? ""}
                onChange={(e) =>
                  setLayout((x) => ({ ...x, imageId: e.target.value || null }))
                }
              >
                <option value="">등록 안 함 · 글자 버튼</option>
                {images.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="min-h-11 border px-3"
                onClick={() => setLayout((x) => ({ ...x, imageId: null }))}
              >
                등록 해제
              </button>
              <button
                type="button"
                disabled={!image || saved?.imageId === image.id}
                className="min-h-11 border border-red-800 px-3 disabled:opacity-40"
                onClick={() => setDeleting(image!.id)}
              >
                선택 이미지 삭제
              </button>
            </div>
            {deleting && (
              <div role="alert" className="border border-red-800 p-3">
                <p>
                  {images.find((i) => i.id === deleting)?.name} 이미지를
                  삭제할까요?
                </p>
                <button
                  type="button"
                  className="min-h-11 px-4 text-red-200"
                  onClick={() => void remove(deleting)}
                >
                  삭제 확인
                </button>
                <button
                  type="button"
                  className="min-h-11 px-4"
                  onClick={() => setDeleting(null)}
                >
                  취소
                </button>
              </div>
            )}
            <label className="block">
              배치 화면
              <select
                aria-label="메뉴 그림 배치 화면"
                value={device}
                onChange={(e) => setDevice(e.target.value as typeof device)}
                className="ml-3 min-h-11 bg-black p-2"
              >
                <option value="mobile">모바일</option>
                <option value="desktop">PC</option>
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  ["scale", "확대·축소", 0.25, 3, 0.05],
                  ["x", "가로 기준점", 0, 100, 1],
                  ["y", "세로 기준점", 0, 100, 1],
                ] as const
              ).map(([key, label, min, max, step]) => (
                <label key={key}>
                  {label} <output>{layout[device][key]}</output>
                  <input
                    type="range"
                    className="min-h-11 w-full"
                    aria-label={label}
                    value={layout[device][key]}
                    min={min}
                    max={max}
                    step={step}
                    onChange={(e) => patch({ [key]: Number(e.target.value) })}
                  />
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={layout[device].flip}
                  onChange={(e) => patch({ flip: e.target.checked })}
                />
                좌우 반전
              </label>
              <label>
                그림 맞춤
                <select
                  aria-label="메뉴 그림 맞춤"
                  className="ml-2 min-h-11 bg-black p-2"
                  value={layout[device].fit}
                  onChange={(e) =>
                    patch({ fit: e.target.value as HomeArtPlacement["fit"] })
                  }
                >
                  <option value="contain">전체 보기</option>
                  <option value="cover">여백 없이 채우기</option>
                </select>
              </label>
              <button
                type="button"
                className="min-h-11 border px-3"
                onClick={() => patch(defaultHomeMenuLayout()[device])}
              >
                현재 화면 배치 초기화
              </button>
            </div>
            <p className="text-xs text-neutral-400">
              아래는 실제 홈과 같은 버튼입니다. PC·모바일 표본 크기로 미리
              봅니다. 변경 사항은 저장 후 적용됩니다.
            </p>
            <div className="overflow-x-auto border border-neutral-700 p-2">
              <div style={{ width: device === "mobile" ? 366 : 700 }}>
                <BattleModeButton
                  artwork={{ ...layout, imageUrl: image?.assetUrl ?? null }}
                  onClick={() =>
                    setMessage(
                      "버튼 미리보기입니다. 실제 홈에서는 대전 모드 선택창이 열립니다.",
                    )
                  }
                  previewDevice={device}
                />
              </div>
            </div>
            <AdminHomeBackground value={layout.background} onChange={background=>setLayout(x=>({...x,background}))}/>
            <button
              type="button"
              disabled={!dirty}
              className="min-h-11 border border-amber-600 bg-amber-950 px-5 disabled:opacity-40"
              onClick={() => void save()}
            >
              홈 메뉴 저장
            </button>
          </fieldset>
        </>
      )}
      {!loading && !saved && (
        <button
          type="button"
          className="min-h-11 border px-3"
          onClick={() => setReload((x) => x + 1)}
        >
          설정 다시 불러오기
        </button>
      )}
      {busy && (
        <div role="status">
          처리 중…{" "}
          <button
            type="button"
            className="min-h-11 border px-3"
            onClick={() => {
              request.current?.abort();
              setMessage(
                "응답 대기를 취소했습니다. 저장 요청은 반영됐을 수 있으니 다시 불러와 확인하세요.",
              );
            }}
          >
            응답 대기 취소
          </button>
        </div>
      )}
      {message && (
        <p role="status" className="text-amber-200">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-200">
          {error}
        </p>
      )}
    </section>
  );
}
