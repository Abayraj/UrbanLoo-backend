const express = require('express');
require('dotenv').config();
const cors = require('cors');
const connectDB = require('./config/db');
const formidableMiddleware = require('express-formidable');
const authRoutes = require('./routes/auth');
const verifyJWT = require('./middlewares/verifyJWT');
const { admin, adminRouter } = require('./admin/setup');

const app = express();
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
});

app.use(cors());
app.use(express.json());

// AdminJS panel
app.use(admin.options.rootPath, (req, res, next) => {
  if (req.method === 'POST') {
    return formidableMiddleware()(req, res, next);
  }
  next();
}, adminRouter);

// Public routes
app.use('/api/auth', authRoutes);
app.get('/api/test', verifyJWT, (req, res) => {
  res.json({ message: 'token is valid', user: req.user });
});

module.exports = app;