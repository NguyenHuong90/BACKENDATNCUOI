const express = require("express");
const router = express.Router();
const Lamp = require("../models/Lamp");
const ActivityLog = require("../models/ActivityLog");
const jwt = require("jsonwebtoken");
const mqtt = require("mqtt");

// Kết nối tới MQTT broker
const mqttClient = mqtt.connect("mqtt://broker.hivemq.com:1883");

mqttClient.on("connect", () => {
  console.log("Đã kết nối tới MQTT broker");
  mqttClient.subscribe("lamp/control/#");
  mqttClient.subscribe("lamp/state/#");
});

mqttClient.on("error", (err) => {
  console.error("Lỗi MQTT:", err);
});

// Middleware xác thực JWT
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Không có token được cung cấp" });
  try {
    const decoded = jwt.verify(token, process.env.SECRET_KEY);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token đã hết hạn" });
    }
    res.status(401).json({ message: "Token không hợp lệ" });
  }
};

// Lấy trạng thái tất cả đèn
router.get("/state", verifyToken, async (req, res) => {
  try {
    const lamps = await Lamp.find({});
    console.log("GET /state - Trả về:", lamps.length, "đèn");
    res.json(lamps);
  } catch (err) {
    console.error("Lỗi khi lấy trạng thái đèn:", err);
    res.status(500).json({ error: err.message });
  }
});

// Điều khiển đèn - FIX HOÀN TOÀN LUX & CURRENT_A
router.post("/control", verifyToken, async (req, res) => {
  let { gw_id, node_id, lamp_state, lamp_dim, lux, current_a, lat, lng, source = 'manual' } = req.body;

  console.log("Nhận yêu cầu POST /api/lamp/control:", req.body);

  try {
    if (!gw_id || !node_id) {
      return res.status(400).json({ message: "Thiếu gw_id hoặc node_id" });
    }

    // Kiểm tra lat/lng
    if (lat !== undefined && (isNaN(lat) || lat < -90 || lat > 90)) {
      return res.status(400).json({ message: "Vĩ độ không hợp lệ" });
    }
    if (lng !== undefined && (isNaN(lng) || lng < -180 || lng > 180)) {
      return res.status(400).json({ message: "Kinh độ không hợp lệ" });
    }

    const now = new Date();
    const hour = now.getHours();

    // === XÁC ĐỊNH TRẠNG THÁI ĐÈN (ƯU TIÊN lamp_state > lamp_dim) ===
    let finalLampState = lamp_state;
    let finalLampDim = lamp_dim;

    // Nếu không có lamp_state, suy ra từ lamp_dim
    if (finalLampState === undefined) {
      if (finalLampDim !== undefined && finalLampDim > 0) {
        finalLampState = 'ON';
      } else {
        finalLampState = 'OFF';
      }
    }

    // Nếu không có lamp_dim, suy ra từ lamp_state
    if (finalLampDim === undefined) {
      finalLampDim = finalLampState === 'ON' ? 100 : 0;
    }

    // Sync: nếu lamp_state = OFF thì lamp_dim = 0
    if (finalLampState === 'OFF') {
      finalLampDim = 0;
    }

    const isOn = finalLampState === 'ON' && finalLampDim > 0;

    // === SINH RANDOM LUX (LUÔN TRẢ VỀ GIÁ TRỊ MỚI) ===
    if (isOn) {
      lux = Math.floor(Math.random() * 56 + 5); // 5-60 lux khi bật
    } else {
      if (hour >= 6 && hour <= 18) {
        lux = Math.floor(Math.random() * 801 + 400); // 400-1200 lux ban ngày
      } else {
        lux = Math.floor(Math.random() * 56 + 5); // 5-60 lux ban đêm
      }
    }

    // === SINH RANDOM CURRENT_A (LUÔN TRẢ VỀ GIÁ TRỊ MỚI) ===
    const maxWatt = 15;
    const maxCurrent = maxWatt / 220;
    if (finalLampDim > 0) {
      current_a = parseFloat(((finalLampDim / 100) * maxCurrent + Math.random() * 0.008).toFixed(4));
    } else {
      current_a = 0;
    }

    // === CHUẨN BỊ OBJECT UPDATE CHO MONGODB ===
    const updateData = {
      lamp_state: finalLampState,
      lamp_dim: finalLampDim,
      lux: lux,
      current_a: current_a,
      updatedAt: new Date(),
    };

    // Chỉ update lat/lng nếu được gửi từ frontend
    if (lat !== undefined) updateData.lat = lat;
    if (lng !== undefined) updateData.lng = lng;

    // === LƯU VÀO DB ===
    const lamp = await Lamp.findOneAndUpdate(
      { gw_id, node_id },
      {
        $set: updateData,
        $setOnInsert: {
          createdAt: new Date(),
          energy_consumed: 0,
        },
      },
      { upsert: true, new: true }
    );

    // Tính energy khi tắt đèn (giả lập)
    if (finalLampState === 'OFF' && current_a > 0) {
      const durationHours = 0.0167; // ~1 phút
      const power = current_a * 220;
      const energy = (power * durationHours * (finalLampDim / 100)) / 1000;
      lamp.energy_consumed += energy;
      await lamp.save();
    }

    console.log(`✅ Đèn ${node_id} đã lưu DB: state=${lamp.lamp_state}, dim=${lamp.lamp_dim}, lux=${lamp.lux}, current_a=${lamp.current_a.toFixed(4)}`);

    // Gửi lệnh MQTT
    const payload = JSON.stringify({
      lamp_state: lamp.lamp_state,
      lamp_dim: lamp.lamp_dim,
      lux: lamp.lux,
      current_a: lamp.current_a,
    });
    mqttClient.publish(`lamp/control/${node_id}`, payload, { qos: 0 });

    // Lưu ActivityLog
    await new ActivityLog({
      userId: req.user.id,
      action: finalLampState === 'ON' ? "set_lamp_on" : "set_lamp_off",
      details: {
        startTime: new Date(),
        lampDim: lamp.lamp_dim,
        lux: lamp.lux,
        currentA: lamp.current_a,
        energyConsumed: parseFloat(lamp.energy_consumed.toFixed(4)),
        nodeId: node_id,
        gwId: gw_id,
        lat: lamp.lat,
        lng: lamp.lng,
      },
      source,
      ip: req.ip || "127.0.0.1",
      timestamp: new Date(),
    }).save();

    res.json({ lamp });
  } catch (err) {
    console.error("Lỗi khi cập nhật trạng thái đèn:", err);
    res.status(500).json({ error: err.message });
  }
});

