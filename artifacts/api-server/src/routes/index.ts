import { Router, type IRouter } from "express";
import healthRouter          from "./health";
import webhooksRouter        from "./webhooks";
import usersRouter           from "./users";
import proposalsRouter       from "./proposals";
import whatsappRouter        from "./whatsapp";
import whatsappWebhookRouter from "./whatsapp-webhook";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/webhooks", webhooksRouter);
router.use(usersRouter);
router.use(proposalsRouter);
router.use(whatsappRouter);
router.use(whatsappWebhookRouter);

export default router;
