import { Router } from "express";
import { createTransaction, confirmPayment, adminCreatePackage, adminUpdatePackage, adminDeletePackage, listPackages, createZaloOrder, createZaloUpgradeOrder, createZaloPostActivationOrder, zaloCallback, createZaloQuery, upgradeToPremium, getMySubscriptionHistory, getMyPaymentHistory } from "../controllers/subscriptionController";
import { authMiddleware, requireAdmin } from "../middlewares/authMiddleware";

const router = Router();

router.post("/create", authMiddleware, createTransaction);
router.post("/confirm", confirmPayment);

// ZaloPay endpoints (create order, callback, query)
router.post("/zalo/create", authMiddleware, createZaloOrder);
router.post("/zalo/upgrade", authMiddleware, createZaloUpgradeOrder);
router.post("/zalo/post-activation", authMiddleware, createZaloPostActivationOrder);
router.post("/zalo/callback", zaloCallback);
router.post("/zalo/query", authMiddleware, createZaloQuery);

// Subscription history
router.get("/history", authMiddleware, getMySubscriptionHistory);
router.get("/payment-history", authMiddleware, getMyPaymentHistory);

// Upgrade subscription: basic -> premium (carry over remaining time)
//router.post("/upgrade-to-premium", authMiddleware, upgradeToPremium);

// admin package management
router.get("/packages", authMiddleware, listPackages);
router.post("/packages", authMiddleware, requireAdmin, adminCreatePackage);
router.put("/packages/:id", authMiddleware, requireAdmin, adminUpdatePackage);
router.delete("/packages/:id", authMiddleware, requireAdmin, adminDeletePackage);

export default router;
