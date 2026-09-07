import { Router, type IRouter } from "express";
import adminRouter from "./admin";
import cardsRouter from "./cards";
import healthRouter from "./health";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(cardsRouter);
router.use("/admin", adminRouter);

export default router;
