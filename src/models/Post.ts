import mongoose, { Document, Schema } from "mongoose";
import { removeVietnameseTones } from "../utils/normalizeText";

export interface IPost extends Document {
  _id: mongoose.Types.ObjectId;
  title: string;
  description: string;
  price: number;
  city: string;
  district: string;
  ward?: string;
  address: string;
  superficies?: number;
  images: string[];
  available: boolean;
  statusApproval: boolean;
  category: mongoose.Types.ObjectId;
  owner: mongoose.Types.ObjectId;
  searchNormalized?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const postSchema = new Schema<IPost>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    city: { type: String, required: true },
    district: { type: String, required: true },
    ward: { type: String },
    address: { type: String, required: true },
    superficies: { type: Number },
    images: { type: [String], default: [] },
    available: { type: Boolean, default: true },
    statusApproval: { type: Boolean, default: false },
    category: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    searchNormalized: { type: String, index: true , select: false },
  },
  { timestamps: true }
);

// Middleware: tự động tạo bản không dấu để hỗ trợ tìm kiếm tiếng Việt không dấu
postSchema.pre("save", function (next) {
  const post = this as IPost;
  const combined = `${post.title} ${post.description} ${post.address}`;
  post.searchNormalized = removeVietnameseTones(combined.toLowerCase());
  next();
});

// Index hỗ trợ tìm nhanh theo vùng và giá
postSchema.index({ city: 1, district: 1, price: 1 });

const Post = mongoose.model<IPost>("Post", postSchema);
export default Post;
