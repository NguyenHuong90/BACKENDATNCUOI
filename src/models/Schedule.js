const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
  gw_id: { type: String, required: true },
  node_id: { type: String, required: true },
  action: { type: String, required: true, enum: ['on', 'off'] },
  lamp_dim: { type: Number, min: 0, max: 100 }, // Thêm trường lamp_dim
  start: { type: Date, required: true },
  end: { type: Date }, // Chỉ cần cho action = 'on'
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

scheduleSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Schedule', scheduleSchema);