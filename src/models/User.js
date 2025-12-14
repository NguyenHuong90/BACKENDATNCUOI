// src/models/User.js
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    // ===== BASIC AUTH =====
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    password: {
      type: String,
      default: null, // null nếu đăng nhập bằng Google
    },

    role: {
      type: String,
      enum: ["admin", "user", "viewer", "controller"],
      default: "user",
    },

    // ===== PROFILE =====
    firstName: {
      type: String,
      required: true,
      trim: true,
    },

    lastName: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    contact: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    address1: {
      type: String,
      required: true,
      trim: true,
    },

    // ===== GOOGLE LOGIN =====
    googleId: {
      type: String,
      unique: true,
      sparse: true, // cho phép nhiều null
    },

    avatar: {
      type: String,
      default: null,
    },

    isGoogleUser: {
      type: Boolean,
      default: false,
    },

    // ===== EMAIL VERIFY =====
    isVerified: {
      type: Boolean,
      default: false,
    },

    verificationToken: {
      type: String,
      default: null,
    },

    verificationTokenExpire: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // tự tạo createdAt & updatedAt
  }
);

// ===== INDEX (TRÁNH LỖI UNIQUE + NULL) =====
userSchema.index({ googleId: 1 }, { sparse: true });
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ contact: 1 }, { unique: true });

module.exports = mongoose.model("User", userSchema);
