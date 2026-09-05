const mongoose = require('mongoose');
const Location = require('../models/location');
const Review = require('../models/review');
const User = require('../models/user');
const getAttachmentsForRecord = require('../utils/getAttachments');

const DEFAULT_RADIUS_KM = 10;
const MAX_RADIUS_KM = 100;

// ── GET /api/locations/map?lat=&lng=&radius= ──────────────────────────
// Used by the "Nearby Wash Rooms" list — distance-from-user based.
const getLocationsForMap = async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ message: 'lat and lng query params are required' });
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ message: 'lat/lng out of valid range' });
    }

    let radiusKm = parseFloat(req.query.radius);
    if (Number.isNaN(radiusKm) || radiusKm <= 0) radiusKm = DEFAULT_RADIUS_KM;
    radiusKm = Math.min(radiusKm, MAX_RADIUS_KM);

    const locations = await Location.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [lng, lat] },
          distanceField: 'distanceMeters',
          maxDistance: radiusKm * 1000,
          spherical: true,
          query: { isActive: true },
        },
      },
      {
        $project: {
          name: 1,
          city: 1,
          latitude: 1,
          longitude: 1,
          state: 1,
          district: 1,
          distanceKm: { $round: [{ $divide: ['$distanceMeters', 1000] }, 2] },
        },
      },
    ]);

    res.json(locations);
  } catch (error) {
    console.error('getLocationsForMap error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ── GET /api/locations/all-for-map ─────────────────────────────────────
// Used for BOTH the map pins AND search. The frontend fetches this once
// and filters it client-side for search, instead of hitting a separate
// /search endpoint on every keystroke.
//
// PRODUCTION TODO — client-side search scaling limit:
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
//      client-side search would silently miss results outside the
//      current viewport.
// When either trips: bring back server-side search. We already built
// and verified an Atlas Search version using an `autocomplete` field
// index (index name was 'location_autocomplete') that correctly
// supports partial/live-typing matches with proper index performance —
// removed from this file for now since it's dead code while we're
// searching client-side, but the approach is proven and ready to
// reintroduce (check git history for this file, or ask for it again).
// A plain MongoDB $text index was tried first and rejected — it only
// matches whole words/prefixes, not arbitrary mid-word substrings
// (e.g. "cheva" would not match "Chevayoor"), which broke the
// live-search UX this app needs.
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
    const locations = await Location.find({ isActive: true })
      .select('name city state district pincode latitude longitude')
      .lean();

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
  getLocationsForMap,
  getAllLocationsForMap,
  getLocationById,
  getLikedLocations,
  toggleLikeLocation,
};