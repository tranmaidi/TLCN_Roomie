import express, { Application } from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import connectDB from "./config/database";

// ====== ROUTES ======
import authRoutes from "./routes/userRoutes";
import categoryRoutes from "./routes/categoryRoutes";
import postRoutes from "./routes/postRoutes";
import conversationRoutes from "./routes/conversationRoutes";
import messageRoutes from "./routes/messageRoutes";
import uploadRoutes from "./routes/uploadRoutes";
import notificationRoutes from "./routes/notificationRoute";
import favoriteRoutes from "./routes/favoriteRoutes";
import noteRoutes from "./routes/noteRoutes";
import adminRoutes from "./routes/adminRoutes";
import surveyRoutes from "./routes/surveyRoutes";
import subscriptionRoutes from "./routes/subscriptionRoutes";
import reviewRoutes from "./routes/reviewRoutes";
import startSubscriptionCron from "./cron/subscriptionCron";

// ====== SOCKET ======
import initMessageSocket from "./socket/messageSocket";
import { notificationSocket } from "./socket/notificationSocket";

dotenv.config();
const app: Application = express();

// ====== MIDDLEWARE ======
app.use(cors());

// Middleware này lưu raw body cho ZaloPay callback
app.use(express.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

// Parse application/x-www-form-urlencoded (ZaloPay callback uses form fields `data` and `mac`)
app.use(express.urlencoded({ extended: true }));

// ====== DATABASE ======
connectDB();

// ====== ROUTES ======
app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/favorites", favoriteRoutes);
app.use("/api/notes", noteRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/surveys", surveyRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/reviews", reviewRoutes);

// ====== SERVER + SOCKET ======
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// Khởi tạo Socket.io server
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

// Lưu io để controller/service có thể dùng emit()
app.set("io", io);

// Tích hợp các module socket
initMessageSocket(io);
notificationSocket(io);

// start subscription cron tasks
startSubscriptionCron();

// ====== START ======
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));