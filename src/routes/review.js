// routes/reviews.js
const express = require('express');
const multer = require('multer');
const router = express.Router();
const verifyJWT = require('../middlewares/verifyJWT');
const {
  createReview,
  updateReview,
  getReviewsForLocation,
  getMyReviewForLocation,
  deleteReview,
} = require('../controllers/reviewController');

const upload = multer({
  dest: 'uploads/tmp/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max per file
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
});

// Create a review (max 3 images). One review per user per location.
router.post('/', verifyJWT, upload.array('images', 3), createReview);

// Edit rating/comment and add/remove images (max 3 total).
router.put('/:id', verifyJWT, upload.array('images', 3), updateReview);

router.get('/location/:locationId', getReviewsForLocation); // public, no auth needed to view reviews
router.get('/location/:locationId/mine', verifyJWT, getMyReviewForLocation);

router.delete('/:id', verifyJWT, deleteReview);

module.exports = router;