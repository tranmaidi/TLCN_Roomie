import { Request, Response } from "express";
import mongoose from "mongoose";
import Transaction from "../models/Transaction";
import Package from "../models/Package";
import User from "../models/User";
import PaymentHistory, { PaymentHistoryType } from "../models/PaymentHistory";
import { activateSubscription, upgradeSubscriptionToPremium } from "../services/subscriptionService";
import Subscription from "../models/Subscription";
import { getCurrentPostFee } from "../services/postFeeService";
import { NotificationService } from "../services/notificationService";
import axios from "axios";
import crypto from "crypto";
const qs = require('qs');

function buildAppTransId() {
  const now = new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const MM = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const prefix = `${yy}${MM}${dd}`;
  const random = Math.floor(Math.random() * 1000000).toString().padStart(6, "0");
  const timestamp = Date.now().toString().slice(-4);
  return `${prefix}_${random}${timestamp}`;
}

async function createPendingPaymentHistory(params: {
  userId: string;
  type: PaymentHistoryType;
  amount: number;
  paymentMethod?: string;
  transactionId?: string;
  packageId?: mongoose.Types.ObjectId | string;
}) {
  const transactionId = params.transactionId || new mongoose.Types.ObjectId().toString();
  const history: any = await PaymentHistory.create({
    userId: params.userId,
    type: params.type,
    amount: params.amount,
    paymentMethod: params.paymentMethod || "zalopay",
    transactionId,
    status: "pending",
    packageId: params.packageId,
  });

  return history;
}

function buildZaloOrderPayload(params: {
  app_id: string;
  key1: string;
  app_trans_id: string;
  app_user: string;
  app_time: number;
  amount: number;
  items: any[];
  embed_data: any;
  description: string;
  callback_url: string;
}) {
  const order: any = {
    app_id: parseInt(params.app_id, 10),
    app_trans_id: params.app_trans_id,
    app_user: params.app_user,
    app_time: params.app_time,
    item: JSON.stringify(params.items),
    embed_data: JSON.stringify(params.embed_data),
    amount: params.amount,
    description: params.description.substring(0, 100),
    bank_code: "",
    callback_url: params.callback_url,
  };

  const macData = `${order.app_id}|${order.app_trans_id}|${order.app_user}|${order.amount}|${order.app_time}|${order.embed_data}|${order.item}`;
  order.mac = crypto.createHmac("sha256", params.key1).update(macData).digest("hex");

  return order;
}

function normalizePackageInput(body: any) {
  const rawDays = body?.durationDays ?? body?.days;
  const days = rawDays === undefined || rawDays === null ? undefined : Number(rawDays);
  const isActive =
    body?.isActive === undefined || body?.isActive === null
      ? undefined
      : body.isActive === true || body.isActive === "true" || body.isActive === 1 || body.isActive === "1";

  return {
    name: body?.name,
    price: body?.price === undefined ? undefined : Number(body.price),
    days,
    description: typeof body?.description === "string" ? body.description : undefined,
    priority_level: body?.priority_level === undefined ? undefined : Number(body.priority_level),
    isActive,
  };
}

function formatPackageOutput(pkg: any) {
  if (!pkg) return pkg;
  const plain = typeof pkg.toObject === "function" ? pkg.toObject({ virtuals: true }) : { ...pkg };
  return {
    ...plain,
    durationDays: plain.durationDays ?? plain.days,
  };
}

async function findActivePackageById(packageId: string) {
  return Package.findOne({ _id: packageId, isDeleted: false });
}

