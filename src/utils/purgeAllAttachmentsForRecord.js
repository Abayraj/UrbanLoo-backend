// utils/purgeAllAttachmentsForRecord.js
const ActiveStorageAttachment = require('../models/activeStorageAttachment');
const purgeAttachment = require('./purgeAttachment');

async function purgeAllAttachmentsForRecord(recordType, recordId) {
  const attachments = await ActiveStorageAttachment
    .find({ recordType, recordId }).populate('blobId');

  for (const attachment of attachments) {
    await purgeAttachment(attachment);
  }
}

module.exports = purgeAllAttachmentsForRecord;