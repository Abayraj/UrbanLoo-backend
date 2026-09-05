// src/cron/index.js
//
// Registers scheduled jobs. Cron's only responsibility is deciding WHEN a
// job runs — the actual work lives in src/utils. Each job is wrapped with
// withLock() so a slow run can never overlap with itself: node-cron does
// not wait for a previous invocation to finish before firing the next one.

const cron = require('node-cron');
const { sendPushToUsers } = require('../utils/pushNotifications');

/**
 * Wraps a job function so overlapping ticks are skipped instead of running
 * concurrently, and so every run's success/failure is logged consistently.
 */
function withLock(jobName, jobFn) {
  let isRunning = false;

  return async () => {
    if (isRunning) {
      console.warn(`[cron] ${jobName} skipped — previous run still in progress`);
      return;
    }

    isRunning = true;
    const startedAt = Date.now();

    try {
      const result = await jobFn();
      const durationMs = Date.now() - startedAt;
      console.log(`[cron] ${jobName} finished in ${durationMs}ms`, result || '');
    } catch (jobError) {
      console.error(`[cron] ${jobName} failed:`, jobError);
    } finally {
      isRunning = false;
    }
  };
}

function startCronJobs() {
  // Daily "come check the app" engagement reminder.
  // Default: 6:00 PM server time. Override with CRON_DAILY_REMINDER (standard cron syntax).
  const dailyReminderSchedule = process.env.CRON_DAILY_REMINDER || '0 18 * * *';

  cron.schedule(
    dailyReminderSchedule,
    withLock('dailyReminder', () =>
      sendPushToUsers({
        title: process.env.DAILY_REMINDER_TITLE || 'Need a restroom? 🚻',
        body: process.env.DAILY_REMINDER_BODY || 'Open UrbanLoo to find one near you.',
        imageUrl: process.env.DEFAULT_NOTIFICATION_IMAGE_URL || undefined,
      })
    )
  );

  console.log(`🕐 Cron jobs registered (dailyReminder: "${dailyReminderSchedule}")`);
}

module.exports = startCronJobs;