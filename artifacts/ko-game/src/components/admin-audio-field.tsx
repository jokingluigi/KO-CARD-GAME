import { useEffect, useRef, useState } from "react";
import { Music2, Square, Trash2, Upload } from "lucide-react";
import { audioManager } from "../audio/audio-manager";

type AudioValue = {
  assetId: string | null;
  url: string | null;
  volume: number;
  enabled: boolean;
  uploadToken: string | null;
  fileName: string | null;
};

type Props = {
  title: string;
  value: AudioValue;
  onChange: (value: AudioValue) => void;
  onError: (message: string) => void;
  onMessage: (message: string) => void;
};

const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/admin`;
const audioAccept = ".mp3,.ogg,.wav,audio/mpeg,audio/ogg,audio/wav,audio/x-wav";

async function readMessage(response: Response) {
  try {
    return ((await response.json()) as { message?: string }).message ?? "요청을 처리하지 못했습니다.";
  } catch {
    return "요청을 처리하지 못했습니다.";
  }
}

function isSupportedAudio(file: File) {
  const extension = file.name.toLowerCase().split(".").pop();
  return extension === "mp3" || extension === "ogg" || extension === "wav";
}

export function AdminAudioField({ title, value, onChange, onError, onMessage }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef(value);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  valueRef.current = value;

  useEffect(() => () => {
    if (localUrl?.startsWith("blob:")) URL.revokeObjectURL(localUrl);
  }, [localUrl]);

  useEffect(() => () => {
    audioManager.stop();
    const current = valueRef.current;
    if (current.assetId && current.uploadToken) {
      void fetch(`${apiBase}/audio/discard`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioAssetId: current.assetId, audioUploadToken: current.uploadToken }),
      });
    }
  }, []);

  async function discardPending() {
    if (!value.assetId || !value.uploadToken) return;
    await fetch(`${apiBase}/audio/discard`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audioAssetId: value.assetId, audioUploadToken: value.uploadToken }),
    });
  }

  async function upload(file: File) {
    if (!isSupportedAudio(file)) {
      onError("MP3, OGG, WAV 오디오 파일만 선택할 수 있습니다.");
      return;
    }
    audioManager.stop();
    await discardPending();
    if (localUrl?.startsWith("blob:")) URL.revokeObjectURL(localUrl);
    setLocalUrl(URL.createObjectURL(file));
    setUploading(true);
    onError("");
    try {
      const formData = new FormData();
      formData.append("file", file, file.name);
      const requestResponse = await fetch(`${apiBase}/audio/upload`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!requestResponse.ok) throw new Error(await readMessage(requestResponse));
      const asset = await requestResponse.json() as {
        audioAssetId: string; audioUrl: string; audioUploadToken: string; audioFileName: string;
      };
      onChange({
        ...value,
        assetId: asset.audioAssetId,
        url: asset.audioUrl,
        uploadToken: asset.audioUploadToken,
        fileName: asset.audioFileName,
        enabled: true,
      });
      onMessage(`${title}을 업로드했습니다. 저장하면 적용됩니다.`);
    } catch (reason) {
      if (localUrl?.startsWith("blob:")) URL.revokeObjectURL(localUrl);
      setLocalUrl(null);
      onError(reason instanceof Error ? reason.message : `${title}을 업로드하지 못했습니다.`);
    } finally {
      setUploading(false);
    }
  }

  function remove() {
    audioManager.stop();
    void discardPending();
    if (localUrl?.startsWith("blob:")) URL.revokeObjectURL(localUrl);
    setLocalUrl(null);
    onChange({ assetId: null, url: null, volume: value.volume, enabled: false, uploadToken: null, fileName: null });
    onMessage(`${title}을 제거했습니다. 저장하면 적용됩니다.`);
    if (inputRef.current) inputRef.current.value = "";
  }

  const previewUrl = localUrl ?? value.url;
  const displayName = value.fileName ?? (value.url ? value.url.split("/").pop() : null);
  return (
    <div className="space-y-3 rounded border border-neutral-800 bg-neutral-900/50 p-3 md:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-bold text-neutral-300">{title}</div>
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          <input type="checkbox" checked={value.enabled} onChange={(event) => onChange({ ...value, enabled: event.target.checked })} />
          사용
        </label>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={audioAccept}
        className="hidden"
        onChange={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={uploading}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            inputRef.current?.click();
          }}
          className="flex items-center gap-2 rounded border border-neutral-700 px-3 py-2 text-xs font-bold hover:border-primary hover:text-primary disabled:opacity-40"
        >
          <Upload className="h-4 w-4" /> {uploading ? "업로드 중..." : previewUrl ? "음악 변경" : "음악 파일 업로드"}
        </button>
        {previewUrl && <button type="button" disabled={uploading} onClick={() => audioManager.preview(previewUrl, value.volume)} className="flex items-center gap-2 rounded border border-emerald-800 px-3 py-2 text-xs font-bold text-emerald-300 disabled:opacity-40"><Music2 className="h-4 w-4" /> 미리듣기</button>}
        {previewUrl && <button type="button" onClick={() => audioManager.stop()} className="flex items-center gap-2 rounded border border-neutral-700 px-3 py-2 text-xs font-bold"><Square className="h-3.5 w-3.5" /> 정지</button>}
        {previewUrl && <button type="button" disabled={uploading} onClick={remove} data-testid="button-remove-audio" className="flex items-center gap-2 rounded border border-red-900 px-3 py-2 text-xs font-bold text-red-400 disabled:opacity-40"><Trash2 className="h-4 w-4" /> 음악 제거</button>}
      </div>
      {displayName && <div className="truncate text-xs text-neutral-400" title={displayName}>파일: {displayName}</div>}
      <label className="block text-xs text-neutral-400">
        볼륨 <strong className="ml-2 text-neutral-200">{value.volume}%</strong>
        <input type="range" min="0" max="100" value={value.volume} onChange={(event) => onChange({ ...value, volume: Number(event.target.value) })} className="mt-2 w-full accent-primary" />
      </label>
    </div>
  );
}