export const createTransaction = async (req: Request & { user?: any }, res: Response) => {
  try {
    const userId = req.user?.id;
    const { packageId } = req.body;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!packageId) return res.status(400).json({ message: "packageId required" });

    const pkg = await findActivePackageById(packageId);
    if (!pkg) return res.status(404).json({ message: "Package not found or has been deleted" });

    const txn: any = await Transaction.create({ user: userId, package: pkg._id, amount: pkg.price, status: "pending" });
    await createPendingPaymentHistory({
      userId: userId.toString(),
      type: "priority_package",
      amount: pkg.price,
      paymentMethod: "manual",
      transactionId: txn._id.toString(),
      packageId: (pkg as any)._id,
    });
    return res.json({ success: true, transactionId: txn._id.toString(), amount: pkg.price });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

export const confirmPayment = async (req: Request, res: Response) => {
  try {
    const { transactionId, success } = req.body;
    const txn: any = await Transaction.findById(transactionId);
    if (!txn) return res.status(404).json({ message: "Transaction not found" });

    const history = await PaymentHistory.findOne({
      transactionId: txn._id.toString(),
      type: "priority_package",
    });

    if (success) {
      const t: any = txn;
      const sub = await activateSubscription(t.user.toString(), t.package.toString(), t._id.toString());
      if (history && history.status !== "success") {
        history.status = "success";
        history.paidAt = new Date();
        await history.save();
      }
      return res.json({ success: true, subscription: sub });
    } else {
      txn.status = "failed";
      await txn.save();
      if (history && history.status === "pending") {
        history.status = "failed";
        await history.save();
      }
      return res.json({ success: false });
    }
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

export const createZaloOrder = async (req: Request & { user?: any }, res: Response) => {
  try {
    const userId = req.user?.id;
    const { packageId } = req.body;
    
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    if (!packageId) return res.status(400).json({ message: 'packageId required' });

    const pkg = await findActivePackageById(packageId);
    if (!pkg) return res.status(404).json({ message: 'Package not found or has been deleted' });

    const app_id = process.env.ZALOPAY_APP_ID;
    const key1 = process.env.ZALOPAY_KEY1;
    const endpoint = process.env.ZALOPAY_ENDPOINT || 'https://sb-openapi.zalopay.vn/v2/create';
    
    if (!app_id || !key1) {
      return res.status(500).json({ message: 'ZaloPay config missing in env' });
    }

    // Tạo pending transaction
    const txn: any = await Transaction.create({ 
      user: userId, 
      package: pkg._id, 
      amount: pkg.price, 
      status: 'pending' 
    });
    const paymentHistory: any = await createPendingPaymentHistory({
      userId: userId.toString(),
      type: "priority_package",
      amount: pkg.price,
      paymentMethod: "zalopay",
      transactionId: txn._id.toString(),
      packageId: (pkg as any)._id,
    });

    // Tạo các tham số theo đúng format ZaloPay yêu cầu
    const app_trans_id = buildAppTransId();
    const app_user = userId.toString();
    const app_time = Date.now();
    
    // embed_data phải là object, sau đó stringify
    const embed_data = {
      paymentHistoryId: (paymentHistory as any)._id.toString(),
      type: "priority_package",
      transactionId: (txn as any)._id.toString(),
      redirecturl: process.env.ZALOPAY_REDIRECT_URL || '' // URL redirect sau thanh toán
    };
    
    // item phải là mảng object, sau đó stringify
    const items = [{
      item_id: (pkg as any)._id.toString(),
      item_name: pkg.name,
      item_price: pkg.price,
      item_quantity: 1
    }];
    
    // Tạo order object
  const order: any = {
      app_id: parseInt(app_id, 10), // Chuyển sang number
      app_trans_id: app_trans_id,
      app_user: app_user,
      app_time: app_time,
      item: JSON.stringify(items),
      embed_data: JSON.stringify(embed_data),
      amount: pkg.price,
      description: `Thanh toan goi ${pkg.name}`.substring(0, 100), // Không dấu, tối đa 100 ký tự
      bank_code: "",
      callback_url: process.env.ZALOPAY_CALLBACK_URL || ""
    };

    // Tạo chữ ký MAC
    // Format: app_id|app_trans_id|app_user|amount|app_time|embed_data|item
    const macData = `${order.app_id}|${order.app_trans_id}|${order.app_user}|${order.amount}|${order.app_time}|${order.embed_data}|${order.item}`;
  order.mac = crypto.createHmac('sha256', key1).update(macData).digest('hex');

    console.log('[createZaloOrder] Request data:', {
      endpoint,
  order: { ...order, mac: (order.mac || '').substring(0, 10) + '...' }
    });

    // Gửi request dạng x-www-form-urlencoded
    const response = await axios({
      method: 'post',
      url: endpoint,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data: qs.stringify(order)
    });

    console.log('[createZaloOrder] ZaloPay response:', response.data);

    // Xử lý response từ ZaloPay
    if (response.data.return_code === 1) {
      // Thành công, cập nhật providerMeta cho transaction
      txn.providerMeta = {
        app_trans_id: app_trans_id,
        zp_trans_token: response.data.zp_trans_token,
        order_url: response.data.order_url
      };
      await txn.save();
      paymentHistory.providerMeta = {
        app_trans_id: app_trans_id,
        zp_trans_token: response.data.zp_trans_token,
        order_url: response.data.order_url
      };
      await paymentHistory.save();
      const { order_url, ...zaloResponseWithoutOrderUrl } = response.data || {};

      return res.json({ 
        success: true, 
        transactionId: (txn as any)._id.toString(),
        paymentHistoryId: (paymentHistory as any)._id.toString(),
        app_trans_id,
        orderUrl: response.data.order_url, // URL để redirect người dùng đến ZaloPay
        zaloResponse: zaloResponseWithoutOrderUrl 
      });
    } else {
      // Thất bại, cập nhật transaction status
      txn.status = 'failed';
      txn.providerMeta = { error: response.data };
      await txn.save();
      paymentHistory.status = "failed";
      paymentHistory.providerMeta = { error: response.data };
      await paymentHistory.save();
      
      return res.json({ 
        success: false, 
        transactionId: (txn as any)._id.toString(),
        paymentHistoryId: (paymentHistory as any)._id.toString(),
        zaloResponse: response.data 
      });
    }
  } catch (err: any) {
    console.error('[createZaloOrder] error:', err?.response?.data || err.message);
    return res.status(500).json({ 
      message: err?.response?.data?.sub_return_message || err.message 
    });
  }
};

// Create ZaloPay order for upgrading: user pays full Premium price (Option C)
export const createZaloUpgradeOrder = async (req: Request & { user?: any }, res: Response) => {
  try {
    const userId = req.user?.id;
    const { premiumPackageId } = req.body;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!premiumPackageId) return res.status(400).json({ message: "premiumPackageId required" });

    const pkg = await findActivePackageById(premiumPackageId);
    if (!pkg) return res.status(404).json({ message: "Package not found or has been deleted" });

    const app_id = process.env.ZALOPAY_APP_ID;
    const key1 = process.env.ZALOPAY_KEY1;
    const endpoint = process.env.ZALOPAY_ENDPOINT || "https://sb-openapi.zalopay.vn/v2/create";

    if (!app_id || !key1) {
      return res.status(500).json({ message: "ZaloPay config missing in env" });
    }

    // Tạo pending transaction (type upgrade)
    const txn: any = await Transaction.create({
      user: userId,
      package: pkg._id,
      amount: pkg.price,
      status: "pending",
      provider: "zalopay",
      // Optional: store that this is upgrade payment
      providerMeta: { purpose: "upgrade_to_premium" },
    } as any);
    const paymentHistory: any = await createPendingPaymentHistory({
      userId: userId.toString(),
      type: "priority_package",
      amount: pkg.price,
      paymentMethod: "zalopay",
      transactionId: txn._id.toString(),
      packageId: (pkg as any)._id,
    });

    const app_trans_id = buildAppTransId();
    const app_user = userId.toString();
    const app_time = Date.now();

    // embed_data includes upgrade intent
    const embed_data = {
      upgrade: true,
      premiumPackageId: (pkg as any)._id.toString(),
      paymentHistoryId: (paymentHistory as any)._id.toString(),
      type: "priority_package",
      transactionId: (txn as any)._id.toString(),
      redirecturl: process.env.ZALOPAY_REDIRECT_URL || "",
    };

    const items = [
      {
        item_id: (pkg as any)._id.toString(),
        item_name: pkg.name,
        item_price: pkg.price,
        item_quantity: 1,
      },
    ];

    const order: any = {
      app_id: parseInt(app_id, 10),
      app_trans_id,
      app_user,
      app_time,
      item: JSON.stringify(items),
      embed_data: JSON.stringify(embed_data),
      amount: pkg.price,
      description: `Nang cap goi ${pkg.name}`.substring(0, 100),
      bank_code: "",
      callback_url: process.env.ZALOPAY_CALLBACK_URL || "",
    };

    const macData = `${order.app_id}|${order.app_trans_id}|${order.app_user}|${order.amount}|${order.app_time}|${order.embed_data}|${order.item}`;
    order.mac = crypto.createHmac("sha256", key1).update(macData).digest("hex");

    console.log("[createZaloUpgradeOrder] Request data:", {
      endpoint,
      order: { ...order, mac: (order.mac || "").substring(0, 10) + "..." },
    });

    const response = await axios({
      method: "post",
      url: endpoint,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: qs.stringify(order),
    });

    console.log("[createZaloUpgradeOrder] ZaloPay response:", response.data);

    if (response.data.return_code === 1) {
      txn.providerMeta = {
        ...(txn as any).providerMeta,
        app_trans_id,
        zp_trans_token: response.data.zp_trans_token,
        order_url: response.data.order_url,
      };
      await txn.save();
      paymentHistory.providerMeta = {
        app_trans_id,
        zp_trans_token: response.data.zp_trans_token,
        order_url: response.data.order_url,
      };
      await paymentHistory.save();

      return res.json({
        success: true,
        transactionId: (txn as any)._id.toString(),
        paymentHistoryId: (paymentHistory as any)._id.toString(),
        app_trans_id,
        orderUrl: response.data.order_url,
        zaloResponse: (({ order_url, ...rest }) => rest)(response.data || {}),
      });
    }

    txn.status = "failed";
    txn.providerMeta = { ...(txn as any).providerMeta, error: response.data };
    await txn.save();
    paymentHistory.status = "failed";
    paymentHistory.providerMeta = { error: response.data };
    await paymentHistory.save();

    return res.json({
      success: false,
      transactionId: (txn as any)._id.toString(),
      paymentHistoryId: (paymentHistory as any)._id.toString(),
      zaloResponse: response.data,
    });
  } catch (err: any) {
    console.error("[createZaloUpgradeOrder] error:", err?.response?.data || err.message);
    return res.status(500).json({ message: err?.response?.data?.sub_return_message || err.message });
  }
};

export const createZaloPostActivationOrder = async (req: Request & { user?: any }, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const user = await User.findOne({ _id: userId, isDeleted: false }).select("isPostActivated name");
    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    if (user.isPostActivated) {
      return res.status(400).json({ message: "Tài khoản đã được kích hoạt quyền đăng tin" });
    }

    const app_id = process.env.ZALOPAY_APP_ID;
    const key1 = process.env.ZALOPAY_KEY1;
    const endpoint = process.env.ZALOPAY_ENDPOINT || "https://sb-openapi.zalopay.vn/v2/create";

    if (!app_id || !key1) {
      return res.status(500).json({ message: "ZaloPay config missing in env" });
    }

    const currentPostActivationFee = await getCurrentPostFee();
    const feeAmount = Number(currentPostActivationFee.feeAmount) >= 0 ? Number(currentPostActivationFee.feeAmount) : 0;

    const transactionId = new mongoose.Types.ObjectId().toString();
    const paymentHistory: any = await createPendingPaymentHistory({
      userId: userId.toString(),
      type: "post_activation",
      amount: feeAmount,
      paymentMethod: "zalopay",
      transactionId,
    });

    const app_trans_id = buildAppTransId();
    const app_user = userId.toString();
    const app_time = Date.now();

    const items = [
      {
        item_id: "post_activation",
        item_name: "Kich hoat quyen dang tin",
        item_price: feeAmount,
        item_quantity: 1,
      },
    ];

    const embed_data = {
      type: "post_activation",
      paymentHistoryId: paymentHistory._id.toString(),
      transactionId,
      redirecturl: process.env.ZALOPAY_REDIRECT_URL2 || "",
    };

    const order = buildZaloOrderPayload({
      app_id,
      key1,
      app_trans_id,
      app_user,
      app_time,
      amount: feeAmount,
      items,
      embed_data,
      description: "Thanh toan kich hoat quyen dang tin",
      callback_url: process.env.ZALOPAY_CALLBACK_URL || "",
    });

    console.log("[createZaloPostActivationOrder] Request data:", {
      endpoint,
      order: { ...order, mac: (order.mac || "").substring(0, 10) + "..." },
    });

    const response = await axios({
      method: "post",
      url: endpoint,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      data: qs.stringify(order),
    });

    console.log("[createZaloPostActivationOrder] ZaloPay response:", response.data);

    if (response.data.return_code === 1) {
      paymentHistory.providerMeta = {
        app_trans_id,
        zp_trans_token: response.data.zp_trans_token,
        order_url: response.data.order_url,
      };
      await paymentHistory.save();

      return res.json({
        success: true,
        transactionId,
        paymentHistoryId: paymentHistory._id.toString(),
        app_trans_id,
        orderUrl: response.data.order_url,
        amount: feeAmount,
        zaloResponse: (({ order_url, ...rest }) => rest)(response.data || {}),
      });
    }

    paymentHistory.status = "failed";
    paymentHistory.providerMeta = { error: response.data };
    await paymentHistory.save();

    return res.json({
      success: false,
      paymentHistoryId: paymentHistory._id.toString(),
      zaloResponse: response.data,
    });
  } catch (err: any) {
    console.error("[createZaloPostActivationOrder] error:", err?.response?.data || err.message);
    return res.status(500).json({ message: err?.response?.data?.sub_return_message || err.message });
  }
};

export const zaloCallback = async (req: Request, res: Response) => {
  try {
    console.log('[zaloCallback] Raw body type:', typeof req.body);
    console.log('[zaloCallback] Body keys:', Object.keys(req.body));
    
    const key2 = process.env.ZALOPAY_KEY2;
    if (!key2) {
      console.error('[zaloCallback] Missing ZALOPAY_KEY2');
      return res.status(200).json({ return_code: -1, return_message: 'Missing key2' });
    }

    let dataStr = "";
    let requestMac = "";

    // ZaloPay gửi callback với data là string, nhưng Express đã parse nó
    if (req.body.data) {
      // Nếu data đã bị parse thành object, lấy lại string gốc từ rawBody
      if (typeof req.body.data === 'object') {
        // Dùng rawBody đã lưu từ middleware
        if ((req as any).rawBody) {
          try {
            const rawParsed = JSON.parse((req as any).rawBody);
            dataStr = rawParsed.data;
            requestMac = rawParsed.mac;
          } catch (e) {
            console.error('[zaloCallback] Failed to parse rawBody');
          }
        }
        
        // Nếu vẫn chưa có, thử lấy từ chuỗi JSON của object
        if (!dataStr) {
          dataStr = JSON.stringify(req.body.data);
          requestMac = req.body.mac;
        }
      } else if (typeof req.body.data === 'string') {
        // Trường hợp data vẫn là string (lý tưởng)
        dataStr = req.body.data;
        requestMac = req.body.mac;
      }
    } else {
      // Fallback: dùng toàn bộ body
      dataStr = JSON.stringify(req.body);
      requestMac = req.body.mac || "";
    }

    console.log('[zaloCallback] Data string length:', dataStr.length);
    console.log('[zaloCallback] Data string preview:', dataStr.substring(0, 200));
    console.log('[zaloCallback] MAC from request:', requestMac);

    if (!dataStr) {
      console.error('[zaloCallback] Cannot extract data string');
      return res.status(200).json({ return_code: -1, return_message: 'Cannot extract data' });
    }

    // Verify MAC
    const calculatedMac = crypto.createHmac('sha256', key2).update(dataStr).digest('hex');
    console.log('[zaloCallback] Calculated MAC:', calculatedMac);
    
    if (requestMac && requestMac !== calculatedMac) {
      console.error('[zaloCallback] MAC mismatch');
      return res.status(200).json({ return_code: -1, return_message: 'MAC not equal' });
    }

    // Parse data string thành object
    let callbackData: any = {};
    try {
      callbackData = JSON.parse(dataStr);
      console.log('[zaloCallback] Parsed callback data - return_code:', callbackData.return_code);
      console.log('[zaloCallback] Parsed callback data - app_trans_id:', callbackData.app_trans_id);
    } catch (e) {
      console.error('[zaloCallback] Failed to parse data string:', e);
      return res.status(200).json({ return_code: -1, return_message: 'Invalid data format' });
    }

    // Lưu ý: Trong callback data của ZaloPay, KHÔNG có field return_code
    // Thay vào đó, nếu thanh toán thành công, ZaloPay sẽ gửi callback này
    // Chúng ta cần lấy paymentHistoryId / transactionId từ embed_data
    
    console.log('[zaloCallback] Payment successful, processing...');

    let paymentHistoryId: string | null = null;
    let transactionId: string | null = null;
    let paymentType: PaymentHistoryType | null = null;
    const embed_data = callbackData.embed_data;
    
    if (embed_data) {
      try {
        let embedDataObj = embed_data;
        if (typeof embed_data === 'string') {
          embedDataObj = JSON.parse(embed_data);
        }
        paymentHistoryId = embedDataObj.paymentHistoryId || null;
        transactionId = embedDataObj.transactionId;
        paymentType = embedDataObj.type || null;
        console.log('[zaloCallback] Extracted transactionId:', transactionId);
      } catch (e) {
        console.error('[zaloCallback] Failed to parse embed_data:', e);
      }
    }

    if (!paymentHistoryId && !transactionId) {
      console.error('[zaloCallback] No payment reference found in callback');
      return res.status(200).json({ return_code: 1, return_message: 'No payment reference' });
    }

    const paymentHistory: any = paymentHistoryId
      ? await PaymentHistory.findById(paymentHistoryId)
      : (transactionId
          ? await PaymentHistory.findOne({ transactionId: String(transactionId) })
          : null);

    if (!paymentHistory) {
      console.error('[zaloCallback] PaymentHistory not found:', paymentHistoryId || transactionId);
      return res.status(200).json({ return_code: 1, return_message: 'PaymentHistory not found' });
    }

    if (paymentHistory.status === 'success') {
      console.log('[zaloCallback] PaymentHistory already processed');
      return res.status(200).json({ return_code: 1, return_message: 'Already processed' });
    }

    if (callbackData.return_code !== undefined && Number(callbackData.return_code) !== 1) {
      paymentHistory.status = "failed";
      paymentHistory.providerMeta = {
        ...(paymentHistory.providerMeta || {}),
        callback_data: callbackData,
      };
      await paymentHistory.save();
      return res.status(200).json({ return_code: 1, return_message: "Payment failed" });
    }

    const resolvedType = paymentType || paymentHistory.type;
    let processingFailed = false;

    if (resolvedType === 'post_activation') {
      const userUpdate = await User.updateOne(
        { _id: paymentHistory.userId, isPostActivated: { $ne: true } },
        { $set: { isPostActivated: true } }
      );
      console.log('[zaloCallback] Post activation update result:', userUpdate.modifiedCount);
      console.log('[zaloCallback] Post activation granted for payment history:', paymentHistory._id.toString());
    } else if (resolvedType === 'priority_package') {
      const linkedTxnId = paymentHistory.transactionId;
      const txn = await Transaction.findById(linkedTxnId);

      if (txn && txn.status !== 'paid') {
        try {
          await activateSubscription((txn as any).user.toString(), (txn as any).package.toString(), (txn as any)._id.toString());
          console.log('[zaloCallback] Subscription activated successfully for transaction:', linkedTxnId);
        } catch (error) {
          console.error('[zaloCallback] Failed to activate subscription:', error);
          processingFailed = true;
        }
      } else if (txn) {
        console.log('[zaloCallback] Transaction already marked paid:', linkedTxnId);
      }
    }

    if (processingFailed) {
      paymentHistory.status = 'failed';
      paymentHistory.providerMeta = {
        ...(paymentHistory.providerMeta || {}),
        callback_data: callbackData,
        zp_trans_id: callbackData.zp_trans_id,
        app_trans_id: callbackData.app_trans_id,
      };
      await paymentHistory.save();
      return res.status(200).json({ return_code: 1, return_message: 'Processing failed' });
    }

    paymentHistory.status = 'success';
    paymentHistory.paidAt = paymentHistory.paidAt || new Date();
    paymentHistory.providerMeta = { 
      ...(paymentHistory.providerMeta || {}), 
      callback_data: callbackData,
      zp_trans_id: callbackData.zp_trans_id,
      app_trans_id: callbackData.app_trans_id
    };
    await paymentHistory.save();

    return res.status(200).json({ return_code: 1, return_message: 'Success' });
  } catch (err: any) {
    console.error('[zaloCallback] Error:', err);
    return res.status(200).json({ return_code: -1, return_message: err.message });
  }
};

export const adminCreatePackage = async (req: Request, res: Response) => {
  try {
    const normalized = normalizePackageInput(req.body);
    if (!normalized.name) return res.status(400).json({ message: "name required" });
    if (normalized.price === undefined || Number.isNaN(normalized.price)) return res.status(400).json({ message: "price required" });
    if (normalized.days === undefined || Number.isNaN(normalized.days)) return res.status(400).json({ message: "durationDays required" });

    const pkg = await Package.create({
      name: normalized.name,
      price: normalized.price,
      days: normalized.days,
      description: normalized.description ?? "",
      priority_level: normalized.priority_level ?? 0,
      isActive: normalized.isActive ?? true,
    });
    return res.status(201).json({ success: true, data: formatPackageOutput(pkg) });
  } catch (err: any) {
    return res.status(400).json({ message: err.message });
  }
};

export const adminUpdatePackage = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const currentPkg = await Package.findById(id);
    if (!currentPkg) return res.status(404).json({ message: "Not found" });

    const normalized = normalizePackageInput(req.body);
    const updateData: Record<string, any> = {};

    if (normalized.name !== undefined) updateData.name = normalized.name;
    if (normalized.price !== undefined && !Number.isNaN(normalized.price)) updateData.price = normalized.price;
    if (normalized.days !== undefined && !Number.isNaN(normalized.days)) updateData.days = normalized.days;
    if (normalized.description !== undefined) updateData.description = normalized.description;
    if (normalized.priority_level !== undefined && !Number.isNaN(normalized.priority_level)) updateData.priority_level = normalized.priority_level;
    if (normalized.isActive !== undefined) updateData.isActive = normalized.isActive;

    delete (updateData as any).isDeleted;

    const oldPrice = currentPkg.price;
    const pkg = await Package.findByIdAndUpdate(id, updateData, { new: true });
    if (normalized.price !== undefined && !Number.isNaN(normalized.price) && Number(normalized.price) !== Number(oldPrice)) {
      await NotificationService.notifyAllUsers(
        `Giá gói ${currentPkg.name} đã được cập nhật từ ${oldPrice.toLocaleString("vi-VN")}đ lên ${Number(normalized.price).toLocaleString("vi-VN")}đ.`
      );
    }

    return res.json({ success: true, data: formatPackageOutput(pkg) });
  } catch (err: any) {
    return res.status(400).json({ message: err.message });
  }
};

