const mongoose = require('mongoose');

// A VerifiedVisit is written server-side, only when a device's real GPS
// coordinates (sent via PATCH /api/auth/device-location) were found to be
// within VISIT_PROXIMITY_METERS of a location — see
// recordNearbyVerifiedVisits in authController.js. Nothing client-side can
// create one of these directly, so it can't be faked by editing local
// storage or hitting the API with a made-up "visited: true" flag.
//
// Used only as a soft signal: reviewController.createReview checks for a
// matching record to decide whether a new review gets `verified: true`
// (see models/review.js). It never blocks review creation either way —
// see the design note in reviewController.js.
const verifiedVisitSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    location: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true },
    verifiedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// One record per user+location. Repeat proximity syncs near the same
// place (e.g. reopening the app there again next week) should never
// duplicate — recordNearbyVerifiedVisits upserts against this index.
verifiedVisitSchema.index({ user: 1, location: 1 }, { unique: true });

module.exports = mongoose.model('VerifiedVisit', verifiedVisitSchema);