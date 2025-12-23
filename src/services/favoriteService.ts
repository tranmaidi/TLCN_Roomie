import Favorite from "../models/Favorite";
import Post from "../models/Post";
import mongoose from "mongoose";

export const addFavorite = async (
    userId: mongoose.Types.ObjectId,
    postId: mongoose.Types.ObjectId
) => {
    // Kiểm tra bài viết tồn tại
    const post = await Post.findById(postId);
    if (!post) {
        throw new Error("Bài viết không tồn tại");
    }

    // Kiểm tra bài viết có phải của chính user
    if (post.owner.toString() === userId.toString()) {
        throw new Error("Bạn không thể thêm bài viết của chính mình vào yêu thích");
    }

    // Giới hạn 100 bài
    const count = await Favorite.countDocuments({ user: userId });
    if (count >= 100) {
        throw new Error("Bạn chỉ được lưu tối đa 100 bài viết yêu thích");
    }

    // Tạo favorite (unique index đã chống trùng)
    const favorite = await Favorite.create({
        user: userId,
        post: postId
    });

    return favorite;
};

export const removeFavorite = async (userId: mongoose.Types.ObjectId, postId: mongoose.Types.ObjectId) => {
    const deleted = await Favorite.findOneAndDelete({ user: userId, post: postId });

    if (!deleted) {
        throw new Error("Bài viết chưa nằm trong danh sách yêu thích");
    }

    return true;
};

export const getFavorites = async (userId: mongoose.Types.ObjectId) => {
    return Favorite.find({ user: userId })
        .populate("post")
        .sort({ createdAt: -1 });
};
