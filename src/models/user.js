const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true },
    expoPushToken: { type: String },
    deviceName: { type: String },
    deviceModel: { type: String },
    platform: { type: String, enum: ['ios', 'android'] },
    notificationsEnabled: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    googleId: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    name: { type: String },
    photo: { type: String },
    devices: [deviceSchema],
    lastActiveAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);