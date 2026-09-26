// utils/purgeAttachment.js
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const s3 = require('../config/s3Client');
const ActiveStorageBlob = require('../models/activeStorageBlob');
const ActiveStorageAttachment = require('../models/activeStorageAttachment');

async function purgeAttachment(attachmentId) {
  const attachment = await ActiveStorageAttachment.findByIdAndDelete(attachmentId);
  if (!attachment) return;

  const blob = await ActiveStorageBlob.findByIdAndDelete(attachment.blobId);

  if (blob) {
    await s3.send(new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: blob.key,
    }));
  }
}

module.exports = purgeAttachment;