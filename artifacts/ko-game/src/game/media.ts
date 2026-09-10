export type AttackSoundLevel =
  | "LIGHT_ATTACK"
  | "NORMAL_ATTACK"
  | "HEAVY_ATTACK"
  | "VERY_HEAVY_ATTACK";

export type GameMediaType = "BACKGROUND" | "BGM" | AttackSoundLevel;

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
  attackSounds: Partial<Record<AttackSoundLevel, GameMediaItem>>;
};

export const emptyGameMediaCatalog: GameMediaCatalog = {
  backgrounds: [],
  bgms: [],
  attackSounds: {},
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
    attackSounds: Object.fromEntries(
      media
        .filter((item): item is GameMediaItem & { mediaType: AttackSoundLevel } =>
          item.mediaType !== "BACKGROUND" &&
          item.mediaType !== "BGM",
        )
        .map((item) => [item.mediaType, item]),
    ),
  };
}