export const adminDeletePackage = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const pkg = await Package.findByIdAndUpdate(id, { isDeleted: true }, { new: true });
    if (!pkg) return res.status(404).json({ message: "Not found" });
    return res.json({ success: true, data: formatPackageOutput(pkg) });
  } catch (err: any) {
    return res.status(400).json({ message: err.message });
  }
};

export const listPackages = async (req: Request, res: Response) => {
  try {
    const pkgs = await Package.find({ isDeleted: false }).sort({ priority_level: 1 }).lean();
    return res.json({
      success: true,
      data: pkgs.map((pkg: any) => ({
        ...pkg,
        durationDays: pkg.durationDays ?? pkg.days,
      })),
    });
  } catch (err: any) {
    return res.status(400).json({ message: err.message });
  }
};

export const createZaloQuery = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { app_trans_id, paymentHistoryId } = req.body;

    const app_id = process.env.ZALOPAY_APP_ID;
    const key1 = process.env.ZALOPAY_KEY1;
    
    if (!app_id || !key1) {
      return res.status(500).json({ message: 'ZaloPay config missing' });
    }

    let resolvedAppTransId = app_trans_id as string | undefined;
    if (!resolvedAppTransId && paymentHistoryId) {
      const history: any = await PaymentHistory.findById(paymentHistoryId);
      const historyAppTransId = history?.providerMeta?.app_trans_id || history?.providerMeta?.appTransId || null;
      resolvedAppTransId = historyAppTransId || undefined;
    }

    if (!resolvedAppTransId) {
      return res.status(400).json({ message: 'app_trans_id or paymentHistoryId required' });
    }

    const postData: any = {
      app_id: parseInt(app_id, 10),
      app_trans_id: resolvedAppTransId
    };

    // Tạo MAC cho query
    const macData = `${postData.app_id}|${postData.app_trans_id}|${key1}`;
    postData.mac = crypto.createHmac('sha256', key1).update(macData).digest('hex');

    const endpoint = process.env.ZALOPAY_QUERY_ENDPOINT || 'https://sb-openapi.zalopay.vn/v2/query';
    
    const response = await axios({
      method: 'post',
      url: endpoint,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data: qs.stringify(postData)
    });

    if (paymentHistoryId) {
      const history: any = await PaymentHistory.findById(paymentHistoryId);
      if (history && history.status === "pending") {
        if (Number(response.data?.return_code) === 1) {
          history.status = "success";
          history.paidAt = history.paidAt || new Date();
          history.providerMeta = { ...(history.providerMeta || {}), query_response: response.data };
          await history.save();

          if (history.type === "post_activation") {
            await User.updateOne(
              { _id: history.userId, isPostActivated: { $ne: true } },
              { $set: { isPostActivated: true } }
            );
          }
        } else {
          history.status = "failed";
          history.providerMeta = { ...(history.providerMeta || {}), query_response: response.data };
          await history.save();
        }
      }
    }

    return res.json({ success: true, data: response.data });
  } catch (err: any) {
    console.error('[createZaloQuery] error:', err?.response?.data || err.message);
    return res.status(500).json({ message: err?.response?.data?.sub_return_message || err.message });
  }
};

