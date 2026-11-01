import {parseHomeMenuLayout,parseHomeBackgroundPlacement,type HomeBackgroundPlacement,type HomeMenuArtwork} from "@workspace/cosmetics";
export type MainNotice = {
  id: string;
  title: string;
  body: string;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type MainContentMedia = {
  id: string;
  mediaType: "BACKGROUND" | "BGM";
  name: string;
  assetUrl: string;
  width: number | null;
  height: number | null;
  volume: number;
};

export type MainContent = {
  battleMenuArtwork?:HomeMenuArtwork|null;
  backgroundPlacement?:HomeBackgroundPlacement|null;
  notices: MainNotice[];
  background: MainContentMedia | null;
  bgm: MainContentMedia | null;
};

export const emptyMainContent: MainContent = {
  notices: [],
  background: null,
  bgm: null,
};

export async function fetchMainContent(): Promise<MainContent> {
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
  const response = await fetch(`${apiBase}/main-content`, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`메인 콘텐츠를 불러오지 못했습니다. (${response.status})`);
  }
  const body = await response.json() as Partial<MainContent>;
  return {
    battleMenuArtwork: parseHomeMenuLayout(body.battleMenuArtwork) && typeof body.battleMenuArtwork?.imageUrl === "string" ? body.battleMenuArtwork : null,
    backgroundPlacement: parseHomeBackgroundPlacement(body.backgroundPlacement),
    notices: Array.isArray(body.notices) ? body.notices : [],
    background: body.background ?? null,
    bgm: body.bgm ?? null,
  };
}