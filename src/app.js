const express = require('express');
require('dotenv').config();
const cors = require('cors');
const connectDB = require('./config/db');

const authRoutes = require('./routes/auth');
const verifyJWT = require('./middlewares/verifyJWT');
const testController = require('./controllers/testController');
const app = express();

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
});
app.use(cors());
app.use(express.json());

// Public routes
app.use('/api/auth', authRoutes);
app.get('/api/test', verifyJWT, (req, res) => {
  res.json({ message: 'token is valid', user: req.user });
});

module.exports = app;