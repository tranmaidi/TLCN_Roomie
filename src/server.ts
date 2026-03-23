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

// ====== SOCKET ======
import initMessageSocket from "./socket/messageSocket";
import { notificationSocket } from "./socket/notificationSocket";

dotenv.config();
const app: Application = express();

// ====== MIDDLEWARE ======
app.use(cors());
app.use(express.json());

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

// ====== START ======
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
