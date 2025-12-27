const dotenv = require("dotenv");  // ← THÊM DÒNG NÀY (QUAN TRỌNG)
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");  // ← Cũng đã có từ lần trước

const User = require("./src/models/User");

dotenv.config();  // Bây giờ mới được gọi đúng

// Kiểm tra SECRET_KEY
if (!process.env.SECRET_KEY) {
  console.error("SECRET_KEY is not defined in environment variables");
  process.exit(1);
}

const app = express();

// Middleware logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${req.ip}`);
  next();
});

// CORS mở hoàn toàn
app.use(cors());
console.log("CORS: ĐÃ MỞ HOÀN TOÀN → localhost + Vercel + mọi domain đều được phép!");

// Bảo mật
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

// Rate limit
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Quá nhiều yêu cầu đăng nhập, vui lòng thử lại sau 15 phút.",
});
app.use("/api/auth/login", loginLimiter);

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000000000,
  message: "Quá nhiều yêu cầu, vui lòng thử lại sau 15 phút.",
}));

// Kết nối MongoDB
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

// Load routers
try {
  const authRouter = require("./src/routes/auth");
  const lampRouter = require("./src/routes/lamp");
  const scheduleRouter = require("./src/routes/schedule");
  const activityLogRouter = require("./src/routes/activitylog");

  console.log("Auth router type:", typeof authRouter);
  console.log("Lamp router type:", typeof lampRouter);
  console.log("Schedule router type:", typeof scheduleRouter);
  console.log("ActivityLog router type:", typeof activityLogRouter);

  app.use("/api/auth", authRouter);
  app.use("/api/lamp", lampRouter);
  app.use("/api/schedule", scheduleRouter);
  app.use("/api/activitylog", activityLogRouter);
} catch (err) {
  console.error("Error loading routers:", err.message);
  process.exit(1);
}

// Xử lý lỗi chung
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Có lỗi xảy ra trên server." });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
