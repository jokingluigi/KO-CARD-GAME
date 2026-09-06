import { Router, type IRouter } from "express";
import adminRouter from "./admin";
import cardsRouter from "./cards";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(cardsRouter);
router.use("/admin", adminRouter);

export default router;
