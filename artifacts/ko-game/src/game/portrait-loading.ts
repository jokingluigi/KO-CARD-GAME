/** Shared, bounded portrait requests: retries never permanently blacklist a URL. */
const loaded = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();
export function cachedPortrait(url: string | null | undefined) { return url ? loaded.get(url) : undefined; }
export function loadPortrait(url: string, timeoutMs = 8000): Promise<string | null> {
 if (loaded.has(url)) return Promise.resolve(loaded.get(url)!);
 if (pending.has(url)) return pending.get(url)!;
 if (typeof Image === 'undefined') return Promise.resolve(null);
 const request = new Promise<string | null>(resolve => {
  let image: HTMLImageElement | null = null, attempt = 0, finished = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const finish = (src: string | null) => {
   if (finished) return; finished = true; clearTimeout(deadline); clearTimeout(retry);
   if (image) { image.onload = null; image.onerror = null; }
   if (src) { loaded.set(url, src); if (loaded.size > 24) loaded.delete(loaded.keys().next().value!); }
   resolve(src);
  };
  const deadline = setTimeout(() => finish(null), timeoutMs);
  const start = () => {
   if (finished) return;
   const src = attempt === 0 ? url : `${url}${url.includes('?') ? '&' : '?'}ko_portrait_retry=${attempt}`;
   image = new Image(); image.decoding = 'async'; image.fetchPriority = 'high';
   image.onload = () => finish(image!.naturalWidth > 0 ? src : null);
   image.onerror = () => { if (++attempt < 3) retry = setTimeout(start, attempt * 250); else finish(null); };
   image.src = src;
   if (image.complete && image.naturalWidth) finish(src);
  };
  start();
 });
 pending.set(url, request);
 void request.finally(() => { if (pending.get(url) === request) pending.delete(url); });
 return request;
}
