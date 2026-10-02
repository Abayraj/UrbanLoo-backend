const VerifiedVisit = require('../models/verifiedVisit');

// Computes `verified` on read rather than storing it on Review itself.
// A review's author counts as verified for this location if a
// VerifiedVisit exists for that user+location — regardless of whether
// the visit happened before or after the review was written. This is
// the reason it's computed, not stored: storing it would freeze the
// value at review-creation time, so someone who reviews first and is
// seen at the location later would never get the badge. Computing it
// here means the badge is always accurate, on every read.
//
// locationId: single location these reviews belong to.
// reviews: array of lean review docs, each with a populated `user`
//   (either a full { _id, name, photo } object or a raw ObjectId/string).
// Returns a new array of reviews, each with `verified: boolean` added.
async function markVerifiedReviews(locationId, reviews) {
  if (!reviews || reviews.length === 0) return reviews ?? [];

  const userIds = reviews.map((r) => (r.user?._id ?? r.user)?.toString());

  const verifiedVisits = await VerifiedVisit.find({
    location: locationId,
    user: { $in: userIds },
  }).select('user');

  const verifiedUserIds = new Set(verifiedVisits.map((v) => v.user.toString()));

  return reviews.map((r) => ({
    ...r,
    verified: verifiedUserIds.has((r.user?._id ?? r.user)?.toString()),
  }));
}

module.exports = markVerifiedReviews;