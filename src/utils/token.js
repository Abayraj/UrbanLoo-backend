const jwt = require('jsonwebtoken');

const generateAccessToken = (userId) => {
  return jwt.sign(
    { id: userId },process.env.JWT_SECRET,
    { expiresIn: '30min',}); // Change to 15m for production
};

const generateRefreshToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.REFRESH_SECRET,
    {expiresIn: '2days',}); // Change to 30d for production
};

module.exports = { generateAccessToken,generateRefreshToken,};