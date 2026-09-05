const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true },
    expoPushToken: { type: String },
    deviceName: { type: String },
    deviceModel: { type: String },
    platform: { type: String, enum: ['ios', 'android','web'] },
    notificationsEnabled: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: Date.now },

    // Populated from the app's reverse-geocode result (district/state/etc.
    // resolved client-side via expo-location) whenever the app fetches
    // nearby washrooms. Lets you answer "where are our users using the app
    // from" for analytics, without making the backend do paid geocoding.
    lastKnownLocation: {
      latitude: { type: Number },
      longitude: { type: Number },
      district: { type: String },
      city: { type: String },
      state: { type: String },
      country: { type: String },
      updatedAt: { type: Date },
    },
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
     likedLocations: [
      { type: mongoose.Schema.Types.ObjectId, ref: 'Location', default: [] },
    ],
  },
 
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);