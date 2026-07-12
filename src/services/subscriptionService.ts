import mongoose from "mongoose";
import Package from "../models/Package";
import Subscription from "../models/Subscription";
import Transaction from "../models/Transaction";
import Post from "../models/Post";
import Notification from "../models/Notification";

/**
 * Activate subscription in a transaction: create subscription, update user's posts priority and expiry, update transaction
 */
export async function activateSubscription(userId: string, packageId: string, transactionId: string) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const pkg = await Package.findById(packageId).session(session);
    if (!pkg) throw new Error("Package not found");

    const now = new Date();
    const latestFutureSubscription = await Subscription.findOne({
      user: userId,
      status: { $in: ["active", "pending"] },
      expiryAt: { $gt: now },
    })
      .sort({ expiryAt: -1, createdAt: -1 })
      .session(session);

    const baseTime = latestFutureSubscription?.expiryAt && latestFutureSubscription.expiryAt > now
      ? latestFutureSubscription.expiryAt
      : now;
    const expiry = new Date(baseTime.getTime() + pkg.days * 24 * 60 * 60 * 1000);

    let subDoc: any;
    let isQueued = false;

    if (latestFutureSubscription) {
      const created = await Subscription.create(
        [
          {
            user: userId,
            package: pkg._id,
            status: "pending",
            startAt: baseTime,
            expiryAt: expiry,
          },
        ],
        { session }
      );
      subDoc = created[0];
      isQueued = true;
    } else {
      const created = await Subscription.create(
        [
          {
            user: userId,
            package: pkg._id,
            status: "active",
            startAt: now,
            expiryAt: expiry,
          },
        ],
        { session }
      );
      subDoc = created[0];

      // update all posts of the user only when the package starts immediately
      await Post.updateMany({ owner: userId }, { $set: { priority_level: pkg.priority_level, priority_expiry: expiry } }).session(session);
    }

    // update transaction
    await Transaction.findByIdAndUpdate(transactionId, { status: "paid" }).session(session);

    // create notification
    await Notification.create(
      [
        {
          user: userId,
          title: isQueued ? "Đăng ký gói thành công" : "Đăng ký gói thành công",
          content: isQueued
            ? `Gói ${pkg.name} đã được ghi nhận và sẽ tự động kích hoạt khi gói hiện tại hết hạn. Thời gian kết thúc dự kiến: ${expiry.toISOString()}`
            : `Gói ${pkg.name} đã được kích hoạt. Hết hạn: ${expiry.toISOString()}`,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    return subDoc;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}

/**
 * Upgrade active Basic -> Premium and carry over remaining time.
 * - Finds current active subscription
 * - Computes remaining time (expiryAt - now)
 * - Sets package = premiumPackageId and expiryAt = now + remaining + premium.days
 * - Updates user's posts priority fields accordingly
 */
export async function upgradeSubscriptionToPremium(userId: string, premiumPackageId: string) {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const now = new Date();

    const premiumPkg = await Package.findById(premiumPackageId).session(session);
    if (!premiumPkg) throw new Error("Premium package not found");

    const current = await Subscription.findOne({ user: userId, status: "active", expiryAt: { $gt: now } }).session(session);
    if (!current) throw new Error("Bạn chưa có gói đang hoạt động để nâng cấp");

    // remaining ms from current plan
    const remainingMs = Math.max(0, (current.expiryAt as Date).getTime() - now.getTime());
    const newExpiry = new Date(now.getTime() + remainingMs + premiumPkg.days * 24 * 60 * 60 * 1000);

    current.package = premiumPkg._id as any;
    current.expiryAt = newExpiry;
    current.status = "active";
    await current.save({ session });

    // update posts priority during active window
    await Post.updateMany(
      { owner: userId },
      { $set: { priority_level: premiumPkg.priority_level, priority_expiry: newExpiry } }
    ).session(session);

    await Notification.create([
      {
        user: userId,
        title: "Nâng cấp gói thành công",
        content: `Bạn đã nâng cấp lên gói ${premiumPkg.name}. Hết hạn: ${newExpiry.toISOString()}`,
      },
    ], { session });

    await session.commitTransaction();
    session.endSession();

    return current;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}
