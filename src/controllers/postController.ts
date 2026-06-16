import { Request, Response } from "express";
import * as postService from "../services/postService";
import { rerankPostsByUser, recordInteraction, getLatestSearchQuery } from "../services/rankingService";
import { applyBusinessRanking } from "../services/postService";

export const createPost = async (req: Request & { user?: any }, res: Response) => {
    try {
        const { title, description, price, city, district, ward, address, superficies, category } = req.body;
        const files = req.files as Express.Multer.File[];
        const mediaUrls = files?.map((file) => (file as any).path) || [];

        const io = req.app.get("io"); // Lấy instance socket.io từ app

        const newPost = await postService.createPost({
            title,
            description,
            price,
            city,
            district,
            ward,
            address,
            superficies,
            images: mediaUrls,
            owner: req.user.id,
            category,
        }, io); // Truyền io vào service

        res.status(201).json({ message: "Tạo bài viết thành công", data: newPost });
    } catch (err: any) {
        const message = err?.message || "Lỗi server!";
        if (message.includes("kích hoạt quyền đăng tin")) {
            return res.status(403).json({ message });
        }
        res.status(400).json({ message });
    }
};

export const deletePost = async (req: Request & { user?: any }, res: Response) => {
    try {
        const io = req.app.get("io"); // <-- Lấy socket.io

        const result = await postService.deletePost(
            req.params.id,
            req.user.id,
            req.user.role === "admin",
            io
        );

        res.json(result);
    } catch (err: any) {
        res.status(400).json({ message: err.message });
    }
};

export const updatePost = async (req: Request & { user?: any }, res: Response) => {
    try {
        const io = req.app.get("io"); // <-- Lấy socket.io

        const files = req.files as Express.Multer.File[];
        const mediaUrls = files?.map((file) => (file as any).path);

        const updatedPost = await postService.updatePost(
            req.params.id,
            req.user.id,
            req.user.role === "admin",
            {
                ...req.body,
                ...(mediaUrls?.length ? { images: mediaUrls } : {}),
            },
            io
        );

        res.json({ message: "Cập nhật bài viết thành công", data: updatedPost });
    } catch (err: any) {
        res.status(400).json({ message: err.message });
    }
};

export const toggleAvailable = async (req: Request & { user?: any }, res: Response) => {
    try {
        const io = req.app.get("io"); // <-- Lấy socket.io

        const { id } = req.params;
        const { available } = req.body;

        if (typeof available !== "boolean") {
            return res
                .status(400)
                .json({ message: "Trạng thái 'available' phải là true hoặc false" });
        }

        const updatedPost = await postService.toggleAvailable(
            id,
            req.user.id,
            req.user.role === "admin",
            available,
            io
        );

        res.json({ message: "Cập nhật trạng thái thành công", data: updatedPost });
    } catch (err: any) {
        res.status(400).json({ message: err.message });
    }
};

export const getPostDetail = async (req: Request, res: Response) => {
    try {
        const post = await postService.getPostDetail(req.params.id);
        if (!post) return res.status(404).json({ message: "Không tìm thấy bài viết" });
        res.json(post);
    } catch (err: any) {
        res.status(400).json({ message: err.message });
    }
};

export const getMyPosts = async (req: Request & { user?: any }, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;

        const posts = await postService.getMyPosts(req.user.id, page, limit);
        res.json(posts);
    } catch (err: any) {
        res.status(400).json({ message: err.message });
    }
};

// Lấy bài viết đã bán (available=false) của chính mình
export const getMySoldPosts = async (req: Request & { user?: any }, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const posts = await postService.getMySoldPosts(req.user.id, page, limit);
    return res.json(posts);
  } catch (err: any) {
    return res.status(400).json({ message: err.message });
  }
};

// Lấy bài viết đã bán (available=false) của người khác (public)
export const getSoldPostsByUser = async (req: Request, res: Response) => {
  try {
    const ownerId = req.params.userId;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const posts = await postService.getSoldPostsByUser(ownerId, page, limit);
    return res.json(posts);
  } catch (err: any) {
    return res.status(400).json({ message: err.message });
  }
};

