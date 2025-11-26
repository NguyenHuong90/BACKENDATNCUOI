const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  action: { type: String, required: true },
  details: {
    startTime: { type: Date }, // Thời gian bắt đầu (nếu có)
    endTime: { type: Date }, // Thời gian kết thúc (nếu có)
    lampDim: { type: Number, min: 0, max: 100 }, // Độ sáng (%)
    lux: { type: Number }, // Ánh sáng (lux)
    currentA: { type: Number }, // Dòng điện (A)
    nodeId: { type: String }, // ID bóng đèn
    gwId: { type: String }, // ID gateway
    energyConsumed: { type: Number, default: 0 }, // Năng lượng tiêu thụ (kWh)
  },
  source: { type: String, enum: ["manual", "schedule", "auto"], default: "manual" }, // Nguồn hành động
  ip: { type: String },
  timestamp: { type: Date, default: Date.now },
});

module.exports = mongoose.model("ActivityLog", activityLogSchema);