// Xóa đèn
router.delete("/delete", verifyToken, async (req, res) => {
  const { gw_id, node_id } = req.body;
  try {
    const lamp = await Lamp.findOneAndDelete({ gw_id, node_id });
    if (!lamp) return res.status(404).json({ message: "Bóng đèn không tồn tại" });

    await new ActivityLog({
      userId: req.user.id,
      action: "delete_lamp",
      details: { nodeId: node_id, gwId: gw_id },
      source: "manual",
      ip: req.ip,
      timestamp: new Date(),
    }).save();

    res.json({ message: "Bóng đèn đã được xóa" });
  } catch (err) {
    console.error("Lỗi khi xóa bóng đèn:", err);
    res.status(500).json({ error: err.message });
  }
});

// Nhận trạng thái từ Node (nếu có phần cứng thật)
mqttClient.on("message", async (topic, message) => {
  if (topic.startsWith("lamp/state/")) {
    const node_id = topic.split("/")[2];
    try {
      const payload = JSON.parse(message.toString());
      const { lamp_state, lamp_dim, lux, current_a } = payload;

      const updatedLamp = await Lamp.findOneAndUpdate(
        { node_id },
        {
          $set: {
            lamp_state: lamp_state,
            lamp_dim: lamp_dim,
            lux: lux,
            current_a: current_a,
            updatedAt: new Date(),
          },
        },
        { new: true }
      );

      console.log(`Cập nhật từ Node ${node_id}: lux=${updatedLamp?.lux}, current_a=${updatedLamp?.current_a}`);
    } catch (err) {
      console.error("Lỗi parse MQTT state:", err);
    }
  }
});

module.exports = router;