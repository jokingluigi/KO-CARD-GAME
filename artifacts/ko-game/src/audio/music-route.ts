export type MusicContext = "NON_BATTLE" | "BATTLE" | "SILENT";

export function musicContextForPath(pathname: string): MusicContext {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "SILENT";
  return pathname === "/ai-match" || pathname === "/tower" || pathname.startsWith("/online/match/") || pathname.startsWith("/draft/match/")
    ? "BATTLE"
    : "NON_BATTLE";
}

export function shouldLoadMainBgm(pathname: string): boolean {
  return musicContextForPath(pathname) === "NON_BATTLE";
}
