/*const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.register = async (req, res) => {
  const { username, password, role, firstName, lastName, email, contact, address1 } = req.body;

  // Kiểm tra quyền admin
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Không có token được cung cấp' });

  try {
    const decoded = jwt.verify(token, process.env.SECRET_KEY);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ message: 'Chỉ admin mới có quyền tạo người dùng' });
    }

    // Kiểm tra username, email, contact đã tồn tại
    const existingUser = await User.findOne({
      $or: [{ username }, { email }, { contact }],
    });
    if (existingUser) {
      if (existingUser.username === username) {
        return res.status(400).json({ message: 'Tên tài khoản đã tồn tại' });
      }
      if (existingUser.email === email) {
        return res.status(400).json({ message: 'Email đã tồn tại' });
      }
      if (existingUser.contact === contact) {
        return res.status(400).json({ message: 'Số điện thoại đã tồn tại' });
      }
    }

    // Mã hóa mật khẩu
    const hashedPassword = await bcrypt.hash(password, 10);

    // Tạo người dùng mới
    const user = new User({
      username,
      password: hashedPassword,
      role,
      firstName,
      lastName,
      email,
      contact,
      address1,
    });
    await user.save();

    // Ghi log hoạt động
    await new ActivityLog({
      userId: decoded.id,
      action: 'register_user',
      details: { username, role },
      ip: req.ip,
      timestamp: new Date(),
    }).save();

    res.status(201).json({ message: 'Người dùng đã được tạo' });
  } catch (err) {
    console.error('Lỗi khi đăng ký:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.login = async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ message: 'Thông tin đăng nhập không hợp lệ' });
    }

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.SECRET_KEY, { expiresIn: '1h' });
    const refreshToken = jwt.sign({ id: user._id }, process.env.SECRET_KEY, { expiresIn: '7d' });

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
};

module.exports = { register: exports.register, login: exports.login };*/
