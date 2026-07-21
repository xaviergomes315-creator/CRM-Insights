import { Router, type IRouter } from "express";
import healthRouter             from "./health";
import webhooksRouter           from "./webhooks";
import usersRouter              from "./users";
import proposalsRouter          from "./proposals";
import whatsappRouter           from "./whatsapp";
import whatsappWebhookRouter    from "./whatsapp-webhook";
import whatsappQueueRouter      from "./whatsapp-queue";
import whatsappCampaignsRouter  from "./whatsapp-campaigns";
import aiRouter                 from "./ai";
import modulesRouter            from "./modules";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/webhooks", webhooksRouter);
router.use(usersRouter);
router.use(proposalsRouter);
router.use(whatsappRouter);
router.use(whatsappWebhookRouter);
router.use(whatsappQueueRouter);
router.use(whatsappCampaignsRouter);
router.use(aiRouter);
router.use(modulesRouter);

export default router;
