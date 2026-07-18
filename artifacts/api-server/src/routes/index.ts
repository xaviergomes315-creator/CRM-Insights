import { Router, type IRouter } from "express";
import healthRouter from "./health";
import webhooksRouter from "./webhooks";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/webhooks", webhooksRouter);

export default router;
