const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema(
  {
    expoPushToken: { type: String, required: true },
    deviceName: { type: String },
    deviceModel: { type: String },
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
    lastLoginAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);