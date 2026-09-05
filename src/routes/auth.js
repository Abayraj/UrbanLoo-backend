const express = require('express');
const router = express.Router();
const { googleLogin, updatePushToken, refreshToken, updateDeviceLocation } = require('../controllers/authController');
const verifyJWT = require('../middlewares/verifyJWT');

// Public
router.post('/google', googleLogin);
router.post('/refresh', refreshToken);

// Protected
router.patch('/push-token', verifyJWT, updatePushToken);
router.patch('/device-location', verifyJWT, updateDeviceLocation);

module.exports = router;