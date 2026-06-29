const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

const {generateAccessToken, generateRefreshToken,} = require('../utils/token');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ── POST /api/auth/google ────────────────────────────────────────────
const googleLogin = async (req, res) => {
  try {
    const { idToken, expoPushToken, deviceName, deviceModel } = req.body;

    if (!idToken) {return res.status(400).json({ message: 'idToken is required' });}

    const ticket = await client.verifyIdToken({idToken, audience: process.env.GOOGLE_CLIENT_ID,});
    const { sub, email, name, picture } = ticket.getPayload();

    let user = await User.findOne({ googleId: sub });

    if (user) {
      user.lastLoginAt = new Date();

      if (expoPushToken) {
        const existingDeviceIndex = user.devices.findIndex(
          (device) => device.expoPushToken === expoPushToken
        );

        if (existingDeviceIndex > -1) {
          user.devices[existingDeviceIndex].lastLoginAt = new Date();
        } else {
          user.devices.push({
            expoPushToken,
            deviceName,
            deviceModel,
            lastLoginAt: new Date(),
          });
        }
      }

      await user.save();

    } else {
      user = await User.create({
        googleId: sub,
        email,
        name,
        photo: picture,
        lastLoginAt: new Date(),
        devices: expoPushToken
          ? [
              {
                expoPushToken,
                deviceName,
                deviceModel,
                lastLoginAt: new Date(),
              },
            ]
          : [],
      });
    }

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    res.status(200).json({
      message: 'Login successful',
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        photo: user.photo,
      },
    });

  } catch (error) {
    console.error('Google login error:', error.message);

    if (error.message?.includes('Invalid token')) {
      return res.status(401).json({ message: 'Invalid Google token' });
    }

    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── Update Expo Push Token ───────────────────────────────────────────
const updatePushToken = async (req, res) => {
  try {
    const { expoPushToken, deviceName, deviceModel } = req.body;

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const existingIndex = user.devices.findIndex(
      (device) => device.deviceModel === deviceModel
    );

    if (existingIndex > -1) {
      user.devices[existingIndex].expoPushToken = expoPushToken;
      user.devices[existingIndex].lastLoginAt = new Date();
    } else {
      user.devices.push({
        expoPushToken,
        deviceName,
        deviceModel,
        lastLoginAt: new Date(),
      });
    }

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

module.exports = {
  googleLogin,
  updatePushToken,
  refreshToken,
};