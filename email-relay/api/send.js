/**
 * Vercel Serverless Function: Email Relay
 * Sends emails via Gmail SMTP using Nodemailer.
 * Called by the Cloudflare Worker when automated emails are needed.
 *
 * Required env vars (set in Vercel Dashboard):
 * - GMAIL_USER: sender email (e.g. deem0u.github.io@gmail.com)
 * - GMAIL_APP_PASSWORD: Gmail App Password (16 chars, no spaces)
 * - RELAY_SECRET: shared secret for authenticating requests from the Worker
 */

const nodemailer = require('nodemailer');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const secret = req.headers['x-relay-secret'];
  const expected = process.env.RELAY_SECRET;

  if (!expected || !secret || secret !== expected) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    res.status(500).json({ error: 'Email relay not configured (missing GMAIL_USER or GMAIL_APP_PASSWORD)' });
    return;
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (e) {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  const { to, subject, html, text } = body;
  if (!to || !subject) {
    res.status(400).json({ error: 'Missing to or subject' });
    return;
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user, pass }
  });

  try {
    const info = await transporter.sendMail({
      from: `"Contact Page Editor" <${user}>`,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      text: text || (html ? html.replace(/<[^>]+>/g, '') : ''),
      html: html || undefined
    });
    res.status(200).json({ success: true, id: info.messageId });
  } catch (err) {
    console.error('Email send error:', err);
    res.status(500).json({ error: err.message || 'Failed to send email' });
  }
};
