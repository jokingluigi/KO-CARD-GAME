export type MusicContext = "NON_BATTLE" | "BATTLE";

export function musicContextForPath(pathname: string): MusicContext {
  return pathname === "/ai-match" || pathname === "/tower" || pathname.startsWith("/online/match/") || pathname.startsWith("/admin/draft/match/")
    ? "BATTLE"
    : "NON_BATTLE";
}

export function shouldLoadMainBgm(pathname: string): boolean {
  return musicContextForPath(pathname) === "NON_BATTLE";
}