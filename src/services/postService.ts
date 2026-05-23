import Post, { IPost } from "../models/Post";
import { removeVietnameseTones } from "../utils/normalizeText";
import mongoose from "mongoose";
import { NotificationService } from "./notificationService";
import { getLatLngFromAddress, formatAddress } from "../utils/geocoding";
import Subscription from "../models/Subscription";
import Package from "../models/Package";

// Tạo bài viết mới
export const createPost = async (data: Partial<IPost>, io?: any) => {
  try {
    // Lấy tọa độ từ địa chỉ nếu có đủ thông tin
    let location: any = undefined;
    if (data.address) {
      const fullAddress = formatAddress(data.address, data.ward, data.district, data.city);
      try {
        const coords = await getLatLngFromAddress(fullAddress, data.city);
        if (coords) {
          location = {
            type: "Point",
            coordinates: [coords.lng, coords.lat], // [lng, lat]
          };
          console.log(`[createPost] Geocoded address: ${fullAddress} -> [${coords.lng}, ${coords.lat}]`);
        } else {
          console.warn(`[createPost] Geocoding returned null for: ${fullAddress} — post will be saved without location`);
        }
      } catch (geocodeErr) {
        console.error(`[createPost] Geocoding error for address "${fullAddress}":`, geocodeErr);
      }
    }

    const postData: any = { ...data };
    // Nếu owner có subscription active thì áp priority tương ứng
    try {
      const ownerId = data.owner;
      if (ownerId) {
        const now = new Date();
        const activeSub = await Subscription.findOne({ user: ownerId, status: 'active', expiryAt: { $gt: now } }).populate('package');
        if (activeSub) {
          const pkg: any = (activeSub as any).package || (await Package.findById((activeSub as any).package));
          if (pkg) {
            postData.priority_level = pkg.priority_level ?? 0;
            postData.priority_expiry = (activeSub as any).expiryAt || undefined;
            // also propagate partnerPriority if needed (kept as default 0)
            console.log(`[createPost] Applying subscription priority to new post: user=${ownerId}, priority_level=${postData.priority_level}`);
          }
        }
      }
    } catch (e) {
      console.error('[createPost] Failed to apply subscription priority:', e);
    }
    if (location) {
      postData.location = location;
    }

    const post = new Post(postData);
    const savedPost = await post.save();

    return savedPost;
  } catch (error) {
    console.error('[postService.createPost] Error', error);
    throw error;
  }
};

// Xóa bài viết (của chủ sở hữu hoặc admin)
export const deletePost = async (id: string, userId: string, isAdmin: boolean, io?: any) => {
    const post = await Post.findById(id);
    if (!post) throw new Error("Không tìm thấy bài viết");

    if (!isAdmin && post.owner.toString() !== userId) {
        throw new Error("Bạn không có quyền xóa bài viết này");
    }

    await Post.findByIdAndDelete(id);

    // --- Gửi thông báo tới chủ bài viết ---
    if (isAdmin) {
        const notification = await NotificationService.createNotification({
            user: post.owner.toString(),
            sender: userId,
            type: "system",
            content: `Bài viết "${post.title}" của bạn đã bị admin xóa.`,
            post: id,
        });

        if (io) io.to(post.owner.toString()).emit("newNotification", notification);
    }

    return { message: "Xóa bài viết thành công" };
};

// Cập nhật bài viết (của chủ sở hữu hoặc admin)
export const updatePost = async (
    id: string,
    userId: string,
    isAdmin: boolean,
    data: Partial<IPost>,
    io?: any
) => {
    const post = await Post.findById(id);
    if (!post) throw new Error("Không tìm thấy bài viết");

    const isOwner = post.owner.toString() === userId;

    if (!isAdmin && !isOwner) {
        throw new Error("Bạn không có quyền chỉnh sửa bài viết này");
    }

    Object.assign(post, data);
    await post.save();

    // --- Gửi thông báo nếu là admin chỉnh sửa ---
    if (isAdmin && !isOwner) {
        const notification = await NotificationService.createNotification({
            user: post.owner.toString(),
            sender: userId,
            type: "system",
            content: `Admin đã chỉnh sửa bài viết "${post.title}" của bạn.`,
            post: post._id.toString(),
        });

        if (io) io.to(post.owner.toString()).emit("newNotification", notification);
    }

    return post;
};

