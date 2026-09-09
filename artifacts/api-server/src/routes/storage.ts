import { Router, type IRouter } from "express";
import { AudioStorage, CardImageStorage } from "../lib/object-storage";

const router: IRouter = Router();
const imageStorage = new CardImageStorage();
const audioStorage = new AudioStorage();

router.get(
  "/storage/objects/*path",
  async (request, response): Promise<void> => {
    const rawPath = request.params.path;
    const path = Array.isArray(rawPath) ? rawPath.join("/") : rawPath;
    const storage = path.startsWith("uploads/audio/") ? audioStorage : imageStorage;
    const assetLabel = path.startsWith("uploads/audio/") ? "오디오" : "이미지";
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