const mongoose = require('mongoose');
const Location = require('../models/location');
const Review = require('../models/review');
const User = require('../models/user');
const getAttachmentsForRecord = require('../utils/getAttachments');

const DEFAULT_RADIUS_KM = 10;
const MAX_RADIUS_KM = 100;

// ── Shared helpers ───────────────────────────────────────────────────

// Parses/validates lat & lng from query params. Returns { lat, lng } or
// null if either is missing/invalid — callers decide what "no coords"
// means for their own endpoint (error vs. fall back to plain find()).
function parseCoords(query) {
  const lat = parseFloat(query.lat);
  const lng = parseFloat(query.lng);

  const valid = !Number.isNaN(lat) && !Number.isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

  return valid ? { lat, lng } : null;
}

// Runs the shared $geoNear aggregation used by the map endpoint(s).
// - coords: { lat, lng } — required, caller must validate first.
// - maxDistanceKm: optional cap.
// - extraFields: extra field names to include in the $project on top
//   of the ones every caller needs.
async function geoNearLocations({ coords, maxDistanceKm, extraFields = [] }) {
  const geoNearStage = {
    near: { type: 'Point', coordinates: [coords.lng, coords.lat] },
    distanceField: 'distanceMeters',
    spherical: true,
    query: { isActive: true },
  };

  if (maxDistanceKm) {
    geoNearStage.maxDistance = maxDistanceKm * 1000;
  }

  const projectFields = {
    name: 1,
    city: 1,
    state: 1,
    district: 1,
    latitude: 1,
    longitude: 1,
    distanceKm: { $round: [{ $divide: ['$distanceMeters', 1000] }, 2] },
  };

  for (const field of extraFields) {
    projectFields[field] = 1;
  }

  return Location.aggregate([{ $geoNear: geoNearStage }, { $project: projectFields }]);
}

// ── GET /api/locations/map?lat=&lng=&radius= ──────────────────────────
// UNUSED as of the Home screen merge — the frontend now derives "nearby"
// client-side from getAllLocationsForMap's distanceKm field instead of
// calling this separate radius-limited endpoint (see useAllLocations.ts
// and HomeScreen.tsx). Left commented out (not deleted) since the
// $geoNear + maxDistance pattern here is exactly what you'd want back if
// the dataset grows large enough that "fetch everything" stops being
// viable — see the PRODUCTION TODO on getAllLocationsForMap below for
// the scaling thresholds. Also remove/re-add the matching route in your
// routes file if you fully remove this later.
//
// const getLocationsForMap = async (req, res) => {
//   try {
//     const coords = parseCoords(req.query);
//     if (!coords) {
//       return res.status(400).json({ message: 'lat and lng query params are required' });
//     }
//
//     let radiusKm = parseFloat(req.query.radius);
//     if (Number.isNaN(radiusKm) || radiusKm <= 0) radiusKm = DEFAULT_RADIUS_KM;
//     radiusKm = Math.min(radiusKm, MAX_RADIUS_KM);
//
//     const locations = await geoNearLocations({ coords, maxDistanceKm: radiusKm });
//
//     res.json(locations);
//   } catch (error) {
//     console.error('getLocationsForMap error:', error);
//     res.status(500).json({ message: 'Internal server error' });
//   }
// };

