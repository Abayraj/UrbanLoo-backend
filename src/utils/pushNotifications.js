// src/utils/pushNotifications.js
//
// Sends Expo push notifications to users and cleans up dead device tokens
// (e.g. the app was uninstalled) as part of the same call — no separate
// database table or later job is needed to track in-flight tickets, since
// this whole flow runs to completion inside a single async function call.
//
// Reference: https://docs.expo.dev/push-notifications/sending-notifications/
// Reference: https://github.com/expo/expo-server-sdk-node

const { Expo } = require('expo-server-sdk');
const User = require('../models/user');

// Per Expo docs, an access token is only required if you've enabled
// "Enhanced Security for Push Notifications" on the project. Passing
// undefined is fine when that's not enabled.
const expoClient = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN || undefined });

/**
 * Removes a single device entry from a user's `devices` array.
 * Used whenever Expo tells us a token is no longer valid pull means remove.
 */
async function removeInvalidDevice(userId, deviceId) {
  await User.updateOne({ _id: userId }, { $pull: { devices: { deviceId } } });
}

/**
 * Sends a push notification to every eligible device across the given
 * users, then checks delivery receipts and prunes any device whose token
 * Expo reports as dead.
 *
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.body
 * @param {string} [options.imageUrl] - optional image URL, rendered as the
 *   notification's rich-content image. Renders automatically on Android.
 *   On iOS this requires the mobile app to ship its own Notification Service
 *   Extension (native, client-side) — without that, iOS will show the
 *   title/body but no image, even though this field is set correctly here.
 * @param {Object} [options.data] - extra payload data your app's own JS can
 *   read once the notification is received/tapped (e.g. a deep-link target).
 *   This is NOT where an image goes — the OS never renders anything from `data`.
 * @param {Object} [options.userFilter] - optional Mongoose filter to narrow which users receive it
 * @returns {Promise<{sent: number, failed: number, invalidRemoved: number}>}
 */
async function sendPushToUsers({ title, body, imageUrl, data = {}, userFilter = {} }) {
  const eligibleUsers = await User.find({
    ...userFilter,
    'devices.0': { $exists: true },
  })
    .select('devices')
    .lean();

  const pushMessages = [];
  // Parallel array: pushMessages[i] belongs to messageRecipients[i]
  const messageRecipients = [];

  for (const user of eligibleUsers) {
    for (const device of user.devices || []) {
      const pushToken = device.expoPushToken;
      if (!pushToken || !Expo.isExpoPushToken(pushToken)) continue;
      if (device.notificationsEnabled === false) continue;

      pushMessages.push({
        to: pushToken,
        sound: 'default',
        title,
        body,
        // richContent.image is the field Expo/Android actually render as
        // the notification's picture — NOT `data`, which is invisible to
        // the OS and only readable by your app's own JS.
        ...(imageUrl ? { richContent: { image: imageUrl } } : {}),
        data,
      });
      messageRecipients.push({ userId: user._id, deviceId: device.deviceId });
    }
  }

  if (pushMessages.length === 0) {
    return { sent: 0, failed: 0, invalidRemoved: 0 };
  }

  // Expo recommends batching into chunks (also enforces the 600/sec rate
  // limit and retry/backoff internally when sent one chunk at a time).
  const messageChunks = expoClient.chunkPushNotifications(pushMessages);

  let sentCount = 0;
  let failedCount = 0;
  let invalidRemovedCount = 0;
  let recipientIndex = 0;

  // Tickets that came back "ok" and have a receipt id — checked for real
  // delivery status once all chunks have been sent. Held in memory only.
  const pendingReceipts = []; // [{ ticketId, userId, deviceId }]

  for (const chunk of messageChunks) {
    let tickets = [];
    try {
      tickets = await expoClient.sendPushNotificationsAsync(chunk);
    } catch (sendError) {
      console.error('[pushNotifications] chunk send failed:', sendError.message);
      failedCount += chunk.length;
      recipientIndex += chunk.length;
      continue;
    }

    tickets.forEach((ticket, chunkOffset) => {
      const recipient = messageRecipients[recipientIndex + chunkOffset];

      if (ticket.status === 'error') {
        failedCount++;
        // Some errors (malformed token, etc.) surface immediately on the
        // ticket itself, without needing a receipt lookup.
        if (ticket.details?.error === 'DeviceNotRegistered') {
          removeInvalidDevice(recipient.userId, recipient.deviceId);
          invalidRemovedCount++;
        }
        return;
      }

      sentCount++;
      // A ticket status of "ok" only means Expo accepted the message for
      // delivery — not that it reached the device. The real result (most
      // DeviceNotRegistered cases included) only appears in the receipt.
      if (ticket.id) {
        pendingReceipts.push({ ticketId: ticket.id, ...recipient });
      }
    });

    recipientIndex += chunk.length;
  }

  if (pendingReceipts.length > 0) {
    invalidRemovedCount += await checkReceiptsAndCleanup(pendingReceipts);
  }

  return { sent: sentCount, failed: failedCount, invalidRemoved: invalidRemovedCount };
}

/**
 * Fetches delivery receipts for a batch of tickets and removes any device
 * whose token Expo reports as no longer registered.
 *
 * Note: Expo's docs say receipts are usually available quickly, but can
 * take up to ~30 minutes to appear under heavy load. Since we don't persist
 * ticket ids anywhere, a receipt that isn't ready yet on this check will
 * simply be missed — that device's stale token just gets caught on a later
 * send instead. Acceptable for a "come check the app" reminder; would not
 * be for something that needs guaranteed cleanup.
 */
async function checkReceiptsAndCleanup(pendingReceipts) {
  const ticketIds = pendingReceipts.map((entry) => entry.ticketId);
  const receiptIdChunks = expoClient.chunkPushNotificationReceiptIds(ticketIds);
  let removedCount = 0;

  for (const chunk of receiptIdChunks) {
    let receipts = {};
    try {
      receipts = await expoClient.getPushNotificationReceiptsAsync(chunk);
    } catch (receiptError) {
      console.error('[pushNotifications] receipt fetch failed:', receiptError.message);
      continue;
    }

    for (const ticketId of chunk) {
      const receipt = receipts[ticketId];
      const recipient = pendingReceipts.find((entry) => entry.ticketId === ticketId);
      if (!receipt || !recipient) continue;

      if (receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') {
        await removeInvalidDevice(recipient.userId, recipient.deviceId);
        removedCount++;
      }
      // Other error reasons (e.g. MessageTooBig, MessageRateExceeded) are
      // not token-validity problems, so we leave those devices alone.
    }
  }

  return removedCount;
}

module.exports = { sendPushToUsers, removeInvalidDevice };