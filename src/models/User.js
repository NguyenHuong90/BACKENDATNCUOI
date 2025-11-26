// src/models/User.js
const mongoose = require("mongoose"); // THÊM DÒNG NÀY VÀO ĐẦU FILE

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String }, // NULL nếu dùng Google
  role: { type: String, default: "user" },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  contact: { type: String, required: true, unique: true },
  address1: { type: String, required: true },

  // Google fields
  googleId: { type: String, unique: true, sparse: true },
  avatar: { type: String },
  isGoogleUser: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

userSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model("User", userSchema);