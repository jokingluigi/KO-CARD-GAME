export type CombatPreferences = {
  quality: "LOW" | "MEDIUM" | "HIGH";
  intensity: "STANDARD" | "STRONG" | "EXTREME";
  reducedMotion: boolean;
  zoom: number;
  flash: number;
  spriteMotion: number;
  confirmEndTurn: boolean;
  quietBoard: boolean;
  detailTextScale: number;
  dialogueTextScale: number;
  highContrastTargets: boolean;
  visualEventCaptions: boolean;
};
export const COMBAT_PREFERENCES_KEY = "ko-combat-presentation-v1";
export const DEFAULT_COMBAT_PREFERENCES: CombatPreferences = {
  quality: "HIGH",
  intensity: "STRONG",
  reducedMotion: false,
  zoom: 1,
  flash: 1,
  spriteMotion: 1,
  confirmEndTurn: true,
  quietBoard: true,
  detailTextScale: 1,
  dialogueTextScale: 1,
  highContrastTargets: true,
  visualEventCaptions: true,
};
export function parseCombatPreferences(
  value: string | null,
): CombatPreferences {
  try {
    const p = JSON.parse(value ?? "{}");
    return {
      quality: ["LOW", "MEDIUM", "HIGH"].includes(p.quality)
        ? p.quality
        : "HIGH",
      intensity: ["STANDARD", "STRONG", "EXTREME"].includes(p.intensity)
        ? p.intensity
        : "STRONG",
      reducedMotion: p.reducedMotion === true,
      zoom: bounded(p.zoom),
      flash: bounded(p.flash),
      spriteMotion: bounded(p.spriteMotion),
      confirmEndTurn: p.confirmEndTurn !== false,
      quietBoard: p.quietBoard !== false,
      detailTextScale: textScale(p.detailTextScale),
      dialogueTextScale: textScale(p.dialogueTextScale),
      highContrastTargets: p.highContrastTargets !== false,
      visualEventCaptions: p.visualEventCaptions !== false,
    };
  } catch {
    return { ...DEFAULT_COMBAT_PREFERENCES };
  }
}
function textScale(value: unknown) {
  return value === 1.15 || value === 1.3 ? value : 1;
}
function bounded(v: unknown) {
  return typeof v === "number" && Number.isFinite(v)
    ? Math.max(0, Math.min(1, v))
    : 1;
}
let session: CombatPreferences | undefined;
export function readCombatPreferences(): CombatPreferences {
  if (session) return session;
  try {
    return parseCombatPreferences(
      window.localStorage.getItem(COMBAT_PREFERENCES_KEY),
    );
  } catch {
    return { ...DEFAULT_COMBAT_PREFERENCES };
  }
}
export function saveCombatPreferences(value: CombatPreferences) {
  session = value;
  try {
    window.localStorage.setItem(COMBAT_PREFERENCES_KEY, JSON.stringify(value));
  } catch {
    /* Session settings still work. */
  }
  window.dispatchEvent(
    new CustomEvent("ko-combat-preferences", { detail: value }),
  );
}
export function impactMultiplier(intensity: CombatPreferences["intensity"]) {
  return intensity === "STANDARD" ? 0.75 : intensity === "EXTREME" ? 1.22 : 1;
}
