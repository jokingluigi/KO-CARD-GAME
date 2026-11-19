/** Standard media fragments persist a start offset without changing the uploaded file. */
export const MAX_AUDIO_START_SECONDS = 86_400;
export function validAudioStartSeconds(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_AUDIO_START_SECONDS
  );
}
export function audioStartSeconds(url?: string | null): number {
  const fragment = url?.split("#")[1];
  const value = fragment?.match(/^t=(\d+(?:\.\d+)?)$/)?.[1];
  const seconds = value === undefined ? 0 : Number(value);
  return validAudioStartSeconds(seconds) ? seconds : 0;
}
export function validAudioStartUrl(url?: string | null): boolean {
  if (!url?.includes("#")) return true;
  const fragment = url.split("#")[1];
  return (
    /^t=\d+(?:\.\d+)?$/.test(fragment ?? "") &&
    validAudioStartSeconds(Number(fragment.slice(2))) &&
    url.split("#").length === 2
  );
}
export function audioFileUrl(url: string): string {
  return url.split("#")[0];
}
export function withAudioStart(url: string, seconds: number): string {
  const start = validAudioStartSeconds(seconds)
    ? Math.round(seconds * 1000) / 1000
    : 0;
  return audioFileUrl(url) + (start > 0 ? `#t=${start}` : "");
}
