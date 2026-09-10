export type GameMediaType = "BACKGROUND" | "BGM";

export type GameMediaItem = {
  id: string;
  mediaType: GameMediaType;
  name: string;
  assetUrl: string;
  width: number | null;
  height: number | null;
  volume: number;
};

export type GameMediaCatalog = {
  backgrounds: GameMediaItem[];
  bgms: GameMediaItem[];
};

export const emptyGameMediaCatalog: GameMediaCatalog = {
  backgrounds: [],
  bgms: [],
};

export async function fetchGameMedia(): Promise<GameMediaCatalog> {
  const apiBase = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
  const response = await fetch(`${apiBase}/game-media`);
  if (!response.ok) return emptyGameMediaCatalog;

  const body = (await response.json()) as { media?: GameMediaItem[] };
  const media = body.media ?? [];
  return {
    backgrounds: media.filter((item) => item.mediaType === "BACKGROUND"),
    bgms: media.filter((item) => item.mediaType === "BGM"),
  };
}