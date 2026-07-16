// models/ActiveStorageAttachment.js
const mongoose = require('mongoose');

const activeStorageAttachmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, default: 'image' },
    recordType: { type: String, required: true },
    recordId: { type: mongoose.Schema.Types.ObjectId, required: true },
    blobId: { type: mongoose.Schema.Types.ObjectId, ref: 'ActiveStorageBlob', required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
  },
  { timestamps: true, collection: 'active_storage_attachments' }
);

activeStorageAttachmentSchema.index({ recordType: 1, recordId: 1 });

module.exports = mongoose.model('ActiveStorageAttachment', activeStorageAttachmentSchema);