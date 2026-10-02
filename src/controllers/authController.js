const { OAuth2Client } = require('google-auth-library');
const User = require('../models/user');
const Location = require('../models/location');
const VerifiedVisit = require('../models/verifiedVisit');
const jwt = require('jsonwebtoken');
const upsertDevice = require('../utils/upsertDevice');
const {generateAccessToken, generateRefreshToken,} = require('../utils/token');
const STATES_DISTRICTS = require('../data/statesDistricts');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ── Verified-visit detection ────────────────────────────────────────
// Piggybacks on the device-location sync that already runs every time the
// app has a fresh GPS fix (app open + the map's recenter button) — no new
// permission, no new network trigger. Whenever that fix lands within
// VISIT_PROXIMITY_METERS of a location, we record a VerifiedVisit for that
// user+location pair. See utils/markVerifiedReviews.js for how this gets
// read back, per-review, at request time.
//
// This is intentionally a soft, best-effort side effect: it must never
// cause updateDeviceLocation's own response to fail just because this
// extra step hit an error.
const VISIT_PROXIMITY_METERS = 150;

async function recordNearbyVerifiedVisits(userId, latitude, longitude) {
  try {
    const nearbyLocations = await Location.find({
      isActive: true,
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [longitude, latitude] },
          $maxDistance: VISIT_PROXIMITY_METERS,
        },
      },
    }).select('_id');

    if (nearbyLocations.length === 0) return;

    await Promise.all(
      nearbyLocations.map((loc) =>
        VerifiedVisit.updateOne(
          { user: userId, location: loc._id },
          { $setOnInsert: { user: userId, location: loc._id, verifiedAt: new Date() } },
          { upsert: true }
        )
      )
    );
  } catch (error) {
    // Non-fatal — never let this break the device-location update itself.
    console.error('recordNearbyVerifiedVisits error:', error.message);
  }
}

const googleLogin = async (req, res) => {
  try {
    const { idToken, expoPushToken, deviceId, notificationsEnabled, deviceName, deviceModel, platform } = req.body;
    if (!idToken) return res.status(400).json({ message: 'idToken is required' });

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
    if (error.message?.includes('Invalid token')) {
      return res.status(401).json({ message: 'Invalid Google token' });
    }
    res.status(500).json({ message: 'Internal server error' });
  }
};

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

    // Best-effort: does not block or affect this response either way.
    await recordNearbyVerifiedVisits(user._id, latitude, longitude);

    res.status(200).json({ message: 'Device location updated' });
  } catch (error) {
    console.error('updateDeviceLocation error:', error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── PATCH /api/auth/location — saves the user's manually selected
// state/district. District must match a real district for that state.
const updateUserLocation = async (req, res) => {
  try {
    const { state, district } = req.body;

    if (!state || !district) {
      return res.status(400).json({ message: 'state and district are required' });
    }

    const matchedState = Object.keys(STATES_DISTRICTS).find(
      (key) => key.toLowerCase() === state.toLowerCase()
    );
    if (!matchedState) {
      return res.status(400).json({ message: `Unknown state: ${state}` });
    }

    const matchedDistrict = STATES_DISTRICTS[matchedState].find(
      (d) => d.toLowerCase() === district.toLowerCase()
    );
    if (!matchedDistrict) {
      return res.status(400).json({ message: `${district} is not a district of ${matchedState}` });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.state = matchedState;
    user.district = matchedDistrict;
    await user.save();

    res.status(200).json({
      message: 'Location updated',
      state: user.state,
      district: user.district,
    });
  } catch (error) {
    console.error('updateUserLocation error:', error.message);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/auth/me ──────────────────────────────────────────────────
// Called from the home screen on load. state/district come back null
// until the user has picked them — the frontend shows the picker popup
// when either is missing, and skips it once both are present.
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      'name email photo state district'
    );
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.status(200).json({
      id: user._id,
      name: user.name,
      email: user.email,
      photo: user.photo,
      state: user.state,
      district: user.district,
    });

    console.log('[getMe] returned state/district:', user.state, '/', user.district);
  } catch (error) {
    console.error('getMe error:', error.message);
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

const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token is required' });
    }

    const decoded = jwt.verify(refreshToken, process.env.REFRESH_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    const accessToken = generateAccessToken(user._id);

    res.status(200).json({ accessToken });
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
};

module.exports = {googleLogin, updatePushToken, refreshToken, updateDeviceLocation, updateUserLocation, getMe};