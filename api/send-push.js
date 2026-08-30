// api/send-push.js — Vercel Serverless Function
// Sends an immediate Web Push notification to the stored subscription
// POST body: { title: string, body: string, tag?: string }

import webpush from 'web-push';
import { list } from '@vercel/blob';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL = 'mailto:routinesync@noreply.vercel.app';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return res.status(500).json({ error: 'VAPID keys not configured in Vercel environment variables' });
  }

  try {
    const { title, body, tag = 'routinesync-alert', url = '/' } = req.body;
    if (!title) return res.status(400).json({ error: 'Missing title' });

    // Load the stored subscription from Vercel Blob
    const { blobs } = await list({ prefix: 'routinesync-subscription' });
    if (!blobs.length) return res.status(404).json({ error: 'No push subscription stored. Open the app and enable notifications first.' });

    const blobRes = await fetch(blobs[0].url);
    const { subscription } = await blobRes.json();

    if (!subscription?.endpoint) return res.status(404).json({ error: 'Invalid subscription' });

    const payload = JSON.stringify({
      title: title.slice(0, 50),
      body: body?.slice(0, 120) || '',
      tag,
      url,
      icon: '/icon.png',
      badge: '/icon.png',
    });

    await webpush.sendNotification(subscription, payload, {
      TTL: 3600, // 1 hour TTL so Chrome retries delivery
    });

    return res.status(200).json({ ok: true, sent: true });
  } catch (err) {
    // If subscription is expired/invalid, return 410 to signal client should re-subscribe
    if (err.statusCode === 410) {
      return res.status(410).json({ error: 'Subscription expired — user must re-subscribe' });
    }
    console.error('send-push error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
