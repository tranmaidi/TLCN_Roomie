import PostFee, { IPostFee } from "../models/PostActivationFee";

export async function getCurrentPostFee(): Promise<IPostFee> {
  let fee = await PostFee.findOne({});
  if (!fee) {
    fee = await PostFee.create({ feeAmount: 0 });
  }
  return fee;
}

export async function upsertPostFee(feeAmount: number): Promise<IPostFee> {
  const current = await PostFee.findOne({});
  if (!current) {
    return PostFee.create({ feeAmount });
  }

  current.feeAmount = feeAmount;
  await current.save();
  return current;
}
