import { useState, useEffect } from "react";
import {
  FINAL_SPRITE_EVENTS as SPRITE_EVENTS,
  SPRITE_EXPRESSIONS,
  spriteEventLabels,
  spriteDefaultTiming,
  finalSpriteSet,
  withSpriteFrame,
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
  workspace = false,
  onBusyChange,
  fallbackImage,
}: {
  fallbackImage?: string | null;
  workspace?: boolean;
  onBusyChange?: (busy: boolean) => void;
  value?: BattleSprite | null;
  onChange: (value: BattleSprite) => void;
}) {
  const root = finalSpriteSet(
    value ?? { version: 1 as const, frames: {}, reactions: {} },
  );
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
    [health, setHealth] = useState(10);
  const low = health >= 1 && health <= 5;
  const [reaction, setReaction] = useState<{
    event: import("@workspace/cosmetics").SpriteEvent;
    until: number;
  }>({ event: "IDLE", until: 0 });
  useEffect(() => {
    if (
      !reaction.until ||
      reaction.event === "VICTORY" ||
      reaction.event === "DEFEAT"
    )
      return;
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
    onChange(withSpriteFrame(config, expression, frame));
  async function upload(file: File) {
    setBusy(true);
    onBusyChange?.(true);
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
        self: {
          ...(frame?.self ??
            config.frames.default?.self ??
            defaultSpritePlacement),
        },
        opponent: {
          ...(frame?.opponent ??
            config.frames.default?.opponent ??
            defaultSpritePlacement),
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "등록 실패");
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const change = () =>
      setFullscreen(
        Boolean(
          document.fullscreenElement?.classList.contains(
            "ko-sprite-reaction-preview",
          ),
        ),
      );
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);
  const [previewMode, setPreviewMode] = useState<"FRAME" | "REACTION">("FRAME");
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);
  const previewFrame =
    workspace && previewMode === "FRAME"
      ? frame
      : selectSpriteFrame(root, {
          awakened: awake,
          low,
          outcome:
            reaction.event === "VICTORY" || reaction.event === "DEFEAT"
              ? reaction.event
              : undefined,
          reaction: reaction.event,
        });
  const [failedPreview, setFailedPreview] = useState<Set<string>>(new Set());
  useEffect(
    () => setFailedPreview(new Set()),
    [value, editing, awake, fallbackImage],
  );
  const previewSet =
    workspace && previewMode === "FRAME"
      ? config
      : awake && root.awakening === "REPLACE"
        ? (root.awakened ?? root)
        : root;
  const previewCandidates = [previewFrame, previewSet.frames.default].filter(
    (f): f is SpriteFrame => Boolean(f),
  );
  const visiblePreviewFrame = previewCandidates.find(
    (f) => !failedPreview.has(f.url),
  );
  const previewURL =
    visiblePreviewFrame?.url ??
    (fallbackImage && !failedPreview.has(fallbackImage)
      ? fallbackImage
      : undefined);
  const previewPlacement = {
    ...(visiblePreviewFrame?.[side] ?? defaultSpritePlacement),
    flip: side === "opponent",
  };
  const reactionPreview = (
    <section
      className="ko-sprite-reaction-preview border p-3"
      aria-label="스프라이트 큰 미리보기"
    >
      <div className="ko-sprite-preview-heading">
        <strong>{workspace ? "큰 미리보기" : "실제 선택 로직 미리보기"}</strong>
        {workspace && (
          <button
            type="button"
            onClick={async (e) => {
              try {
                if (document.fullscreenElement) await document.exitFullscreen();
                else
                  await (
                    e.currentTarget.closest(
                      ".ko-sprite-reaction-preview",
                    ) as HTMLElement
                  )?.requestFullscreen?.();
              } catch {
                setError("브라우저에서 전체 화면을 열 수 없습니다.");
              }
            }}
          >
            {fullscreen ? "전체 화면 닫기" : "전체 화면"}
          </button>
        )}
      </div>
      {workspace && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={previewMode === "FRAME"}
            onClick={() => setPreviewMode("FRAME")}
          >
            배치 조정
          </button>
          <button
            type="button"
            aria-pressed={previewMode === "REACTION"}
            onClick={() => setPreviewMode("REACTION")}
          >
            상태·반응 확인
          </button>
          <select
            aria-label="큰 미리보기 위치"
            value={side}
            onChange={(e) => setSide(e.target.value as typeof side)}
          >
            <option value="self">내 위치 · 좌측 하단</option>
            <option value="opponent">상대 위치 · 우측 상단</option>
          </select>
        </div>
      )}
      <div className="flex flex-wrap gap-3 my-2">
        <label>
          <input
            type="checkbox"
            checked={awake}
            onChange={(e) => {
              setAwake(e.target.checked);
              if (workspace) setPreviewMode("REACTION");
            }}
          />
          각성
        </label>
        <label>
          챔피언 체력
          <input
            aria-label="미리보기 체력"
            type="number"
            min={0}
            max={99}
            value={health}
            onChange={(e) => {
              setHealth(Number(e.target.value));
              setPreviewMode("REACTION");
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setPreviewMode("REACTION");
            setHealth((h) => h + 2);
            setReaction((c) => reactSprite(c, "HEAL", Date.now(), root));
          }}
        >
          실제 회복 +2
        </button>
        <span>{low ? "저체력 (1~5)" : "기본 (6 이상)"}</span>
      </div>
      <div
        className="ko-sprite-preview-canvas h-40 overflow-hidden"
        data-side={side}
        data-reaction={reaction.event}
        data-state={
          reaction.event === "VICTORY" || reaction.event === "DEFEAT"
            ? reaction.event
            : low
              ? "LOW"
              : "IDLE"
        }
      >
        {previewURL ? (
          <div
            className="ko-sprite-preview-figure"
            style={{ transform: `scaleX(${side === "opponent" ? -1 : 1})` }}
          >
            <img
              alt="상태·반응 미리보기"
              src={previewURL}
              onError={() =>
                setFailedPreview((old) => new Set([...old, previewURL]))
              }
              className="h-full w-full"
              style={{
                objectFit: "contain",
                objectPosition: `${previewPlacement.x}% ${previewPlacement.y}%`,
                transform: `scale(${previewPlacement.scale})`,
                transformOrigin: `${previewPlacement.x}% ${previewPlacement.y}%`,
              }}
            />
          </div>
        ) : (
          <p>기본 이미지를 등록하면 여기에 표시됩니다.</p>
        )}
      </div>
      <div className="ko-sprite-reaction-buttons">
        {SPRITE_EVENTS.filter((e) => e !== "IDLE").map((event) => (
          <button
            className="border p-2"
            type="button"
            key={event}
            onClick={() => {
              if (workspace) setPreviewMode("REACTION");
              setReaction((c) => reactSprite(c, event, Date.now(), root));
            }}
          >
            {spriteEventLabels[event]} 재생
          </button>
        ))}
        <button
          type="button"
          onClick={() => setReaction({ event: "IDLE", until: 0 })}
        >
          상태로 복귀
        </button>
      </div>
      {workspace && (
        <p className="text-xs text-neutral-400">
          배치 조정은 편집 중인 표정, 상태·반응 확인은 실제 전투와 같은
          세트·표정 선택 규칙을 사용합니다. 이 화면은 배치 미리보기이며 실제
          대전은 아닙니다.
        </p>
      )}
    </section>
  );
  return (
    <fieldset
      className={`ko-sprite-editor my-4 min-w-0 space-y-3 border border-neutral-700 p-3 [&_select]:max-w-full [&_input[type=number]]:w-20 ${workspace ? "ko-sprite-editor--workspace" : ""}`}
      disabled={busy}
    >
      <legend>현재 외형 스킨의 대전 스프라이트</legend>
      <p className="text-xs">
        이 설정은 현재 편집 중인 스킨에만 저장됩니다. 챔피언 편집 화면은 기본
        외형 스킨입니다. 다른 스킨의 표정이나 각성 세트를 가져오지 않습니다.
      </p>
      <p className="text-xs">
        표정은 10개입니다. 약한 피격 1~4 · 강한 피격 5 이상 · 저체력 1~5. 회복은 실제 체력이 증가했을 때입니다. 공격은
        주문·고유능력 사용 확정, 놀람은 내 레전더리 선수의
        리타이어·파괴·소멸입니다. 각성은 별도 표정이 아닌 세트 전환입니다. 누락
        표정은 현재 세트의 기본 이미지를 사용합니다.
      </p>
      <div className="ko-sprite-editor-layout">
        {workspace && reactionPreview}
        <div className="ko-sprite-editor-controls space-y-3">
          <label>
            편집 세트
            <select
              aria-label="편집 세트"
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
              aria-label="각성 외형"
              value={root.awakening ?? "KEEP"}
              onChange={(e) =>
                save({
                  ...root,
                  awakening: e.target.value as "KEEP" | "REPLACE",
                })
              }
            >
              <option value="KEEP">기존 세트 유지</option>
              <option value="REPLACE" disabled={!root.awakened?.frames.default}>
                전용 세트 교체 (각성 기본 등록 필요)
              </option>
            </select>
          </label>
          <p className="text-xs text-neutral-400">
            기본(default)을 먼저 등록하세요. 표정이 없으면 기본 이미지로
            표시됩니다. 내 위치는 원본 방향, 상대 위치는 좌우 반전으로 자동
            적용·저장됩니다.
          </p>
          <label>
            표정
            <select
              aria-label="스프라이트 표정"
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              className="ml-2 bg-neutral-900 p-2"
            >
              {Object.entries(SPRITE_EXPRESSIONS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
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
              <div
                hidden={workspace}
                className="relative h-56 overflow-hidden border border-neutral-600 bg-neutral-950"
              >
                <div
                  className="absolute h-44 w-32 overflow-hidden"
                  style={{
                    ...(side === "self"
                      ? { left: 0, bottom: 0 }
                      : { right: 0, top: 0 }),
                    transform: `scaleX(${side === "opponent" ? -1 : 1})`,
                  }}
                >
                  <img
                    src={frame.url}
                    alt="스프라이트 배치 미리보기"
                    className="h-full w-full"
                    style={{
                      objectFit: "contain",
                      objectPosition: `${frame[side].x}% ${frame[side].y}%`,
                      transform: `scale(${frame[side].scale})`,
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
                        [side]: {
                          ...frame[side],
                          [key]: Number(e.target.value),
                        },
                      })
                    }
                  />
                  {frame[side][key]}
                </label>
              ))}
              <p className="text-xs text-neutral-400">
                비율 유지 자동 맞춤입니다. 배율·위치는 조절할 수 있으며 실제
                대전에서는 아치 밖이 잘립니다.
              </p>
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
          <details
            className="ko-sprite-advanced"
            open={!workspace || undefined}
          >
            <summary>상태·사건별 표정 연결과 반응 시간</summary>
            {!workspace && reactionPreview}
            {(["IDLE", "LOW", "VICTORY", "DEFEAT"] as const).map((state) => (
              <label key={state}>
                {state === "LOW" ? "저체력" : spriteEventLabels[state]} 상태
                <select
                  value={config.states?.[state] ?? ""}
                  onChange={(e) => {
                    const states = { ...config.states };
                    if (e.target.value || config.frames.default)
                      states[state] = e.target.value || "default";
                    else delete states[state];
                    onChange({ ...config, states });
                  }}
                >
                  <option value="">기본 이미지</option>
                  {Object.keys(config.frames).map((key) => (
                    <option key={key} value={key}>
                      {SPRITE_EXPRESSIONS[
                        key as keyof typeof SPRITE_EXPRESSIONS
                      ] ?? key}
                    </option>
                  ))}
                </select>
              </label>
            ))}
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
                {spriteEventLabels[event]} 사용 · 유지(ms)
                <input
                  type="number"
                  min={100}
                  max={3000}
                  value={
                    root.timing?.[event] ?? spriteDefaultTiming[event] ?? 800
                  }
                  onChange={(e) =>
                    save({
                      ...root,
                      timing: {
                        ...root.timing,
                        [event]: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
            ))}

            <div className="grid grid-cols-2 gap-2">
              {SPRITE_EVENTS.filter((event) => event !== "AWAKEN").map(
                (event) => (
                  <label key={event} className="text-xs">
                    {spriteEventLabels[event]}
                    <select
                      aria-label={event + " 표정 연결"}
                      className="block w-full bg-neutral-900 p-2"
                      value={config.reactions[event] ?? ""}
                      onChange={(e) => {
                        const reactions = { ...config.reactions };
                        if (e.target.value || config.frames.default)
                          reactions[event] = e.target.value || "default";
                        else delete reactions[event];
                        onChange({ ...config, reactions });
                      }}
                    >
                      <option value="">기본 표정</option>
                      {Object.keys(config.frames).map((key) => (
                        <option key={key} value={key}>
                          {SPRITE_EXPRESSIONS[
                            key as keyof typeof SPRITE_EXPRESSIONS
                          ] ?? key}
                        </option>
                      ))}
                    </select>
                  </label>
                ),
              )}
            </div>
          </details>
        </div>
      </div>
    </fieldset>
  );
}
