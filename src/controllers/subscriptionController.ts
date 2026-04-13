import { Request, Response } from "express";
import Transaction from "../models/Transaction";
import Package from "../models/Package";
import { activateSubscription, upgradeSubscriptionToPremium } from "../services/subscriptionService";
import Subscription from "../models/Subscription";
import axios from "axios";
import crypto from "crypto";
const qs = require('qs');

export const createTransaction = async (req: Request & { user?: any }, res: Response) => {
  try {
    const userId = req.user?.id;
    const { packageId } = req.body;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!packageId) return res.status(400).json({ message: "packageId required" });

    const pkg = await Package.findById(packageId);
    if (!pkg) return res.status(404).json({ message: "Package not found" });

    const txn = await Transaction.create({ user: userId, package: pkg._id, amount: pkg.price, status: "pending" });
    return res.json({ success: true, transactionId: txn._id, amount: pkg.price });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

export const confirmPayment = async (req: Request, res: Response) => {
  try {
    const { transactionId, success } = req.body;
    const txn = await Transaction.findById(transactionId);
    if (!txn) return res.status(404).json({ message: "Transaction not found" });

    if (success) {
      const t: any = txn;
      const sub = await activateSubscription(t.user.toString(), t.package.toString(), t._id.toString());
      return res.json({ success: true, subscription: sub });
    } else {
      txn.status = "failed";
      await txn.save();
      return res.json({ success: false });
    }
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// --- ZaloPay integration helpers ---
function buildAppTransId() {
  const now = new Date();
  // Format: yyMMdd_xxxx (8 ký tự đầu: 2 số năm + 2 tháng + 2 ngày)
  const yy = now.getFullYear().toString().slice(-2);
  const MM = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const prefix = `${yy}${MM}${dd}`;
  // Tạo chuỗi ngẫu nhiên 6-8 ký tự
  const random = Math.floor(Math.random() * 1000000).toString().padStart(6, "0");
  const timestamp = Date.now().toString().slice(-4);
  return `${prefix}_${random}${timestamp}`;
}

export const createZaloOrder = async (req: Request & { user?: any }, res: Response) => {
  try {
    const userId = req.user?.id;
    const { packageId } = req.body;
    
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    if (!packageId) return res.status(400).json({ message: 'packageId required' });

    const pkg = await Package.findById(packageId);
    if (!pkg) return res.status(404).json({ message: 'Package not found' });

    const app_id = process.env.ZALOPAY_APP_ID;
    const key1 = process.env.ZALOPAY_KEY1;
    const endpoint = process.env.ZALOPAY_ENDPOINT || 'https://sb-openapi.zalopay.vn/v2/create';
    
    if (!app_id || !key1) {
      return res.status(500).json({ message: 'ZaloPay config missing in env' });
    }

    // Tạo pending transaction
    const txn = await Transaction.create({ 
      user: userId, 
      package: pkg._id, 
      amount: pkg.price, 
      status: 'pending' 
    });

    // Tạo các tham số theo đúng format ZaloPay yêu cầu
    const app_trans_id = buildAppTransId();
    const app_user = userId.toString();
    const app_time = Date.now();
    
    // embed_data phải là object, sau đó stringify
    const embed_data = {
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
      const { order_url, ...zaloResponseWithoutOrderUrl } = response.data || {};

      return res.json({ 
        success: true, 
        transactionId: (txn as any)._id.toString(),
  orderUrl: response.data.order_url, // URL để redirect người dùng đến ZaloPay
        zaloResponse: zaloResponseWithoutOrderUrl 
      });
    } else {
      // Thất bại, cập nhật transaction status
  txn.status = 'failed';
  txn.providerMeta = { error: response.data };
      await txn.save();
      
      return res.json({ 
        success: false, 
        transactionId: (txn as any)._id.toString(),
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

    const pkg = await Package.findById(premiumPackageId);
    if (!pkg) return res.status(404).json({ message: "Package not found" });

    const app_id = process.env.ZALOPAY_APP_ID;
    const key1 = process.env.ZALOPAY_KEY1;
    const endpoint = process.env.ZALOPAY_ENDPOINT || "https://sb-openapi.zalopay.vn/v2/create";

    if (!app_id || !key1) {
      return res.status(500).json({ message: "ZaloPay config missing in env" });
    }

    // Tạo pending transaction (type upgrade)
    const txn = await Transaction.create({
      user: userId,
      package: pkg._id,
      amount: pkg.price,
      status: "pending",
      provider: "zalopay",
      // Optional: store that this is upgrade payment
      providerMeta: { purpose: "upgrade_to_premium" },
    } as any);

    const app_trans_id = buildAppTransId();
    const app_user = userId.toString();
    const app_time = Date.now();

    // embed_data includes upgrade intent
    const embed_data = {
      upgrade: true,
      premiumPackageId: (pkg as any)._id.toString(),
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

      return res.json({
        success: true,
        transactionId: (txn as any)._id.toString(),
        orderUrl: response.data.order_url,
        zaloResponse: (({ order_url, ...rest }) => rest)(response.data || {}),
      });
    }

    txn.status = "failed";
    txn.providerMeta = { ...(txn as any).providerMeta, error: response.data };
    await txn.save();

    return res.json({
      success: false,
      transactionId: (txn as any)._id.toString(),
      zaloResponse: response.data,
    });
  } catch (err: any) {
    console.error("[createZaloUpgradeOrder] error:", err?.response?.data || err.message);
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
    // Chúng ta cần lấy transactionId từ embed_data
    
    console.log('[zaloCallback] Payment successful, processing...');

    // Lấy transactionId từ embed_data
    let transactionId = null;
    const embed_data = callbackData.embed_data;
    
    if (embed_data) {
      try {
        let embedDataObj = embed_data;
        if (typeof embed_data === 'string') {
          embedDataObj = JSON.parse(embed_data);
        }
        transactionId = embedDataObj.transactionId;
        console.log('[zaloCallback] Extracted transactionId:', transactionId);
      } catch (e) {
        console.error('[zaloCallback] Failed to parse embed_data:', e);
      }
    }

    if (!transactionId) {
      console.error('[zaloCallback] No transactionId found in callback');
      return res.status(200).json({ return_code: 1, return_message: 'No transactionId' });
    }

    // Xử lý transaction
    const txn = await Transaction.findById(transactionId);
    if (!txn) {
      console.error('[zaloCallback] Transaction not found:', transactionId);
      return res.status(200).json({ return_code: 1, return_message: 'Transaction not found' });
    }

    if (txn.status === 'paid') {
      console.log('[zaloCallback] Transaction already processed');
      return res.status(200).json({ return_code: 1, return_message: 'Already processed' });
    }

    // Cập nhật transaction thành paid
    txn.status = 'paid';
    txn.providerMeta = { 
      ...(txn.providerMeta || {}), 
      callback_data: callbackData,
      zp_trans_id: callbackData.zp_trans_id,
      app_trans_id: callbackData.app_trans_id
    };
    await txn.save();

    // Kích hoạt subscription
    try {
      await activateSubscription((txn as any).user.toString(), (txn as any).package.toString(), (txn as any)._id.toString());
      console.log('[zaloCallback] Subscription activated successfully for transaction:', transactionId);
    } catch (error) {
      console.error('[zaloCallback] Failed to activate subscription:', error);
    }

    return res.status(200).json({ return_code: 1, return_message: 'Success' });
  } catch (err: any) {
    console.error('[zaloCallback] Error:', err);
    return res.status(200).json({ return_code: -1, return_message: err.message });
  }
};

export const adminCreatePackage = async (req: Request, res: Response) => {
  try {
    const { name, price, days, priority_level, isActive } = req.body;
    const pkg = await Package.create({ 
      name, 
      price, 
      days, 
      priority_level: priority_level ?? 0, 
      isActive: isActive ?? true 
    });
    return res.status(201).json({ success: true, data: pkg });
  } catch (err: any) {
    return res.status(400).json({ message: err.message });
  }
};

export const adminUpdatePackage = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const pkg = await Package.findByIdAndUpdate(id, req.body, { new: true });
    if (!pkg) return res.status(404).json({ message: "Not found" });
    return res.json({ success: true, data: pkg });
  } catch (err: any) {
    return res.status(400).json({ message: err.message });
  }
};

export const adminDeletePackage = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const pkg = await Package.findByIdAndDelete(id);
    if (!pkg) return res.status(404).json({ message: "Not found" });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(400).json({ message: err.message });
  }
};

export const listPackages = async (req: Request, res: Response) => {
  try {
    const pkgs = await Package.find().sort({ priority_level: 1 }).lean();
    return res.json({ success: true, data: pkgs });
  } catch (err: any) {
    return res.status(400).json({ message: err.message });
  }
};

export const createZaloQuery = async (req: Request & { user?: any }, res: Response) => {
  try {
    const { app_trans_id } = req.body;
    if (!app_trans_id) {
      return res.status(400).json({ message: 'app_trans_id required' });
    }

    const app_id = process.env.ZALOPAY_APP_ID;
    const key1 = process.env.ZALOPAY_KEY1;
    
    if (!app_id || !key1) {
      return res.status(500).json({ message: 'ZaloPay config missing' });
    }

    const postData: any = {
      app_id: parseInt(app_id, 10),
      app_trans_id: app_trans_id
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