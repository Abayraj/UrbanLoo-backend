// admin/setup.js
const AdminJS = require('adminjs');
const { ComponentLoader } = require('adminjs');
const AdminJSExpress = require('@adminjs/express');
const { Database, Resource: MongooseResource } = require('@adminjs/mongoose');
const path = require('path');
const fs = require('fs');
const AdminUser = require('../models/adminUser');
const User = require('../models/User');
const Location = require('../models/Location');
const attachFile = require('../utils/attachFile');
const getAttachmentsForRecord = require('../utils/getAttachments');
const purgeAttachment = require('../utils/purgeAttachment');
const purgeAllAttachmentsForRecord = require('../utils/purgeAllAttachmentsForRecord');

// ── Patch: skip schema paths that crash AdminJS's Mongoose introspection ────
const EXCLUDED_PATHS_BY_MODEL = {
  User: ['devices'],
};

// Models that have image attachments — extend this list as you add more (e.g. 'Review')
const MODELS_WITH_ATTACHMENTS = ['Location'];

class SafeMongooseResource extends MongooseResource {
  properties() {
    const modelName = this.MongooseModel?.modelName;
    const excluded = EXCLUDED_PATHS_BY_MODEL[modelName] || [];
    return super.properties().filter((property) => {
      const path = property.path();
      return !excluded.some((ex) => path === ex || path.startsWith(`${ex}.`));
    });
  }

  async delete(id) {
    const modelName = this.MongooseModel?.modelName;

    // Clean up any attached images (R2 + Blob + Attachment records)
    // before deleting the actual record, so nothing is orphaned.
    if (MODELS_WITH_ATTACHMENTS.includes(modelName)) {
      await purgeAllAttachmentsForRecord(modelName, id);
    }

    await this.MongooseModel.findOneAndDelete({ _id: id });
  }
}
// ──────────────────────────────────────────────────────────────────────────

AdminJS.registerAdapter({ Database, Resource: SafeMongooseResource });

// ── Custom component loader ─────────────────────────────────────────────
const componentLoader = new ComponentLoader();
componentLoader.add('DevicesView', path.join(__dirname, 'components/DevicesView'));
componentLoader.add('LocationMap', path.join(__dirname, 'components/LocationMap'));
componentLoader.add('LocationImagesView', path.join(__dirname, 'components/LocationImagesView'));
componentLoader.add('ImagesUploadInput', path.join(__dirname, 'components/ImagesUploadInput'));
componentLoader.add('ExistingImagesManager', path.join(__dirname, 'components/ExistingImagesManager'));
// ──────────────────────────────────────────────────────────────────────────

const superadminOnly = { isAccessible: ({ currentAdmin }) => currentAdmin?.role === 'superadmin' };

// ── Shared upload-detection logic, used by both `new` and `edit` ───────────
function extractUploadedFiles(request) {
  request.payload = request.payload || {};

  const collected = [];
  const hasFiles = request.files && Object.keys(request.files).length > 0;
  const source = hasFiles ? request.files : request.payload;

  Object.keys(source).forEach((key) => {
    if (key === 'imagesUpload' || key.startsWith('imagesUpload.') || key.startsWith('imagesUpload[')) {
      const value = source[key];
      if (Array.isArray(value)) {
        collected.push(...value);
      } else if (value) {
        collected.push(value);
      }
    }
  });

  request._uploadedFiles = collected;

  Object.keys(request.payload).forEach((key) => {
    if (key === 'imagesUpload' || key.startsWith('imagesUpload.') || key.startsWith('imagesUpload[')) {
      delete request.payload[key];
    }
  });

  return request;
}

async function uploadFilesToRecord(files, recordId, context) {
  for (const file of files) {
    const filePath = file?.path || file?.filepath;
    const fileName = file?.name || file?.originalFilename;
    const fileType = file?.type || file?.mimetype;

    if (!filePath) continue;

    try {
      const buffer = fs.readFileSync(filePath);
      const result = await attachFile({
        fileBuffer: buffer,
        filename: fileName,
        contentType: fileType,
        recordType: 'Location',
        recordId,
        uploadedBy: context.currentAdmin?._id,
      });
      console.log('DEBUG: successfully attached file:', result.blob.key);
    } catch (err) {
      console.error('ERROR uploading file to R2:', err);
    }
  }
}
// ──────────────────────────────────────────────────────────────────────────