// Upgrade subscription: Basic (or any active) -> Premium, carry over remaining time
export const upgradeToPremium = async (req: Request & { user?: any }, res: Response) => {
  try {
    const userId = req.user?.id;
    const { premiumPackageId } = req.body;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!premiumPackageId) return res.status(400).json({ message: "premiumPackageId required" });

    const premiumPkg = await findActivePackageById(premiumPackageId.toString());
    if (!premiumPkg) {
      return res.status(404).json({ message: "Package not found or has been deleted" });
    }

    const upgraded = await upgradeSubscriptionToPremium(userId.toString(), premiumPackageId.toString());
    return res.json({ success: true, data: upgraded });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

// Lịch sử các gói đã đăng kí của tôi
export const getMySubscriptionHistory = async (req: Request & { user?: any }, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      Subscription.find({ user: userId })
        .populate("package")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Subscription.countDocuments({ user: userId }),
    ]);

    return res.json({
      success: true,
      content: rows,
      pagination: { total, page, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getMyPaymentHistory = async (req: Request & { user?: any }, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      PaymentHistory.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("packageId", "name price"),
      PaymentHistory.countDocuments({ userId }),
    ]);

    return res.json({
      success: true,
      content: rows.map((row: any) => ({
        time: row.paidAt || row.createdAt,
        type: row.type,
        amount: row.amount,
        status: row.status,
        transactionId: row.transactionId,
        paymentMethod: row.paymentMethod,
        package: row.packageId || null,
      })),
      pagination: { total, page, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
