const express = require('express');
const router = express.Router();

const {
  getLocationsForMap,
  getAllLocationsForMap,
  getLocationById,
  getLikedLocations,
  toggleLikeLocation,
} = require('../controllers/locationController');
const verifyJWT = require('../middlewares/verifyJWT');

// router.get('/map', getLocationsForMap);
router.get('/all-for-map', getAllLocationsForMap);

// NOTE: must stay above the '/:id' route below, or '/:id' would swallow
// 'liked' as if it were a location id.
router.get('/liked/me', verifyJWT, getLikedLocations);
router.patch('/:id/like', verifyJWT, toggleLikeLocation);

router.get('/:id', getLocationById);

module.exports = router;