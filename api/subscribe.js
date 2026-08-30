// api/subscribe.js — Vercel Serverless Function
// Stores a push subscription for this single-user PWA using Vercel Blob or a JSON KV store
// POST body: { subscription: PushSubscriptionJSON, events: ScheduleEvent[] }

import { put, list, del } from '@vercel/blob';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      const { subscription, events } = req.body;
      if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ error: 'Missing subscription' });
      }

      const payload = JSON.stringify({ subscription, events: events || [], savedAt: Date.now() });

      // Save to Vercel Blob (overwrite the single-user subscription file)
      const blob = await put('routinesync-subscription.json', payload, {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
      });

      return res.status(200).json({ ok: true, url: blob.url });
    } catch (err) {
      console.error('subscribe error:', err);
      return res.status(500).json({ error: String(err) });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const blobs = await list({ prefix: 'routinesync-subscription' });
      for (const b of blobs.blobs) await del(b.url);
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: String(err) });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
