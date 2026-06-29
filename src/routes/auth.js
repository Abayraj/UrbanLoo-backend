const express = require('express');
const router = express.Router();
const { googleLogin, updatePushToken, refreshToken } = require('../controllers/authController');
const verifyJWT = require('../middlewares/verifyJWT');

// Public
router.post('/google', googleLogin);
router.post('/refresh', refreshToken);

// Protected
router.patch('/push-token', verifyJWT, updatePushToken);

module.exports = router;