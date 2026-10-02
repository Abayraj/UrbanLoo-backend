const express = require('express');
const router = express.Router();
const { googleLogin, updatePushToken, refreshToken, updateDeviceLocation, updateUserLocation, getMe } = require('../controllers/authController');
const verifyJWT = require('../middlewares/verifyJWT');

// Public
router.post('/google', googleLogin);
router.post('/refresh', refreshToken);

// Protected
router.get('/me', verifyJWT, getMe);
router.patch('/push-token', verifyJWT, updatePushToken);
router.patch('/device-location', verifyJWT, updateDeviceLocation);
router.patch('/location', verifyJWT, updateUserLocation);


module.exports = router;