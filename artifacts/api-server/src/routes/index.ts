import { Router, type IRouter } from "express";
import adminRouter from "./admin";
import cardsRouter from "./cards";
import gameMediaRouter from "./game-media";
import healthRouter from "./health";
import storageRouter from "./storage";
import authRouter from "./auth";
import decksRouter from "./decks";
import collectionRouter from "./collection";
import adminPacksRouter from "./admin-packs";
import packsRouter from "./packs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(cardsRouter);
router.use(gameMediaRouter);
router.use("/admin", adminRouter);
router.use("/auth", authRouter);
router.use("/decks", decksRouter);
router.use("/collection", collectionRouter);
router.use("/packs", packsRouter);
router.use("/admin/packs", adminPacksRouter);

export default router;
