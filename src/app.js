const express = require('express');
require('dotenv').config();
const cors = require('cors');
const connectDB = require('./config/db');
const formidableMiddleware = require('express-formidable');
const authRoutes = require('./routes/auth');
const locationRoutes = require('./routes/locations');
const reviewRoutes = require('./routes/review');
const metaRoutes = require('./routes/meta');
const verifyJWT = require('./middlewares/verifyJWT');
const { admin, adminRouter } = require('./admin/setup');
const startCronJobs = require('./cron');

const app = express();
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });

  if (process.env.ENABLE_CRON === 'true') {
    startCronJobs();
  }
});

app.use(cors());
app.use(express.json());

// Temporary request logger — helps confirm whether requests from the
// frontend are actually reaching the backend at all. Safe to remove
// once things are working.
// app.use((req, res, next) => {
//   console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
//   next();
// });

app.use(admin.options.rootPath, (req, res, next) => {
  if (req.method === 'POST') {
    return formidableMiddleware()(req, res, next);
  }
  next();
}, adminRouter);

app.use('/api/auth', authRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/meta', metaRoutes);

app.use((err, req, res, next) => {
  if (err && err.name === 'MulterError') {
    return res.status(400).json({ message: err.message });
  }
  if (err) {
    console.error(err);
    return res.status(400).json({ message: err.message || 'Bad request' });
  }
  next();
});

module.exports = app;