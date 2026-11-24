/**
 * 축하 꽃가루. canvas-confetti (ISC 라이선스) 사용.
 * 필요할 때만 불러와서 처음 화면을 무겁게 하지 않는다.
 */
import { prefersReducedMotion } from "@/components/presentation-config";

const COLORS: Record<string, string[]> = {
  legendary: ["#ffd978", "#f3c14a", "#fff3c4", "#c9922a"],
  champion: ["#ff9a7a", "#ffd978", "#fff0e0", "#e0563a"],
  boss: ["#ffd978", "#ffffff", "#e0b75a", "#ff6a4a"],
};

export async function celebrate(kind: keyof typeof COLORS = "legendary") {
  if (typeof window === "undefined" || prefersReducedMotion()) return;
  try {
    const { default: confetti } = await import("canvas-confetti");
    const colors = COLORS[kind] ?? COLORS.legendary;
    const base = { colors, zIndex: 10000, disableForReducedMotion: true, ticks: 220, scalar: 0.95 };
    confetti({ ...base, particleCount: 90, spread: 75, startVelocity: 48, origin: { x: 0.5, y: 0.55 } });
    window.setTimeout(() => {
      confetti({ ...base, particleCount: 45, angle: 60, spread: 60, origin: { x: 0, y: 0.7 } });
      confetti({ ...base, particleCount: 45, angle: 120, spread: 60, origin: { x: 1, y: 0.7 } });
    }, 220);
  } catch {
    /* 꽃가루는 꾸밈일 뿐이라 실패해도 무시 */
  }
}
