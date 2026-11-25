import { Router, type IRouter } from "express";
import {
  CosmeticImageStorage,
  ShopDeckImageStorage,
  AudioStorage,
  BackgroundImageStorage,
  CardImageStorage,
  GameAttackStorage,
  GameBgmStorage,
} from "../lib/object-storage";
import { acceptsWebp, deliverImage } from "../lib/image-delivery";
import { deliverCachedAudio } from "../lib/audio-cache";

const router: IRouter = Router();
const shopDeckStorage = new ShopDeckImageStorage();
const cosmeticStorage = new CosmeticImageStorage();
const imageStorage = new CardImageStorage();
const backgroundStorage = new BackgroundImageStorage();
const audioStorage = new AudioStorage();
const bgmStorage = new GameBgmStorage();
const attackStorage = new GameAttackStorage();

router.get(
  "/storage/objects/*path",
  async (request, response): Promise<void> => {
    const rawPath = request.params.path;
    const path = Array.isArray(rawPath) ? rawPath.join("/") : rawPath;
    const isAudio = path.startsWith("uploads/audio/");
    const isBgm = path.startsWith("uploads/game-bgm/");
    const isAttack = path.startsWith("uploads/game-attack/");
    const isBackground = path.startsWith("uploads/game-backgrounds/");
    const storage = path.startsWith("uploads/shop-decks/") ? shopDeckStorage : path.startsWith("uploads/cosmetics/") ? cosmeticStorage : isAudio
      ? audioStorage
      : isBgm
        ? bgmStorage
        : isAttack
          ? attackStorage
        : isBackground
          ? backgroundStorage
          : imageStorage;
    const assetLabel = isAudio || isBgm || isAttack ? "오디오" : "이미지";
    try {
      const objectPath = `/objects/${path}`;
      const isImageStorage = !(isAudio || isBgm || isAttack);
      // 그림은 화면에 맞게 줄인 WebP로 보내고, 서버 메모리에 보관해 Supabase에서 반복해서 내려받지 않는다.
      const found = isImageStorage && "download" in storage
        ? await deliverImage(objectPath, path.split("/")[1] ?? "", acceptsWebp(request.headers.accept),
            () => (storage as { download(p: string): Promise<{ buffer: Buffer; contentType: string | null } | null> }).download(objectPath), response)
        : await deliverAudio(objectPath, storage, response);
      if (!found) response.status(404).json({ message: `${assetLabel}를 찾을 수 없습니다.` });
    } catch (error) {
      request.log.error({ err: error }, "Failed to serve object asset");
      if (!response.headersSent) {
        response.status(500).json({ message: `${assetLabel}를 불러오지 못했습니다.` });
      }
    }
  },
);

/** 음악은 서버 디스크에 한 번 받아 두고 그다음부터는 서버에서 바로 보낸다. 문제가 생기면 예전처럼 바로 이어 보낸다. */
async function deliverAudio(
  objectPath: string,
  storage: { stream(p: string, r: import("express").Response): Promise<boolean>; download?(p: string): Promise<{ buffer: Buffer; contentType: string | null } | null> },
  response: import("express").Response,
): Promise<boolean> {
  if (storage.download) {
    try {
      const result = await deliverCachedAudio(objectPath, () => storage.download!(objectPath), response);
      if (result !== null) return result;
    } catch {
      if (response.headersSent) return true;
    }
  }
  return storage.stream(objectPath, response);
}

export default router;