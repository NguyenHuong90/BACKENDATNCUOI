const mongoose = require('mongoose');

// Schema cho bóng đèn
const lampSchema = new mongoose.Schema({
  gw_id: { type: String, required: true, description: 'ID của cổng kết nối' },
  node_id: { type: String, required: true, unique: true, description: 'ID của bóng đèn' },
  lamp_state: { type: String, enum: ['ON', 'OFF'], default: 'OFF', description: 'Trạng thái đèn (Bật/Tắt)' },
  lamp_dim: { type: Number, min: 0, max: 100, default: 0, description: 'Độ sáng đèn (%)' },
  lux: { type: Number, default: 0, description: 'Cường độ ánh sáng (lux)' },
  current_a: { type: Number, default: 0, description: 'Dòng điện (A)' },
  lat: { type: Number, min: -90, max: 90, default: null, description: 'Vĩ độ' }, // Thêm ràng buộc
  lng: { type: Number, min: -180, max: 180, default: null, description: 'Kinh độ' }, // Thêm ràng buộc
  energy_consumed: { type: Number, default: 0, description: 'Năng lượng tiêu thụ (kWh)' },
  createdAt: { type: Date, default: Date.now, description: 'Thời gian tạo' },
  updatedAt: { type: Date, default: Date.now, description: 'Thời gian cập nhật' },
});

// Cập nhật thời gian trước khi lưu
lampSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Lamp', lampSchema);
