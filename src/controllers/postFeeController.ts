import { Request, Response } from "express";
import { getCurrentPostFee, upsertPostFee } from "../services/postFeeService";
import { NotificationService } from "../services/notificationService";

export const getPostFee = async (_req: Request, res: Response) => {
  try {
    const fee = await getCurrentPostFee();
    return res.json({
      feeAmount: fee.feeAmount,
      updatedAt: fee.updatedAt,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

export const updatePostFee = async (req: Request, res: Response) => {
  try {
    const { feeAmount } = req.body;
    const parsedFee = Number(feeAmount);

    if (feeAmount === undefined || feeAmount === null || Number.isNaN(parsedFee)) {
      return res.status(400).json({ message: "feeAmount bắt buộc" });
    }

    if (parsedFee < 0) {
      return res.status(400).json({ message: "feeAmount phải >= 0" });
    }

    const currentFee = await getCurrentPostFee();
    const oldFee = Number(currentFee.feeAmount || 0);
    await upsertPostFee(parsedFee);

    if (Number(oldFee) !== Number(parsedFee)) {
      await NotificationService.notifyAllUsers(
        `Phí kích hoạt quyền đăng tin đã được cập nhật từ ${oldFee.toLocaleString("vi-VN")}đ lên ${parsedFee.toLocaleString("vi-VN")}đ.`
      );
    }

    return res.json({ message: "Cập nhật phí kích hoạt quyền đăng tin thành công" });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};
