import mongoose, { Document, Schema } from "mongoose";

export type InteractionType = "search" | "view" | "click" | "favorite" | "survey";

export interface IInteraction extends Document {
  user?: mongoose.Types.ObjectId;
  type: InteractionType;
  query?: string;
  post?: mongoose.Types.ObjectId;
  meta?: any;
  createdAt?: Date;
}

const InteractionSchema = new Schema<IInteraction>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", index: true, required: false },
    type: { type: String, enum: ["search", "view", "click", "favorite", "survey"], required: true },
    query: { type: String },
    post: { type: Schema.Types.ObjectId, ref: "Post" },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

const Interaction = mongoose.model<IInteraction>("Interaction", InteractionSchema);
export default Interaction;