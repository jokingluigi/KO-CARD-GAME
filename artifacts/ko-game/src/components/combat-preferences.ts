export type CombatPreferences = {
  quality: "LOW" | "MEDIUM" | "HIGH";
  intensity: "STANDARD" | "STRONG" | "EXTREME";
  reducedMotion: boolean;
  zoom: number;
  flash: number;
  spriteMotion: number;
  confirmEndTurn: boolean;
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
    };
  } catch {
    return { ...DEFAULT_COMBAT_PREFERENCES };
  }
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
