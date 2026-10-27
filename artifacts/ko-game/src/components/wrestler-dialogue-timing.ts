/** Shared by queue expiry and its decorative entrance/exit animation. */
export function legendaryDialogueDuration(text: string): number {
  return text.length > 32 ? 2800 : 2200;
}
