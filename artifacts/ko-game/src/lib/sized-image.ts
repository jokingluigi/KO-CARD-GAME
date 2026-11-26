/**
 * 서버에 올린 그림(PNG·JPG)은 필요한 폭만큼 줄여서 받는다 (?w=폭).
 * 휴대폰에서 1400px 원본을 수십 장 풀어두면 메모리가 수백 MB가 되어 렉이 걸렸다.
 */
export const IMAGE_WIDTHS = [256, 384, 512, 640, 768, 1024] as const;
const RESIZABLE = /^(?:https?:\/\/[^/]+)?\/api\/storage\/objects\/uploads\/[^?#]+\.(?:png|jpe?g)$/i;

export function isResizableImage(url: string | null | undefined): url is string {
  return typeof url === "string" && RESIZABLE.test(url);
}

/** 원하는 폭보다 크거나 같은 단계로 올려서 요청 (가장 큰 단계보다 크면 원본) */
export function sizedImage<T extends string | null | undefined>(url: T, width: number): T {
  if (!isResizableImage(url)) return url;
  const w = IMAGE_WIDTHS.find((step) => step >= width);
  return (w ? `${url}?w=${w}` : url) as T;
}

/** <img srcset>: 브라우저가 화면 크기·선명도(DPR)를 보고 알맞은 걸 고른다 */
export function sizedSrcSet(url: string | null | undefined): string | undefined {
  if (!isResizableImage(url)) return undefined;
  return [...IMAGE_WIDTHS.map((w) => `${url}?w=${w} ${w}w`), `${url} 1400w`].join(", ");
}

/** 챔피언 스프라이트: 휴대폰은 640px, PC는 1024px이면 충분 */
export function spriteImageWidth() {
  if (typeof window === "undefined") return 1024;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  return window.innerWidth < 700 ? Math.min(640, Math.ceil(240 * dpr)) : Math.min(1024, Math.ceil(420 * dpr));
}
