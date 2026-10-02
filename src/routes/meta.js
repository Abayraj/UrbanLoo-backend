const express = require('express');
const router = express.Router();

const { getStatesDistricts } = require('../controllers/metaController');

// Public — no verifyJWT. Static reference data, nothing sensitive.
router.get('/states-districts', getStatesDistricts);

module.exports = router;