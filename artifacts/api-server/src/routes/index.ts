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
import shopRouter from "./shop";
import adminShopRouter from "./admin-shop";
import prismRouter from "./prism";
import adminPrismRouter from "./admin-prism";
import adminCardSkinsRouter from "./admin-card-skins";
import testAuthRouter from "./test-auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(cardsRouter);
router.use(gameMediaRouter);
router.use("/admin", adminRouter);
router.use("/auth", authRouter);
router.use("/test-auth", testAuthRouter);
router.use("/decks", decksRouter);
router.use("/collection", collectionRouter);
router.use("/packs", packsRouter);
router.use("/admin/packs", adminPacksRouter);
router.use("/shop", shopRouter);
router.use("/admin/shop", adminShopRouter);
router.use("/prism", prismRouter);
router.use("/admin/prism", adminPrismRouter);
router.use("/admin/card-skins", adminCardSkinsRouter);

export default router;
