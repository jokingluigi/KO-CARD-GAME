import { useEffect, useState } from "react";
import {
  defaultHomeBackgroundPlacement,
  type HomeBackgroundPlacement,
} from "@workspace/cosmetics";
import { fetchMainContent } from "@/lib/main-content-client";
import { HomeBackgroundImage } from "./home-background-image";
export function AdminHomeBackground({
  value,
  onChange,
}: {
  value?: HomeBackgroundPlacement;
  onChange: (next: HomeBackgroundPlacement) => void;
}) {
  const [device, setDevice] = useState<"desktop" | "mobile">("mobile"),
    [url, setUrl] = useState<string | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void fetchMainContent()
      .then((v) => {
        if (active) setUrl(v.background?.assetUrl ?? null);
      })
      .catch(() => {
        if (active)
          setError(
            "대표 배경을 불러오지 못했습니다. 새로 진입해 다시 확인하세요.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const p = value ?? defaultHomeBackgroundPlacement();
  return (
    <section
      aria-label="대표 배경 위치"
      className="space-y-4 border-t border-neutral-700 pt-5"
    >
      <h3 className="text-lg font-bold">대표 배경 · PC/모바일 구도</h3>
      <p className="text-sm text-neutral-400">
        기존 대표 배경의 표시 위치만 바꿉니다. 원본 그림과 다른 화면의 배경은
        바뀌지 않습니다. 배경이 잘리는 방향에서 위치 조정이 적용됩니다. 조절 후 아래 ‘홈 메뉴 저장’을 눌러 주세요.
      </p>
      <label>
        배경 미리보기 화면{" "}
        <select
          aria-label="배경 미리보기 화면"
          className="min-h-11 bg-black p-2"
          value={device}
          onChange={(e) => setDevice(e.target.value as typeof device)}
        >
          <option value="mobile">모바일</option>
          <option value="desktop">PC</option>
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        {(["x", "y"] as const).map((axis) => (
          <label key={axis}>
            {axis === "x" ? "배경 가로 위치" : "배경 세로 위치"}{" "}
            <output>{p[device][axis]}%</output>
            <input
              aria-label={axis === "x" ? "배경 가로 위치" : "배경 세로 위치"}
              className="min-h-11 w-full"
              type="range"
              min={0}
              max={100}
              step={1}
              value={p[device][axis]}
              onChange={(e) =>
                onChange({
                  ...p,
                  [device]: { ...p[device], [axis]: Number(e.target.value) },
                })
              }
            />
          </label>
        ))}
      </div>
      <div
        className="relative mx-auto overflow-hidden rounded border border-neutral-700 bg-black"
        style={{
          width: device === "mobile" ? 260 : "100%",
          maxWidth: "100%",
          aspectRatio: device === "mobile" ? "390 / 844" : "1440 / 900",
        }}
      >
        {url ? (
          <HomeBackgroundImage url={url} placement={p} device={device} />
        ) : (
          <p className="p-4 text-sm">
            {loading
              ? "대표 배경 확인 중…"
              : error || "대표 배경이 등록되어 있지 않습니다."}
          </p>
        )}
        <span className="pointer-events-none absolute bottom-[25%] left-[4%] right-[4%] border border-amber-300/40 bg-black/60 p-3 text-sm text-amber-100">
          홈 메뉴가 겹치는 구도 확인
        </span>
      </div>
      <button
        type="button"
        className="min-h-11 border px-3"
        onClick={() => onChange({ ...p, [device]: { x: 50, y: 50 } })}
      >
        현재 화면 배경 위치 초기화
      </button>
    </section>
  );
}
