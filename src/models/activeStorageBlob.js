// models/activeStorageBlob.js
const mongoose = require('mongoose');

const activeStorageBlobSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    filename: { type: String, required: true },
    contentType: { type: String },
    byteSize: { type: Number },
    // checksum: { type: String },
    // serviceName: { type: String, default: 'r2' },
  },
  { timestamps: true, collection: 'active_storage_blobs' }
);

module.exports = mongoose.model('ActiveStorageBlob', activeStorageBlobSchema);