// Thay đổi trạng thái available (chủ sở hữu hoặc admin)
export const toggleAvailable = async (postId: string, userId: string, isAdmin: boolean, available: boolean, io?: any) => {
    const post = await Post.findById(postId);
    if (!post) throw new Error("Không tìm thấy bài viết");

    const isOwner = post.owner.toString() === userId;

    if (!isAdmin && !isOwner) {
        throw new Error("Bạn không có quyền thay đổi trạng thái bài viết này");
    }

    post.available = available;
    await post.save();

    // --- Nếu admin thay đổi trạng thái của bài viết ---
    if (isAdmin && !isOwner) {
        const statusText = available ? "mở lại" : "đóng";

        const notification = await NotificationService.createNotification({
            user: post.owner.toString(),
            sender: userId,
            type: "system",
            content: `Admin đã ${statusText} trạng thái bài viết "${post.title}" của bạn.`,
            post: post._id.toString(),
        });

        if (io) io.to(post.owner.toString()).emit("newNotification", notification);
    }

    return post;
};

// Lấy chi tiết bài viết
export const getPostDetail = async (id: string) => {
    return await Post.findById(id)
        .populate("category", "name")
        .populate("owner", "name email");
};

// Lấy bài viết của chính mình
export const getMyPosts = async (userId: string, page = 1, limit = 10) => {
    const skip = (page - 1) * limit;

    const [posts, total] = await Promise.all([
        Post.find({ owner: userId })
            .populate("category", "name")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),
        Post.countDocuments({ owner: userId })
    ]);

    return {
        content: posts,
        pagination: {
            total,
            page,
            totalPages: Math.ceil(total / limit),
        },
    };
};

// Lấy bài viết đã bán (available=false) của chính mình
export const getMySoldPosts = async (userId: string, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;

  const filters: any = { owner: userId, available: false };

  const [posts, total] = await Promise.all([
    Post.find(filters)
      .populate("category", "name")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit),
    Post.countDocuments(filters),
  ]);

  return {
    content: posts,
    pagination: {
      total,
      page,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// Lấy bài viết đã bán (available=false) của 1 user khác (public)
export const getSoldPostsByUser = async (ownerId: string, page = 1, limit = 10) => {
  if (!mongoose.Types.ObjectId.isValid(ownerId)) {
    throw new Error("UserId không hợp lệ");
  }

  const skip = (page - 1) * limit;
  const filters: any = { owner: ownerId, available: false, statusApproval: true };

  const [posts, total] = await Promise.all([
    Post.find(filters)
      .populate("category", "name -_id")
      .populate("owner", "name email phone")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit),
    Post.countDocuments(filters),
  ]);

  return {
    content: posts,
    pagination: {
      total,
      page,
      totalPages: Math.ceil(total / limit),
    },
  };
};


// Lấy tất cả bài viết (admin)
export const getAllPostsAdmin = async (page = 1, limit = 10) => {
    const skip = (page - 1) * limit;

    const [posts, total] = await Promise.all([
        Post.find()
            .populate("category", "name")
            .populate("owner", "name email")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),
        Post.countDocuments()
    ]);

    return {
        content: posts,
        pagination: {
            total,
            page,
            totalPages: Math.ceil(total / limit),
        },
    };
};


// Duyệt bài viết (chỉ admin)
// export const approvePost = async (postId: string) => {
//     // Kiểm tra ID có hợp lệ không
//     if (!mongoose.Types.ObjectId.isValid(postId)) {
//         throw new Error("ID bài viết không hợp lệ");
//     }

