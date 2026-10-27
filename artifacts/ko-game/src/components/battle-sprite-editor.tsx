import { useState } from "react";
import {
  SPRITE_EVENTS,
  defaultSpritePlacement,
  type BattleSprite,
  type SpriteFrame,
} from "@workspace/cosmetics";
import { cosmeticsRequest } from "@/lib/cosmetics-client";
export function BattleSpriteEditor({
  value,
  onChange,
}: {
  value?: BattleSprite | null;
  onChange: (value: BattleSprite) => void;
}) {
  const config = value ?? { version: 1 as const, frames: {}, reactions: {} };
  const [expression, setExpression] = useState("default"),
    [side, setSide] = useState<"self" | "opponent">("self"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const frame = config.frames[expression];
  const put = (frame: SpriteFrame) =>
    onChange({ ...config, frames: { ...config.frames, [expression]: frame } });
  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      if (
        !["image/png", "image/webp"].includes(file.type) ||
        file.size > 5 * 1024 * 1024
      )
        throw Error("PNG·WebP, 최대 5MB만 등록할 수 있습니다.");
      const request = await cosmeticsRequest<{
        uploadURL: string;
        objectPath: string;
      }>("/admin/cosmetics/uploads", {
        method: "POST",
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type,
        }),
      });
      const uploaded = await fetch(request.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
        signal: AbortSignal.timeout(30000),
      });
      if (!uploaded.ok) throw Error("업로드 실패");
      const image = await cosmeticsRequest<{ imageUrl: string }>(
        "/admin/cosmetics/uploads/complete",
        {
          method: "POST",
          body: JSON.stringify({
            objectPath: request.objectPath,
            contentType: file.type,
          }),
        },
      );
      put({
        url: image.imageUrl,
        self: { ...(frame?.self ?? defaultSpritePlacement) },
        opponent: { ...(frame?.opponent ?? defaultSpritePlacement) },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "등록 실패");
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset
      className="my-4 space-y-3 border border-neutral-700 p-3"
      disabled={busy}
    >
      <legend>대전 대화용 스프라이트</legend>
      <p className="text-xs text-neutral-400">
        기본(default)을 먼저 등록하세요. 표정이 없으면 기본 이미지로 표시됩니다.
        반전은 위치별로 직접 선택합니다.
      </p>
      <label>
        표정
        <select
          aria-label="스프라이트 표정"
          value={expression}
          onChange={(e) => setExpression(e.target.value)}
          className="ml-2 bg-neutral-900 p-2"
        >
          {[
            "default",
            "summon",
            "attack",
            "hurt",
            "retire",
            "ability",
            "awakened",
            "victory",
            "defeat",
          ].map((key) => (
            <option key={key}>{key}</option>
          ))}
        </select>
      </label>
      <input
        aria-label="대전 스프라이트 업로드"
        type="file"
        accept="image/png,image/webp"
        disabled={expression !== "default" && !config.frames.default}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.currentTarget.value = "";
        }}
      />
      {error && <p role="alert">{error}</p>}
      {frame && (
        <>
          <label>
            미리보기 위치
            <select
              aria-label="스프라이트 배치 위치"
              className="ml-2 bg-neutral-900 p-2"
              value={side}
              onChange={(e) => setSide(e.target.value as typeof side)}
            >
              <option value="self">내 위치 · 좌측 하단</option>
              <option value="opponent">상대 위치 · 우측 상단</option>
            </select>
          </label>
          <div className="relative h-56 overflow-hidden border border-neutral-600 bg-neutral-950">
            <div
              className="absolute h-44 w-32 overflow-hidden"
              style={
                side === "self" ? { left: 0, bottom: 0 } : { right: 0, top: 0 }
              }
            >
              <img
                src={frame.url}
                alt="스프라이트 배치 미리보기"
                className="h-full w-full"
                style={{
                  objectFit: frame[side].crop ? "cover" : "contain",
                  objectPosition: `${frame[side].x}% ${frame[side].y}%`,
                  transform: `scale(${frame[side].scale}) scaleX(${frame[side].flip ? -1 : 1})`,
                  transformOrigin: `${frame[side].x}% ${frame[side].y}%`,
                }}
              />
            </div>
            <span className="absolute left-1/3 top-1/2 text-xs">
              중앙 선수 필드
            </span>
          </div>
          {(["scale", "x", "y"] as const).map((key) => (
            <label key={key} className="block">
              {key === "scale"
                ? "표시 배율"
                : key === "x"
                  ? "가로 기준점"
                  : "세로 기준점"}
              <input
                aria-label={"스프라이트 " + key}
                type="range"
                min={key === "scale" ? 0.5 : 0}
                max={key === "scale" ? 3 : 100}
                step={key === "scale" ? 0.05 : 1}
                value={frame[side][key]}
                onChange={(e) =>
                  put({
                    ...frame,
                    [side]: { ...frame[side], [key]: Number(e.target.value) },
                  })
                }
              />
              {frame[side][key]}
            </label>
          ))}
          {(["flip", "crop"] as const).map((key) => (
            <label key={key} className="mr-3">
              <input
                type="checkbox"
                checked={frame[side][key]}
                onChange={(e) =>
                  put({
                    ...frame,
                    [side]: { ...frame[side], [key]: e.target.checked },
                  })
                }
              />
              {key === "flip" ? "좌우 반전" : "영역 채우기 크롭"}
            </label>
          ))}
          <button
            type="button"
            className="border p-2"
            onClick={() => {
              const frames = { ...config.frames };
              delete frames[expression];
              onChange({
                ...config,
                frames: expression === "default" ? {} : frames,
                reactions:
                  expression === "default"
                    ? {}
                    : Object.fromEntries(
                        Object.entries(config.reactions).filter(
                          ([, v]) => v !== expression,
                        ),
                      ),
              });
            }}
          >
            {expression === "default"
              ? "전체 스프라이트 등록 해제"
              : "현재 표정 등록 해제"}
          </button>
        </>
      )}
      <div className="grid grid-cols-2 gap-2">
        {SPRITE_EVENTS.map((event) => (
          <label key={event} className="text-xs">
            {event}
            <select
              aria-label={event + " 표정 연결"}
              className="block w-full bg-neutral-900 p-2"
              value={config.reactions[event] ?? ""}
              onChange={(e) => {
                const reactions = { ...config.reactions };
                if (e.target.value) reactions[event] = e.target.value;
                else delete reactions[event];
                onChange({ ...config, reactions });
              }}
            >
              <option value="">기본 표정</option>
              {Object.keys(config.frames).map((key) => (
                <option key={key}>{key}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
