// Older clients stored mute as the initial preference; start everyone with
// music enabled once, while still persisting any new explicit choice.
export const BGM_MUTE_STORAGE_KEY = "ko-game-bgm-muted-v2";
export const BGM_VOLUME_STORAGE_KEY = "ko-game-bgm-volume";
export const SFX_VOLUME_STORAGE_KEY = "ko-game-sfx-volume";
export const ENTRANCE_VOLUME_STORAGE_KEY = "ko-game-entrance-volume";

export function parseStoredBgmMute(value: string | null): boolean {
  return value === "true";
}

export function parseStoredBgmVolume(value: string | null): number {
  if (value === null || value.trim() === "") return 100;
  const volume = Number(value);
  return Number.isFinite(volume) ? Math.min(100, Math.max(0, volume)) : 100;
}

export function readStoredBgmMute(): boolean {
  try {
    return typeof window !== "undefined" &&
      parseStoredBgmMute(window.localStorage.getItem(BGM_MUTE_STORAGE_KEY));
  } catch {
    return false;
  }
}

export function readStoredBgmVolume(): number {
  try {
    if (typeof window === "undefined") return 100;
    return parseStoredBgmVolume(window.localStorage.getItem(BGM_VOLUME_STORAGE_KEY));
  } catch {
    return 100;
  }
}

export function readStoredSfxVolume(): number {
  try {
    if (typeof window === "undefined") return 100;
    return parseStoredBgmVolume(window.localStorage.getItem(SFX_VOLUME_STORAGE_KEY));
  } catch {
    return 100;
  }
}

export function readStoredEntranceVolume(): number {
  try {
    if (typeof window === 'undefined') return 100;
    return parseStoredBgmVolume(window.localStorage.getItem(ENTRANCE_VOLUME_STORAGE_KEY));
  } catch { return 100; }
}
