// api/cron-push.js — Vercel Cron Job (runs every hour)
// Reads saved schedule events and sends Web Push notifications for upcoming classes
// Configured in vercel.json crons section

import webpush from 'web-push';
import { list } from '@vercel/blob';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL = 'mailto:routinesync@noreply.vercel.app';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

function timeStrToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function getDayOfWeekISO(date) {
  // Monday=1 ... Sunday=7
  const d = date.getDay();
  return d === 0 ? 7 : d;
}

export default async function handler(req, res) {
  // Vercel cron validation
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(200).json({ ok: false, reason: 'VAPID keys not set' });
  }

  try {
    // Load subscription + events
    const { blobs } = await list({ prefix: 'routinesync-subscription' });
    if (!blobs.length) return res.status(200).json({ ok: true, reason: 'No subscription' });

    const blobRes = await fetch(blobs[0].url);
    const { subscription, events } = await blobRes.json();
    if (!subscription?.endpoint || !events?.length) {
      return res.status(200).json({ ok: true, reason: 'No events' });
    }

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const todayISO = getDayOfWeekISO(now);
    const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const pushMessages = [];

    for (const event of events) {
      const eventMins = timeStrToMinutes(event.time);
      const reminderMins = event.reminderMinutesBefore || 5;

      // Check if this event applies today
      const appliesToday = event.date
        ? event.date === todayDateStr
        : event.dayOfWeek === todayISO;

      if (!appliesToday) continue;

      // Fire reminder notification ~reminderMins before class (within 5 min window of cron run)
      const reminderFireAt = eventMins - reminderMins;
      if (nowMinutes >= reminderFireAt && nowMinutes < reminderFireAt + 5) {
        pushMessages.push({
          title: `⏰ Class in ${reminderMins}m: ${event.title}`.slice(0, 50),
          body: `${event.title} at ${event.time}${event.venue ? ` · ${event.venue}` : ''}`.slice(0, 120),
          tag: `reminder-${event.id || event.title}`,
          url: '/',
        });
      }

      // Fire class-start notification
      if (nowMinutes >= eventMins && nowMinutes < eventMins + 5) {
        pushMessages.push({
          title: `🟢 Class starting: ${event.title}`.slice(0, 50),
          body: `${event.title} is starting now${event.venue ? ` at ${event.venue}` : ''}.`.slice(0, 120),
          tag: `start-${event.id || event.title}`,
          url: '/',
        });
      }
    }

    let sent = 0;
    for (const msg of pushMessages) {
      try {
        await webpush.sendNotification(subscription, JSON.stringify({
          ...msg,
          icon: '/icon.png',
          badge: '/icon.png',
        }), { TTL: 3600 });
        sent++;
      } catch (err) {
        if (err.statusCode === 410) {
          // Expired subscription — log only, don't delete (user may re-subscribe)
          console.warn('Push subscription expired');
        } else {
          console.error('Push send error:', err.message);
        }
      }
    }

    return res.status(200).json({ ok: true, checked: events.length, sent });
  } catch (err) {
    console.error('cron-push error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
