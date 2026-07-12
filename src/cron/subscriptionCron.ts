// @ts-ignore
import cron from "node-cron";
import Subscription from "../models/Subscription";
import Notification from "../models/Notification";
import Post from "../models/Post";
import Package from "../models/Package";

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

        const userId = (s as any).user;
        // reset user's posts priority first, then re-apply if there is a queued subscription
        await Post.updateMany({ owner: userId }, { $set: { priority_level: 0 }, $unset: { priority_expiry: "" } });

        const nextPending = await Subscription.findOne({
          user: userId,
          status: "pending",
          startAt: { $lte: now },
        })
          .sort({ startAt: 1, createdAt: 1 });

        if (nextPending) {
          const nextPkg = await Package.findById(nextPending.package);
          nextPending.status = "active";
          nextPending.startAt = nextPending.startAt || now;
          await nextPending.save();

          if (nextPkg) {
            await Post.updateMany(
              { owner: userId },
              { $set: { priority_level: nextPkg.priority_level, priority_expiry: nextPending.expiryAt } }
            );
          }

          await Notification.create({
            user: userId,
            title: "Gói ưu tiên mới đã được kích hoạt",
            body: `Gói ${nextPkg?.name || "ưu tiên"} của bạn đã tự động bắt đầu sau khi gói trước kết thúc.`,
          });
        } else {
          await Notification.create({
            user: userId,
            title: "Gói ưu tiên đã hết hạn",
            body: `Gói ưu tiên của bạn đã hết hạn.`,
          });
        }
      }

      console.log("[cron] subscription job finished");
    } catch (err) {
      console.error("[cron] error", err);
    }
  });
}