export const getAllPostsAdmin = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;

        const posts = await postService.getAllPostsAdmin(page, limit);
        res.json(posts);
    } catch (err: any) {
        res.status(400).json({ message: err.message });
    }
};

// export const approvePost = async (req: Request, res: Response) => {
//     try {
//         const postId = req.params.id;
//         const post = await postService.approvePost(postId);
//         res.status(200).json({ message: "Bài viết đã được duyệt", post });
//     } catch (error: any) {
//         res.status(400).json({ message: error.message });
//     }
// };

export const getApprovedPosts = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const userId = (req as any).user?.id;
    const posts = await postService.getApprovedPosts(page, limit, userId);

  if (userId && posts?.content?.length) {
      try {
        await recordInteraction(userId, "view", { meta: { action: "listApproved" } });
      } catch (e) {
        console.error("[postController] recordInteraction failed", e);
      }

      try {
        const latestQuery = await getLatestSearchQuery(userId);
        posts.content = await rerankPostsByUser(userId, latestQuery, posts.content);
        // apply business ranking after AI rerank to include partner/subscription boost
        posts.content = applyBusinessRanking(userId, posts.content);
      } catch (e) {
        console.error("[postController] rerank failed", e);
      }
    }

    return res.status(200).json(posts);
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
};

export const getApprovedPostsByUser = async (req: Request, res: Response) => {
    try {
        const userId = req.params.userId;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;

        const posts = await postService.getApprovedPostsByUser(userId, page, limit);
        res.status(200).json(posts);
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
};

export const searchPosts = async (req: Request, res: Response) => {
    try {
    const userId = (req as any).user?.id;
        const query = {
            city: req.query.city?.toString(),
            district: req.query.district?.toString(),
            ward: req.query.ward?.toString(),
            category: req.query.category?.toString(),
            minPrice: req.query.minPrice ? Number(req.query.minPrice) : undefined,
            maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : undefined,
            keyword: req.query.keyword?.toString(),
            page: req.query.page ? Number(req.query.page) : 1,
            limit: req.query.limit ? Number(req.query.limit) : 10,
      userId,
        };

        const result = await postService.searchPosts(query);
        const keyword = (req.query.keyword as string) || "";

        // record/search + rerank only for authenticated users (non-blocking)
        if (userId && keyword) {
          recordInteraction(userId, "search", { query: keyword }).catch((e) => {
            console.error("[postController] recordInteraction failed", e);
          });
        }

        if (userId && result?.content?.length) {
          try {
            result.content = await rerankPostsByUser(userId, keyword, result.content);
          } catch (e) {
            console.error("[postController] rerank failed", e);
          }
        }

        res.status(200).json(result);
    } catch (err: any) {
        console.error(err);
        res.status(500).json({ message: err.message || "Lỗi server!" });
    }
};

export const getNearbyPosts = async (req: Request, res: Response) => {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    const maxDistance = parseInt(req.query.maxDistance as string) || 5000;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ message: "lat và lng phải là số hợp lệ" });
    }

    const userId = (req as any).user?.id;
    const result = await postService.getNearbyPosts(lat, lng, maxDistance, page, limit, userId);

    if (userId) {
      recordInteraction(userId, "search", { query: `nearby:${lat},${lng}` }).catch((e) => {
        console.error("[postController] recordInteraction failed", e);
      });
    }

    res.status(200).json(result);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ message: err.message || "Lỗi server!" });
  }
};

export const getPriority = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
  const userId = (req as any).user?.id;
  const result = await postService.getPriorityPosts(page, limit, userId);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
}

export const getNewest = async (req: Request, res: Response) => {
  try {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const userId = (req as any).user?.id;
  const result = await postService.getNewestPosts(page, limit, userId);
  return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
}