// ── GET /api/locations/all-for-map?lat=&lng= ────────────────────────────
// Used for BOTH the map pins AND search AND the "Nearby Wash Rooms" list
// on the Home screen — the frontend fetches this once (with coords) and
// derives nearby-by-distance + search results client-side from the same
// dataset, instead of separate endpoints/calls.
//
// lat/lng are OPTIONAL here. When provided, each location also gets a
// distanceKm field (straight-line, via the shared $geoNear helper) so
// map pins, nearby list, and search results can all show "~X km away"
// from this single call. Without lat/lng, behaves as before — plain
// find(), no distanceKm field.
//
// PRODUCTION TODO — client-side search AND client-side "nearby" scaling
// limit:
// This works because we're shipping the FULL active-location list to
// every device. That's fine while the dataset is small (roughly up to
// a few hundred documents / a payload in the tens of KB). Revisit once
// EITHER of these becomes true:
//   1. Location count grows large enough that this payload becomes
//      noticeably large (check actual response size — rough trigger:
//      once it crosses ~100-200KB, or a few hundred+ documents).
//   2. Map pins move to viewport/bounding-box fetching instead of
//      "fetch all" (see the map-pins scaling TODO below) — at that
//      point this endpoint no longer returns the full dataset, so
//      client-side search AND client-side "nearby" filtering would
//      silently miss results outside the current viewport.
// When either trips: bring back server-side search (Atlas Search
// version already built once, using an `autocomplete` field index named
// 'location_autocomplete' — check git history or ask for it again) AND
// bring back the dedicated radius-limited nearby endpoint (see the
// commented-out getLocationsForMap above — the $geoNear + maxDistance
// pattern is already there, ready to uncomment).
// A plain MongoDB $text index was tried first for search and rejected —
// it only matches whole words/prefixes, not arbitrary mid-word
// substrings (e.g. "cheva" would not match "Chevayoor"), which broke
// the live-search UX this app needs.
//
// PRODUCTION TODO — map pins scaling limit (same endpoint, same data):
// "Fetch all, show all" pins is fine under roughly ~100-150 locations
// confined to a regional area. Past that, watch for either (a) visibly
// cluttered/overlapping pins on the map, or (b) the payload size trigger
// above. First lever to pull is usually marker clustering (e.g.
// react-native-map-clustering) purely client-side — it can carry you
// a long way without touching this endpoint. Only bring back viewport/
// bounding-box fetching ($geoWithin + a GeoJSON polygon, keyed off the
// map's visible region) once clustering alone isn't enough — that
// version was also already built and works, using the existing
// 2dsphere index on the `location` field.
const getAllLocationsForMap = async (req, res) => {
  try {
    const coords = parseCoords(req.query);

    if (!coords) {
      // No valid coords given — original behavior, unchanged.
      const locations = await Location.find({ isActive: true })
        .select('name city state district pincode latitude longitude')
        .lean();
      return res.json(locations);
    }

    // Coords given — annotate every active location with distanceKm.
    // No maxDistanceKm cap: this endpoint intentionally returns ALL
    // active locations (map pins + client-side search + client-side
    // nearby-list derivation).
    const locations = await geoNearLocations({ coords, extraFields: ['pincode'] });

    res.json(locations);
  } catch (error) {
    console.error('getAllLocationsForMap error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/locations/:id ─────────────────────────────────────────────
const getLocationById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid location id' });
    }

    const location = await Location.findById(id)
      .select('name city pincode latitude longitude')
      .lean();

    if (!location) {
      return res.status(404).json({ message: 'Location not found' });
    }

    const images = await getAttachmentsForRecord('Location', location._id);

    const reviews = await Review.find({ location: location._id })
      .populate('user', 'name photo')
      .sort({ createdAt: -1 })
      .lean();

    const reviewsWithImages = await Promise.all(
      reviews.map(async (r) => ({
        ...r,
        images: await getAttachmentsForRecord('Review', r._id),
      }))
    );

    const avgRating = reviews.length
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : null;

    res.json({
      ...location,
      images,
      reviews: reviewsWithImages,
      averageRating: avgRating,
      reviewCount: reviews.length,
    });
  } catch (error) {
    console.error('getLocationById error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/locations/liked/me (auth) ─────────────────────────────────
// Returns the current user's liked locations, hydrated from Location so
// the "Liked Places" list can render name/city/coords without a second
// round trip.
const getLikedLocations = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('likedLocations').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    const locations = await Location.find({
      _id: { $in: user.likedLocations },
      isActive: true,
    })
      .select('name city state district pincode latitude longitude')
      .lean();

    res.json(locations);
  } catch (error) {
    console.error('getLikedLocations error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── PATCH /api/locations/:id/like (auth) ────────────────────────────────
// Toggles the location in the current user's likedLocations list — liked
// becomes disliked/removed, and vice versa. This is the single endpoint
// for both the like and the unlike action.
const toggleLikeLocation = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid location id' });
    }

    const location = await Location.findById(id).select('_id').lean();
    if (!location) {
      return res.status(404).json({ message: 'Location not found' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const alreadyLiked = user.likedLocations.some((locId) => locId.toString() === id);

    if (alreadyLiked) {
      // Dislike: remove it from the list.
      user.likedLocations = user.likedLocations.filter((locId) => locId.toString() !== id);
    } else {
      // Like: add it to the list.
      user.likedLocations.push(id);
    }

    await user.save();

    res.status(200).json({
      liked: !alreadyLiked,
      likedLocations: user.likedLocations,
    });
  } catch (error) {
    console.error('toggleLikeLocation error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  // getLocationsForMap, // commented out — unused since the Home screen merge, see note above
  getAllLocationsForMap,
  getLocationById,
  getLikedLocations,
  toggleLikeLocation,
};