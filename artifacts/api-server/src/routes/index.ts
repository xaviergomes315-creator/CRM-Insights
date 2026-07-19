import { Router, type IRouter } from "express";
import healthRouter from "./health";
import webhooksRouter from "./webhooks";
import usersRouter from "./users";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/webhooks", webhooksRouter);
router.use(usersRouter);

export default router;
