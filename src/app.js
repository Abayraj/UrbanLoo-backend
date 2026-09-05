const express = require('express');
require('dotenv').config();
const cors = require('cors');
const connectDB = require('./config/db');
const formidableMiddleware = require('express-formidable');
const authRoutes = require('./routes/auth');
const locationRoutes = require('./routes/locations');
const reviewRoutes = require('./routes/review');
const verifyJWT = require('./middlewares/verifyJWT');
const { admin, adminRouter } = require('./admin/setup');
const startCronJobs = require('./cron');

const app = express();
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });

  // Only one running instance should have this enabled. If this app is ever
  // scaled to more than one process/container, every instance with
  // ENABLE_CRON=true would fire the same job at the same time and send
  // duplicate notifications — set this on exactly one instance in production.
  if (process.env.ENABLE_CRON === 'true') {
    startCronJobs();
  }
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

// Public / API routes
app.use('/api/auth', authRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/reviews', reviewRoutes);

app.get('/api/test', verifyJWT, (req, res) => {
  res.json({ message: 'token is valid', user: req.user });
});

// Catches multer errors (bad file type, too many files, file too large)
// and any other errors passed via next(err) so they come back as JSON
// instead of crashing the request.
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