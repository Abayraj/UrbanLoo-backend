// models/Review.js
const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    location: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, trim: true, maxlength: 500 }, // review length limit
  },
  { timestamps: true }
);

reviewSchema.index({ location: 1 }); // fast lookup: "all reviews for this location"
reviewSchema.index({ location: 1, user: 1 }, { unique: true }); // one review per user per location

module.exports = mongoose.model('Review', reviewSchema);