/** Explicit bundled cue classes. Uploaded asset names do not decide battle rules. */
export function impactAudioPriority(url: string): number {
  const file = url.split("/").at(-1)?.split(/[?#]/)[0] ?? "";
  if (["combat-finisher.wav", "impact-finisher.wav"].includes(file)) return 9;
  if (
    [
      "combat-hit-10-plus.wav",
      "contact-massive.wav",
      "impact-very-heavy.wav",
    ].includes(file)
  )
    return 8;
  if (
    ["combat-hit-6-9.wav", "contact-heavy.wav", "impact-heavy.wav"].includes(
      file,
    )
  )
    return 7;
  return 5;
}
