import mongoose, { Document, Schema } from "mongoose";

export interface IConversation extends Document {
  members: mongoose.Types.ObjectId[];
  lastMessage?: mongoose.Types.ObjectId;
  avatar?: string;
  name?: string;
  deletedFor?: mongoose.Types.ObjectId[];
}

const conversationSchema = new Schema<IConversation>(
  {
    members: [{ type: Schema.Types.ObjectId, ref: "User", required: true }],
    lastMessage: { type: Schema.Types.ObjectId, ref: "Message" },
    avatar: { type: String, default: "" },
    name: { type: String, default: "" },
    deletedFor: [{ type: Schema.Types.ObjectId, ref: "User", default: [] }],
  },
  { timestamps: true }
);

const Conversation = mongoose.model<IConversation>("Conversation", conversationSchema);
export default Conversation;
