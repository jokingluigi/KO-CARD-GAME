import { useState, useRef, useEffect } from "react";
import {
  defaultSpritePlacement,
  type BattleSprite,
  type SpriteFrame,
} from "@workspace/cosmetics";
import { BattleSpriteEditor } from "./battle-sprite-editor";
import { TowerMusicEditor } from "./tower-music-editor";
import { cosmeticsRequest } from "@/lib/cosmetics-client";
type Entry = NonNullable<BattleSprite["finishers"]>[string];
/** Same sprite editor/upload endpoints; a branch edits only its own presentation. */
export function FinisherPresentationEditor({
  value,
  onChange,
  choices,
  onBusyChange,
  championName,
  fallbackImage,
  inheritedMotion,
}: {
  value: BattleSprite | null;
  onChange: (value: BattleSprite) => void;
  choices: { id: string; name: string }[];
  onBusyChange: (busy: boolean) => void;
  championName: string;
  fallbackImage?: string | null;
  inheritedMotion?: BattleSprite["motion"];
}) {
  const [branch, setBranch] = useState(""),
    [error, setError] = useState("");
  const jobs = useRef(new Set<string>()),
    upload = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      upload.current?.abort();
    },
    [],
  );
  const root = value ?? { version: 1 as const, frames: {}, reactions: {} },
    entry = root.finishers?.[branch] ?? {};
  const busy = (job: string, yes: boolean) => {
    yes ? jobs.current.add(job) : jobs.current.delete(job);
    onBusyChange(jobs.current.size > 0);
  };
  const latest = useRef(root);
  latest.current = root;
  const set = (patch: Partial<Entry>) => {
    const current = latest.current;
    onChange({
      ...current,
      finishers: {
        ...current.finishers,
        [branch]: { ...current.finishers?.[branch], ...patch },
      },
    });
  };
  async function portrait(file: File) {
    if (jobs.current.size) return;
    setError("");
    const controller = new AbortController();
    upload.current = controller;
    busy("portrait", true);
    try {
      if (
        !["image/png", "image/webp"].includes(file.type) ||
        !file.size ||
        file.size > 5 * 1024 * 1024
      )
        throw Error("투명 PNG·WebP, 최대 5MB를 사용하세요.");
      const request = await cosmeticsRequest<{
        uploadURL: string;
        objectPath: string;
      }>(
        "/admin/cosmetics/uploads",
        {
          method: "POST",
          signal: controller.signal,
          body: JSON.stringify({
            name: file.name,
            size: file.size,
            contentType: file.type,
          }),
        },
        { timeoutMs: 60000, label: "각성 프로필 업로드 준비" },
      );
      const response = await fetch(request.uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(120000),
        ]),
      });
      if (!response.ok) throw Error("이미지 전송 실패");
      const result = await cosmeticsRequest<{ imageUrl: string }>(
        "/admin/cosmetics/uploads/complete",
        {
          method: "POST",
          signal: controller.signal,
          body: JSON.stringify({
            objectPath: request.objectPath,
            contentType: file.type,
          }),
        },
        { timeoutMs: 60000, label: "각성 프로필 검증" },
      );
      if (!controller.signal.aborted)
        set({
          portrait: {
            url: result.imageUrl,
            self: { ...defaultSpritePlacement },
            opponent: { ...defaultSpritePlacement, flip: true },
          },
        });
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "이미지 업로드 실패");
    } finally {
      upload.current = null;
      busy("portrait", false);
    }
  }
  return (
    <section className="min-w-0 space-y-4">
      <label className="block text-amber-200">
        편집할 연출
        <select
          aria-label="편집할 피니셔 연출"
          className="mt-2 min-h-12 w-full rounded border border-neutral-700 bg-neutral-950 p-3"
          value={branch}
          onChange={(e) => {
            if (jobs.current.size) return;
            setBranch(e.target.value);
            setError("");
          }}
        >
          <option value="">공통 · 일반/각성 설정</option>
          {choices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · 선택지 전용 각성
            </option>
          ))}
        </select>
      </label>
      {!branch ? (
        <BattleSpriteEditor
          key="common"
          championName={championName}
          fallbackImage={fallbackImage}
          inheritedMotion={inheritedMotion}
          value={value}
          workspace
          onBusyChange={(yes) => busy("sprite", yes)}
          onChange={onChange}
        />
      ) : (
        <>
          <p className="text-sm text-neutral-300">
            이 선택지를 획득한 이후에만 적용됩니다. 미등록 항목은 현재 스킨의
            공통 설정을 사용합니다. 아래 기본 표정부터 등록하면 이 선택지의 각성
            세트로 사용합니다.
          </p>
          <TowerMusicEditor
            key={branch + ":music"}
            label="선택지 각성 음악"
            value={entry.music}
            onChange={(music) => set({ music })}
            onUploadingChange={(yes) => busy("music", yes)}
          />
          <fieldset className="space-y-3 rounded border border-neutral-700 p-3">
            <legend>선택지 각성 프로필</legend>
            <input
              aria-label="선택지 각성 프로필 이미지"
              type="file"
              accept="image/png,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void portrait(f);
              }}
            />
            {entry.portrait ? (
              <>
                <img
                  src={entry.portrait.url}
                  alt="선택지 각성 프로필 미리보기"
                  className="mx-auto max-h-56 max-w-full object-contain"
                />
                <button
                  type="button"
                  className="min-h-11 border px-3"
                  onClick={() => set({ portrait: undefined })}
                >
                  이 선택지 프로필 등록 해제
                </button>
              </>
            ) : (
              <p>현재 스킨의 공통 각성 프로필 사용</p>
            )}
          </fieldset>
          {error && <p role="alert">{error}</p>}
          <BattleSpriteEditor
            awakeningOnly
            key={branch}
            championName={
              championName +
              " · " +
              (choices.find((c) => c.id === branch)?.name ?? branch)
            }
            fallbackImage={entry.portrait?.url ?? fallbackImage}
            inheritedMotion={root.motion ?? inheritedMotion}
            value={entry.sprite ?? null}
            workspace
            onBusyChange={(yes) => busy("sprite", yes)}
            onChange={(sprite) => set({ sprite })}
          />
          <button
            type="button"
            className="min-h-11 border border-red-800 px-3 text-red-200"
            onClick={() => {
              const finishers = { ...root.finishers };
              delete finishers[branch];
              onChange({ ...root, finishers });
            }}
          >
            이 선택지의 전용 연출 모두 해제
          </button>
        </>
      )}
    </section>
  );
}