//     // Tìm bài viết theo ID
//     const post = await Post.findById(postId);
//     if (!post) {
//         throw new Error("Không tìm thấy bài viết");
//     }

//     // Nếu bài viết đã được duyệt rồi thì thông báo
//     if (post.statusApproval === true) {
//         throw new Error("Bài viết này đã được duyệt trước đó");
//     }

//     // Duyệt bài viết
//     post.statusApproval = true;
//     await post.save();

//     return post;
// };

// Lấy tất cả bài viết đã duyệt
export const getApprovedPosts = async (page = 1, limit = 10, userId?: string) => {
    const skip = (page - 1) * limit;

    // Filter loại bỏ bài của chính user
    const ownerFilter = userId ? new mongoose.Types.ObjectId(userId) : null;
    const filters: any = { statusApproval: true, available: true };
    if (ownerFilter) {
      filters.owner = { $ne: ownerFilter };
    }

    const [posts, total] = await Promise.all([
        Post.find(filters)
            .populate("category", "name")
            .populate("owner", "name email")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),
        Post.countDocuments(filters)
    ]);

    return {
        content: posts,
        pagination: {
            total,
            page,
            totalPages: Math.ceil(total / limit),
        },
    };
};

// Xem tất cả bài viết của một người dùng
export const getApprovedPostsByUser = async (userId: string, page = 1, limit = 10) => {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new Error("ID người dùng không hợp lệ");
    }

    const skip = (page - 1) * limit;

    const filters = {
        owner: userId,
        statusApproval: true,
    };

    const [posts, total] = await Promise.all([
        Post.find(filters)
            .populate("category", "name -_id")
            .populate("owner", "name email phone")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),
        Post.countDocuments(filters)
    ]);

    return {
        content: posts,
        pagination: {
            total,
            page,
            totalPages: Math.ceil(total / limit),
        },
    };
};

// Tìm kiếm & lọc bài viết
interface SearchQuery {
    city?: string;
    district?: string;
    ward?: string;
    category?: string | mongoose.Types.ObjectId;
    minPrice?: number;
    maxPrice?: number;
    keyword?: string;
    page?: number;
    limit?: number;
}

export const searchPosts = async (query: SearchQuery) => {
    const {
        city,
        district,
        ward,
        category,
        minPrice,
        maxPrice,
        keyword,
        page = 1,
        limit = 10,
    } = query;

    const filters: any = {
        statusApproval: true, // chỉ lấy bài đã duyệt
    };

    if (city) filters.city = city;
    if (district) filters.district = district;
    if (ward) filters.ward = ward;
    if (category) filters.category = category;

    if (minPrice || maxPrice)
        filters.price = {
            ...(minPrice && { $gte: minPrice }),
            ...(maxPrice && { $lte: maxPrice }),
        };

    // Tìm kiếm tiếng Việt không dấu, cho phép gõ sai dấu hoặc sai cách từ
    if (keyword) {
        const normalizedKeyword = removeVietnameseTones(keyword.toLowerCase().trim());
        const keywordRegex = normalizedKeyword
            .split(/\s+/)
            .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) // escape ký tự đặc biệt
            .join(".*"); // cho phép có chữ khác xen giữa các từ

        const regex = new RegExp(keywordRegex, "i");

        filters.$or = [
            { title: regex },
            { city: regex },
            { district: regex },
            { ward: regex },
            { description: regex },
            { address: regex },
            { searchNormalized: regex },
        ];
    }

    const skip = (page - 1) * limit;

  const [posts, total] = await Promise.all([
        Post.find(filters)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("owner", "name email phone")
            .populate("category", "name"),
        Post.countDocuments(filters),
    ]);

    return {
        content: posts,
        pagination: {
            total,
            page,
            totalPages: Math.ceil(total / limit),
        },
    };
};

