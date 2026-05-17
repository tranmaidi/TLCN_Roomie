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
  location?: {
    type: "Point";
    coordinates: [number, number]; // [lng, lat]
  };
  createdAt?: Date;
  updatedAt?: Date;
  priority_level?: number;
  priority_expiry?: Date;
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
    statusApproval: { type: Boolean, default: true },
    category: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    searchNormalized: { type: String, index: true, select: false },
    // Thêm location GeoJSON
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [lng, lat]
        required: false,
      },
    },
  // Priority fields (subscription + partner)
  priority_level: { type: Number, default: 0 },
  priority_expiry: { type: Date },
  },
  { timestamps: true }
);

// Thêm 2dsphere index để query theo bán kính
postSchema.index({ location: "2dsphere" });

// Index hỗ trợ tìm nhanh theo vùng và giá
postSchema.index({ city: 1, district: 1, price: 1 });

// Text index for semantic-ish search layer (MongoDB native text search)
// Note: weights are tuned for room finding queries.
postSchema.index(
  {
    title: "text",
    description: "text",
    address: "text",
    searchNormalized: "text",
  },
  {
    name: "post_text_search",
    weights: {
      title: 10,
      description: 5,
      address: 4,
      searchNormalized: 3,
    },
    default_language: "none",
  }
);

// Middleware: tự động tạo bản không dấu để hỗ trợ tìm kiếm tiếng Việt không dấu
postSchema.pre("save", function (next) {
  const post = this as unknown as IPost;
  const combined = `${post.title} ${post.description} ${post.address}`;
  post.searchNormalized = removeVietnameseTones(combined.toLowerCase());
  next();
});

const Post = mongoose.model<IPost>("Post", postSchema);
export default Post;
