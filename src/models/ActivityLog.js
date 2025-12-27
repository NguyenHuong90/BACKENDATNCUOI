const mongoose = require("mongoose");  // ← BẮT BUỘC PHẢI CÓ DÒNG NÀY

const activityLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
  action: { type: String, required: true },
  details: {
    startTime: { type: Date },
    endTime: { type: Date },
    lampDim: { type: Number, min: 0, max: 100 },
    lux: { type: Number },
    currentA: { type: Number },
    nodeId: { type: String },
    gwId: { type: String },
    energyConsumed: { type: Number, default: 0 },
  },
  source: { 
    type: String, 
    enum: ["manual", "schedule", "auto", "node"], 
    default: "manual" 
  },
  ip: { type: String },
  timestamp: { type: Date, default: Date.now },
});

module.exports = mongoose.model("ActivityLog", activityLogSchema);