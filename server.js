// server.js (hoặc index.js) – FILE HOÀN CHỈNH ĐÃ FIX TẤT CẢ
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const User = require("./src/models/User");

dotenv.config();

// KIỂM TRA SECRET_KEY – BẮT BUỘC
if (!process.env.SECRET_KEY) {
  console.error("SECRET_KEY is not defined in environment variables!");
  process.exit(1);
}

const app = express();

// LOG MỖI REQUEST (rất hữu ích khi debug)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${req.ip}`);
  next();
});

// MỞ HOÀN TOÀN CORS – CHO PHÉP TẤT CẢ DOMAIN (localhost, Vercel, Render, điện thoại...)
app.use(cors({
  origin: true, // Cho phép mọi origin
  credentials: true,
}));
console.log("CORS: ĐÃ MỞ HOÀN TOÀN → localhost, Vercel, Render, mobile... đều được!");

// BẢO MẬT VỚI HELMET + CHO PHÉP data: (base64 avatar)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      fontSrc: ["'self'", "data:"],
    },
  },
}));

// QUAN TRỌNG NHẤT: TĂNG GIỚI HẠN PAYLOAD ĐỂ GỬI ẢNH BASE64 LỚN
app.use(express.json({ limit: "10mb" }));                    // Cho phép JSON lên tới 10MB
app.use(express.urlencoded({ limit: "10mb", extended: true })); // Cho form-data nếu cần

// RATE LIMIT RIÊNG CHO ĐĂNG NHẬP (chống brute force)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 10,
  message: { message: "Quá nhiều lần đăng nhập. Vui lòng thử lại sau 15 phút." },
});
app.use("/api/auth/login", loginLimiter);

// RATE LIMIT CHUNG (tăng cao cho dev, production có thể giảm)
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000000,
  message: { message: "Quá nhiều yêu cầu từ IP này. Thử lại sau 15 phút." },
}));

// KẾT NỐI MONGODB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("MongoDB connected successfully!");
    await createDefaultAdmin();
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  }
};

// TẠO TÀI KHOẢN ADMIN MẶC ĐỊNH
const createDefaultAdmin = async () => {
  try {
    const adminExists = await User.findOne({ username: "admin" });
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
        address1: "Hà Nội, Việt Nam",
        avatar: null,
      });
      await admin.save();
      console.log("Default admin created → username: admin | password: admin123");
    } else {
      console.log("Admin account already exists");
    }
  } catch (err) {
    console.error("Error creating default admin:", err.message);
  }
};

connectDB();

// IMPORT VÀ SỬ DỤNG ROUTES
try {
  const authRouter = require("./src/routes/auth");
  const lampRouter = require("./src/routes/lamp");
  const scheduleRouter = require("./src/routes/schedule");
  const activityLogRouter = require("./src/routes/activitylog");

  app.use("/api/auth", authRouter);
  app.use("/api/lamp", lampRouter);
  app.use("/api/schedule", scheduleRouter);
  app.use("/api/activitylog", activityLogRouter);

  console.log("All routes loaded successfully!");
} catch (err) {
  console.error("Error loading routes:", err.message);
  process.exit(1);
}

// TRANG CHỦ ĐỂ TEST SERVER SỐNG
app.get("/", (req, res) => {
  res.json({
    message: "Backend Admin Panel đang chạy mượt mà!",
    version: "1.0.0",
    time: new Date().toISOString(),
  });
});

// XỬ LÝ LỖI 404
app.use((req, res) => {
  res.status(404).json({ message: "Route không tồn tại!" });
});

// XỬ LÝ LỖI CHUNG
app.use((err, req, res, next) => {
  console.error("Server Error:", err.stack);
  res.status(500).json({ message: "Có lỗi xảy ra trên server!", error: err.message });
});

// KHỞI ĐỘNG SERVER
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server đang chạy trên port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
  console.log(`Deploy: https://your-backend.onrender.com`);
  console.log("CHÚC BẠN THÀNH CÔNG!");
});