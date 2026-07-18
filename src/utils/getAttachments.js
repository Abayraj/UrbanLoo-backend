// utils/getAttachments.js
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const s3 = require('../config/s3Client');
const ActiveStorageAttachment = require('../models/activeStorageAttachment');

async function buildUrl(key) {
  if (process.env.R2_PUBLIC_URL) {
    return `${process.env.R2_PUBLIC_URL}/${key}`;
  }
  const command = new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn: 3600 });
}

async function getAttachmentsForRecord(recordType, recordId, name = 'image') {
  const attachments = await ActiveStorageAttachment.find({ recordType, recordId, name }).populate('blobId');

  const results = await Promise.all(
    attachments.map(async (a) => {
      const url = await buildUrl(a.blobId.key);
      console.log('DEBUG image URL built:', url); // temporary, to verify
      return {
        attachmentId: a._id,
        filename: a.blobId.filename,
        url,
        key: a.blobId.key,
      };
    })
  );

  return results;
}

module.exports = getAttachmentsForRecord;