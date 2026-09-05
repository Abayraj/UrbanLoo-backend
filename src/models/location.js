const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 100,
    },
    state: { type: String, required: true, trim: true },
    district: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    pincode: { type: String, trim: true },
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 },
    isActive: { type: Boolean, default: true },

    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: undefined,
      },
    },
  },
  { timestamps: true }
);

locationSchema.pre('save', function () {
  if (this.isModified('latitude') || this.isModified('longitude') || !this.location?.coordinates) {
    this.location = {
      type: 'Point',
      coordinates: [this.longitude, this.latitude],
    };
  }
});

// Powers $geoNear in getLocationsForMap (nearby-list distance queries).
locationSchema.index({ location: '2dsphere' });

// No search-related index here — search is currently client-side
// (see PRODUCTION TODO in controllers/locationController.js for when
// and how to bring back server-side search + its index).

module.exports = mongoose.model('Location', locationSchema);