const admin = new AdminJS({
  rootPath: '/admin',
  componentLoader,
  assets: {
    scripts: [
      `https://maps.googleapis.com/maps/api/js?key=${process.env.GOOGLE_MAPS_API_KEY}&libraries=places`,
    ],
  },
  resources: [
    {
      resource: User,
      options: {
        properties: {
          googleId: { isVisible: { list: false, filter: true, show: true, edit: false } },
          devices: {
            isVisible: { list: false, filter: false, show: true, edit: false },
            components: { show: 'DevicesView' },
          },
        },
        actions: {
          show: {
            after: async (response) => {
              const userId = response?.record?.params?._id;
              if (userId) {
                const doc = await User.findById(userId).lean();
                response.record.params.devices = doc?.devices || [];
              }
              return response;
            },
          },
        },
      },
    },
    {
      resource: AdminUser,
      options: {
        properties: {
          password: {
            type: 'password',
            isVisible: { list: false, filter: false, show: false, edit: true },
          },
        },
        actions: {
          new: superadminOnly,
          edit: superadminOnly,
          delete: superadminOnly,
          list: superadminOnly,
          show: superadminOnly,
        },
      },
    },
    {
      resource: Location,
      options: {
        properties: {
          state: { isVisible: { list: true, filter: true, show: true, edit: true } },
          district: { isVisible: { list: true, filter: true, show: true, edit: true } },
          latitude: { components: { edit: 'LocationMap' } },
          longitude: { isVisible: { list: false, filter: true, show: true, edit: false } },
          isActive: { isVisible: { list: true, filter: true, show: true, edit: true } },
          pincode: { isRequired: false },
          existingImages: {
            isVisible: { list: false, filter: false, show: false, edit: true },
            components: { edit: 'ExistingImagesManager' },
          },
          imagesUpload: {
            type: 'file',
            isArray: true,
            isVisible: { list: false, filter: false, show: false, edit: true },
            components: { edit: 'ImagesUploadInput' },
          },
          images: {
            isVisible: { list: false, filter: false, show: true, edit: false },
            components: { show: 'LocationImagesView' },
          },
        },
        listProperties: ['name', 'city', 'district', 'state', 'isActive'],
        editProperties: ['name', 'state', 'district', 'city', 'pincode', 'latitude', 'isActive', 'existingImages', 'imagesUpload'],
        showProperties: ['name', 'state', 'district', 'city', 'pincode', 'latitude', 'longitude', 'isActive', 'images', 'createdAt'],
        actions: {
          new: {
            before: async (request) => extractUploadedFiles(request),
            after: async (response, request, context) => {
              const files = request._uploadedFiles || [];
              const recordId = response?.record?.params?._id;
              if (files.length > 0 && recordId) {
                await uploadFilesToRecord(files, recordId, context);
              }
              return response;
            },
          },
          edit: {
            before: async (request) => extractUploadedFiles(request),
            after: async (response, request, context) => {
              const recordId = response?.record?.params?._id;
              const files = request._uploadedFiles || [];

              if (files.length > 0 && recordId) {
                await uploadFilesToRecord(files, recordId, context);
              }

              if (recordId) {
                response.record.params.images = await getAttachmentsForRecord('Location', recordId);
              }

              return response;
            },
          },
          show: {
            after: async (response) => {
              const recordId = response?.record?.params?._id;
              if (recordId) {
                response.record.params.images = await getAttachmentsForRecord('Location', recordId);
              }
              return response;
            },
          },
          deleteImage: {
            actionType: 'record',
            isVisible: false,
            handler: async (request, response, context) => {
              const { record } = context;
              const attachmentId = request.query.attachmentId;
              if (attachmentId) {
                await purgeAttachment(attachmentId);
              }
              const images = await getAttachmentsForRecord('Location', record.params._id);
              return { record: record.toJSON(context.currentAdmin), images };
            },
          },
        },
      },
    },
  ],
  branding: { companyName: 'Your App Admin' },
});

if (process.env.NODE_ENV !== 'production') {
  admin.watch();
}

const authenticate = async (email, password) => {
  const adminUser = await AdminUser.findOne({ email: email.toLowerCase() });
  if (!adminUser) return null;
  const isValid = await adminUser.comparePassword(password);
  return isValid ? adminUser : null;
};

const adminRouter = AdminJSExpress.buildAuthenticatedRouter(admin, {
  authenticate,
  cookiePassword: process.env.ADMIN_COOKIE_SECRET || 'some-long-random-secret-change-this',
}, null, {
  resave: false,
  saveUninitialized: true,
  secret: process.env.ADMIN_SESSION_SECRET || 'another-long-random-secret-change-this',
});

module.exports = { admin, adminRouter };