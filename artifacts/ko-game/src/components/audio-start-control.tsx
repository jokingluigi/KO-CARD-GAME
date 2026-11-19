import { useEffect, useState } from "react";
import {
  audioFileUrl,
  audioStartSeconds,
  MAX_AUDIO_START_SECONDS,
  withAudioStart,
} from "../../../../lib/game-engine/src/audio-start";
import { audioManager } from "../audio/audio-manager";

export function AudioStartControl({
  url,
  onChange,
  label = "음악",
  disabled = false,
}: {
  url: string;
  onChange: (url: string) => void;
  label?: string;
  disabled?: boolean;
}) {
  const [duration, setDuration] = useState<number | null>(null);
  const fileUrl = audioFileUrl(url),
    start = audioStartSeconds(url);
  useEffect(() => {
    setDuration(null);
    const audio = new Audio();
    audio.preload = "metadata";
    const loaded = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0)
        setDuration(audio.duration);
    };
    audio.addEventListener("loadedmetadata", loaded);
    audio.src = fileUrl;
    return () => {
      audio.removeEventListener("loadedmetadata", loaded);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    };
  }, [fileUrl]);
  const maximum =
    duration === null
      ? MAX_AUDIO_START_SECONDS
      : Math.max(0, Math.floor((duration - 0.01) * 1000) / 1000);
  const change = (seconds: number) => {
    if (Number.isFinite(seconds))
      onChange(withAudioStart(url, Math.min(maximum, Math.max(0, seconds))));
  };
  return (
    <div className="space-y-2 rounded border border-neutral-700 p-3">
      <label className="flex flex-wrap items-center gap-2 text-sm">
        재생 시작 지점
        <input
          aria-label={`${label} 재생 시작 초`}
          disabled={disabled}
          type="number"
          min={0}
          max={maximum}
          step={0.001}
          value={start}
          onChange={(e) => change(e.target.value === "" ? 0 : e.target.valueAsNumber)}
          className="w-28 rounded border border-neutral-600 bg-neutral-950 px-2 py-2"
        />
        초
      </label>
      <input
        aria-label={`${label} 재생 시작 위치`}
        disabled={disabled}
        type="range"
        min={0}
        max={Math.max(start, duration === null ? 300 : maximum)}
        step={0.001}
        value={start}
        onChange={(e) => change(e.target.valueAsNumber)}
        className="min-h-8 w-full accent-primary"
      />
      <p className="text-xs text-neutral-400">
        {duration !== null
          ? `곡 길이 ${Math.floor(duration / 60)}분 ${(duration % 60).toFixed(1)}초 · `
          : ""}
        0초는 처음부터 재생합니다. 미리듣기로 확인한 뒤 저장해 주세요.
      </p>
      {duration !== null && start >= duration && (
        <p role="alert" className="text-xs text-amber-300">
          시작 지점이 곡 길이를 넘습니다. 곡이 끝나기 전으로 조절해 주세요.
        </p>
      )}
    </div>
  );
}

export function SavedAudioStartControl({
  url,
  volume,
  onSave,
  label,
}: {
  url: string;
  volume: number;
  onSave: (seconds: number) => Promise<void>;
  label: string;
}) {
  const [draft, setDraft] = useState(url),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  useEffect(() => setDraft(url), [url]);
  return (
    <div className="space-y-2">
      <AudioStartControl
        url={draft}
        onChange={setDraft}
        label={label}
        disabled={saving}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="min-h-10 rounded border px-3 text-xs"
          onClick={() => audioManager.previewBgm(draft, volume)}
        >
          이 위치에서 미리듣기
        </button>
        <button
          type="button"
          disabled={saving}
          className="min-h-10 rounded border border-primary px-3 text-xs"
          onClick={() => {
            setSaving(true);
            setError("");
            void onSave(audioStartSeconds(draft))
              .catch(() =>
                setError(
                  "시작 지점을 저장하지 못했습니다. 다시 시도해 주세요.",
                ),
              )
              .finally(() => setSaving(false));
          }}
        >
          {saving ? "저장 중…" : "시작 지점 저장"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
