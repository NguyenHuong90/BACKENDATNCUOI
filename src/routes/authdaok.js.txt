const express = require('express');
const router = express.Router();
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Không có token được cung cấp' });
  try {
    const decoded = jwt.verify(token, process.env.SECRET_KEY);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token không hợp lệ' });
  }
};

// Route để kiểm tra token
router.get('/verify', verifyToken, (req, res) => {
  res.json({ message: 'Token hợp lệ', userId: req.user.id, role: req.user.role });
});

// Route để refresh token
router.post('/refresh', (req, res) => {
  const refreshToken = req.body.refreshToken;
  if (!refreshToken) return res.status(401).json({ message: 'Không có refresh token' });

  try {
    const decoded = jwt.verify(refreshToken, process.env.SECRET_KEY);
    const newToken = jwt.sign({ id: decoded.id, role: decoded.role }, process.env.SECRET_KEY, { expiresIn: '1h' });
    res.json({ token: newToken });
  } catch (err) {
    res.status(401).json({ message: 'Refresh token không hợp lệ' });
  }
});

// Route để đăng nhập
router.post('/login', async (req, res) => {
  console.log("Login request received:", req.body);
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    console.log("User found:", user ? user.username : null);
    if (!user || !await bcrypt.compare(password, user.password)) {
      console.log("Invalid credentials for:", username);
      return res.status(401).json({ message: 'Thông tin đăng nhập không hợp lệ' });
    }

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.SECRET_KEY, { expiresIn: '1h' });
    const refreshToken = jwt.sign({ id: user._id, role: user.role }, process.env.SECRET_KEY, { expiresIn: '7d' });

    await new ActivityLog({
      userId: user._id,
      action: 'login',
      ip: req.ip,
      timestamp: new Date(),
    }).save();

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
    console.error('Lỗi khi đăng nhập:', err);
    res.status(500).json({ error: err.message });
  }
});

// Route để tạo người dùng mới
router.post('/register', verifyToken, async (req, res) => {
  const { username, password, firstName, lastName, email, contact, address1, role } = req.body;

  if (!username || !password || !firstName || !lastName || !email || !contact || !address1 || !role) {
    return res.status(400).json({ message: 'Tất cả các trường đều bắt buộc' });
  }

  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Chỉ admin mới có quyền tạo người dùng' });
    }

    const existingUser = await User.findOne({
      $or: [{ username }, { email }, { contact }],
    });
    if (existingUser) {
      return res.status(400).json({ message: 'Username, email hoặc số điện thoại đã tồn tại' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      username,
      password: hashedPassword,
      firstName,
      lastName,
      email,
      contact,
      address1,
      role,
    });

    const savedUser = await newUser.save();

    await new ActivityLog({
      userId: req.user.id,
      action: 'create_user',
      details: { username: newUser.username, role: newUser.role },
      ip: req.ip,
      timestamp: new Date(),
    }).save();

    res.status(201).json({ message: 'Người dùng đã được tạo thành công', user: savedUser });
  } catch (err) {
    console.error('Lỗi khi tạo người dùng:', err);
    res.status(500).json({ message: 'Không thể tạo người dùng!', error: err.message });
  }
});

// Route để lấy danh sách người dùng
router.get('/users', verifyToken, async (req, res) => {
  try {
    const { search, role, page = 1, limit = 10 } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
      ];
    }

    if (role && role !== 'all') {
      query.role = role;
    }

    const users = await User.find(query)
      .select('username role firstName lastName email contact address1')
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    const totalUsers = await User.countDocuments(query);
    const totalPages = Math.ceil(totalUsers / limit);

    res.json({ users, totalPages });
  } catch (err) {
    console.error('Lỗi khi lấy danh sách người dùng:', err);
    res.status(500).json({ error: err.message });
  }
});

// Route để cập nhật thông tin người dùng
router.put('/users/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { firstName, lastName, email, contact, address1, role } = req.body;

  if (!firstName || !lastName || !email || !contact || !address1 || !role) {
    return res.status(400).json({ message: 'Tất cả các trường đều bắt buộc' });
  }

  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Chỉ admin mới có quyền sửa người dùng' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'Người dùng không tồn tại' });
    }

    user.firstName = firstName;
    user.lastName = lastName;
    user.email = email;
    user.contact = contact;
    user.address1 = address1;
    user.role = role;
    user.updatedAt = new Date();

    const updatedUser = await user.save();

    await new ActivityLog({
      userId: req.user.id,
      action: 'update_user',
      details: { username: updatedUser.username, role: updatedUser.role },
      ip: req.ip,
      timestamp: new Date(),
    }).save();

    res.json({ message: 'Người dùng đã được cập nhật thành công', user: updatedUser });
  } catch (err) {
    console.error('Lỗi khi cập nhật người dùng:', err);
    res.status(500).json({ message: 'Không thể cập nhật người dùng!', error: err.message });
  }
});

// Route để xóa người dùng
router.delete('/users/:id', verifyToken, async (req, res) => {
  const { id } = req.params;

  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Chỉ admin mới có quyền xóa người dùng' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'Người dùng không tồn tại' });
    }

    if (user.role === 'admin') {
      return res.status(403).json({ message: 'Không thể xóa tài khoản admin' });
    }

    await User.findByIdAndDelete(id);

    await new ActivityLog({
      userId: req.user.id,
      action: 'delete_user',
      details: { username: user.username, role: user.role },
      ip: req.ip,
      timestamp: new Date(),
    }).save();

    res.json({ message: 'Người dùng đã được xóa thành công' });
  } catch (err) {
    console.error('Lỗi khi xóa người dùng:', err);
    res.status(500).json({ message: 'Không thể xóa người dùng!', error: err.message });
  }
});

module.exports = router;