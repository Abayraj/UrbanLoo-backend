// admin/setup.js

const AdminJS = require('adminjs');
const { ComponentLoader } = require('adminjs');
const AdminJSExpress = require('@adminjs/express');
const {
  Database,
  Resource: MongooseResource,
} = require('@adminjs/mongoose');

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const AdminUser = require('../models/adminUser');
const User = require('../models/user');
const Location = require('../models/location');

const attachFile = require('../utils/attachFile');
const getAttachmentsForRecord = require('../utils/getAttachments');
const purgeAttachment = require('../utils/purgeAttachment');
const purgeAllAttachmentsForRecord = require('../utils/purgeAllAttachmentsForRecord');
const { sendPushToUsers } = require('../utils/pushNotifications');


// ─────────────────────────────────────────────────────────────────────────────
// AdminJS / Mongoose compatibility fix
// ─────────────────────────────────────────────────────────────────────────────
//
// @adminjs/mongoose can crash while recursively inspecting certain nested
// Mongoose array structures.
//
// Your Location model contains GeoJSON:
//
// location: {
//   type: {
//     type: String,
//     enum: ['Point']
//   },
//   coordinates: [Number]
// }
//
// AdminJS tries to inspect the nested coordinates array and internally
// accesses:
//
//   this.mongoosePath.caster
//
// For this particular nested structure, caster can be undefined:
//
//   Cannot destructure property 'instance'
//   of 'this.mongoosePath.caster' as it is undefined.
//
// We do NOT change the actual Mongoose schema or MongoDB data.
//
// Instead, these fields are completely excluded from AdminJS property
// discovery.
//
// IMPORTANT:
// Do not use only `isVisible: false` for these fields.
// AdminJS can still introspect/flatten the property before visibility is
// applied. The SafeMongooseResource filters them from the discovered
// properties themselves.
//

const EXCLUDED_PATHS_BY_MODEL = {
  // User contains array/nested properties which can also cause the same
  // AdminJS Mongoose property/caster introspection problem.
  User: [
    'devices',
    'likedLocations',
  ],

  // GeoJSON field. AdminJS does not need this because latitude and longitude
  // are already exposed separately in the Location resource.
  Location: [
    'location',
  ],
};


// ─────────────────────────────────────────────────────────────────────────────
// Models that have image attachments
// ─────────────────────────────────────────────────────────────────────────────

const MODELS_WITH_ATTACHMENTS = [
  'Location',
];


// ─────────────────────────────────────────────────────────────────────────────
// Safe Mongoose Resource
// ─────────────────────────────────────────────────────────────────────────────

class SafeMongooseResource extends MongooseResource {
  properties() {
    const modelName = this.MongooseModel?.modelName;

    const excluded =
      EXCLUDED_PATHS_BY_MODEL[modelName] || [];

    const properties = super.properties();

    return properties.filter((property) => {
      const propertyPath = property.path();

      return !excluded.some(
        (excludedPath) =>
          propertyPath === excludedPath ||
          propertyPath.startsWith(`${excludedPath}.`)
      );
    });
  }

