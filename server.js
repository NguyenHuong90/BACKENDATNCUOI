const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");           // ← Giữ lại để dùng
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const User = require("./src/models/User");

dotenv.config();

// Kiểm tra SECRET_KEY
if (!process.env.SECRET_KEY) {
  console.error("SECRET_KEY is not defined in environment variables");
  process.exit(1);
}

const app = express();

// Middleware logging (giữ lại để thấy log đẹp)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${req.ip}`);
  next();
});

// ĐÃ SỬA: MỞ HOÀN TOÀN CORS → CHO PHÉP VERCEL, LOCALHOST, ĐIỆN THOẠI, MỌI NƠI KẾT NỐI
app.use(cors());
console.log("CORS: ĐÃ MỞ HOÀN TOÀN → localhost + Vercel + mọi domain đều được phép!");

// Cấu hình Helmet (giữ nguyên bảo mật)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
    },
  },
  xssFilter: true,
}));

app.use(express.json());

// Rate limit riêng cho đăng nhập (giữ nguyên)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 5,
  message: "Quá nhiều yêu cầu đăng nhập, vui lòng thử lại sau 15 phút.",
});
app.use("/api/auth/login", loginLimiter);

// Rate limit chung (đã tăng max cho dev)
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000000000,
  message: "Quá nhiều yêu cầu, vui lòng thử lại sau 15 phút.",
}));

// XÓA HẾT ĐOẠN XỬ LÝ LỖI CORS CŨ (không cần nữa vì đã mở hoàn toàn)
// (đoạn app.use((err, req, res, next) => { if (err.message === "Not allowed by CORS")... }) → XÓA HOẶC COMMENT

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL || "mongodb://localhost:27017/lamp_control", {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("MongoDB connected");
    await createDefaultAdmin();
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  }
};

const createDefaultAdmin = async () => {
  try {
    const adminExists = await User.findOne({
      $or: [
        { username: "admin" },
        { email: "admin@example.com" },
        { contact: "0123456789" },
      ],
    });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash("admin123", 10);
      const admin = new User({
        username: "admin",
        password: hashedPassword,
        role: "admin",
        firstName: "Nguyễn Văn",
        lastName: "Hướng",
        email: "admin@example.com",
        contact: "0123456789",
        address1: "Default Address",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await admin.save();
      console.log("Default admin account created: username=admin, password=admin123");
    } else {
      console.log("Admin account already exists");
    }
  } catch (err) {
    console.error("Error creating default admin account:", err.message);
  }
};

connectDB();

// Kiểm tra và log các router
try {
  const authRouter = require("./src/routes/auth");
  const lampRouter = require("./src/routes/lamp");
  const scheduleRouter = require("./src/routes/schedule");
  const activityLogRouter = require("./src/routes/activitylog");

  console.log("Auth router type:", typeof authRouter);
  console.log("Lamp router type:", typeof lampRouter);
  console.log("Schedule router type:", typeof scheduleRouter);
  console.log("ActivityLog router type:", typeof activityLogRouter);

  if (
    typeof authRouter !== "function" ||
    typeof lampRouter !== "function" ||
    typeof scheduleRouter !== "function" ||
    typeof activityLogRouter !== "function"
  ) {
    throw new Error("One or more routers are not functions");
  }

  app.use("/api/auth", authRouter);
  app.use("/api/lamp", lampRouter);
  app.use("/api/schedule", scheduleRouter);
  app.use("/api/activitylog", activityLogRouter);
} catch (err) {
  console.error("Error loading routers:", err.message);
  process.exit(1);
}

// Middleware xử lý lỗi chung (giữ nguyên)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Có lỗi xảy ra trên server." });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));