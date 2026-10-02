const STATES_DISTRICTS = require('../data/statesDistricts');

// ── GET /api/meta/states-districts ───────────────────────────────────
// Public, unauthenticated — returns the full dataset in one shot:
// { states: ["Kerala", ...], data: { "Kerala": [...], ... } }
const getStatesDistricts = (req, res) => {
  res.json({
    states: Object.keys(STATES_DISTRICTS).sort(),
    data: STATES_DISTRICTS,
  });
};

module.exports = { getStatesDistricts };