// Apply business ranking (combine AI order with priority fields) - minimal implementation
export function applyBusinessRanking(userId: string | undefined, posts: any[]) {
  // weights
  const w_ai = 0.7, w_sub = 0.3;
  // Prefer explicit ai_score produced by aiService; if missing, fall back to position proxy
  const n = posts.length;
  const scored = posts.map((p, idx) => {
    const ai_score = typeof p.ai_score === "number" ? p.ai_score : (n - idx) / Math.max(n, 1);
  const expiryOk = p.priority_expiry ? new Date(p.priority_expiry) > new Date() : false;
  // priority_level mapping: 1 = Premium, 2 = Basic, 0 = normal
  const sub = expiryOk ? (p.priority_level === 1 ? 0.4 : (p.priority_level === 2 ? 0.2 : 0)) : 0;
    const final = w_ai * ai_score + w_sub * sub;
    return { post: p, final };
  });

  scored.sort((a, b) => b.final - a.final);

  return scored.map((s) => s.post);
}

export const getPriorityPosts = async (page = 1, limit = 10) => {
  // return active priority posts (subscription) ordered high->low, nearest expiry first
  const now = new Date();
  const skip = (page - 1) * limit;
  const filter = {
    priority_level: { $gt: 0 },
    priority_expiry: { $exists: true, $gt: now },
    available: true,
    statusApproval: true,
  };

  const [docs, total] = await Promise.all([
    Post.find(filter)
      .sort({ priority_level: -1, priority_expiry: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("owner", "name email")
      .lean(),
    Post.countDocuments(filter),
  ]);

  return {
    content: docs,
    pagination: {
      total,
      page,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export const getNewestPosts = async (page = 1, limit = 10) => {
  const skip = (page - 1) * limit;
  const filter = { available: true, statusApproval: true };

  const [docs, total] = await Promise.all([
    Post.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("owner", "name email")
      .lean(),
    Post.countDocuments(filter),
  ]);

  return {
    content: docs,
    pagination: {
      total,
      page,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Tìm bài viết gần đây dựa trên tọa độ (lat, lng) + bán kính
 * Dùng aggregation pipeline với $geoNear
 */
export const getNearbyPosts = async (lat: number, lng: number, maxDistance = 5000, page = 1, limit = 10, userId?: string) => {
  const skip = (page - 1) * limit;

  // Filter loại bỏ bài của chính user
  const ownerFilter = userId ? new mongoose.Types.ObjectId(userId) : null;

  const [posts, countResult] = await Promise.all([
    Post.aggregate([
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [lng, lat], // [lng, lat]
          },
          distanceField: "distance",
          maxDistance: maxDistance,
          spherical: true,
          query: { 
            statusApproval: true,
            ...(ownerFilter ? { owner: { $ne: ownerFilter } } : {}), // ⭐ Loại bỏ bài của user
          },
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $skip: skip,
      },
      {
        $limit: limit,
      },
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "category",
        },
      },
      {
        $unwind: {
          path: "$category",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "owner",
          foreignField: "_id",
          as: "owner",
        },
      },
      {
        $unwind: {
          path: "$owner",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          title: 1,
          description: 1,
          price: 1,
          city: 1,
          district: 1,
          ward: 1,
          address: 1,
          images: 1,
          available: 1,
          statusApproval: 1,
          distance: 1,
          "category.name": 1,
          "owner.name": 1,
          "owner.email": 1,
          "owner.phone": 1,
          createdAt: 1,
        },
      },
    ]),
    Post.countDocuments({
      statusApproval: true,
      location: { $exists: true, $ne: null },
      ...(ownerFilter ? { owner: { $ne: ownerFilter } } : {}),
    }),
  ]);

  return {
    content: posts,
    pagination: {
      total: countResult,
      page,
      totalPages: Math.ceil(countResult / limit),
    },
  };
};

