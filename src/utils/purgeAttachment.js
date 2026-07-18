// utils/purgeAttachment.js
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const s3 = require('../config/s3Client');
const ActiveStorageBlob = require('../models/activeStorageBlob');
const ActiveStorageAttachment = require('../models/activeStorageAttachment');

async function purgeAttachment(attachment) {
  if (!attachment) return;
  await s3.send(
    new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: attachment.blobId.key,
    })
  );

  await ActiveStorageBlob.findByIdAndDelete(attachment.blobId._id);
  await ActiveStorageAttachment.findByIdAndDelete(attachment._id);
}

module.exports = purgeAttachment;