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
  /** 15. 색약 모드: 빨강·초록 대신 주황·파랑 */
  colorblind: boolean;
  /** 관중석·관중 소리·중계 자막 */
  audience: boolean;
  /** 사용자가 설정에서 화질을 직접 골랐는지 (안 골랐으면 기기에 맞춰 자동) */
  qualityChosen?: boolean;
};

/**
 * 기기에 맞는 기본 화질.
 * 휴대폰은 화면 선명도(DPR 2~3배) 때문에 같은 연출도 PC보다 몇 배 무겁다 → 중간,
 * 메모리·코어가 적은 휴대폰 → 낮음.
 */
export function deviceQuality(): CombatPreferences["quality"] {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "HIGH";
  try {
    const coarse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
    const short = Math.min(window.screen?.width ?? window.innerWidth, window.screen?.height ?? window.innerHeight);
    const phone = coarse && short < 820;
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    const cores = navigator.hardwareConcurrency;
    const lowEnd = (typeof memory === "number" && memory <= 4) || (typeof cores === "number" && cores > 0 && cores <= 4);
    if (phone) return lowEnd ? "LOW" : "MEDIUM";
    return lowEnd ? "MEDIUM" : "HIGH";
  } catch {
    return "HIGH";
  }
}
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
  colorblind: false,
  audience: true,
};
export function parseCombatPreferences(
  value: string | null,
): CombatPreferences {
  try {
    const p = JSON.parse(value ?? "{}");
    return {
      // 예전엔 기본값 HIGH가 그대로 저장됐으므로, HIGH는 직접 고른 경우에만 존중
      quality: ["LOW", "MEDIUM", "HIGH"].includes(p.quality) && (p.qualityChosen === true || p.quality !== "HIGH")
        ? p.quality
        : deviceQuality(),
      qualityChosen: p.qualityChosen === true,
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
      colorblind: p.colorblind === true,
      audience: p.audience !== false,
    };
  } catch {
    return { ...DEFAULT_COMBAT_PREFERENCES, quality: deviceQuality() };
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
