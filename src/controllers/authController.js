const { OAuth2Client } = require('google-auth-library');
const User = require('../models/user');
const jwt = require('jsonwebtoken');
const upsertDevice = require('../utils/upsertDevice');
const {generateAccessToken, generateRefreshToken,} = require('../utils/token');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ── POST /api/auth/google ────────────────────────────────────────────
const googleLogin = async (req, res) => {
  try {
    const { idToken, expoPushToken, deviceId, notificationsEnabled, deviceName, deviceModel, platform } = req.body;
    if (!idToken) return res.status(400).json({ message: 'idToken is required' });
    console.log('Received idToken from client:', idToken);

    const ticket = await client.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
    const { sub, email, name, picture } = ticket.getPayload();

    let user = await User.findOne({ googleId: sub });

    if (user) {
      user.lastLoginAt = new Date();
      upsertDevice(user, { deviceId, expoPushToken, deviceName, deviceModel, platform, notificationsEnabled });
      await user.save();
    } else {
      user = await User.create({
        googleId: sub,
        email,
        name,
        photo: picture,
        lastLoginAt: new Date(),
        devices: [],
      });
      upsertDevice(user, { deviceId, expoPushToken, deviceName, deviceModel, platform, notificationsEnabled });
      await user.save();
      console.log('New user created:', user);
    }

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    res.status(200).json({
      message: 'Login successful',
      accessToken,
      refreshToken,
      user: { id: user._id, name: user.name, email: user.email, photo: user.photo },
    });
  } catch (error) {
    console.error('Google login error:', error.message);
    console.log('Error details:', error);
    if (error.message?.includes('Invalid token')) {
      return res.status(401).json({ message: 'Invalid Google token' });
    }
    res.status(500).json({ message: 'Internal server error' });
  }
};


// ── PATCH /api/auth/device-location ──────────────────────────────────
// Fire-and-forget from the app whenever it has fresh reverse-geocoded
// location data (resolved client-side via expo-location — see notes in
// chat). Doesn't affect washroom search results; purely for tracking
// where users are using the app from (analytics/admin visibility).
const updateDeviceLocation = async (req, res) => {
  try {
    const { deviceId, latitude, longitude, district, state, country } = req.body;

    if (!deviceId) {
      return res.status(400).json({ message: 'deviceId is required' });
    }
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(400).json({ message: 'latitude and longitude must be numbers' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    upsertDevice(user, {
      deviceId,
      location: { latitude, longitude, district, state, country },
    });
    await user.save();

    res.status(200).json({ message: 'Device location updated' });
  } catch (error) {
    console.error('updateDeviceLocation error:', error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const updatePushToken = async (req, res) => {
  try {
    const { expoPushToken, deviceId, deviceName, deviceModel, platform, notificationsEnabled } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    upsertDevice(user, { deviceId, expoPushToken, deviceName, deviceModel, platform, notificationsEnabled });
    await user.save();

    res.status(200).json({ message: 'Push token updated' });
  } catch (error) {
    console.error('updatePushToken error:', error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
};
// ── POST /api/auth/refresh ───────────────────────────────────────────
const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    console.log('Received refresh token from refresh endpoint:', refreshToken);

    if (!refreshToken) {
      return res.status(401).json({
        message: 'Refresh token is required',
      });
    }

    const decoded = jwt.verify(
      refreshToken,
      process.env.REFRESH_SECRET
    );

    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        message: 'User not found',
      });
    }

    const accessToken = generateAccessToken(user._id);
    console.log('New access token generated for user from refresh token:', user._id);

    res.status(200).json({
      accessToken,
    });

  } catch (error) {
    return res.status(401).json({
      message: 'Invalid or expired refresh token',
    });
  }
};

module.exports = {googleLogin, updatePushToken, refreshToken, updateDeviceLocation};