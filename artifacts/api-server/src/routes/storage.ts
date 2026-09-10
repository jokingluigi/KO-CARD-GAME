import { Router, type IRouter } from "express";
import {
  AudioStorage,
  BackgroundImageStorage,
  CardImageStorage,
  GameBgmStorage,
} from "../lib/object-storage";

const router: IRouter = Router();
const imageStorage = new CardImageStorage();
const backgroundStorage = new BackgroundImageStorage();
const audioStorage = new AudioStorage();
const bgmStorage = new GameBgmStorage();

router.get(
  "/storage/objects/*path",
  async (request, response): Promise<void> => {
    const rawPath = request.params.path;
    const path = Array.isArray(rawPath) ? rawPath.join("/") : rawPath;
    const isAudio = path.startsWith("uploads/audio/");
    const isBgm = path.startsWith("uploads/game-bgm/");
    const isBackground = path.startsWith("uploads/game-backgrounds/");
    const storage = isAudio
      ? audioStorage
      : isBgm
        ? bgmStorage
        : isBackground
          ? backgroundStorage
          : imageStorage;
    const assetLabel = isAudio || isBgm ? "오디오" : "이미지";
    try {
      const found = await storage.stream(`/objects/${path}`, response);
      if (!found) response.status(404).json({ message: `${assetLabel}를 찾을 수 없습니다.` });
    } catch (error) {
      request.log.error({ err: error }, "Failed to serve object asset");
      if (!response.headersSent) {
        response.status(500).json({ message: `${assetLabel}를 불러오지 못했습니다.` });
      }
    }
  },
);

export default router;