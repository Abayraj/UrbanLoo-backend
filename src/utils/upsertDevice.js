const upsertDevice = (user, { deviceId, expoPushToken, deviceName, deviceModel, platform, notificationsEnabled }) => {
  if (!deviceId) return;

  const existing = user.devices.find((d) => d.deviceId === deviceId);

  if (existing) {
    if (expoPushToken) existing.expoPushToken = expoPushToken;
    if (typeof notificationsEnabled === 'boolean') existing.notificationsEnabled = notificationsEnabled;
    // existing.lastActiveAt = new Date();
  } else {
    user.devices.push({
      deviceId,
      expoPushToken,
      deviceName,
      deviceModel,
      platform,
      notificationsEnabled: notificationsEnabled ?? true,
      lastLoginAt: new Date(),
    });
  }
};

module.exports = upsertDevice;