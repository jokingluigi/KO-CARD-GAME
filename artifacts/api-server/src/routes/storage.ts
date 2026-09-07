import { Router, type IRouter } from "express";
import { CardImageStorage } from "../lib/object-storage";

const router: IRouter = Router();
const imageStorage = new CardImageStorage();

router.get(
  "/storage/objects/*path",
  async (request, response): Promise<void> => {
    const rawPath = request.params.path;
    const path = Array.isArray(rawPath) ? rawPath.join("/") : rawPath;
    try {
      const found = await imageStorage.stream(`/objects/${path}`, response);
      if (!found) response.status(404).json({ message: "이미지를 찾을 수 없습니다." });
    } catch (error) {
      request.log.error({ err: error }, "Failed to serve card image");
      if (!response.headersSent) {
        response.status(500).json({ message: "이미지를 불러오지 못했습니다." });
      }
    }
  },
);

export default router;