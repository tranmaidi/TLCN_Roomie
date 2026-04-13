// @ts-ignore
import cron from "node-cron";
import Subscription from "../models/Subscription";
import Notification from "../models/Notification";
import Post from "../models/Post";

// Runs every day at 01:00 AM server time
export default function startSubscriptionCron() {
  cron.schedule("0 1 * * *", async () => {
    try {
      console.log("[cron] running subscription expiry job");

      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      // 1) notify subscriptions that will expire within 24h
      const willExpire = await Subscription.find({
        status: "active",
        expiryAt: { $lte: tomorrow, $gt: now },
      });

      for (const s of willExpire) {
        const expiryStr = s.expiryAt ? (s.expiryAt as Date).toISOString() : "";
        await Notification.create({
          user: (s as any).user,
          title: "Gói ưu tiên sắp hết hạn",
          body: `Gói của bạn sẽ hết hạn vào ${expiryStr}`,
        });
      }

      // 2) expire subscriptions that passed expiryAt
      const expired = await Subscription.find({ status: "active", expiryAt: { $lte: now } });
      for (const s of expired) {
        s.status = "expired";
        await s.save();
        // reset user's posts priority
        await Post.updateMany({ owner: (s as any).user }, { $set: { priority_level: 0 }, $unset: { priority_expiry: "" } });
        await Notification.create({
          user: (s as any).user,
          title: "Gói ưu tiên đã hết hạn",
          body: `Gói ưu tiên của bạn đã hết hạn.`,
        });
      }

      console.log("[cron] subscription job finished");
    } catch (err) {
      console.error("[cron] error", err);
    }
  });
}