  async delete(id) {
    const modelName = this.MongooseModel?.modelName;

    // Clean up all attached images before deleting the actual record.
    if (MODELS_WITH_ATTACHMENTS.includes(modelName)) {
      await purgeAllAttachmentsForRecord(modelName, id);
    }

    await this.MongooseModel.findOneAndDelete({
      _id: id,
    });
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Register AdminJS Mongoose adapter
// ─────────────────────────────────────────────────────────────────────────────

AdminJS.registerAdapter({
  Database,
  Resource: SafeMongooseResource,
});


// ─────────────────────────────────────────────────────────────────────────────
// Custom component loader
// ─────────────────────────────────────────────────────────────────────────────

const componentLoader = new ComponentLoader();

componentLoader.add(
  'DevicesView',
  path.join(__dirname, 'components/DevicesView')
);

componentLoader.add(
  'LocationMap',
  path.join(__dirname, 'components/LocationMap')
);

componentLoader.add(
  'LocationImagesView',
  path.join(__dirname, 'components/LocationImagesView')
);

componentLoader.add(
  'ImagesUploadInput',
  path.join(__dirname, 'components/ImagesUploadInput')
);

componentLoader.add(
  'ExistingImagesManager',
  path.join(__dirname, 'components/ExistingImagesManager')
);

componentLoader.add(
  'SendNotificationForm',
  path.join(__dirname, 'components/SendNotificationForm')
);


// ─────────────────────────────────────────────────────────────────────────────
// Access control
// ─────────────────────────────────────────────────────────────────────────────

const superadminOnly = {
  isAccessible: ({ currentAdmin }) =>
    currentAdmin?.role === 'superadmin',
};


// ─────────────────────────────────────────────────────────────────────────────
// Upload detection
// Used by both new and edit actions
// ─────────────────────────────────────────────────────────────────────────────

function extractUploadedFiles(request) {
  request.payload = request.payload || {};

  const collected = [];

  const hasFiles =
    request.files &&
    Object.keys(request.files).length > 0;

  const source = hasFiles
    ? request.files
    : request.payload;

  Object.keys(source).forEach((key) => {
    if (
      key === 'imagesUpload' ||
      key.startsWith('imagesUpload.') ||
      key.startsWith('imagesUpload[')
    ) {
      const value = source[key];

      if (Array.isArray(value)) {
        collected.push(...value);
      } else if (value) {
        collected.push(value);
      }
    }
  });

  request._uploadedFiles = collected;

  // Remove upload fields from AdminJS payload so that Mongoose does not
  // try to save the temporary file objects into the Location document.
  Object.keys(request.payload).forEach((key) => {
    if (
      key === 'imagesUpload' ||
      key.startsWith('imagesUpload.') ||
      key.startsWith('imagesUpload[')
    ) {
      delete request.payload[key];
    }
  });

  return request;
}


// ─────────────────────────────────────────────────────────────────────────────
// Upload files to a record
// ─────────────────────────────────────────────────────────────────────────────

async function uploadFilesToRecord(
  files,
  recordId,
  context
) {
  for (const file of files) {
    const filePath =
      file?.path ||
      file?.filepath;

    const fileName =
      file?.name ||
      file?.originalFilename;

    const fileType =
      file?.type ||
      file?.mimetype;

    if (!filePath) {
      continue;
    }

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

      console.log(
        'DEBUG: successfully attached file:',
        result.blob.key
      );
    } catch (err) {
      console.error(
        'ERROR uploading file to R2:',
        err
      );
    }
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// AdminJS configuration
// ─────────────────────────────────────────────────────────────────────────────

const admin = new AdminJS({
  rootPath: '/admin',

  componentLoader,

  assets: {
    scripts: [
      `https://maps.googleapis.com/maps/api/js?key=${process.env.GOOGLE_MAPS_API_KEY}&libraries=places`,
    ],
  },

  resources: [

    // ────────────────────────────────────────────────────────────────────────
    // USER
    // ────────────────────────────────────────────────────────────────────────

    {
      resource: User,

      options: {
        properties: {
          googleId: {
            isVisible: {
              list: false,
              filter: true,
              show: true,
              edit: false,
            },
          },

          devices: {
            isVisible: {
              list: false,
              filter: false,
              show: true,
              edit: false,
            },

            components: {
              show: 'DevicesView',
            },
          },
        },

        actions: {
          show: {
            after: async (response) => {
              const userId =
                response?.record?.params?._id;

              if (userId) {
                const doc =
                  await User.findById(userId).lean();

                response.record.params.devices =
                  doc?.devices || [];
              }

              return response;
            },
          },

          sendNotification: {
            actionType: 'resource',

            icon: 'Send',

            component: 'SendNotificationForm',

            handler: async (
              request,
              response,
              context
            ) => {

              // GET: initial page load
              if (request.method !== 'post') {
                return {
                  record: {},
                };
              }

              const {
                title,
                body,
                presetImageUrl,
              } = request.payload || {};

              if (
                !title?.trim() ||
                !body?.trim()
              ) {
                return {
                  record: {},

                  notice: {
                    message:
                      'Title and body are both required.',
                    type: 'error',
                  },
                };
              }

              let imageUrl =
                presetImageUrl ||
                undefined;

              const uploadedImage =
                request.files?.image;

              if (uploadedImage) {
                const filePath =
                  uploadedImage.path ||
                  uploadedImage.filepath;

                const fileName =
                  uploadedImage.name ||
                  uploadedImage.originalFilename;

                const fileType =
                  uploadedImage.type ||
                  uploadedImage.mimetype;

                if (filePath) {
                  const fileBuffer =
                    fs.readFileSync(filePath);

                  const { blob } =
                    await attachFile({
                      fileBuffer,
                      filename: fileName,
                      contentType: fileType,
                      recordType: 'Notification',
                      recordId:
                        new mongoose.Types.ObjectId(),
                      uploadedBy:
                        context.currentAdmin?._id,
                    });

                  imageUrl =
                    process.env.R2_PUBLIC_URL
                      ? `${process.env.R2_PUBLIC_URL}/${blob.key}`
                      : undefined;
                }
              }

              const stats =
                await sendPushToUsers({
                  title,
                  body,
                  imageUrl,
                });

              return {
                record: {},

                notice: {
                  message:
                    `Sent: ${stats.sent} · ` +
                    `Failed: ${stats.failed} · ` +
                    `Dead tokens removed: ${stats.invalidRemoved}`,

                  type: 'success',
                },

                stats,
              };
            },
          },
        },
      },
    },


    // ────────────────────────────────────────────────────────────────────────
    // ADMIN USER
    // ────────────────────────────────────────────────────────────────────────

    {
      resource: AdminUser,

      options: {
        properties: {
          password: {
            type: 'password',

            isVisible: {
              list: false,
              filter: false,
              show: false,
              edit: true,
            },
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


    // ────────────────────────────────────────────────────────────────────────
    // LOCATION
    // ────────────────────────────────────────────────────────────────────────

    {
      resource: Location,

      options: {
        properties: {

          state: {
            isVisible: {
              list: true,
              filter: true,
              show: true,
              edit: true,
            },
          },

          district: {
            isVisible: {
              list: true,
              filter: true,
              show: true,
              edit: true,
            },
          },

          latitude: {
            components: {
              edit: 'LocationMap',
            },
          },

          longitude: {
            isVisible: {
              list: false,
              filter: true,
              show: true,
              edit: false,
            },
          },

          isActive: {
            isVisible: {
              list: true,
              filter: true,
              show: true,
              edit: true,
            },
          },

          pincode: {
            isRequired: false,
          },


          // IMPORTANT:
          //
          // Do NOT add:
          //
          // location: { isVisible: false }
          // location.type: { isVisible: false }
          // location.coordinates: { isVisible: false }
          //
          // These fields are excluded by SafeMongooseResource above.
          // That prevents AdminJS from attempting to recursively inspect
          // the problematic GeoJSON property.


          existingImages: {
            isVisible: {
              list: false,
              filter: false,
              show: false,
              edit: true,
            },

            components: {
              edit: 'ExistingImagesManager',
            },
          },


          imagesUpload: {
            type: 'file',

            isArray: true,

            isVisible: {
              list: false,
              filter: false,
              show: false,
              edit: true,
            },

            components: {
              edit: 'ImagesUploadInput',
            },
          },


          images: {
            isVisible: {
              list: false,
              filter: false,
              show: true,
              edit: false,
            },

            components: {
              show: 'LocationImagesView',
            },
          },
        },


        // ──────────────────────────────────────────────────────────────────
        // Location property layouts
        // ──────────────────────────────────────────────────────────────────

        listProperties: [
          'name',
          'city',
          'district',
          'state',
          'isActive',
        ],

        editProperties: [
          'name',
          'state',
          'district',
          'city',
          'pincode',
          'latitude',
          'isActive',
          'existingImages',
          'imagesUpload',
        ],

        showProperties: [
          'name',
          'state',
          'district',
          'city',
          'pincode',
          'latitude',
          'longitude',
          'isActive',
          'images',
          'createdAt',
        ],


        // ──────────────────────────────────────────────────────────────────
        // Location actions
        // ──────────────────────────────────────────────────────────────────

        actions: {

          // ────────────────────────────────────────────────────────────────
          // CREATE
          // ────────────────────────────────────────────────────────────────

          new: {

            before: async (request) => {
              return extractUploadedFiles(request);
            },

            after: async (
              response,
              request,
              context
            ) => {

              const files =
                request._uploadedFiles || [];

              const recordId =
                response?.record?.params?._id;

              if (
                files.length > 0 &&
                recordId
              ) {
                await uploadFilesToRecord(
                  files,
                  recordId,
                  context
                );
              }

              return response;
            },
          },


          // ────────────────────────────────────────────────────────────────
          // EDIT
          // ────────────────────────────────────────────────────────────────

          edit: {

            before: async (request) => {
              return extractUploadedFiles(request);
            },

            after: async (
              response,
              request,
              context
            ) => {

              const recordId =
                response?.record?.params?._id;

              const files =
                request._uploadedFiles || [];


              // Upload newly selected images
              if (
                files.length > 0 &&
                recordId
              ) {
                await uploadFilesToRecord(
                  files,
                  recordId,
                  context
                );
              }


              // Refresh image attachments
              if (recordId) {
                response.record.params.images =
                  await getAttachmentsForRecord(
                    'Location',
                    recordId
                  );
              }

              return response;
            },
          },


          // ────────────────────────────────────────────────────────────────
          // SHOW
          // ────────────────────────────────────────────────────────────────

          show: {

            after: async (response) => {

              const recordId =
                response?.record?.params?._id;

              if (recordId) {
                response.record.params.images =
                  await getAttachmentsForRecord(
                    'Location',
                    recordId
                  );
              }

              return response;
            },
          },


          // ────────────────────────────────────────────────────────────────
          // DELETE IMAGE
          // ────────────────────────────────────────────────────────────────

          deleteImage: {

            actionType: 'record',

            isVisible: false,

            handler: async (
              request,
              response,
              context
            ) => {

              const { record } = context;

              const attachmentId =
                request.query.attachmentId;

              if (attachmentId) {
                await purgeAttachment(
                  attachmentId
                );
              }

              const images =
                await getAttachmentsForRecord(
                  'Location',
                  record.params._id
                );

              return {
                record:
                  record.toJSON(
                    context.currentAdmin
                  ),

                images,
              };
            },
          },
        },
      },
    },
  ],


  // ─────────────────────────────────────────────────────────────────────────
  // Branding
  // ─────────────────────────────────────────────────────────────────────────

  branding: {
    companyName: 'Your App Admin',
  },
});


// ─────────────────────────────────────────────────────────────────────────────
// AdminJS development watcher
// ─────────────────────────────────────────────────────────────────────────────

if (process.env.NODE_ENV !== 'production') {
  admin.watch();
}


// ─────────────────────────────────────────────────────────────────────────────
// Authentication
// ─────────────────────────────────────────────────────────────────────────────

const authenticate = async (
  email,
  password
) => {

  const adminUser =
    await AdminUser.findOne({
      email: email.toLowerCase(),
    });

  if (!adminUser) {
    return null;
  }

  const isValid =
    await adminUser.comparePassword(password);

  return isValid
    ? adminUser
    : null;
};


// ─────────────────────────────────────────────────────────────────────────────
// AdminJS Express router
// ─────────────────────────────────────────────────────────────────────────────

const adminRouter =
  AdminJSExpress.buildAuthenticatedRouter(
    admin,
    {
      authenticate,

      cookiePassword:
        process.env.ADMIN_COOKIE_SECRET 
    },
    null,
    {
      resave: false,

      saveUninitialized: true,

      secret:
        process.env.ADMIN_SESSION_SECRET
    }
  );


// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  admin,
  adminRouter,
};