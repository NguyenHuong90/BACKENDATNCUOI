const express = require('express');
const router = express.Router();
const Schedule = require('../models/Schedule');
const ActivityLog = require('../models/ActivityLog');
const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Không có token được cung cấp' });
  try {
    const decoded = jwt.verify(token, process.env.SECRET_KEY);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token đã hết hạn' });
    }
    res.status(401).json({ message: 'Token không hợp lệ' });
  }
};

router.get('/', verifyToken, async (req, res) => {
  try {
    console.log('GET /api/schedule received');
    const schedules = await Schedule.find({}).sort({ start: 1 });
    console.log('Schedules fetched:', schedules);
    res.json(schedules);
  } catch (err) {
    console.error('Lỗi khi lấy lịch trình:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', verifyToken, async (req, res) => {
  const { gw_id, node_id, action, start, end, lamp_dim } = req.body;
  console.log('POST /api/schedule received:', req.body);
  try {
    if (!gw_id || !node_id || !action || !start) {
      return res.status(400).json({ message: 'Thiếu thông tin bắt buộc' });
    }
    const startDate = new Date(start);
    let endDate = end ? new Date(end) : null;
    if (action === 'on' && (!end || endDate <= startDate)) {
      return res.status(400).json({ message: 'Thời gian kết thúc không hợp lệ' });
    }
    if (action === 'on' && (lamp_dim === undefined || lamp_dim < 0 || lamp_dim > 100)) {
      return res.status(400).json({ message: 'Độ sáng phải là số từ 0 đến 100' });
    }
    const schedule = new Schedule({ 
      gw_id, 
      node_id, 
      action, 
      start: startDate, 
      end: endDate,
      lamp_dim: action === 'on' ? lamp_dim : undefined,
    });
    await schedule.save();
    console.log('Schedule saved:', schedule);

    await new ActivityLog({
      userId: req.user.id,
      action: 'add_schedule',
      details: { node_id, action, start, end, lamp_dim },
      source: 'auto',
      ip: req.ip,
      timestamp: new Date(),
    }).save();

    res.json({ schedule });
  } catch (err) {
    console.error('Lỗi khi thêm lịch trình:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', verifyToken, async (req, res) => {
  console.log('DELETE /api/schedule/:id received, id:', req.params.id);
  try {
    const schedule = await Schedule.findByIdAndDelete(req.params.id);
    if (!schedule) {
      console.log('Schedule not found:', req.params.id);
      return res.status(404).json({ message: 'Lịch trình không tồn tại' });
    }
    console.log('Schedule deleted:', schedule);

    await new ActivityLog({
      userId: req.user.id,
      action: 'delete_schedule',
      details: { node_id: schedule.node_id, action: schedule.action, lamp_dim: schedule.lamp_dim },
      source: 'auto',
      ip: req.ip,
      timestamp: new Date(),
    }).save();

    res.json({ message: 'Lịch trình đã được xóa' });
  } catch (err) {
    console.error('Lỗi khi xóa lịch trình:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;