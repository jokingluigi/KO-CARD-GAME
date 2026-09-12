import { Router, type IRouter } from "express";
import adminRouter from "./admin";
import cardsRouter from "./cards";
import gameMediaRouter from "./game-media";
import healthRouter from "./health";
import storageRouter from "./storage";
import authRouter from "./auth";
import decksRouter from "./decks";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(cardsRouter);
router.use(gameMediaRouter);
router.use("/admin", adminRouter);
router.use("/auth", authRouter);
router.use("/decks", decksRouter);

export default router;
