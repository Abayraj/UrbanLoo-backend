const Review = require('../models/review');
const purgeAllAttachmentsForRecord = require('./purgeAllAttachmentsForRecord');

async function purgeReviewsForLocation(locationId) {
  const reviews = await Review.find({ locationId }).select('_id');

  for (const review of reviews) {
    await purgeAllAttachmentsForRecord('Review', review._id);
  }

  await Review.deleteMany({ locationId });
}

module.exports = purgeReviewsForLocation;