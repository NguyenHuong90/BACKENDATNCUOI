const express = require("express");
const router = express.Router();
const User = require("../models/User");
const ActivityLog = require("../models/ActivityLog");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const sendEmail = require("../utils/mailer");

/* ================= MIDDLEWARE ================= */

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Không có token" });

  try {
    const decoded = jwt.verify(token, process.env.SECRET_KEY);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: "Token không hợp lệ" });
  }
};

/* ================= VERIFY TOKEN ================= */

router.get("/verify", verifyToken, (req, res) => {
  res.json({ message: "Token hợp lệ", userId: req.user.id, role: req.user.role });
});

/* ================= REFRESH TOKEN ================= */

router.post("/refresh", (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ message: "Không có refresh token" });

  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_SECRET_KEY);
    const newToken = jwt.sign(
      { id: decoded.id, role: decoded.role },
      process.env.SECRET_KEY,
      { expiresIn: "1h" }
    );
    res.json({ token: newToken });
  } catch {
    res.status(401).json({ message: "Refresh token không hợp lệ" });
  }
});

/* ================= LOGIN ================= */

router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ message: "Sai tài khoản hoặc mật khẩu" });

    if (!user.isVerified) {
      return res.status(403).json({ message: "Email chưa được xác nhận" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: "Sai tài khoản hoặc mật khẩu" });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.SECRET_KEY,
      { expiresIn: "1h" }
    );

    const refreshToken = jwt.sign(
      { id: user._id, role: user.role },
      process.env.REFRESH_SECRET_KEY,
      { expiresIn: "7d" }
    );

    await ActivityLog.create({
      userId: user._id,
      action: "login",
      ip: req.ip,
    });

    res.json({
      token,
      refreshToken,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        contact: user.contact,
        address1: user.address1,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= REGISTER (ADMIN) ================= */

router.post("/register", verifyToken, async (req, res) => {
  const { username, password, firstName, lastName, email, contact, address1, role } = req.body;

  if (!username || !password || !firstName || !lastName || !email || !contact || !address1 || !role) {
    return res.status(400).json({ message: "Thiếu thông tin" });
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Chỉ admin mới có quyền tạo user" });
  }

  try {
    const exists = await User.findOne({
      $or: [{ username }, { email }, { contact }],
    });
    if (exists) return res.status(400).json({ message: "User đã tồn tại" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString("hex");

    const newUser = await User.create({
      username,
      password: hashedPassword,
      firstName,
      lastName,
      email,
      contact,
      address1,
      role,
      isVerified: false,
      verificationToken,
      verificationTokenExpire: Date.now() + 15 * 60 * 1000,
    });

    const verifyLink = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

    await sendEmail({
      to: email,
      subject: "Xác nhận email",
      html: `
        <p>Chào ${firstName},</p>
        <p>Vui lòng xác nhận email của bạn:</p>
        <a href="${verifyLink}">Xác nhận email</a>
      `,
    });

    await ActivityLog.create({
      userId: req.user.id,
      action: "create_user",
      details: { username, role },
      ip: req.ip,
    });

    res.status(201).json({
      message: "Tạo user thành công. Email xác nhận đã được gửi.",
      user: newUser,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= VERIFY EMAIL ================= */

router.get("/verify-email", async (req, res) => {
  const { token } = req.query;

  const user = await User.findOne({
    verificationToken: token,
    verificationTokenExpire: { $gt: Date.now() },
  });

  if (!user) {
    return res.status(400).json({ message: "Link không hợp lệ hoặc đã hết hạn" });
  }

  user.isVerified = true;
  user.verificationToken = null;
  user.verificationTokenExpire = null;
  await user.save();

  res.json({ message: "Xác nhận email thành công" });
});

/* ================= USERS CRUD (GIỮ NGUYÊN) ================= */

// lấy danh sách
router.get("/users", verifyToken, async (req, res) => {
  try {
    const { search, role, page = 1, limit = 10 } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { username: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
      ];
    }

    if (role && role !== "all") query.role = role;

    const users = await User.find(query)
      .select("username role firstName lastName email contact address1")
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const totalUsers = await User.countDocuments(query);
    res.json({ users, totalPages: Math.ceil(totalUsers / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// update
router.put("/users/:id", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Chỉ admin được sửa" });
    }

    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!user) return res.status(404).json({ message: "User không tồn tại" });

    res.json({ message: "Cập nhật thành công", user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// delete
router.delete("/users/:id", verifyToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Chỉ admin được xóa" });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User không tồn tại" });
    if (user.role === "admin") {
      return res.status(403).json({ message: "Không thể xóa admin" });
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "Xóa user thành công" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
