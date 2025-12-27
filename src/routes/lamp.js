const express = require("express");
const router = express.Router();
const Lamp = require("../models/Lamp");
const ActivityLog = require("../models/ActivityLog");
const jwt = require("jsonwebtoken");
const mqtt = require("mqtt");

// Kết nối MQTT
const mqttClient = mqtt.connect("mqtt://broker.hivemq.com:1883");

mqttClient.on("connect", () => {
  console.log("Đã kết nối tới MQTT broker");
  mqttClient.subscribe("lamp/state/#");
});

mqttClient.on("error", (err) => {
  console.error("Lỗi MQTT:", err);
});

// XỬ LÝ REPORT TỪ NODE (tự động, không có user)
mqttClient.on("message", async (topic, message) => {
  if (topic.startsWith("lamp/state/")) {
    const node_id = topic.split("/")[2];
    try {
      const data = JSON.parse(message.toString());
      console.log(`Nhận report từ Node ${node_id}:`, data);

      // Cập nhật hoặc tạo mới Lamp
      let lamp = await Lamp.findOne({ node_id });
      if (!lamp) {
        lamp = new Lamp({
          gw_id: "gw-01",
          node_id,
          lamp_state: data.lamp_state || "OFF",
          lamp_dim: data.lamp_dim || 0,
          lux: data.lux || 0,
          current_a: data.current_a || 0,
          energy_consumed: 0,
        });
      } else {
        lamp.lamp_state = data.lamp_state || lamp.lamp_state;
        lamp.lamp_dim = data.lamp_dim !== undefined ? data.lamp_dim : lamp.lamp_dim;
        lamp.lux = data.lux !== undefined ? data.lux : lamp.lux;
        lamp.current_a = data.current_a !== undefined ? data.current_a : lamp.current_a;
        lamp.updatedAt = new Date();
      }
      await lamp.save();

      // Lưu log hoạt động từ Node (source: "node", không có userId)
      await new ActivityLog({
        action: "node_report",
        details: {
          lampDim: data.lamp_dim,
          lux: data.lux,
          currentA: data.current_a,
          nodeId: node_id,
          gwId: "gw-01",
        },
        source: "node",
        timestamp: new Date(),
      }).save();

      console.log(`Đã lưu report + log từ Node ${node_id} thành công!`);
    } catch (err) {
      console.error("Lỗi xử lý report từ Node:", err);
    }
  }
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
    console.log("Nhận yêu cầu GET /api/lamp/state");
    const lamps = await Lamp.find({});
    res.json(lamps);
  } catch (err) {
    console.error("Lỗi khi lấy trạng thái đèn:", err);
    res.status(500).json({ error: err.message });
  }
});

// Điều khiển đèn (từ người dùng)
router.post("/control", verifyToken, async (req, res) => {
  const {
    gw_id,
    node_id,
    lamp_state,
    lamp_dim,
    lux,
    current_a,
    lat,
    lng,
    source = "manual",
  } = req.body;

  console.log("Nhận yêu cầu POST /api/lamp/control:", req.body);

  try {
    if (!gw_id || !node_id) {
      return res.status(400).json({ message: "Thiếu gw_id hoặc node_id" });
    }

    if (lat !== undefined && (isNaN(lat) || lat < -90 || lat > 90)) {
      return res.status(400).json({ message: "Vĩ độ không hợp lệ" });
    }
    if (lng !== undefined && (isNaN(lng) || lng < -180 || lng > 180)) {
      return res.status(400).json({ message: "Kinh độ không hợp lệ" });
    }

    let lamp = await Lamp.findOne({ gw_id, node_id });
    if (!lamp) {
      lamp = new Lamp({
        gw_id,
        node_id,
        lamp_state: lamp_state || "OFF",
        lamp_dim: lamp_dim || 0,
        lux: lux || 0,
        current_a: current_a || 0,
        lat: lat !== undefined ? lat : null,
        lng: lng !== undefined ? lng : null,
        energy_consumed: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } else {
      lamp.lamp_state = lamp_state || lamp.lamp_state;
      lamp.lamp_dim = lamp_dim !== undefined ? lamp_dim : lamp.lamp_dim;
      lamp.lux = lux !== undefined ? lux : lamp.lux;
      lamp.current_a = current_a !== undefined ? current_a : lamp.current_a;
      lamp.lat = lat !== undefined ? lat : lamp.lat;
      lamp.lng = lng !== undefined ? lng : lamp.lng;

      if (lamp_state === "OFF" && lamp.current_a > 0) {
        const prevLog = await ActivityLog.findOne({
          "details.nodeId": node_id,
          action: "set_lamp_on",
        })
          .sort({ timestamp: -1 })
          .limit(1);

        if (prevLog) {
          const startTime = new Date(prevLog.timestamp);
          const endTime = new Date();
          const durationHours = (endTime - startTime) / (1000 * 60 * 60);
          const power = lamp.current_a * 220;
          const energy = (power * durationHours * (lamp.lamp_dim / 100)) / 1000;
          lamp.energy_consumed += energy;
        }
      }

      lamp.updatedAt = new Date();
    }

    await lamp.save();
    console.log("Cập nhật trạng thái đèn:", lamp);

    // Gửi lệnh qua MQTT
    const payload = JSON.stringify({
      lamp_state: lamp.lamp_state,
      lamp_dim: lamp.lamp_dim,
    });
    const topic = `lamp/control/${node_id}`;
    mqttClient.publish(topic, payload, { qos: 0 }, (err) => {
      if (err) console.error("Lỗi gửi MQTT:", err);
      else console.log(`Đã gửi MQTT tới ${topic}: ${payload}`);
    });

    // Lưu log từ người dùng (có userId)
    await new ActivityLog({
      userId: req.user.id,
      action:
        lamp_state
          ? `set_lamp_${lamp_state.toLowerCase()}`
          : lamp_dim !== undefined
          ? `set_lamp_brightness_to_${lamp_dim}%`
          : lat !== undefined || lng !== undefined
          ? "update_lamp_location"
          : "update_lamp_state",
      details: {
        startTime: new Date(),
        lampDim: lamp.lamp_dim,
        lux: lamp.lux,
        currentA: lamp.current_a,
        energyConsumed: lamp.energy_consumed.toFixed(2),
        nodeId: node_id,
        gwId: gw_id,
        lat: lamp.lat,
        lng: lamp.lng,
      },
      source,
      ip: req.ip,
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
  console.log("Nhận yêu cầu DELETE /api/lamp/delete:", req.body);
  try {
    const lamp = await Lamp.findOneAndDelete({ gw_id, node_id });
    if (!lamp) {
      return res.status(404).json({ message: "Bóng đèn không tồn tại" });
    }
    console.log("Đã xóa đèn:", lamp);

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

module.exports = router;
