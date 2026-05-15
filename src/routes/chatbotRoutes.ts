import express from "express";
import * as chatbotController from "../controllers/chatbotController";

const router = express.Router();

// POST /api/chatbot
router.post("/", chatbotController.chat);

export default router;
