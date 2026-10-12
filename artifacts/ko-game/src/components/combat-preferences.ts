export type CombatPreferences = {
  intensity: "STANDARD" | "STRONG" | "EXTREME";
  reducedMotion: boolean;
};
export const COMBAT_PREFERENCES_KEY = "ko-combat-presentation-v1";
export const DEFAULT_COMBAT_PREFERENCES: CombatPreferences = {
  intensity: "STRONG",
  reducedMotion: false,
};
export function parseCombatPreferences(
  value: string | null,
): CombatPreferences {
  try {
    const p = JSON.parse(value ?? "{}");
    return {
      intensity: ["STANDARD", "STRONG", "EXTREME"].includes(p.intensity)
        ? p.intensity
        : "STRONG",
      reducedMotion: p.reducedMotion === true,
    };
  } catch {
    return { ...DEFAULT_COMBAT_PREFERENCES };
  }
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
