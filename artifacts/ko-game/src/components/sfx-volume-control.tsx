import { useState } from "react";
import { audioManager } from "@/audio/audio-manager";
import { readStoredSfxVolume, SFX_VOLUME_STORAGE_KEY } from "@/audio/audio-settings";

export function SfxVolumeControl() {
  const [volume, setVolume] = useState(readStoredSfxVolume);
  function changeVolume(next: number) {
    setVolume(next);
    audioManager.setSfxVolume(next);
    try { window.localStorage.setItem(SFX_VOLUME_STORAGE_KEY, String(next)); } catch { /* Storage may be unavailable. */ }
  }
  return <label className="block text-xs font-bold text-neutral-300">
    <span className="flex items-center justify-between gap-3"><span>효과음 볼륨</span><span className="text-amber-300">{volume}%</span></span>
    <input type="range" min="0" max="100" step="1" value={volume}
      onChange={(event) => changeVolume(Number(event.target.value))}
      className="mt-2 w-full accent-amber-400" aria-label="효과음 볼륨" />
  </label>;
}
