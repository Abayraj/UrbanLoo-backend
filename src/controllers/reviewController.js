// controllers/reviewController.js
const mongoose = require('mongoose');
const fs = require('fs');
const Review = require('../models/review');
const Location = require('../models/location');
const ActiveStorageAttachment = require('../models/activeStorageAttachment');
const attachFile = require('../utils/attachFile');
const getAttachmentsForRecord = require('../utils/getAttachments');
const purgeAttachment = require('../utils/purgeAttachment');
const purgeAllAttachmentsForRecord = require('../utils/purgeAllAttachmentsForRecord');

const MAX_REVIEW_IMAGES = 3;

const cleanupTempFiles = (files = []) => {
  for (const file of files) {
    fs.unlink(file.path, () => {});
  }
};

// ── POST /api/reviews ─────────────────────────────────────────────────────
// Creates a review. Each user may only have one review per location — if
// they already reviewed this location, they're told to edit it instead.
const createReview = async (req, res) => {
  try {
    const { locationId, rating, comment } = req.body;

    if (!locationId || !mongoose.Types.ObjectId.isValid(locationId)) {
      cleanupTempFiles(req.files);
      return res.status(400).json({ message: 'A valid locationId is required' });
    }
    if (!rating) {
      cleanupTempFiles(req.files);
      return res.status(400).json({ message: 'rating is required' });
    }

    const location = await Location.findById(locationId);
    if (!location) {
      cleanupTempFiles(req.files);
      return res.status(404).json({ message: 'Location not found' });
    }

    const existing = await Review.findOne({ location: locationId, user: req.user._id });
    if (existing) {
      cleanupTempFiles(req.files);
      return res.status(409).json({
        message: 'You have already reviewed this location. Edit your existing review instead.',
        reviewId: existing._id,
      });
    }

    if (req.files && req.files.length > MAX_REVIEW_IMAGES) {
      cleanupTempFiles(req.files);
      return res.status(400).json({ message: `You can upload up to ${MAX_REVIEW_IMAGES} images per review` });
    }

    const review = await Review.create({
      location: locationId,
      user: req.user._id, // from verifyJWT middleware
      rating,
      comment,
    });

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const buffer = fs.readFileSync(file.path);
        await attachFile({
          fileBuffer: buffer,
          filename: file.originalname,
          contentType: file.mimetype,
          recordType: 'Review',
          recordId: review._id,
          uploadedBy: req.user._id,
        });
      }
      cleanupTempFiles(req.files);
    }

    const images = await getAttachmentsForRecord('Review', review._id);

    res.status(201).json({ ...review.toObject(), images });
  } catch (error) {
    cleanupTempFiles(req.files);
    if (error.code === 11000) {
      return res.status(409).json({ message: 'You have already reviewed this location.' });
    }
    console.error('createReview error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── PUT /api/reviews/:id ────────────────────────────────────────────────
// Edits rating/comment and lets the owner add new images and/or remove
// existing ones in the same request. Total images can never exceed
// MAX_REVIEW_IMAGES.
// Body (multipart/form-data):
//   rating          - optional new rating
//   comment         - optional new comment
//   removeImageIds  - optional JSON array of attachmentIds to delete
//   images          - optional new image files (field name "images")
const updateReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      cleanupTempFiles(req.files);
      return res.status(404).json({ message: 'Review not found' });
    }

    // Only the review's author can edit it
    if (review.user.toString() !== req.user._id.toString()) {
      cleanupTempFiles(req.files);
      return res.status(403).json({ message: 'Not authorized to edit this review' });
    }

    const { rating, comment } = req.body;

    let removeImageIds = [];
    if (req.body.removeImageIds) {
      try {
        const parsed = JSON.parse(req.body.removeImageIds);
        removeImageIds = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        removeImageIds = [].concat(req.body.removeImageIds);
      }
    }

    const currentImages = await getAttachmentsForRecord('Review', review._id);
    const remainingCount = currentImages.filter(
      (img) => !removeImageIds.includes(String(img.attachmentId))
    ).length;
    const incomingCount = req.files ? req.files.length : 0;

    if (remainingCount + incomingCount > MAX_REVIEW_IMAGES) {
      cleanupTempFiles(req.files);
      return res.status(400).json({
        message: `A review can have at most ${MAX_REVIEW_IMAGES} images. Remove an existing image before adding a new one.`,
      });
    }

    if (rating !== undefined) review.rating = rating;
    if (comment !== undefined) review.comment = comment;
    await review.save();

    for (const attachmentId of removeImageIds) {
      if (!mongoose.Types.ObjectId.isValid(attachmentId)) continue;
      const attachment = await ActiveStorageAttachment.findById(attachmentId).populate('blobId');
      if (
        attachment &&
        attachment.recordType === 'Review' &&
        attachment.recordId.toString() === review._id.toString()
      ) {
        await purgeAttachment(attachment);
      }
    }

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const buffer = fs.readFileSync(file.path);
        await attachFile({
          fileBuffer: buffer,
          filename: file.originalname,
          contentType: file.mimetype,
          recordType: 'Review',
          recordId: review._id,
          uploadedBy: req.user._id,
        });
      }
      cleanupTempFiles(req.files);
    }

    const images = await getAttachmentsForRecord('Review', review._id);
    res.json({ ...review.toObject(), images });
  } catch (error) {
    cleanupTempFiles(req.files);
    console.error('updateReview error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/reviews/location/:locationId ─────────────────────────────────
const getReviewsForLocation = async (req, res) => {
  try {
    const reviews = await Review.find({ location: req.params.locationId })
      // FIX: was .populate('user', 'photo') — this excluded "name", so
      // review.user?.name was always undefined on the frontend and
      // ReviewCard.tsx fell back to "Anonymous" for every review.
      .populate('user', 'name photo')
      .sort({ createdAt: -1 })
      .lean();

    const reviewsWithImages = await Promise.all(
      reviews.map(async (r) => ({
        ...r,
        images: await getAttachmentsForRecord('Review', r._id),
      }))
    );

    res.json(reviewsWithImages);
  } catch (error) {
    console.error('getReviewsForLocation error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/reviews/location/:locationId/mine ────────────────────────────
// Lets the frontend check whether the logged-in user already has a review
// for this location, so it can show "Edit review" instead of "Add review".
const getMyReviewForLocation = async (req, res) => {
  try {
    const review = await Review.findOne({
      location: req.params.locationId,
      user: req.user._id,
    })
      // FIX: this query wasn't populated at all — review.user was a raw
      // ObjectId, not { name, photo }, so any UI reading review.user.name
      // here would break the same way.
      .populate('user', 'name photo')
      .lean();

    if (!review) {
      return res.json({ hasReviewed: false, review: null });
    }

    const images = await getAttachmentsForRecord('Review', review._id);
    res.json({ hasReviewed: true, review: { ...review, images } });
  } catch (error) {
    console.error('getMyReviewForLocation error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── DELETE /api/reviews/:id ────────────────────────────────────────────────
const deleteReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }

    // Only the review's author can delete it
    if (review.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this review' });
    }

    await purgeAllAttachmentsForRecord('Review', review._id);
    await Review.findByIdAndDelete(req.params.id);

    res.json({ message: 'Review deleted' });
  } catch (error) {
    console.error('deleteReview error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  createReview,
  updateReview,
  getReviewsForLocation,
  getMyReviewForLocation,
  deleteReview,
};