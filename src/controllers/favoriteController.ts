import { Request, Response } from "express";
import mongoose from "mongoose";
import * as favoriteService from "../services/favoriteService";
import { recordInteraction } from "../services/rankingService";

export const addFavorite = async (req: Request & { user?: any }, res: Response) => {
    try {
        const userId = req.user?.id;
        const postId = req.params.postId;

        if (!postId) return res.status(400).json({ message: "Thiếu postId" });

        const result = await favoriteService.addFavorite(
            new mongoose.Types.ObjectId(userId),
            new mongoose.Types.ObjectId(postId)
        );

        // non-blocking log for personalization
        recordInteraction(userId, "favorite", { postId, meta: { action: "add" } }).catch((e) => {
            console.error("[favoriteController] recordInteraction failed", e);
        });

        res.status(201).json({ message: "Đã thêm vào yêu thích", data: result });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
};

export const removeFavorite = async (req: Request & { user?: any }, res: Response) => {
    try {
        const userId = req.user?.id;
        const postId = req.params.postId;

        const result = await favoriteService.removeFavorite(
            new mongoose.Types.ObjectId(userId),
            new mongoose.Types.ObjectId(postId)
        );

        // non-blocking log for personalization
        recordInteraction(userId, "favorite", { postId, meta: { action: "remove" } }).catch((e) => {
            console.error("[favoriteController] recordInteraction failed", e);
        });

        res.json({ message: "Đã xóa khỏi yêu thích" });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
};

export const getFavorites = async (req: Request & { user?: any }, res: Response) => {
    try {
        const userId = req.user?.id;

        const favorites = await favoriteService.getFavorites(
            new mongoose.Types.ObjectId(userId)
        );

        res.json({ data: favorites });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
};
