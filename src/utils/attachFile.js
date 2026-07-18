const { PutObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');
const sharp = require('sharp');
const s3 = require('../config/s3Client');
const ActiveStorageBlob = require('../models/activeStorageBlob');
const ActiveStorageAttachment = require('../models/activeStorageAttachment');

async function compressImage(buffer, contentType) {
  if (!contentType?.startsWith('image/')) {
    return { buffer, contentType };
  }

  const compressed = await sharp(buffer)
    .rotate()
    .resize({ width: 1920, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();

  return { buffer: compressed, contentType: 'image/jpeg' };
}

async function attachFile({ fileBuffer, filename, contentType, recordType, recordId, name = 'image', uploadedBy }) {
  const { buffer: finalBuffer, contentType: finalContentType } = await compressImage(fileBuffer, contentType);

const key = `${crypto.randomBytes(16).toString('hex')}-${filename}`;

  await s3.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
    Body: finalBuffer,
    ContentType: finalContentType,
  }));

  const blob = await ActiveStorageBlob.create({
    key,
    filename,
    contentType: finalContentType,
    byteSize: finalBuffer.length,
  });

  const attachment = await ActiveStorageAttachment.create({
    name, recordType, recordId, blobId: blob._id, uploadedBy,
  });

  return { blob, attachment };
}

module.exports = attachFile;