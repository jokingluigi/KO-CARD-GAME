import { useState, useEffect } from "react";
import {
  SPRITE_EVENTS,
  selectSpriteFrame,
  reactSprite,
  defaultSpritePlacement,
  type BattleSprite,
  type SpriteFrame,
} from "@workspace/cosmetics";
import { cosmeticsRequest } from "@/lib/cosmetics-client";
export function BattleSpriteEditor({
  value,
  onChange: save,
}: {
  value?: BattleSprite | null;
  onChange: (value: BattleSprite) => void;
}) {
  const root = value ?? { version: 1 as const, frames: {}, reactions: {} };
  const [editing, setEditing] = useState<"NORMAL" | "AWAKENED">("NORMAL");
  const config =
    editing === "AWAKENED"
      ? (root.awakened ?? { version: 1 as const, frames: {}, reactions: {} })
      : root;
  const onChange = (input: BattleSprite) => {
    const next = {
      ...input,
      states: Object.fromEntries(
        Object.entries(input.states ?? {}).filter(
          ([, key]) => !!input.frames[key!],
        ),
      ),
      selfDamage:
        input.selfDamage && input.frames[input.selfDamage]
          ? input.selfDamage
          : undefined,
    };
    const result = editing === "AWAKENED" ? { ...root, awakened: next } : next;
    if (result.awakening === "REPLACE" && !result.awakened?.frames.default)
      result.awakening = "KEEP";
    save(result);
  };
  const [awake, setAwake] = useState(false),
    [low, setLow] = useState(false),
    [selfHit, setSelfHit] = useState(false);
  const [reaction, setReaction] = useState<{
    event: import("@workspace/cosmetics").SpriteEvent;
    until: number;
  }>({ event: "IDLE", until: 0 });
  useEffect(() => {
    if (!reaction.until) return;
    const timer = setTimeout(
      () => setReaction({ event: "IDLE", until: 0 }),
      Math.max(0, reaction.until - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [reaction]);

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
      className="my-4 min-w-0 space-y-3 border border-neutral-700 p-3 [&_select]:max-w-full [&_input[type=number]]:w-20"
      disabled={busy}
    >
      <legend>현재 외형 스킨의 대전 스프라이트</legend><p className="text-xs">이 설정은 현재 편집 중인 스킨에만 저장됩니다. 챔피언 편집 화면은 기본 외형 스킨입니다. 다른 스킨의 표정이나 각성 세트를 가져오지 않습니다.</p>
      <p className="text-xs">
        주요 아군: 레전더리 또는 설정 코스트 이상. 큰 피해: 출처가 확인된 아군
        효과가 상대 챔피언에게 실제로 적용한 피해량. 자해: sourcePlayerId가
        자신인 피해.
      </p>
      <label>
        편집 세트
        <select
          value={editing}
          onChange={(e) => {
            setEditing(e.target.value as typeof editing);
            setExpression("default");
          }}
        >
          <option value="NORMAL">일반</option>
          <option value="AWAKENED">각성</option>
        </select>
      </label>
      <label>
        각성 외형
        <select
          value={root.awakening ?? "KEEP"}
          onChange={(e) =>
            save({ ...root, awakening: e.target.value as "KEEP" | "REPLACE" })
          }
        >
          <option value="KEEP">기존 세트 유지</option>
          <option value="REPLACE" disabled={!root.awakened?.frames.default}>
            전용 세트 교체 (각성 기본 등록 필요)
          </option>
        </select>
      </label>
      {(["lowHealth", "bigDamage", "majorCost"] as const).map((key) => (
        <label className="block" key={key}>
          {key === "lowHealth"
            ? "저체력 HP 이하"
            : key === "bigDamage"
              ? "큰 피해 최소 적용량"
              : "주요 아군 최소 코스트"}
          <input
            type="number"
            min={0}
            max={999}
            value={root[key] ?? (key === "bigDamage" ? 6 : 5)}
            onChange={(e) => save({ ...root, [key]: Number(e.target.value) })}
          />
        </label>
      ))}
      <div className="border p-2">
        <strong>실제 선택 로직 미리보기</strong>
        <label>
          <input
            type="checkbox"
            checked={awake}
            onChange={(e) => setAwake(e.target.checked)}
          />
          각성
        </label>
        <label>
          <input
            type="checkbox"
            checked={low}
            onChange={(e) => setLow(e.target.checked)}
          />
          저체력
        </label>
        <label>
          <input
            type="checkbox"
            checked={selfHit}
            onChange={(e) => setSelfHit(e.target.checked)}
          />
          자해 원인
        </label>
        <div className="h-40 overflow-hidden">
          {(() => {
            const f = selectSpriteFrame(root, {
              awakened: awake,
              low,
              outcome:
                reaction.event === "VICTORY" || reaction.event === "DEFEAT"
                  ? reaction.event
                  : undefined,
              reaction: reaction.event,
              selfDamage: selfHit,
            });
            return f ? (
              <img
                alt="상태·반응 미리보기"
                src={f.url}
                className="h-full w-full"
                style={{
                  objectFit: f[side].crop ? "cover" : "contain",
                  objectPosition: `${f[side].x}% ${f[side].y}%`,
                  transform: `scale(${f[side].scale}) scaleX(${f[side].flip ? -1 : 1})`,
                }}
              />
            ) : (
              <span>등록된 기본 이미지 없음</span>
            );
          })()}
        </div>
        {SPRITE_EVENTS.filter((e) => e !== "IDLE").map((event) => (
          <button
            className="border p-1"
            key={event}
            type="button"
            onClick={() =>
              setReaction((c) => reactSprite(c, event, Date.now(), root))
            }
          >
            {event} 재생
          </button>
        ))}
        <button
          type="button"
          onClick={() => setReaction({ event: "IDLE", until: 0 })}
        >
          상태로 복귀
        </button>
      </div>
      {(["IDLE", "LOW", "VICTORY", "DEFEAT"] as const).map((state) => (
        <label key={state}>
          {state} 상태
          <select
            value={config.states?.[state] ?? ""}
            onChange={(e) => {
              const states = { ...config.states };
              if (e.target.value) states[state] = e.target.value;
              else delete states[state];
              onChange({ ...config, states });
            }}
          >
            <option value="">기본 이미지</option>
            {Object.keys(config.frames).map((key) => (
              <option key={key}>{key}</option>
            ))}
          </select>
        </label>
      ))}
      <label>
        자기 효과 피해 표정
        <select
          value={config.selfDamage ?? ""}
          onChange={(e) =>
            onChange({ ...config, selfDamage: e.target.value || undefined })
          }
        >
          <option value="">기본 피격 반응</option>
          {Object.keys(config.frames).map((key) => (
            <option key={key}>{key}</option>
          ))}
        </select>
      </label>
      {SPRITE_EVENTS.filter(
        (e) => !["IDLE", "VICTORY", "DEFEAT"].includes(e),
      ).map((event) => (
        <label className="block text-xs" key={event}>
          <input
            type="checkbox"
            checked={!root.disabled?.includes(event)}
            onChange={(e) =>
              save({
                ...root,
                disabled: e.target.checked
                  ? root.disabled?.filter((x) => x !== event)
                  : [...(root.disabled ?? []), event],
              })
            }
          />
          {event} 사용 · 유지(ms)
          <input
            type="number"
            min={100}
            max={3000}
            value={
              root.timing?.[event] ??
              (event === "HIT"
                ? 600
                : event === "HEAL"
                  ? 700
                  : event === "ABILITY"
                    ? 900
                    : event === "AWAKEN"
                      ? 1500
                      : 800)
            }
            onChange={(e) =>
              save({
                ...root,
                timing: { ...root.timing, [event]: Number(e.target.value) },
              })
            }
          />
        </label>
      ))}

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
