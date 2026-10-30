import { useState, useEffect, useRef } from "react";
import { ChampionPortraitFrame } from "./champion-portrait-frame";
import {
  ChampionSpriteVisual,
  useMotionExpression,
} from "./champion-sprite-visual";
import {
  type ChampionMotionCue,
  type ChampionMotionKind,
} from "./champion-sprite-motion";
import {
  CHAMPION_EMOTES,
  CHAMPION_EMOTE_LABELS,
} from "../game/champions/types";
import { normalizeImageDisplaySettings } from "../game/cards/types";
import {
  FINAL_SPRITE_EVENTS as SPRITE_EVENTS,
  SPRITE_EXPRESSIONS,
  spriteEventLabels,
  spriteDefaultTiming,
  spriteAwakeningDelay,
  finalSpriteSet,
  withSpriteFrame,
  selectSpriteFrame,
  reactSprite,
  defaultSpritePlacement,
  type BattleSprite,
  type SpriteFrame,
  type SpriteMotionSettings,
  SPRITE_MOTION_PRESETS,
} from "@workspace/cosmetics";
import { cosmeticsRequest } from "@/lib/cosmetics-client";
export function BattleSpriteEditor({
  value,
  onChange: save,
  workspace = false,
  onBusyChange,
  fallbackImage,
  inheritedMotion,
  championName = "챔피언 미리보기",
}: {
  championName?: string;
  fallbackImage?: string | null;
  inheritedMotion?: SpriteMotionSettings;
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
      emotes: input.emotes
        ? Object.fromEntries(
            Object.entries(input.emotes).filter(
              ([, key]) => key === null || Boolean(input.frames[key!]),
            ),
          )
        : undefined,
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
  const sequenceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(
    () => () => {
      if (sequenceTimer.current) clearTimeout(sequenceTimer.current);
    },
    [editing],
  );
  const [showOrigin, setShowOrigin] = useState(false);
  const [frameViewport, setFrameViewport] = useState("MOBILE");
  const [awake, setAwake] = useState(false),
    [health, setHealth] = useState(10);
  const low = health >= 1 && health <= 5;
  const [reaction, setReaction] = useState<{
    event: import("@workspace/cosmetics").SpriteEvent;
    until: number;
    cue?: ChampionMotionCue;
  }>({ event: "IDLE", until: 0 });
  function playMotion(
    kind: ChampionMotionKind,
    event: import("@workspace/cosmetics").SpriteEvent,
    extra: Partial<ChampionMotionCue> = {},
  ) {
    setPreviewMode("REACTION");
    if (event === "AWAKEN") setAwake(false);
    const current =
      awake && root.awakening === "REPLACE" ? root.awakened : root;
    if (
      kind === "EMOTE" &&
      current?.emotes?.[extra.emote as (typeof CHAMPION_EMOTES)[number]] ===
        null
    )
      return;
    setReaction((c) => {
      if (kind === "TURN") {
        if (c.until > Date.now()) return c;
        return {
          ...c,
          cue: { id: crypto.randomUUID(), kind, event, ...extra },
        };
      }
      const next = reactSprite(c, event, Date.now(), root);
      return next === c
        ? c
        : { ...next, cue: { id: crypto.randomUUID(), kind, event, ...extra } };
    });
  }
  useEffect(() => {
    if (reaction.cue?.kind !== "AWAKEN") return;
    const timer = setTimeout(() => setAwake(true), spriteAwakeningDelay(root));
    return () => clearTimeout(timer);
  }, [reaction.cue?.id]);
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
    [busy, setBusy] = useState(false),
    [uploadPhase,setUploadPhase]=useState("");
  const editableExpressions = Object.entries(SPRITE_EXPRESSIONS).filter(
    ([key]) => editing === "NORMAL" || key !== "awaken",
  );
  const frame = config.frames[expression];
  const put = (frame: SpriteFrame) =>
    onChange(withSpriteFrame(config, expression, frame));
  async function upload(file: File) {
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    setUploadPhase("업로드 주소 확인 중…");
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
      }, {timeoutMs:60000,label:"스프라이트 업로드 준비"});
      setUploadPhase("이미지 파일 전송 중…");
      const uploaded = await fetch(request.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
        signal: AbortSignal.timeout(120000),
      });
      if (!uploaded.ok) throw Error("업로드 실패");
      setUploadPhase("업로드 완료 · 이미지 검증 중…");
      const image = await cosmeticsRequest<{ imageUrl: string }>(
        "/admin/cosmetics/uploads/complete",
        {
          method: "POST",
          body: JSON.stringify({
            objectPath: request.objectPath,
            contentType: file.type,
          }),
        },
        {timeoutMs:60000,label:"스프라이트 이미지 검증"},
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
      setError(e instanceof Error&&["TimeoutError","AbortError"].includes(e.name)?"이미지 전송 응답이 지연됐어요. 기존 표정은 유지됩니다. 연결을 확인하고 이미지를 다시 선택해 주세요.":e instanceof Error ? e.message : "등록 실패");
    } finally {
      setBusy(false);
      setUploadPhase("");
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
  const effectivePreviewSet =
    awake && root.awakening === "REPLACE" ? root.awakened! : root;
  const previewMotion = {
    ...inheritedMotion,
    ...root.motion,
    ...effectivePreviewSet.motion,
  };
  const expressionEvent = useMotionExpression(
    reaction.event,
    reaction.cue,
    previewMotion,
  );
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
          reaction: expressionEvent,
          emote: reaction.cue?.emote,
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
      <label className="block my-2">
        액자 미리보기 화면
        <select
          aria-label="액자 미리보기 화면"
          value={frameViewport}
          onChange={(e) => setFrameViewport(e.target.value)}
        >
          <option value="MOBILE">모바일 · 390×844</option>
          <option value="PC">PC · 1440×900</option>
        </select>
      </label>
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
            playMotion("HEAL", "HEAL");
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
        <div
          className="ko-champion-arena ko-sprite-frame-preview"
          data-viewport={frameViewport}
        >
          <div
            className={
              side === "self" ? "ko-player-champion" : "ko-opponent-champion"
            }
          >
            <ChampionPortraitFrame
              name={championName}
              awakened={awake}
              health={health}
              maxHealth={20}
            />
            <div className="ko-portrait-window">
              {previewURL ? (
                <ChampionSpriteVisual
                  preview
                  cue={reaction.cue}
                  motion={previewMotion}
                  setIdentity={
                    awake && root.awakening === "REPLACE"
                      ? "awakened"
                      : "normal"
                  }
                  identity={editing}
                  self={side === "self"}
                  state={
                    reaction.event === "VICTORY" || reaction.event === "DEFEAT"
                      ? reaction.event
                      : low
                        ? "LOW"
                        : "IDLE"
                  }
                  reacting={reaction.event !== "IDLE"}
                  image={previewURL}
                  display={{
                    imageDisplayMode: previewPlacement.crop
                      ? "COVER"
                      : "CONTAIN",
                    imageScale: previewPlacement.scale,
                    imagePositionX: previewPlacement.x,
                    imagePositionY: previewPlacement.y,
                  }}
                  accent={previewSet.effects?.accent}
                  origin={previewSet.effects?.origin?.[side]}
                >
                  <div
                    className="ko-sprite-preview-figure"
                    style={{
                      transform: `scaleX(${previewPlacement.flip ? -1 : 1})`,
                    }}
                  >
                    <img
                      alt="상태·반응 미리보기"
                      src={previewURL}
                      onError={() =>
                        setFailedPreview((old) => new Set([...old, previewURL]))
                      }
                      className="h-full w-full"
                      style={{
                        objectFit: previewPlacement.crop ? "cover" : "contain",
                        objectPosition: `${previewPlacement.x}% ${previewPlacement.y}%`,
                        transform: `scale(${normalizeImageDisplaySettings({ imageScale: previewPlacement.scale }, 3).imageScale})`,
                        transformOrigin: `${previewPlacement.x}% ${previewPlacement.y}%`,
                      }}
                    />
                  </div>
                  {showOrigin && (
                    <span
                      className="ko-sprite-origin-marker"
                      style={{
                        left: `${previewSet.effects?.origin?.[side]?.x ?? (side === "self" ? 75 : 25)}%`,
                        top: `${previewSet.effects?.origin?.[side]?.y ?? 58}%`,
                      }}
                    >
                      ＋
                    </span>
                  )}
                </ChampionSpriteVisual>
              ) : (
                <p>기본 이미지를 등록하면 여기에 표시됩니다.</p>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="ko-sprite-reaction-buttons">
        {Object.entries(SPRITE_EXPRESSIONS).map(([key, label]) => (
          <button
            className="border p-2"
            type="button"
            key={key}
            data-expression={key}
            onClick={() => {
              setPreviewMode("REACTION");
              if (key === "default" || key === "low") {
                setHealth(key === "low" ? 5 : 10);
                setReaction({ event: "IDLE", until: 0 });
              } else {
                const event = (
                  {
                    attack: "ATTACK",
                    hurt: "HIT",
                    heavy_hurt: "HEAVY_HIT",
                    summon: "SUMMON",
                    surprised: "ALLY_RETIRED",
                    victory: "VICTORY",
                    defeat: "DEFEAT",
                    relief: "HEAL",
                    awaken: "AWAKEN",
                  } as const
                )[
                  key as Exclude<
                    keyof typeof SPRITE_EXPRESSIONS,
                    "default" | "low"
                  >
                ];
                playMotion(
                  (
                    {
                      ATTACK: "SPELL",
                      HIT: "HIT",
                      HEAVY_HIT: "HEAVY_HIT",
                      SUMMON: "SUMMON",
                      ALLY_RETIRED: "SURPRISED",
                      VICTORY: "VICTORY",
                      DEFEAT: "DEFEAT",
                      HEAL: "HEAL",
                      AWAKEN: "AWAKEN",
                    } as const
                  )[event],
                  event,
                );
              }
            }}
          >
            {label} 재생
          </button>
        ))}
        <button
          type="button"
          onClick={() => setReaction({ event: "IDLE", until: 0 })}
        >
          상태로 복귀
        </button>
      </div>
      <div
        className="ko-sprite-reaction-buttons"
        aria-label="상황별 움직임 미리보기"
      >
        {(
          [
            ["턴 시작", "TURN", "IDLE"],
            ["주문", "SPELL", "ATTACK"],
            ["선수 공격", "WRESTLER_ATTACK", "ATTACK"],
            ["고유능력", "ABILITY", "ATTACK"],
            ["일반 소환", "SUMMON", "SUMMON"],
            ["레전더리 소환", "LEGENDARY_SUMMON", "SUMMON"],
            ["각성 전환", "AWAKEN", "AWAKEN"],
          ] as const
        ).map(([label, kind, event]) => (
          <button
            type="button"
            key={kind}
            onClick={() => {
              playMotion(kind, event);
            }}
          >
            {label} 효과
          </button>
        ))}
        <button
          type="button"
          onClick={() =>
            playMotion("HIT", "HIT", { damage: 2, selfDamage: true })
          }
        >
          자해 효과
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
        기존 10표정에 선택 등록하는 각성 표정이 추가됩니다. 피격 1~4 · 강한 피격 5 이상 · 저체력 1~5.
        안도(회복)는 실제 체력이 증가했을 때입니다. 공격은 주문·고유능력 사용
        확정에 반응합니다. 놀람은 내 레전더리 선수의 리타이어·파괴·소멸, 상대의
        레전더리·챔피언 토큰 소환, 기본 6코스트 이상 선수 소환·주문 사용, 상대
        퀘스트 완료에 반응합니다. 일반 세트의 각성 표정은 퀘스트 완료 후 기본 표정을 대체합니다. 전용 각성 세트를 사용하면 1~2초 표시 후 해당 세트로 전환합니다. 누락
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
            기본(default)을 먼저 등록하세요. 표정이 없으면 같은 세트의 기본
            이미지로 표시됩니다. 내 위치는 원본 방향, 상대 위치는 좌우 반전으로
            자동 적용됩니다.
          </p>
          <label>
            표정
            <select
              aria-label="스프라이트 표정"
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              className="ml-2 bg-neutral-900 p-2"
            >
              {editableExpressions.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div
            className="grid grid-cols-2 gap-2 sm:grid-cols-5"
            role="group"
            aria-label={editing === "NORMAL" ? "등록할 표정 11개" : "등록할 표정 10개"}
          >
            {editableExpressions.map(([key, label]) => (
              <button
                type="button"
                key={key}
                aria-pressed={expression === key}
                className={`min-h-11 border p-2 text-left text-sm ${expression === key ? "border-amber-400 text-amber-200" : "border-neutral-700"}`}
                onClick={() => {
                  setExpression(key);
                  setPreviewMode("FRAME");
                }}
              >
                {label}
                <span className="ml-2 text-xs text-neutral-400">
                  {config.frames[key] ? "등록됨" : "미등록"}
                </span>
              </button>
            ))}
          </div>
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
          {busy&&<p role="status" aria-live="polite">{uploadPhase} 느린 연결에서는 잠시 걸릴 수 있어요.</p>}
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
                      objectFit: frame[side].crop ? "cover" : "contain",
                      objectPosition: `${frame[side].x}% ${frame[side].y}%`,
                      transform: `scale(${normalizeImageDisplaySettings({ imageScale: frame[side].scale }, 3).imageScale})`,
                      transformOrigin: `${frame[side].x}% ${frame[side].y}%`,
                    }}
                  />
                </div>
                <span className="absolute left-1/3 top-1/2 text-xs">
                  중앙 선수 필드
                </span>
              </div>
              <fieldset className="space-y-2 border border-amber-600/50 p-3">
                <legend className="px-1 font-bold">
                  이미지 크기 · {editing === "AWAKENED" ? "각성" : "일반"} /
                  현재 표정
                </legend>
                <p className="text-xs text-neutral-300">
                  액자 크기는 유지하고 이미지 자체를 확대·축소합니다. 선택한
                  스킨·세트·표정·위치에 저장됩니다.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    aria-label="스프라이트 10% 축소"
                    className="min-h-11 min-w-11 border border-neutral-600 px-2"
                    onClick={() =>
                      put({
                        ...frame,
                        [side]: {
                          ...frame[side],
                          scale: Math.max(
                            0.5,
                            Math.round((frame[side].scale - 0.1) * 100) / 100,
                          ),
                        },
                      })
                    }
                  >
                    −
                  </button>
                  <label>
                    크기 (%){" "}
                    <input
                      aria-label="스프라이트 크기 퍼센트"
                      className="w-20 border border-neutral-600 bg-neutral-950 p-2"
                      type="number"
                      min={50}
                      max={300}
                      step={5}
                      key={`${editing}:${expression}:${side}:${frame[side].scale}`}
                      defaultValue={Math.round(frame[side].scale * 100)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                      onBlur={(e) => {
                        if (
                          e.target.value !== "" &&
                          Number.isFinite(e.target.valueAsNumber)
                        )
                          put({
                            ...frame,
                            [side]: {
                              ...frame[side],
                              scale: Math.min(
                                3,
                                Math.max(0.5, e.target.valueAsNumber / 100),
                              ),
                            },
                          });
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    aria-label="스프라이트 10% 확대"
                    className="min-h-11 min-w-11 border border-neutral-600 px-2"
                    onClick={() =>
                      put({
                        ...frame,
                        [side]: {
                          ...frame[side],
                          scale: Math.min(
                            3,
                            Math.round((frame[side].scale + 0.1) * 100) / 100,
                          ),
                        },
                      })
                    }
                  >
                    ＋
                  </button>
                  <button
                    type="button"
                    className="min-h-11 border border-neutral-600 px-2"
                    onClick={() =>
                      put({ ...frame, [side]: { ...frame[side], scale: 1 } })
                    }
                  >
                    100% 초기화
                  </button>
                  <button
                    type="button"
                    className="min-h-11 border border-neutral-600 px-2"
                    onClick={() =>
                      put({
                        ...frame,
                        self: { ...frame.self, scale: frame[side].scale },
                        opponent: {
                          ...frame.opponent,
                          scale: frame[side].scale,
                        },
                      })
                    }
                  >
                    양쪽 위치에 배율 적용
                  </button>
                </div>
              </fieldset>
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
                    value={
                      key === "scale"
                        ? normalizeImageDisplaySettings(
                            {
                              imageScale: frame[side].scale,
                            },
                            3,
                          ).imageScale
                        : frame[side][key]
                    }
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
                  {key === "scale"
                    ? normalizeImageDisplaySettings(
                        {
                          imageScale: frame[side].scale,
                        },
                        3,
                      ).imageScale
                    : frame[side][key]}
                </label>
              ))}
              <label className="block">
                이미지 맞춤
                <select
                  aria-label="스프라이트 이미지 맞춤"
                  className="ml-2 bg-neutral-900 p-2"
                  value={frame[side].crop ? "cover" : "contain"}
                  onChange={(e) =>
                    put({
                      ...frame,
                      [side]: {
                        ...frame[side],
                        crop: e.target.value === "cover",
                      },
                    })
                  }
                >
                  <option value="contain">전체 보이기 · 비율 유지</option>
                  <option value="cover">
                    여백 없이 채우기 · 가장자리 잘림
                  </option>
                </select>
              </label>
              <p className="text-xs text-neutral-400">
                현재 표정·배치 위치별로 저장됩니다. 배율은 실제 대전과 같은 최대
                200%입니다. 채우기는 이미지 가장자리를 자르며, 어느 방식이든
                아치 밖으로 넘치지 않습니다.
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
          <details className="ko-sprite-motion-settings" open>
            <summary>현재 세트의 움직임 성격·강도</summary>
            <p className="text-xs text-neutral-400">
              미설정 항목은 챔피언 기본 → 선택 스킨 일반 → 현재 세트 순서로
              상속합니다. 그림만 움직이며 표정·판정은 바뀌지 않습니다.
            </p>
            <label>
              움직임 프리셋
              <select
                aria-label="움직임 프리셋"
                value={config.motion?.preset ?? "INHERIT"}
                onChange={(e) =>
                  onChange({
                    ...config,
                    motion: {
                      ...config.motion,
                      preset:
                        e.target.value === "INHERIT"
                          ? undefined
                          : (e.target
                              .value as keyof typeof SPRITE_MOTION_PRESETS),
                    },
                  })
                }
              >
                <option value="INHERIT">상속 (미설정 시 기본형)</option>
                {Object.entries(SPRITE_MOTION_PRESETS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {(
              [
                ["movement", "이동", 0, 1.5, 0.05],
                ["rotation", "회전", 0, 1.5, 0.05],
                ["scale", "확대", 0, 1.5, 0.05],
                ["speed", "속도", 0.5, 1.5, 0.05],
                ["rebound", "반동", 0, 1, 0.05],
                ["pivotX", "회전 기준 X", 0, 100, 1],
                ["pivotY", "회전 기준 Y", 0, 100, 1],
              ] as const
            ).map(([key, label, min, max, step]) => (
              <label key={key}>
                {label}
                <input
                  aria-label={`움직임 ${label}`}
                  type="number"
                  min={min}
                  max={max}
                  step={step}
                  placeholder="상속"
                  value={config.motion?.[key] ?? ""}
                  onChange={(e) => {
                    const n =
                      e.target.value === ""
                        ? undefined
                        : Number(e.target.value);
                    if (
                      n !== undefined &&
                      (!Number.isFinite(n) || n < min || n > max)
                    )
                      return;
                    onChange({
                      ...config,
                      motion: { ...config.motion, [key]: n },
                    });
                  }}
                />
              </label>
            ))}
            <button
              type="button"
              onClick={() => onChange({ ...config, motion: undefined })}
            >
              움직임 설정 상속으로 초기화
            </button>
            <button
              type="button"
              onClick={() => {
                playMotion("HIT", "HIT", { damage: 2 });
                if (sequenceTimer.current) clearTimeout(sequenceTimer.current);
                sequenceTimer.current = setTimeout(
                  () => playMotion("HEAVY_HIT", "HEAVY_HIT", { damage: 5 }),
                  100,
                );
              }}
            >
              피격 → 강한 피격 전환
            </button>
            <button
              type="button"
              onClick={() => {
                setHealth(4);
                playMotion("HEAL", "HEAL");
              }}
            >
              저체력에서 안도 후 복귀
            </button>
          </details>
          <details className="ko-sprite-effects-settings">
            <summary>현재 세트의 강조색·효과 출발점</summary>
            <label>
              강조색{" "}
              <input
                aria-label="스프라이트 효과 강조색"
                type="color"
                value={config.effects?.accent ?? "#b99a60"}
                onChange={(e) =>
                  onChange({
                    ...config,
                    effects: { ...config.effects, accent: e.target.value },
                  })
                }
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={showOrigin}
                onChange={(e) => setShowOrigin(e.target.checked)}
              />
              효과 출발점 표시
            </label>
            {(["x", "y"] as const).map((axis) => (
              <label key={axis} className="block">
                {side === "self" ? "내 위치" : "상대 위치"} 출발점 {axis}
                <input
                  aria-label={"스프라이트 출발점 " + axis}
                  type="range"
                  min={0}
                  max={100}
                  value={
                    config.effects?.origin?.[side]?.[axis] ??
                    (axis === "x" ? (side === "self" ? 75 : 25) : 58)
                  }
                  onChange={(e) =>
                    onChange({
                      ...config,
                      effects: {
                        ...config.effects,
                        origin: {
                          ...config.effects?.origin,
                          [side]: {
                            x:
                              config.effects?.origin?.[side]?.x ??
                              (side === "self" ? 75 : 25),
                            y: config.effects?.origin?.[side]?.y ?? 58,
                            [axis]: Number(e.target.value),
                          },
                        },
                      },
                    })
                  }
                />
              </label>
            ))}
          </details>
          <details className="ko-sprite-emote-settings">
            <summary>감정표현과 현재 세트의 표정 연결</summary>
            <p className="text-xs">
              등록한 기존 표정을 사용합니다. 약 1초 뒤 현재 기본·저체력으로 돌아오며
              전투 반응이 우선합니다.
            </p>
            {CHAMPION_EMOTES.map((emote) => (
              <div key={emote} className="flex flex-wrap gap-2 my-2">
                <label>
                  {CHAMPION_EMOTE_LABELS[emote]}{" "}
                  <select
                    aria-label={emote + " 감정표현 표정"}
                    disabled={!config.frames.default}
                    value={
                      config.emotes?.[emote] === null
                        ? "OFF"
                        : (config.emotes?.[emote] ?? "AUTO")
                    }
                    onChange={(e) => {
                      const emotes = { ...config.emotes };
                      if (e.target.value === "AUTO") delete emotes[emote];
                      else
                        emotes[emote] =
                          e.target.value === "OFF" ? null : e.target.value;
                      onChange({ ...config, emotes });
                    }}
                  >
                    <option value="AUTO">기본 연결</option>
                    <option value="OFF">반응 사용 안 함</option>
                    {Object.entries(SPRITE_EXPRESSIONS)
                      .filter(([key]) => config.frames[key])
                      .map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => playMotion("EMOTE", "EMOTE", { emote })}
                >
                  미리보기
                </button>
              </div>
            ))}
          </details>
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
                {event === "AWAKEN" ? "각성 표정·전환" : spriteEventLabels[event]} 사용 · 유지(ms)
                <input
                  type="number"
                  min={event === "AWAKEN" ? 1000 : 100}
                  max={event === "AWAKEN" ? 2000 : 3000}
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
              {SPRITE_EVENTS.filter(
                (event) => event !== "AWAKEN" && event !== "EMOTE",
              ).map((event) => (
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
              ))}
            </div>
          </details>
        </div>
      </div>
    </fieldset>
  );
}
