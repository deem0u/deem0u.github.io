/**
 * Contact Page Editor - Cloudflare Worker Backend
 * 
 * Features:
 * - User edit key management (stored in KV)
 * - Admin authentication with email-based recovery
 * - GitHub integration for page updates
 * 
 * KV Storage Structure:
 * - user_password_hash:{username} = hashed password for login
 * - admin:key = admin password (also used as API key)
 * - admin:email = admin recovery email
 * - admin:setup_complete = "true" if setup is done
 * - admin:password_salt = hex salt for PBKDF2
 * - admin:password_hash = hex PBKDF2-SHA256 hash
 * - admin:recovery_otp = JSON { recoveryCode, expiresAt }
 * - admin:reset_token = JSON { token, expiresAt }
 */

const CONFIG = {
  owner: 'deem0u',
  repo: 'deem0u.github.io',
  branch: 'main'
};

/** Public API base for contact-page lockdown check (contact pages are static; they fetch this). */
const PUBLIC_API_BASE = 'https://contact-page-editor.deem0u.workers.dev';

/** Admin dashboard base URL for password reset links. Override with env.ADMIN_BASE_URL. */
function getAdminBaseUrl(env) {
  if (env.ADMIN_BASE_URL) return env.ADMIN_BASE_URL.replace(/\/$/, '');
  return `https://${CONFIG.owner}.github.io/admin`;
}

const PBKDF2_ITERATIONS = 100000;
const SALT_BYTES = 16;

function bufferToHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function hexToBuffer(hex) {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
  return new Uint8Array(bytes);
}

async function hashAdminPassword(password, saltBytes) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const salt = saltBytes instanceof Uint8Array ? saltBytes : hexToBuffer(saltBytes);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, key, 256);
  return bufferToHex(bits);
}

async function verifyAdminPassword(password, saltHex, hashHex) {
  const derived = await hashAdminPassword(password, saltHex);
  return derived === hashHex;
}

/** All user accounts and contact pages live under this folder. */
const USER_PAGES_PREFIX = 'user';

/** GitHub repo path for a contact page: user/<username>/<contactpagename>.html */
function pagePath(username, contactpagename) {
  const name = (contactpagename || 'index').trim() || 'index';
  return `${USER_PAGES_PREFIX}/${username}/${name}.html`;
}

/** Public URL for a contact page (e.g. https://deem0u.github.io/user/chriscam/ or .../user/chriscam/work-card.html) */
function pageUrl(username, contactpagename) {
  const base = `https://${CONFIG.owner}.github.io/${USER_PAGES_PREFIX}/${username}`;
  const name = (contactpagename || 'index').trim() || 'index';
  return name === 'index' ? `${base}/` : `${base}/${name}.html`;
}

/** Parse path after /api/page/ into username and optional contactpagename (default 'index'). */
function parsePagePath(path) {
  const suffix = path.replace(/^\/api\/page\//, '').replace(/\/$/, '').trim();
  const parts = suffix.split('/').filter(Boolean);
  const username = parts[0] || '';
  const contactpagename = (parts[1] && /^[a-zA-Z0-9_-]+$/.test(parts[1])) ? parts[1] : 'index';
  return { username, contactpagename };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Edit-Key, X-Admin-Key, Authorization',
  'Access-Control-Max-Age': '86400',
};

const JWT_EXPIRY_DAYS = 7;

function base64UrlEncode(buffer) {
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

async function signJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const enc = new TextEncoder();
  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(payload)));
  const message = headerB64 + '.' + payloadB64;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return message + '.' + base64UrlEncode(sig);
}

async function verifyJwt(token, secret) {
  const parts = (token || '').split('.');
  if (parts.length !== 3) return null;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const message = parts[0] + '.' + parts[1];
  const sigBytes = base64UrlDecode(parts[2]);
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(message));
  if (!valid) return null;
  const payloadJson = new TextDecoder().decode(base64UrlDecode(parts[1]));
  const payload = JSON.parse(payloadJson);
  if (payload.exp && payload.exp * 1000 < Date.now()) return null;
  return payload;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';

    try {
      // Setup routes
      if (path === '/api/setup/status') {
        return await handleSetupStatus(env);
      }
      if (request.method === 'POST' && path === '/api/setup') {
        return await handleSetup(request, env);
      }

      // Recovery route
      if (request.method === 'POST' && path === '/api/recover') {
        return await handleRecover(request, env);
      }

      // Auth check (admin)
      if (request.method === 'POST' && path === '/api/auth') {
        return await handleAuth(request, env);
      }
      // User auth (Account Email + Password)
      if (request.method === 'POST' && path === '/api/auth/user') {
        return await handleAuthUser(request, env);
      }


      // Check username availability (no auth)
      if (request.method === 'GET' && path.startsWith('/api/check-username/')) {
        const username = path.replace('/api/check-username/', '').replace(/\/$/, '');
        return await handleCheckUsername(username, env);
      }
      if (request.method === 'GET' && path.startsWith('/api/check-account-email/')) {
        const url = new URL(request.url);
        const email = decodeURIComponent(path.replace('/api/check-account-email/', '').split('?')[0].replace(/\/$/, ''));
        const exclude = url.searchParams.get('exclude') || '';
        return await handleCheckAccountEmail(email, exclude, env);
      }
      // Signup route (user-driven page creation)
      if (request.method === 'POST' && path === '/api/signup') {
        return await handleSignup(request, env);
      }
      // OTP for email verification
      if (request.method === 'POST' && path === '/api/otp/send') {
        return await handleOtpSend(request, env);
      }
      if (request.method === 'POST' && path === '/api/otp/verify') {
        return await handleOtpVerify(request, env);
      }
      if (request.method === 'POST' && path === '/api/signup-success-email') {
        return await handleSignupSuccessEmail(request, env);
      }

      // User recovery (no auth)
      if (request.method === 'POST' && path === '/api/recovery/check') {
        return await handleRecoveryCheck(request, env);
      }
      if (request.method === 'POST' && path === '/api/recovery/check-by-email') {
        return await handleRecoveryCheckByEmail(request, env);
      }
      if (request.method === 'POST' && path === '/api/recovery/verify') {
        return await handleRecoveryVerify(request, env);
      }

      // Route: POST /api/page - Create new page (admin only)
      if (request.method === 'POST' && path === '/api/page') {
        return await handleCreatePage(request, env);
      }

      // Route: DELETE /api/page/{username} or /api/page/{username}/{contactpagename} - Delete page (admin only)
      if (request.method === 'DELETE' && path.startsWith('/api/page/')) {
        const { username, contactpagename } = parsePagePath(path);
        return await handleDeletePage(username, contactpagename, request, env);
      }

      // Route: POST /api/page/{username}/create - User creates a new contact page (Bearer, same user)
      if (request.method === 'POST' && path.match(/^\/api\/page\/[^/]+\/create$/)) {
        const username = path.replace(/^\/api\/page\//, '').replace(/\/create$/, '').trim();
        return await handleUserCreatePage(username, request, env);
      }

      // Page routes: GET/POST /api/page/{username} or /api/page/{username}/{contactpagename}
      if (request.method === 'GET' && path.startsWith('/api/page/')) {
        const { username, contactpagename } = parsePagePath(path);
        return await handleGetPage(username, contactpagename, request, env);
      }
      if (request.method === 'POST' && path.startsWith('/api/page/')) {
        const { username, contactpagename } = parsePagePath(path);
        // Fallback: path /api/page/{username}/create can be parsed as contactpagename "create"; treat as create.
        if (contactpagename === 'create') {
          return await handleUserCreatePage(username, request, env);
        }
        return await handleUpdatePage(username, contactpagename, request, env);
      }

      // Admin routes
      if (request.method === 'GET' && path === '/api/pages/summaries') {
        return await handlePageSummaries(request, env);
      }
      if (request.method === 'GET' && path === '/api/pages') {
        return await handleListPages(request, env);
      }
      if (request.method === 'GET' && path.startsWith('/api/contact-pages/')) {
        const username = path.replace('/api/contact-pages/', '').replace(/\/$/, '').trim();
        return await handleListContactPages(username, request, env);
      }
      if (request.method === 'GET' && path === '/api/account-emails') {
        return await handleGetAccountEmails(request, env);
      }
      if (request.method === 'POST' && path === '/api/account-profiles') {
        return await handleGetAccountProfiles(request, env);
      }
      if (request.method === 'POST' && path.startsWith('/api/account-details-sent/')) {
        const username = path.replace('/api/account-details-sent/', '').replace(/\/$/, '');
        return await handleAccountDetailsSent(username, request, env);
      }
      if (request.method === 'POST' && path === '/api/secrets-status') {
        return await handleSecretsStatus(request, env);
      }
      if (request.method === 'GET' && path === '/api/keys') {
        return await handleGetKeys(request, env);
      }
      if (request.method === 'PUT' && path.startsWith('/api/keys/')) {
        const username = path.replace('/api/keys/', '').replace(/\/$/, '');
        return await handleResetAccess(username, request, env);
      }
      if (request.method === 'DELETE' && path.startsWith('/api/keys/')) {
        const username = path.replace('/api/keys/', '').replace(/\/$/, '');
        return await handleRevokeAccess(username, request, env);
      }
      if (request.method === 'GET' && path.startsWith('/api/profile/')) {
        const raw = path.replace('/api/profile/', '').replace(/\/$/, '');
        let username = raw || '';
        try { if (raw) username = decodeURIComponent(raw); } catch (_) {}
        return await handleGetProfile(username, request, env);
      }
      if (request.method === 'PUT' && path.startsWith('/api/profile/')) {
        const raw = path.replace('/api/profile/', '').replace(/\/$/, '');
        let username = raw || '';
        try { if (raw) username = decodeURIComponent(raw); } catch (_) {}
        return await handlePutProfile(username, request, env);
      }
      if (request.method === 'POST' && path === '/api/profile/verify-email-change') {
        return await handleVerifyEmailChange(request, env);
      }
      if (request.method === 'GET' && path.startsWith('/api/secrets/')) {
        const raw = path.replace('/api/secrets/', '').replace(/\/$/, '');
        let username = raw || '';
        try { if (raw) username = decodeURIComponent(raw); } catch (_) {}
        return await handleGetSecrets(username, request, env);
      }
      if (request.method === 'PUT' && path.startsWith('/api/secrets/')) {
        const raw = path.replace('/api/secrets/', '').replace(/\/$/, '');
        let username = raw || '';
        try { if (raw) username = decodeURIComponent(raw); } catch (_) {}
        return await handlePutSecrets(username, request, env);
      }
      if (request.method === 'POST' && path === '/api/admin/rename-user') {
        return await handleAdminRenameUser(request, env);
      }
      if (request.method === 'GET' && path === '/api/site-status') {
        return await handleGetSiteStatus(request, env);
      }
      if (request.method === 'GET' && path === '/api/admin/site-settings') {
        return await handleGetSiteSettings(request, env);
      }
      if (request.method === 'GET' && path === '/api/admin/admin-email') {
        return await handleGetAdminEmail(request, env);
      }
      if (request.method === 'PUT' && path === '/api/admin/admin-email') {
        return await handlePutAdminEmail(request, env);
      }
      if (request.method === 'PUT' && path === '/api/admin/site-settings') {
        return await handlePutSiteSettings(request, env);
      }
      if (request.method === 'PUT' && path === '/api/admin/admin-key') {
        return await handlePutAdminKey(request, env);
      }
      if (request.method === 'PUT' && path === '/api/admin/set-password') {
        return await handlePutAdminPassword(request, env);
      }
      if (request.method === 'POST' && path === '/api/admin/verify-otp-set-password') {
        return await handleVerifyOtpSetPassword(request, env);
      }

      if (request.method === 'POST' && path === '/api/recover/verify-reset-token') {
        return await handleVerifyResetToken(request, env);
      }
      if (request.method === 'POST' && path === '/api/recover/reset-password') {
        return await handleResetPasswordWithToken(request, env);
      }

      // Backend-only: set admin email/password/key with secret (not public-facing, no UI)
      if (request.method === 'POST' && path === '/api/internal/set-admin-credentials') {
        return await handleInternalSetAdminCredentials(request, env);
      }

      if (request.method === 'GET' && path === '/api/admin/kv-orphans') {
        return await handleGetKvOrphans(request, env);
      }
      if (request.method === 'POST' && path === '/api/admin/kv-cleanup') {
        return await handleKvCleanup(request, env);
      }
      if (request.method === 'GET' && path.startsWith('/api/admin/debug-user/')) {
        const raw = path.replace('/api/admin/debug-user/', '').replace(/\/$/, '');
        const username = raw ? decodeURIComponent(raw).trim() : '';
        return await handleDebugUser(username, request, env);
      }

      return jsonResponse({ error: 'Not found' }, 404);
    } catch (error) {
      return jsonResponse({ error: error.message }, 500);
    }
  }
};

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders }
  });
}

function generateKey(length = 24) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let key = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    key += chars[array[i] % chars.length];
  }
  return key;
}

function generateOtpCode() {
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  return Array.from(arr, n => (n % 10).toString()).join('');
}

async function hashPassword(plain) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(plain), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  const hash = btoa(String.fromCharCode(...new Uint8Array(bits)));
  const saltB64 = btoa(String.fromCharCode(...salt));
  return saltB64 + '$' + hash;
}

async function verifyPassword(plain, stored) {
  const parts = (stored || '').split('$');
  if (parts.length !== 2) return false;
  const salt = Uint8Array.from(atob(parts[0]), c => c.charCodeAt(0));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(plain), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  const hash = btoa(String.fromCharCode(...new Uint8Array(bits)));
  return hash === parts[1];
}

const EMAIL_RESTRICTION_RECIPIENT = 'deem0u.github.io@gmail.com';

/**
 * Check if email for this user should be diverted to dev (KV overrides env).
 * When divertAllGlobal is '1', or divert_email:username is '1', or env EMAIL_SEND_RESTRICTED is not 'false', divert.
 */
async function shouldDivertEmail(env, username) {
  if (env.EMAIL_SEND_RESTRICTED !== 'false') return true;
  if (!env.EDIT_KEYS_KV) return false;
  const globalOn = (await env.EDIT_KEYS_KV.get('site:divert_all_global')) === '1';
  if (globalOn) return true;
  if (username && (await env.EDIT_KEYS_KV.get('divert_email:' + username)) === '1') return true;
  return false;
}

/**
 * Send email via the relay (Vercel serverless with Nodemailer + Gmail SMTP).
 * Requires env: EMAIL_RELAY_URL, EMAIL_RELAY_SECRET.
 * Divert: when shouldDivertEmail(env, opts.username) or EMAIL_SEND_RESTRICTED is not 'false', send to EMAIL_RESTRICTION_RECIPIENT with [DEV] subject.
 * @param {object} env - Worker env
 * @param {{ to: string, subject: string, html?: string, text?: string, username?: string }} opts
 * @returns {{ ok: boolean, error?: string }}
 */
async function sendEmail(env, { to, subject, html, text, username }) {
  const url = env.EMAIL_RELAY_URL;
  const secret = env.EMAIL_RELAY_SECRET;
  if (!url || !secret) return { ok: false, error: 'Email not configured' };
  const restricted = await shouldDivertEmail(env, username);
  const effectiveTo = restricted ? EMAIL_RESTRICTION_RECIPIENT : (to || '');
  const effectiveSubject = restricted ? `[DEV] ${subject} (would go to: ${to || '?'})` : subject;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Secret': secret
      },
      body: JSON.stringify({ to: effectiveTo, subject: effectiveSubject, html: html || text, text: text || '' })
    });
    if (!res.ok) {
      const errText = await res.text();
      let errMsg = errText;
      try {
        const errJson = JSON.parse(errText);
        if (errJson && typeof errJson.error === 'string') errMsg = errJson.error;
      } catch (_) {}
      return { ok: false, error: errMsg };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ============ Setup & Recovery ============

async function handleSetupStatus(env) {
  if (!env.EDIT_KEYS_KV) {
    return jsonResponse({ setup_complete: false, error: 'KV not configured' });
  }
  const complete = await env.EDIT_KEYS_KV.get('admin:setup_complete');
  return jsonResponse({ setup_complete: complete === 'true' });
}

async function handleSetup(request, env) {
  if (!env.EDIT_KEYS_KV) {
    return jsonResponse({ error: 'KV storage not configured' }, 500);
  }

  // Check if already set up
  const existing = await env.EDIT_KEYS_KV.get('admin:setup_complete');
  if (existing === 'true') {
    return jsonResponse({ error: 'Setup already complete. Use recovery to reset.' }, 400);
  }

  const body = await request.json();
  const { adminKey, adminEmail, password } = body;

  if (!adminKey || adminKey.length < 8) {
    return jsonResponse({ error: 'Admin key must be at least 8 characters' }, 400);
  }
  if (adminEmail && typeof adminEmail === 'string' && adminEmail.includes('@')) {
    await env.EDIT_KEYS_KV.put('admin:email', adminEmail.toLowerCase());
  }

  await env.EDIT_KEYS_KV.put('admin:key', adminKey);
  await env.EDIT_KEYS_KV.put('admin:setup_complete', 'true');

  if (password && typeof password === 'string' && password.length >= 8) {
    const saltArr = new Uint8Array(SALT_BYTES);
    crypto.getRandomValues(saltArr);
    const saltHex = bufferToHex(saltArr);
    const hashHex = await hashAdminPassword(password, saltArr);
    await env.EDIT_KEYS_KV.put('admin:password_salt', saltHex);
    await env.EDIT_KEYS_KV.put('admin:password_hash', hashHex);
  }

  return jsonResponse({ success: true, message: 'Setup complete' });
}

async function handleRecover(request, env) {
  if (!env.EDIT_KEYS_KV) {
    return jsonResponse({ error: 'KV storage not configured' }, 500);
  }

  const body = await request.json();
  const { email, code } = body;

  if (!email) {
    return jsonResponse({ error: 'Email required' }, 400);
  }

  const storedEmail = await env.EDIT_KEYS_KV.get('admin:email');
  
  if (!storedEmail) {
    return jsonResponse({ error: 'No admin email configured' }, 400);
  }

  if (email.toLowerCase() !== storedEmail.toLowerCase()) {
    return jsonResponse({ error: 'Email does not match' }, 401);
  }

  // Step 2: Verify OTP, create reset token, send reset link by email
  if (code) {
    const storedData = await env.EDIT_KEYS_KV.get('admin:recovery_code');
    if (!storedData) {
      return jsonResponse({ error: 'No recovery code found. Please request a new one.' }, 400);
    }
    const { recoveryCode, expiresAt } = JSON.parse(storedData);
    if (Date.now() > expiresAt) {
      await env.EDIT_KEYS_KV.delete('admin:recovery_code');
      return jsonResponse({ error: 'Code expired. Please request a new one.' }, 400);
    }
    if (code !== recoveryCode) {
      return jsonResponse({ error: 'Invalid code. Please check and try again.' }, 401);
    }
    await env.EDIT_KEYS_KV.delete('admin:recovery_code');

    const resetToken = bufferToHex(crypto.getRandomValues(new Uint8Array(32)));
    const resetExpiresAt = Date.now() + (60 * 60 * 1000); // 1 hour
    await env.EDIT_KEYS_KV.put('admin:reset_token', JSON.stringify({ token: resetToken, expiresAt: resetExpiresAt }));

    const baseUrl = getAdminBaseUrl(env);
    const resetLink = `${baseUrl}/?reset=${resetToken}`;
    const subject = 'Admin Dashboard - Password Reset Link';
    const text = `Click the link below to set a new password. The link expires in 1 hour.\n\n${resetLink}\n\nIf you did not request this, please ignore this email.`;
    const emailResult = await sendEmail(env, { to: storedEmail, subject, text });
    if (!emailResult.ok) {
      await env.EDIT_KEYS_KV.delete('admin:reset_token');
      return jsonResponse({ error: 'Email could not be sent. Use the failsafe: retrieve your admin key from Cloudflare KV — see SETUP-GUIDE.', relayFailed: true }, 503);
    }
    return jsonResponse({ success: true, step: 'reset_link_sent', message: 'Check your email for the reset link.' });
  }

  // Step 1: Generate OTP, store it, send OTP by email
  const recoveryCode = generateRecoveryCode();
  const expiresAt = Date.now() + (10 * 60 * 1000); // 10 minutes
  await env.EDIT_KEYS_KV.put('admin:recovery_code', JSON.stringify({ recoveryCode, expiresAt }));

  const subject = 'Admin Dashboard - Recovery Code';
  const text = `Your recovery code is: ${recoveryCode}\n\nThis code expires in 10 minutes.\n\nIf you did not request this, please ignore this email.`;
  const emailResult = await sendEmail(env, { to: storedEmail, subject, text });
  if (!emailResult.ok) {
    await env.EDIT_KEYS_KV.delete('admin:recovery_code');
    return jsonResponse({ error: 'Email could not be sent. Use the failsafe: retrieve your admin key from Cloudflare KV — see SETUP-GUIDE.', relayFailed: true }, 503);
  }
  return jsonResponse({ success: true, step: 'code_sent', message: 'Check your email for the verification code.' });
}

function generateRecoveryCode() {
  const array = new Uint8Array(3);
  crypto.getRandomValues(array);
  const code = ((array[0] << 16) | (array[1] << 8) | array[2]) % 1000000;
  return code.toString().padStart(6, '0');
}

async function handleAuth(request, env) {
  if (!env.EDIT_KEYS_KV) {
    return jsonResponse({ error: 'KV storage not configured' }, 500);
  }

  const body = await request.json();
  const { adminKey, email, password } = body;

  if (email && password) {
    const storedEmail = await env.EDIT_KEYS_KV.get('admin:email');
    if (!storedEmail || email.toLowerCase() !== storedEmail.toLowerCase()) {
      return jsonResponse({ error: 'Invalid email or password' }, 401);
    }
    const saltHex = await env.EDIT_KEYS_KV.get('admin:password_salt');
    const hashHex = await env.EDIT_KEYS_KV.get('admin:password_hash');
    if (!saltHex || !hashHex) {
      return jsonResponse({ error: 'Password login not set up. Use admin key or set password in dashboard.' }, 401);
    }
    const valid = await verifyAdminPassword(password, saltHex, hashHex);
    if (!valid) return jsonResponse({ error: 'Invalid email or password' }, 401);
    const storedKey = await env.EDIT_KEYS_KV.get('admin:key');
    return jsonResponse({ success: true, adminKey: storedKey });
  }

  const storedKey = await env.EDIT_KEYS_KV.get('admin:key');
  if (!storedKey || adminKey !== storedKey) {
    return jsonResponse({ error: 'Invalid admin key' }, 401);
  }
  return jsonResponse({ success: true });
}

async function handleAuthUser(request, env) {
  if (!env.EDIT_KEYS_KV) return jsonResponse({ error: 'KV not configured' }, 500);
  const secret = env.JWT_SECRET || env.SESSION_SECRET;
  if (!secret) return jsonResponse({ error: 'Auth not configured' }, 500);
  let body; try { body = await request.json(); } catch (_) { return jsonResponse({ error: 'Invalid request' }, 400); }
  const accountEmail = (body.accountEmail || '').trim().toLowerCase();
  const password = (body.password || '').trim();
  if (!accountEmail || !accountEmail.includes('@') || !password) {
    return jsonResponse({ error: 'Invalid email or password' }, 401);
  }
  const username = await env.EDIT_KEYS_KV.get(`account_email_to_folder:${accountEmail}`);
  if (!username) return jsonResponse({ error: 'Invalid email or password' }, 401);
  const pwHash = await env.EDIT_KEYS_KV.get(`user_password_hash:${username}`);
  if (!pwHash) return jsonResponse({ error: 'Account does not have a password. Set one via Set Secrets or sign up.' }, 401);
  const valid = await verifyPassword(password, pwHash);
  if (!valid) return jsonResponse({ error: 'Invalid email or password' }, 401);
  const exp = Math.floor(Date.now() / 1000) + (JWT_EXPIRY_DAYS * 86400);
  const token = await signJwt({ username, exp }, secret);
  return jsonResponse({ success: true, username, token });
}
// ============ Signup (User-driven page creation) ============


async function handleCheckUsername(username, env) {
  if (!username || !/^[a-zA-Z0-9_-]{3,32}$/.test(username)) {
    return jsonResponse({ available: false, error: 'Invalid username format' });
  }
  const reserved = ['admin', 'edit', 'signup', 'home', 'add', 'terms-and-privacy', 'user'];
  if (reserved.includes(username.toLowerCase())) {
    return jsonResponse({ available: false });
  }
  if (!env.GITHUB_TOKEN) {
    return jsonResponse({ available: true });
  }
  const res = await fetch(
    `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${USER_PAGES_PREFIX}/${username}?ref=${CONFIG.branch}`,
    {
      headers: {
        'Authorization': 'token ' + env.GITHUB_TOKEN,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ContactPageEditor/1.0'
      }
    }
  );
  return jsonResponse({ available: !res.ok });
}
async function handleCheckAccountEmail(email, excludeFolder, env) {
  if (!email || !email.includes('@')) {
    return jsonResponse({ available: false, error: 'Invalid email format' });
  }
  const el = email.trim().toLowerCase();
  if (!env.EDIT_KEYS_KV) return jsonResponse({ available: true });
  const existing = await env.EDIT_KEYS_KV.get('account_email_to_folder:' + el);
  if (!existing) return jsonResponse({ available: true });
  if (excludeFolder && existing === excludeFolder.trim()) return jsonResponse({ available: true });
  return jsonResponse({ available: false });
}

async function handleSignup(request, env) {
  if (!env.EDIT_KEYS_KV || !env.GITHUB_TOKEN) {
    return jsonResponse({ error: 'Signup not configured' }, 500);
  }
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return jsonResponse({ error: 'Invalid request body' }, 400);
  }
  const username = (body.username || '').trim().toLowerCase();
  const firstName = (body.firstName || '').trim();
  const surname = (body.surname || body.lastName || '').trim();
  const accountEmail = (body.accountEmail || '').trim();
  const contactPageEmail = (body.contactPageEmail || '').trim();
  const dob = (body.dob || '').trim();
  const secretQuestions = Array.isArray(body.secretQuestions) ? body.secretQuestions : [];

  if (!username || !/^[a-zA-Z0-9_-]{3,32}$/.test(username)) {
    return jsonResponse({ error: 'Valid username required (3-32 chars, letters, numbers, hyphens, underscores)' }, 400);
  }
  if (!accountEmail || !accountEmail.includes('@')) {
    return jsonResponse({ error: 'Valid account email required' }, 400);
  }
  const accountEmailLower = accountEmail.toLowerCase();
  const existingFolder = await env.EDIT_KEYS_KV.get('account_email_to_folder:' + accountEmailLower);
  if (existingFolder) {
    return jsonResponse({ error: 'This account email is already in use' }, 409);
  }
  const dobNorm = normalizeDob(dob);
  if (!dobNorm) {
    return jsonResponse({ error: 'Valid date of birth required (dd/mm/yyyy)' }, 400);
  }
  if (secretQuestions.length !== 3) {
    return jsonResponse({ error: 'Exactly 3 security questions with answers required' }, 400);
  }
  const validIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const ids = secretQuestions.map(q => q.questionId);
  if (ids.some(id => !validIds.includes(id)) || new Set(ids).size !== 3) {
    return jsonResponse({ error: 'Select 3 distinct security questions' }, 400);
  }
  for (const q of secretQuestions) {
    const a = (q.answer || '').trim();
    if (a.length < 4 || a.length > 30) {
      return jsonResponse({ error: 'Each security answer must be 4-30 characters' }, 400);
    }
  }

  const reserved = ['admin', 'edit', 'signup', 'home', 'add', 'terms-and-privacy', 'user', 'styles.css', 'countries-data.js', 'form-descriptions.js'];
  if (reserved.includes(username)) {
    return jsonResponse({ error: 'This username is reserved' }, 400);
  }

  const checkRes = await fetch(
    `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${USER_PAGES_PREFIX}/${username}?ref=${CONFIG.branch}`,
    {
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ContactPageEditor/1.0'
      }
    }
  );
  if (checkRes.ok) {
    return jsonResponse({ error: 'A page with this username already exists' }, 409);
  }

  const content = generateContactPageHTML(firstName, surname, contactPageEmail || '', '', '', '', '', '', '', '', '');
  const filePath = pagePath(username, 'index');
  const createRes = await fetch(
    `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${filePath}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'ContactPageEditor/1.0'
      },
      body: JSON.stringify({
        message: `Create contact page: ${username} (signup)`,
        content: encodeBase64(content),
        branch: CONFIG.branch
      })
    }
  );
  if (!createRes.ok) {
    const err = await createRes.json();
    return jsonResponse({ error: err.message || 'Failed to create page' }, createRes.status);
  }

  const password = (body.password || '').trim();
  if (password.length >= 8) {
    const pwHash = await hashPassword(password);
    await env.EDIT_KEYS_KV.put(`user_password_hash:${username}`, pwHash);
  }
  await env.EDIT_KEYS_KV.put(`account_email_to_folder:${accountEmailLower}`, username);
  await env.EDIT_KEYS_KV.put(`account_email:${username}`, accountEmail);
  await env.EDIT_KEYS_KV.put(`user_first_name:${username}`, firstName);
  await env.EDIT_KEYS_KV.put(`user_last_name:${username}`, surname);
  await env.EDIT_KEYS_KV.put(`user_dob:${username}`, dobNorm);
  await env.EDIT_KEYS_KV.put(`user_recovery:${username}`, JSON.stringify({
    dob: dobNorm,
    secretQuestions: secretQuestions.map(q => ({ questionId: q.questionId, answer: (q.answer || '').trim() }))
  }));

  const secret = env.JWT_SECRET || env.SESSION_SECRET;
  const token = secret ? await signJwt({ username, exp: Math.floor(Date.now() / 1000) + (JWT_EXPIRY_DAYS * 86400) }, secret) : null;
  return jsonResponse({
    success: true,
    username,
    contactpagename: 'index',
    token,
    viewLink: pageUrl(username, 'index')
  });
}

async function handleOtpSend(request, env) {
  if (!env.EDIT_KEYS_KV) return jsonResponse({ error: 'KV not configured' }, 500);
  let body; try { body = await request.json(); } catch (_) { return jsonResponse({ error: 'Invalid request' }, 400); }
  const username = (body.username || body.folder || '').trim().toLowerCase();
  if (!username) return jsonResponse({ error: 'Username required' }, 400);
  const accountEmail = await env.EDIT_KEYS_KV.get(`account_email:${username}`);
  if (!accountEmail || !accountEmail.includes('@')) return jsonResponse({ error: 'No account email' }, 400);
  const code = generateOtpCode();
  await env.EDIT_KEYS_KV.put(`otp:${username}`, code, { expirationTtl: 600 });
  const subject = 'Your verification code - Digital Contact Page';
  const text = `Your 6-digit verification code is: ${code}\n\nThis code expires in 10 minutes. If you did not request this, you can ignore this email.\n\nPlease check your spam/junk folder if you don't see this email.`;
  const html = `<p>Your 6-digit verification code is: <strong>${code}</strong></p><p>This code expires in 10 minutes. If you did not request this, you can ignore this email.</p><p>Please check your spam/junk folder if you don't see this email.</p>`;
  const sent = await sendEmail(env, { to: accountEmail, subject, text, html, username });
  if (!sent.ok) return jsonResponse({ error: sent.error || 'Failed to send' }, 500);
  return jsonResponse({ sent: true });
}

async function handleOtpVerify(request, env) {
  if (!env.EDIT_KEYS_KV) return jsonResponse({ error: 'KV not configured' }, 500);
  let body; try { body = await request.json(); } catch (_) { return jsonResponse({ error: 'Invalid request' }, 400); }
  const username = (body.username || body.folder || '').trim().toLowerCase();
  const code = (body.code || '').trim().replace(/\D/g, '');
  if (!username || !code || code.length !== 6) return jsonResponse({ error: 'Invalid username or code' }, 400);
  const stored = await env.EDIT_KEYS_KV.get(`otp:${username}`);
  if (!stored || stored !== code) return jsonResponse({ error: 'Invalid or expired code' }, 400);
  await env.EDIT_KEYS_KV.put(`email_verified:${username}`, '1');
  await env.EDIT_KEYS_KV.delete(`otp:${username}`);
  return jsonResponse({ success: true });
}

async function handleSignupSuccessEmail(request, env) {
  let body; try { body = await request.json(); } catch (_) { return jsonResponse({ error: 'Invalid request' }, 400); }
  const username = (body.username || body.folder || '').trim();
  const accountEmail = (body.accountEmail || '').trim();
  const firstName = (body.firstName || '').trim();
  const lastName = (body.lastName || body.surname || '').trim();
  if (!username || !accountEmail) return jsonResponse({ error: 'Missing required fields' }, 400);
  const baseUrl = `https://${CONFIG.owner}.github.io`;
  const viewLink = pageUrl(username, 'index');
  const editUrl = `${baseUrl}/edit/`;
  const subject = `Your Digital Contact Page - ${username} - Account Details`;
  const text = `Below are details related to your account you should keep handy.\n\n\t• User Name: ${username}\n\t• Your Digital Contact Page URL: ${viewLink}\n\nHOW TO UPDATE YOUR DIGITAL CONTACT PAGE\n\t1. Visit the Contact Editor (${editUrl}) and sign in with your Account Email and Password\n\t2. Make your changes\n\t3. Click "Save Changes"\n\nIf you wish to have your account deleted, contact deem0u.github.io@gmail.com`;
  const html = `<p>Below are details related to your account you should keep handy.</p><ul><li><strong>User Name:</strong> ${username}</li><li><strong>Contact Page URL:</strong> <a href="${viewLink}">${viewLink}</a></li></ul><p><strong>HOW TO UPDATE YOUR DIGITAL CONTACT PAGE</strong></p><ol><li>Visit the <a href="${editUrl}">Contact Editor</a> and sign in with your Account Email and Password</li><li>Make your changes</li><li>Click "Save Changes"</li></ol><p>If you wish to have your account deleted, contact deem0u.github.io@gmail.com</p>`;
  const sent = await sendEmail(env, { to: accountEmail, subject, text, html, username });
  return jsonResponse({ ok: sent.ok, error: sent.error });
}

function normalizeDob(input) {
  const s = (input || '').trim().replace(/\s+/g, '');
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = parseInt(m[1], 10), mo = parseInt(m[2], 10), y = parseInt(m[3], 10);
  if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 1900 || y > 2100) return null;
  return String(d).padStart(2, '0') + '/' + String(mo).padStart(2, '0') + '/' + y;
}

function generateContactPageHTML(givenName, familyName, contactEmail, mobile, mobileLink, homeCountry, destName, destAddress, destPhone, destEmail, additionalInfo) {
  const esc = s => (s ?? '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const em = String.fromCharCode(0x2014);
  const now = new Date().toISOString();
  const dName = (destName || '').trim();
  const dAddr = (destAddress || '').trim();
  const dPhone = (destPhone || '').trim();
  const dEmail = (destEmail || '').trim();
  const hasDest = !!(dName || dAddr || dPhone || dEmail);
  const destParts = [dName, dAddr, dPhone, dEmail].map(t => '<span>' + (t ? esc(t) : '') + '</span>');
  const destHtml = hasDest ? '<div class="dest-details">' + destParts.join('') + '</div>' : '<span class="value">' + em + '</span>';
  const mobileVal = (mobile || '').trim();
  const mobileHtml = mobileVal ? '<a href="tel:' + esc(mobileLink || mobileVal) + '">' + esc(mobileVal) + '</a>' : em;
  const homeCountryHtml = (homeCountry || '').trim() ? esc((homeCountry || '').trim()) : em;
  const formatMultiline = s => {
    const t = (s ?? '').toString().trim();
    if (!t) return '';
    return esc(t).replace(/\r?\n/g, '<br>');
  };
  const additionalHtml = additionalInfo ? '<span class="value">' + formatMultiline(additionalInfo) + '</span>' : '<span class="value">' + em + '</span>';
  const css = '*{box-sizing:border-box;margin:0;padding:0}html{font-size:16px}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;line-height:1.7;color:#1a1a1a;background:#fff;padding:24px;min-height:100vh}.container{max-width:720px;margin:0 auto;padding:32px 24px}.last-updated-block{font-size:0.95rem;color:#6b7280;text-align:right;margin-bottom:12px}.info{display:flex;flex-direction:column;padding:14px 0;border-bottom:1px solid #e5e7eb;gap:6px}.info:last-of-type{border-bottom:none}.label{font-weight:600;color:#374151}.value{color:#1a1a1a;word-break:break-word}a{color:#2563eb}.dest-details{display:flex;flex-direction:column;gap:4px}.dest-details span:empty{display:none}';
  const titles = 'Last updated \u00b7 Derni\u00e8re mise \u00e0 jour \u00b7 \u6700\u540e\u66f4\u65b0';
  const sectionTitle = 'Contact Information \u00b7 Coordonn\u00e9es \u00b7 \u8054\u7cfb\u4fe1\u606f';
  const lblGiven = 'Given Names \u00b7 Pr\u00e9noms \u00b7 \u540d\u5b57';
  const lblFamily = 'Family Name \u00b7 Nom de famille \u00b7 \u59d3\u6c0f';
  const lblEmail = 'Email \u00b7 Courriel \u00b7 \u7535\u5b50\u90ae\u4ef6';
  const lblMobile = 'Contact Number \u00b7 T\u00e9l\u00e9phone \u00b7 \u7535\u8bdd';
  const lblCountry = 'Home Country \u00b7 Pays de r\u00e9sidence \u00b7 \u5c45\u4f4f\u56fd\u5bb6';
  const lblDest = 'Destination Details \u00b7 D\u00e9tails de la destination \u00b7 \u76ee\u7684\u5730\u8be6\u60c5';
  const lblAdditional = 'Additional Information \u00b7 Informations suppl\u00e9mentaires \u00b7 \u9644\u52a0\u4fe1\u606f';
  const script = '<script>(function(){function f(i,u){if(!i)return"";var d=new Date(i);return d.toLocaleString()+(u?" by "+u:"")}document.querySelectorAll(".last-updated-display").forEach(function(e){var i=e.getAttribute("data-timestamp"),u=e.getAttribute("data-updated-by");if(i)e.textContent=f(i,u)})})();<\/script>';
  const lockdownOverlay = '<div id="site-lockdown-overlay" style="display:none;position:fixed;inset:0;background:#fff;z-index:9999;align-items:center;justify-content:center;flex-direction:column;padding:2rem;text-align:center;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;"><h1 style="font-size:1.5rem;margin-bottom:0.5rem;">Site temporarily unavailable</h1><p style="color:#666;">Please try again later.</p></div>';
  const lockdownScript = '<script>(function(){var api="' + PUBLIC_API_BASE.replace(/"/g, '&quot;') + '";var h={"X-Admin-Key":(typeof localStorage!="undefined"&&localStorage.getItem("admin_key"))||""};fetch(api+"/api/site-status",{headers:h}).then(function(r){return r.json()}).then(function(d){if(!d.isAdmin&&d.lockdownMode){var o=document.getElementById("site-lockdown-overlay");var c=document.querySelector(".container");if(o){o.style.display="flex"}if(c){c.style.display="none"}}}).catch(function(){})})();<\/script>';
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Contact - ' + esc(givenName) + ' ' + esc(familyName) + '</title><style>' + css + '</style></head><body>' + lockdownOverlay + '<div class="container"><div class="last-updated-block"><span class="last-updated-titles">' + titles + '</span><span class="last-updated-display" data-timestamp="' + now + '" data-updated-by="user">' + em + '</span></div><h1>' + sectionTitle + '</h1><div class="info"><span class="label">' + lblGiven + '</span><span class="value">' + esc(givenName) + '</span></div><div class="info"><span class="label">' + lblFamily + '</span><span class="value">' + esc(familyName) + '</span></div><div class="info"><span class="label">' + lblEmail + '</span><span class="value"><a href="mailto:' + esc(contactEmail) + '">' + esc(contactEmail) + '</a></span></div><div class="info"><span class="label">' + lblMobile + '</span><span class="value">' + mobileHtml + '</span></div><div class="info"><span class="label">' + lblCountry + '</span><span class="value">' + homeCountryHtml + '</span></div><div class="info"><span class="label">' + lblDest + '</span>' + destHtml + '</div><div class="info additional-info"><span class="label">' + lblAdditional + '</span>' + additionalHtml + '</div></div>' + script + lockdownScript + '</body></html>';
}

// ============ Auth Helpers ============

async function isAdmin(request, env) {
  const adminKey = request.headers.get('X-Admin-Key');
  if (!adminKey || !env.EDIT_KEYS_KV) return false;
  const storedKey = await env.EDIT_KEYS_KV.get('admin:key');
  return storedKey && adminKey === storedKey;
}

/** Returns true if user has verified their email (or admin bypass). Used to gate add/edit/delete contact pages. */
async function requireEmailVerifiedForEdit(username, auth, env) {
  if (auth.isAdmin) return true;
  if (!env.EDIT_KEYS_KV) return false;
  return (await env.EDIT_KEYS_KV.get('email_verified:' + username)) === '1';
}

async function validateAuth(username, request, env) {
  const adminKey = request.headers.get('X-Admin-Key');

  // Check admin
  if (adminKey && env.EDIT_KEYS_KV) {
    const storedAdmin = await env.EDIT_KEYS_KV.get('admin:key');
    if (storedAdmin && adminKey === storedAdmin) {
      return { authorized: true, isAdmin: true };
    }
  }

  // Check JWT (Bearer token)
  const authHeader = request.headers.get('Authorization');
  const token = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.slice(7) : null;
  const secret = env.JWT_SECRET || env.SESSION_SECRET;
  if (token && secret) {
    const payload = await verifyJwt(token, secret);
    if (payload && payload.username === username) {
      if (env.EDIT_KEYS_KV && (await env.EDIT_KEYS_KV.get(`access_revoked:${username}`)) === '1') {
        return { authorized: false, isAdmin: false };
      }
      return { authorized: true, isAdmin: false };
    }
  }

  return { authorized: false, isAdmin: false };
}

// ============ Page Routes ============

/**
 * POST /api/page - Create a new contact page (admin only)
 */
async function handleCreatePage(request, env) {
  if (!await isAdmin(request, env)) {
    return jsonResponse({ error: 'Admin access required' }, 401);
  }

  const body = await request.json();
  const username = (body.username || body.folder || '').trim();
  const content = body.content;
  const accountEmail = body.accountEmail;
  const firstName = (body.firstName || '').trim();
  const lastName = (body.lastName || body.surname || '').trim();

  if (!username || !content) {
    return jsonResponse({ error: 'Missing username or content' }, 400);
  }

  const usernameTrim = username.trim().toLowerCase();
  const accountEmailVal = (accountEmail || '').trim();
  if (accountEmailVal) {
    if (!accountEmailVal.includes('@')) {
      return jsonResponse({ error: 'Valid account email required' }, 400);
    }
    const accountEmailLower = accountEmailVal.toLowerCase();
    if (env.EDIT_KEYS_KV) {
      const existingFolder = await env.EDIT_KEYS_KV.get('account_email_to_folder:' + accountEmailLower);
      if (existingFolder) {
        return jsonResponse({ error: 'This account email is already in use' }, 409);
      }
    }
  }

  // Validate username name (alphanumeric, hyphens, underscores only)
  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return jsonResponse({ error: 'Invalid username. Use only letters, numbers, hyphens, and underscores.' }, 400);
  }

  // Check reserved names
  if (['admin', 'edit', 'signup', 'home', 'add', 'terms-and-privacy', 'user', 'styles.css', 'countries-data.js', 'form-descriptions.js'].includes(username.toLowerCase())) {
    return jsonResponse({ error: 'This username name is reserved' }, 400);
  }

  const contactpagename = (body.contactpagename || 'index').trim() || 'index';
  if (!/^[a-zA-Z0-9_-]+$/.test(contactpagename)) {
    return jsonResponse({ error: 'Invalid contact page name' }, 400);
  }

  // Check if user folder or this contact page already exists
  const checkResponse = await fetch(
    `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${pagePath(username, contactpagename)}?ref=${CONFIG.branch}`,
    {
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ContactPageEditor/1.0'
      }
    }
  );

  if (checkResponse.ok) {
    return jsonResponse({ error: 'A page with this name already exists' }, 409);
  }

  // Create the file at user/<username>/<contactpagename>.html
  const filePath = pagePath(username, contactpagename);
  const response = await fetch(
    `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${filePath}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'ContactPageEditor/1.0'
      },
      body: JSON.stringify({
        message: `Create contact page: ${username}/${contactpagename}`,
        content: encodeBase64(content),
        branch: CONFIG.branch
      })
    }
  );

  if (!response.ok) {
    const error = await response.json();
    return jsonResponse({ error: error.message || 'Failed to create page' }, response.status);
  }

  const data = await response.json();
  const contactPageName = (body.contactPageName != null && typeof body.contactPageName === 'string') ? body.contactPageName.trim() : null;
  const displayName = (contactPageName && contactPageName.length <= 128) ? contactPageName : (contactpagename === 'index' ? 'Main (index)' : contactpagename);

  // Store account email, profile names, and contact page name in KV when provided
  if (env.EDIT_KEYS_KV) {
    if (accountEmailVal && accountEmailVal.includes('@')) {
      const accountEmailLower = accountEmailVal.toLowerCase();
      await env.EDIT_KEYS_KV.put('account_email:' + usernameTrim, accountEmailVal);
      await env.EDIT_KEYS_KV.put('account_email_to_folder:' + accountEmailLower, usernameTrim);
    }
    if (firstName) await env.EDIT_KEYS_KV.put('user_first_name:' + usernameTrim, firstName);
    if (lastName) await env.EDIT_KEYS_KV.put('user_last_name:' + usernameTrim, lastName);
    await env.EDIT_KEYS_KV.put(`contact_page_name:${usernameTrim}:${contactpagename}`, displayName);
  }

  return jsonResponse({
    success: true,
    username,
    contactpagename,
    contactPageName: displayName,
    sha: data.content.sha,
    url: pageUrl(username, contactpagename)
  });
}

/**
 * POST /api/page/{username}/create - Create a new contact page (Bearer, same user only).
 * Body: { contactpagename, content }. contactpagename is the unique identifier (e.g. work-card, travel-2024).
 * File stored at user/<username>/<contactpagename>.html; URL follows same path.
 */
async function handleUserCreatePage(username, request, env) {
  const auth = await validateAuth(username, request, env);
  if (!auth.authorized) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const contactpagename = (body.contactpagename || '').trim();
  if (!contactpagename) {
    return jsonResponse({ error: 'Contact page URL (slug) is required' }, 400);
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(contactpagename)) {
    return jsonResponse({ error: 'Contact page URL can only use letters, numbers, hyphens, and underscores' }, 400);
  }
  if (contactpagename.length < 2 || contactpagename.length > 64) {
    return jsonResponse({ error: 'Contact page URL must be 2–64 characters' }, 400);
  }
  const contactPageName = (body.contactPageName || '').trim();
  if (contactPageName && contactPageName.length > 128) {
    return jsonResponse({ error: 'Contact page name must be 128 characters or less' }, 400);
  }
  if (env.EDIT_KEYS_KV && contactPageName) {
    const nameList = await env.EDIT_KEYS_KV.list({ prefix: `contact_page_name:${username}:` });
    for (const key of nameList.keys) {
      const existing = await env.EDIT_KEYS_KV.get(key.name);
      if (existing && existing.trim().toLowerCase() === contactPageName.trim().toLowerCase()) {
        return jsonResponse({ error: 'Another contact page already uses this Contact Page Name' }, 409);
      }
    }
  }
  const content = body.content;
  if (typeof content !== 'string') {
    return jsonResponse({ error: 'Content is required' }, 400);
  }

  const filePath = pagePath(username, contactpagename);
  const checkResponse = await fetch(
    `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${filePath}?ref=${CONFIG.branch}`,
    {
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ContactPageEditor/1.0'
      }
    }
  );

  if (checkResponse.ok) {
    return jsonResponse({ error: 'A contact page with this URL already exists' }, 409);
  }

  const response = await fetch(
    `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${filePath}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'ContactPageEditor/1.0'
      },
      body: JSON.stringify({
        message: `Create contact page: ${username}/${contactpagename}`,
        content: encodeBase64(content),
        branch: CONFIG.branch
      })
    }
  );

  if (!response.ok) {
    const error = await response.json();
    return jsonResponse({ error: error.message || 'Failed to create page' }, response.status);
  }

  const data = await response.json();
  const displayName = contactPageName || (contactpagename === 'index' ? 'Main (index)' : contactpagename);
  if (env.EDIT_KEYS_KV) {
    await env.EDIT_KEYS_KV.put(`contact_page_name:${username}:${contactpagename}`, displayName);
  }
  return jsonResponse({
    success: true,
    contactpagename,
    contactPageName: displayName,
    sha: data.content.sha,
    url: pageUrl(username, contactpagename)
  });
}

/**
 * DELETE /api/page/{username} - Delete entire user (admin only).
 * DELETE /api/page/{username}/{contactpagename} - Delete single contact page (Bearer auth, same user, or admin).
 */
async function handleDeletePage(username, contactpagename, request, env) {
  const path = new URL(request.url).pathname.replace(/\/$/, '');
  const pathAfter = path.replace(/^\/api\/page\//, '').trim();
  const segments = pathAfter.split('/').filter(Boolean);
  const isSinglePageDelete = segments.length >= 2;

  if (isSinglePageDelete) {
    const slug = segments[1];
    const auth = await validateAuth(username, request, env);
    if (!auth.authorized) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    const canEdit = await requireEmailVerifiedForEdit(username, auth, env);
    if (!canEdit) {
      return jsonResponse({ error: 'Verify your email to delete contact pages.' }, 403);
    }
    const filePath = pagePath(username, slug);
    const getResponse = await fetch(
      `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${filePath}?ref=${CONFIG.branch}`,
      {
        headers: {
          'Authorization': `token ${env.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'ContactPageEditor/1.0'
        }
      }
    );
    if (!getResponse.ok) {
      return jsonResponse({ error: 'Page not found' }, 404);
    }
    const fileData = await getResponse.json();
    const deleteResponse = await fetch(
      `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${filePath}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `token ${env.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'ContactPageEditor/1.0'
        },
        body: JSON.stringify({
          message: `Delete contact page: ${username}/${slug}.html`,
          sha: fileData.sha,
          branch: CONFIG.branch
        })
      }
    );
    if (!deleteResponse.ok) {
      const err = await deleteResponse.json();
      return jsonResponse({ error: err.message || 'Failed to delete page' }, deleteResponse.status);
    }
    if (env.EDIT_KEYS_KV) {
      await env.EDIT_KEYS_KV.delete(`contact_page_name:${username}:${slug}`);
    }
    return jsonResponse({ success: true, contactpagename: slug, message: 'Contact page deleted' });
  }

  if (!await isAdmin(request, env)) {
    return jsonResponse({ error: 'Admin access required' }, 401);
  }

  // List all files under user/username/
  const listResponse = await fetch(
    `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${USER_PAGES_PREFIX}/${username}?ref=${CONFIG.branch}`,
    {
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ContactPageEditor/1.0'
      }
    }
  );

  if (!listResponse.ok) {
    return jsonResponse({ error: 'Page not found' }, 404);
  }

  const files = await listResponse.json();
  const htmlFiles = Array.isArray(files) ? files.filter(f => f.type === 'file' && f.name && f.name.endsWith('.html')) : [];

  for (const file of htmlFiles) {
    const filePath = `${USER_PAGES_PREFIX}/${username}/${file.name}`;
    const deleteResponse = await fetch(
      `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${filePath}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `token ${env.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'ContactPageEditor/1.0'
        },
        body: JSON.stringify({
          message: `Delete contact page: ${username}/${file.name}`,
          sha: file.sha,
          branch: CONFIG.branch
        })
      }
    );
    if (!deleteResponse.ok) {
      const error = await deleteResponse.json();
      return jsonResponse({ error: error.message || 'Failed to delete page' }, deleteResponse.status);
    }
  }

  // Also delete all KV data for this user
  if (env.EDIT_KEYS_KV) {
    const accountEmail = await env.EDIT_KEYS_KV.get(`account_email:${username}`);
    await env.EDIT_KEYS_KV.delete(`access_revoked:${username}`);
    await env.EDIT_KEYS_KV.delete(`account_email:${username}`);
    await env.EDIT_KEYS_KV.delete(`user_password_hash:${username}`);
    await env.EDIT_KEYS_KV.delete(`user_first_name:${username}`);
    await env.EDIT_KEYS_KV.delete(`user_last_name:${username}`);
    await env.EDIT_KEYS_KV.delete(`email_verified:${username}`);
    if (accountEmail && accountEmail.includes('@')) {
      await env.EDIT_KEYS_KV.delete(`account_email_to_folder:${accountEmail.toLowerCase().trim()}`);
    }
    await env.EDIT_KEYS_KV.delete(`user_dob:${username}`);
    await env.EDIT_KEYS_KV.delete(`user_recovery:${username}`);
    await env.EDIT_KEYS_KV.delete(`account_details_sent:${username}`);
    const nameKeys = await env.EDIT_KEYS_KV.list({ prefix: `contact_page_name:${username}:` });
    for (const key of nameKeys.keys) {
      await env.EDIT_KEYS_KV.delete(key.name);
    }
  }

  return jsonResponse({
    success: true,
    username,
    message: `Page ${username} deleted`
  });
}

/**
 * POST /api/admin/rename-user (admin only). Body: { oldUsername, newUsername }.
 * Renames user folder on GitHub and migrates all KV keys to new username.
 */
async function handleAdminRenameUser(request, env) {
  if (!await isAdmin(request, env)) {
    return jsonResponse({ error: 'Admin access required' }, 401);
  }
  let body;
  try { body = await request.json(); } catch (_) { return jsonResponse({ error: 'Invalid request body' }, 400); }
  const oldUsername = (body.oldUsername || '').trim().toLowerCase();
  const newUsername = (body.newUsername || '').trim().toLowerCase();
  if (!oldUsername || !newUsername) return jsonResponse({ error: 'oldUsername and newUsername required' }, 400);
  if (oldUsername === newUsername) return jsonResponse({ error: 'New username must be different' }, 400);
  if (!/^[a-zA-Z0-9_-]{3,32}$/.test(newUsername)) {
    return jsonResponse({ error: 'New username must be 3-32 characters, letters, numbers, hyphens, underscores' }, 400);
  }
  const reserved = ['admin', 'edit', 'signup', 'home', 'add', 'terms-and-privacy', 'user'];
  if (reserved.includes(newUsername)) return jsonResponse({ error: 'This username is reserved' }, 400);

  if (env.GITHUB_TOKEN) {
    const existingRes = await fetch(
      `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${USER_PAGES_PREFIX}/${newUsername}?ref=${CONFIG.branch}`,
      { headers: { 'Authorization': 'token ' + env.GITHUB_TOKEN, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'ContactPageEditor/1.0' } }
    );
    if (existingRes.ok) return jsonResponse({ error: 'A user with this username already exists' }, 409);
  }

  const listRes = await fetch(
    `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${USER_PAGES_PREFIX}/${oldUsername}?ref=${CONFIG.branch}`,
    { headers: { 'Authorization': 'token ' + env.GITHUB_TOKEN, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'ContactPageEditor/1.0' } }
  );
  if (!listRes.ok) return jsonResponse({ error: 'User folder not found' }, 404);
  const files = await listRes.json();
  const htmlFiles = Array.isArray(files) ? files.filter(f => f.type === 'file' && f.name && f.name.endsWith('.html')) : [];

  for (const file of htmlFiles) {
    const oldPath = `${USER_PAGES_PREFIX}/${oldUsername}/${file.name}`;
    const getRes = await fetch(
      `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${oldPath}?ref=${CONFIG.branch}`,
      { headers: { 'Authorization': 'token ' + env.GITHUB_TOKEN, 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'ContactPageEditor/1.0' } }
    );
    if (!getRes.ok) return jsonResponse({ error: 'Failed to read file: ' + file.name }, 500);
    const fileData = await getRes.json();
    const contentBase64 = fileData.content ? fileData.content.replace(/\n/g, '') : '';
    const newPath = `${USER_PAGES_PREFIX}/${newUsername}/${file.name}`;
    const putRes = await fetch(
      `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${newPath}`,
      {
        method: 'PUT',
        headers: { 'Authorization': 'token ' + env.GITHUB_TOKEN, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'User-Agent': 'ContactPageEditor/1.0' },
        body: JSON.stringify({ message: `Rename user: ${oldUsername} -> ${newUsername}`, content: contentBase64, branch: CONFIG.branch })
      }
    );
    if (!putRes.ok) {
      const err = await putRes.json();
      return jsonResponse({ error: err.message || 'Failed to create file: ' + file.name }, putRes.status);
    }
  }
  for (const file of htmlFiles) {
    const oldPath = `${USER_PAGES_PREFIX}/${oldUsername}/${file.name}`;
    const delRes = await fetch(
      `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${oldPath}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': 'token ' + env.GITHUB_TOKEN, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json', 'User-Agent': 'ContactPageEditor/1.0' },
        body: JSON.stringify({ message: `Rename user: remove ${oldUsername}`, sha: file.sha, branch: CONFIG.branch })
      }
    );
    if (!delRes.ok) return jsonResponse({ error: 'Failed to delete old file: ' + file.name }, 500);
  }

  if (env.EDIT_KEYS_KV) {
    const kvKeys = [
      'account_email', 'user_first_name', 'user_last_name', 'user_dob', 'user_recovery', 'user_password_hash',
      'email_verified', 'access_revoked', 'account_details_sent'
    ];
    for (const prefix of kvKeys) {
      const val = await env.EDIT_KEYS_KV.get(prefix + ':' + oldUsername);
      if (val != null) {
        await env.EDIT_KEYS_KV.put(prefix + ':' + newUsername, val);
        await env.EDIT_KEYS_KV.delete(prefix + ':' + oldUsername);
      }
    }
    const accountEmail = await env.EDIT_KEYS_KV.get('account_email:' + newUsername);
    if (accountEmail && accountEmail.includes('@')) {
      await env.EDIT_KEYS_KV.delete('account_email_to_folder:' + accountEmail.toLowerCase().trim());
      await env.EDIT_KEYS_KV.put('account_email_to_folder:' + accountEmail.toLowerCase().trim(), newUsername);
    }
    const nameList = await env.EDIT_KEYS_KV.list({ prefix: `contact_page_name:${oldUsername}:` });
    for (const key of nameList.keys) {
      const slug = key.name.replace(`contact_page_name:${oldUsername}:`, '');
      const val = await env.EDIT_KEYS_KV.get(key.name);
      if (val != null) {
        await env.EDIT_KEYS_KV.put(`contact_page_name:${newUsername}:${slug}`, val);
        await env.EDIT_KEYS_KV.delete(key.name);
      }
    }
  }

  return jsonResponse({ success: true, oldUsername, newUsername, message: `User renamed to ${newUsername}` });
}

/** GET /api/site-status - Public. Returns maintenance and lockdown. If X-Admin-Key is valid, returns isAdmin: true and no blocking. */
async function handleGetSiteStatus(request, env) {
  if (await isAdmin(request, env)) {
    return jsonResponse({ maintenanceMode: false, lockdownMode: false, isAdmin: true });
  }
  if (!env.EDIT_KEYS_KV) {
    return jsonResponse({ maintenanceMode: false, lockdownMode: false, isAdmin: false });
  }
  const maintenance = (await env.EDIT_KEYS_KV.get('site:maintenance')) === '1';
  const lockdown = (await env.EDIT_KEYS_KV.get('site:lockdown')) === '1';
  return jsonResponse({ maintenanceMode: maintenance, lockdownMode: lockdown, isAdmin: false });
}

/** GET /api/admin/site-settings - Admin only. Returns divert, maintenance, lockdown, per-user divert. */
async function handleGetSiteSettings(request, env) {
  if (!await isAdmin(request, env)) return jsonResponse({ error: 'Admin access required' }, 401);
  if (!env.EDIT_KEYS_KV) {
    return jsonResponse({ divertAllGlobal: false, maintenanceMode: false, lockdownMode: false, divertUsers: {} });
  }
  const divertAllGlobal = (await env.EDIT_KEYS_KV.get('site:divert_all_global')) === '1';
  const maintenanceMode = (await env.EDIT_KEYS_KV.get('site:maintenance')) === '1';
  const lockdownMode = (await env.EDIT_KEYS_KV.get('site:lockdown')) === '1';
  const divertList = await env.EDIT_KEYS_KV.list({ prefix: 'divert_email:' });
  const divertUsers = {};
  for (const key of divertList.keys) {
    const username = key.name.replace('divert_email:', '');
    if (username) {
      const val = await env.EDIT_KEYS_KV.get(key.name);
      if (val === '1') divertUsers[username] = true;
    }
  }
  return jsonResponse({ divertAllGlobal, maintenanceMode, lockdownMode, divertUsers });
}

/** PUT /api/admin/site-settings - Admin only. Body: { divertAllGlobal?, maintenanceMode?, lockdownMode?, divertUsers? }. */
async function handlePutSiteSettings(request, env) {
  if (!await isAdmin(request, env)) return jsonResponse({ error: 'Admin access required' }, 401);
  if (!env.EDIT_KEYS_KV) return jsonResponse({ error: 'KV not configured' }, 500);
  let body; try { body = await request.json(); } catch (_) { return jsonResponse({ error: 'Invalid request body' }, 400); }
  if (body.divertAllGlobal === true) await env.EDIT_KEYS_KV.put('site:divert_all_global', '1');
  else if (body.divertAllGlobal === false) await env.EDIT_KEYS_KV.delete('site:divert_all_global');
  if (body.maintenanceMode === true) await env.EDIT_KEYS_KV.put('site:maintenance', '1');
  else if (body.maintenanceMode === false) await env.EDIT_KEYS_KV.delete('site:maintenance');
  if (body.lockdownMode === true) await env.EDIT_KEYS_KV.put('site:lockdown', '1');
  else if (body.lockdownMode === false) await env.EDIT_KEYS_KV.delete('site:lockdown');
  if (body.divertUsers && typeof body.divertUsers === 'object') {
    for (const [username, on] of Object.entries(body.divertUsers)) {
      const u = (username || '').trim();
      if (!u) continue;
      if (on === true) await env.EDIT_KEYS_KV.put('divert_email:' + u, '1');
      else await env.EDIT_KEYS_KV.delete('divert_email:' + u);
    }
  }
  return jsonResponse({ success: true });
}

/** Returns list of usernames (folder names) that exist in GitHub under user/ and have at least one .html file. */
async function getValidUsernamesFromGitHub(env) {
  const response = await fetch(
    `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${USER_PAGES_PREFIX}?ref=${CONFIG.branch}`,
    {
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ContactPageEditor/1.0'
      }
    }
  );
  if (!response.ok) return [];
  const contents = await response.json();
  const usernames = (Array.isArray(contents) ? contents : [])
    .filter(item => item.type === 'dir' && item.name && !item.name.startsWith('.'))
    .map(item => item.name);
  const valid = [];
  for (const username of usernames) {
    try {
      const r = await fetch(
        `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${USER_PAGES_PREFIX}/${username}?ref=${CONFIG.branch}`,
        {
          headers: {
            'Authorization': `token ${env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'ContactPageEditor/1.0'
          }
        }
      );
      if (!r.ok) continue;
      const files = Array.isArray(await r.json()) ? await r.json() : [];
      if (files.some(f => f.name && f.name.endsWith('.html'))) valid.push(username);
    } catch (_) {}
  }
  return valid;
}

/** List KV keys by prefix; handles pagination (cursor). Returns array of key names. */
async function listAllKvKeys(env, prefix) {
  const out = [];
  let cursor = undefined;
  do {
    const opts = { prefix };
    if (cursor) opts.cursor = cursor;
    const list = await env.EDIT_KEYS_KV.list(opts);
    for (const k of list.keys) out.push(k.name);
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);
  return out;
}

/** Collects orphaned KV keys (user no longer in GitHub) and expired admin temp keys. Returns { orphanedKeys, expiredTemp, validUsernamesCount }. */
async function collectKvOrphans(env) {
  const validUsernames = await getValidUsernamesFromGitHub(env);
  const validSet = new Set(validUsernames);
  const orphanedKeys = [];

  const userPrefixes = [
    'account_email:',
    'user_password_hash:',
    'user_first_name:',
    'user_last_name:',
    'user_dob:',
    'user_recovery:',
    'email_verified:',
    'email_verified_admin:',
    'account_details_sent:',
    'access_revoked:',
    'divert_email:'
  ];
  for (const prefix of userPrefixes) {
    const keys = await listAllKvKeys(env, prefix);
    for (const name of keys) {
      const username = name.slice(prefix.length).split(':')[0];
      if (!validSet.has(username)) orphanedKeys.push(name);
    }
  }

  const contactPrefix = 'contact_page_name:';
  const contactKeys = await listAllKvKeys(env, contactPrefix);
  for (const name of contactKeys) {
    const after = name.slice(contactPrefix.length);
    const username = after.split(':')[0];
    if (!validSet.has(username)) orphanedKeys.push(name);
  }

  const emailToFolderPrefix = 'account_email_to_folder:';
  const emailToFolderKeys = await listAllKvKeys(env, emailToFolderPrefix);
  for (const name of emailToFolderKeys) {
    const email = name.slice(emailToFolderPrefix.length);
    const username = await env.EDIT_KEYS_KV.get(name);
    if (!username || !validSet.has(username)) {
      orphanedKeys.push(name);
    } else {
      const currentEmail = await env.EDIT_KEYS_KV.get('account_email:' + username);
      if ((currentEmail || '').toLowerCase() !== email.toLowerCase()) orphanedKeys.push(name);
    }
  }

  const expiredTemp = [];
  const recoveryRaw = await env.EDIT_KEYS_KV.get('admin:recovery_code');
  if (recoveryRaw) {
    try {
      const { expiresAt } = JSON.parse(recoveryRaw);
      if (expiresAt && Date.now() > expiresAt) expiredTemp.push('admin:recovery_code');
    } catch (_) {}
  }
  const resetRaw = await env.EDIT_KEYS_KV.get('admin:reset_token');
  if (resetRaw) {
    try {
      const { expiresAt } = JSON.parse(resetRaw);
      if (expiresAt && Date.now() > expiresAt) expiredTemp.push('admin:reset_token');
    } catch (_) {}
  }

  return { orphanedKeys, expiredTemp, validUsernamesCount: validUsernames.length };
}

/** GET /api/admin/kv-orphans - Admin only. Returns orphaned and expired temp KV keys (source of truth = GitHub user folders). */
async function handleGetKvOrphans(request, env) {
  if (!await isAdmin(request, env)) return jsonResponse({ error: 'Admin access required' }, 401);
  if (!env.EDIT_KEYS_KV) return jsonResponse({ error: 'KV not configured' }, 500);
  const data = await collectKvOrphans(env);
  return jsonResponse({
    ...data,
    summary: { orphaned: data.orphanedKeys.length, expiredTemp: data.expiredTemp.length }
  });
}

/** POST /api/admin/kv-cleanup - Admin only. Body: { dryRun?: boolean }. Deletes orphaned and expired temp KV keys. Returns { deleted, deletedKeys }. */
async function handleKvCleanup(request, env) {
  if (!await isAdmin(request, env)) return jsonResponse({ error: 'Admin access required' }, 401);
  if (!env.EDIT_KEYS_KV) return jsonResponse({ error: 'KV not configured' }, 500);
  let body; try { body = await request.json(); } catch (_) { body = {}; }
  const dryRun = body.dryRun === true;
  const data = await collectKvOrphans(env);
  const toDelete = [...data.orphanedKeys, ...data.expiredTemp];
  if (!dryRun && toDelete.length > 0) {
    for (const key of toDelete) {
      await env.EDIT_KEYS_KV.delete(key);
    }
  }
  return jsonResponse({
    deleted: toDelete.length,
    deletedKeys: toDelete,
    dryRun
  });
}

/** GET /api/admin/admin-email - Admin only. Returns { email, passwordSet }. */
async function handleGetAdminEmail(request, env) {
  if (!await isAdmin(request, env)) return jsonResponse({ error: 'Admin access required' }, 401);
  if (!env.EDIT_KEYS_KV) return jsonResponse({ email: null, passwordSet: false });
  const email = await env.EDIT_KEYS_KV.get('admin:email');
  const hash = await env.EDIT_KEYS_KV.get('admin:password_hash');
  return jsonResponse({ email: email || null, passwordSet: !!hash });
}

/** POST /api/internal/set-admin-credentials - Secret auth only (X-Setup-Secret or Authorization: Bearer). Not public-facing. Body: { email?, password?, adminKey? }. Sets/updates admin email, password, and/or key without needing the current admin key. Requires env.ADMIN_SETUP_SECRET. */
async function handleInternalSetAdminCredentials(request, env) {
  const secret = env.ADMIN_SETUP_SECRET;
  if (!secret) return jsonResponse({ error: 'Not configured' }, 501);
  const headerSecret = request.headers.get('X-Setup-Secret');
  const bearer = request.headers.get('Authorization');
  const token = (bearer && bearer.startsWith('Bearer ')) ? bearer.slice(7) : null;
  if (!headerSecret && !token) return jsonResponse({ error: 'Unauthorized' }, 401);
  const provided = (headerSecret || token || '').trim();
  if (provided !== secret) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!env.EDIT_KEYS_KV) return jsonResponse({ error: 'KV not configured' }, 500);
  let body; try { body = await request.json(); } catch (_) { return jsonResponse({ error: 'Invalid request body' }, 400); }
  const email = (body.email != null && body.email !== '') ? String(body.email).trim().toLowerCase() : null;
  const password = typeof body.password === 'string' ? body.password : null;
  const newAdminKey = (body.adminKey != null && body.adminKey !== '') ? String(body.adminKey).trim() : null;
  if (!email && !password && !newAdminKey) return jsonResponse({ error: 'Provide at least one of email, password, adminKey' }, 400);
  if (email && !email.includes('@')) return jsonResponse({ error: 'Valid email required' }, 400);
  if (password && password.length < 8) return jsonResponse({ error: 'Password must be at least 8 characters' }, 400);
  if (newAdminKey && newAdminKey.length < 8) return jsonResponse({ error: 'adminKey must be at least 8 characters' }, 400);
  if (email) await env.EDIT_KEYS_KV.put('admin:email', email);
  if (password) {
    const saltArr = new Uint8Array(SALT_BYTES);
    crypto.getRandomValues(saltArr);
    const saltHex = bufferToHex(saltArr);
    const hashHex = await hashAdminPassword(password, saltArr);
    await env.EDIT_KEYS_KV.put('admin:password_salt', saltHex);
    await env.EDIT_KEYS_KV.put('admin:password_hash', hashHex);
  }
  if (newAdminKey) await env.EDIT_KEYS_KV.put('admin:key', newAdminKey);
  return jsonResponse({ success: true, updated: [ email && 'email', password && 'password', newAdminKey && 'adminKey' ].filter(Boolean) });
}

/** PUT /api/admin/admin-email - Admin only. Body: { email }. Sets or updates admin email. Dashboard may only set when empty; once set, change via this API (e.g. curl) only. */
async function handlePutAdminEmail(request, env) {
  if (!await isAdmin(request, env)) return jsonResponse({ error: 'Admin access required' }, 401);
  if (!env.EDIT_KEYS_KV) return jsonResponse({ error: 'KV not configured' }, 500);
  let body; try { body = await request.json(); } catch (_) { return jsonResponse({ error: 'Invalid request body' }, 400); }
  const email = (body.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return jsonResponse({ error: 'Valid email required' }, 400);
  await env.EDIT_KEYS_KV.put('admin:email', email);
  return jsonResponse({ success: true, email });
}

/** PUT /api/admin/admin-key - Admin only. Body: { newAdminKey }. */
async function handlePutAdminKey(request, env) {
  if (!await isAdmin(request, env)) return jsonResponse({ error: 'Admin access required' }, 401);
  if (!env.EDIT_KEYS_KV) return jsonResponse({ error: 'KV not configured' }, 500);
  let body; try { body = await request.json(); } catch (_) { return jsonResponse({ error: 'Invalid request body' }, 400); }
  const newKey = (body.newAdminKey || '').trim();
  if (newKey.length < 8) return jsonResponse({ error: 'Admin key must be at least 8 characters' }, 400);
  await env.EDIT_KEYS_KV.put('admin:key', newKey);
  return jsonResponse({ success: true });
}

/** POST /api/admin/verify-otp-set-password - Admin only. Body: { otp, newPassword }. Verifies admin:recovery_code then sets password. */
async function handleVerifyOtpSetPassword(request, env) {
  if (!await isAdmin(request, env)) return jsonResponse({ error: 'Admin access required' }, 401);
  if (!env.EDIT_KEYS_KV) return jsonResponse({ error: 'KV not configured' }, 500);
  let body; try { body = await request.json(); } catch (_) { return jsonResponse({ error: 'Invalid request body' }, 400); }
  const otp = (body.otp || '').trim();
  const newPassword = body.newPassword;
  if (!otp) return jsonResponse({ error: 'Code required' }, 400);
  if (typeof newPassword !== 'string' || newPassword.length < 8) return jsonResponse({ error: 'Password must be at least 8 characters' }, 400);
  const storedData = await env.EDIT_KEYS_KV.get('admin:recovery_code');
  if (!storedData) return jsonResponse({ error: 'No recovery code found. Request a new one.' }, 400);
  const { recoveryCode, expiresAt } = JSON.parse(storedData);
  if (Date.now() > expiresAt) {
    await env.EDIT_KEYS_KV.delete('admin:recovery_code');
    return jsonResponse({ error: 'Code expired. Request a new one.' }, 400);
  }
  if (otp !== recoveryCode) return jsonResponse({ error: 'Invalid code.' }, 401);
  await env.EDIT_KEYS_KV.delete('admin:recovery_code');
  const saltArr = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(saltArr);
  const saltHex = bufferToHex(saltArr);
  const hashHex = await hashAdminPassword(newPassword, saltArr);
  await env.EDIT_KEYS_KV.put('admin:password_salt', saltHex);
  await env.EDIT_KEYS_KV.put('admin:password_hash', hashHex);
  return jsonResponse({ success: true });
}

/** PUT /api/admin/set-password - Admin only. Body: { password }. */
async function handlePutAdminPassword(request, env) {
  if (!await isAdmin(request, env)) return jsonResponse({ error: 'Admin access required' }, 401);
  if (!env.EDIT_KEYS_KV) return jsonResponse({ error: 'KV not configured' }, 500);
  let body; try { body = await request.json(); } catch (_) { return jsonResponse({ error: 'Invalid request body' }, 400); }
  const password = body.password;
  if (typeof password !== 'string' || password.length < 8) return jsonResponse({ error: 'Password must be at least 8 characters' }, 400);
  const saltArr = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(saltArr);
  const saltHex = bufferToHex(saltArr);
  const hashHex = await hashAdminPassword(password, saltArr);
  await env.EDIT_KEYS_KV.put('admin:password_salt', saltHex);
  await env.EDIT_KEYS_KV.put('admin:password_hash', hashHex);
  return jsonResponse({ success: true });
}

/** POST /api/recover/verify-reset-token - No auth. Body: { token }. */
async function handleVerifyResetToken(request, env) {
  if (!env.EDIT_KEYS_KV) return jsonResponse({ error: 'KV not configured' }, 500);
  let body; try { body = await request.json(); } catch (_) { return jsonResponse({ valid: false }, 400); }
  const token = (body.token || '').trim();
  if (!token) return jsonResponse({ valid: false }, 400);
  const stored = await env.EDIT_KEYS_KV.get('admin:reset_token');
  if (!stored) return jsonResponse({ valid: false }, 400);
  const { token: storedToken, expiresAt } = JSON.parse(stored);
  if (storedToken !== token || Date.now() > expiresAt) return jsonResponse({ valid: false }, 400);
  return jsonResponse({ valid: true });
}

/** POST /api/recover/reset-password - No auth. Body: { token, newPassword }. */
async function handleResetPasswordWithToken(request, env) {
  if (!env.EDIT_KEYS_KV) return jsonResponse({ error: 'KV not configured' }, 500);
  let body; try { body = await request.json(); } catch (_) { return jsonResponse({ error: 'Invalid request body' }, 400); }
  const token = (body.token || '').trim();
  const newPassword = body.newPassword;
  if (!token) return jsonResponse({ error: 'Token required' }, 400);
  if (typeof newPassword !== 'string' || newPassword.length < 8) return jsonResponse({ error: 'Password must be at least 8 characters' }, 400);
  const stored = await env.EDIT_KEYS_KV.get('admin:reset_token');
  if (!stored) return jsonResponse({ error: 'Invalid or expired reset link' }, 400);
  const { token: storedToken, expiresAt } = JSON.parse(stored);
  if (storedToken !== token || Date.now() > expiresAt) {
    await env.EDIT_KEYS_KV.delete('admin:reset_token');
    return jsonResponse({ error: 'Invalid or expired reset link' }, 400);
  }
  const saltArr = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(saltArr);
  const saltHex = bufferToHex(saltArr);
  const hashHex = await hashAdminPassword(newPassword, saltArr);
  await env.EDIT_KEYS_KV.put('admin:password_salt', saltHex);
  await env.EDIT_KEYS_KV.put('admin:password_hash', hashHex);
  await env.EDIT_KEYS_KV.delete('admin:reset_token');
  return jsonResponse({ success: true });
}

async function handleGetPage(username, contactpagename, request, env) {
  const auth = await validateAuth(username, request, env);
  if (!auth.authorized) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const filePath = pagePath(username, contactpagename);
  const response = await fetch(
    `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${filePath}?ref=${CONFIG.branch}`,
    {
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ContactPageEditor/1.0'
      }
    }
  );

  if (!response.ok) {
    return jsonResponse({ error: 'Page not found' }, 404);
  }

  const data = await response.json();
  const content = decodeBase64(data.content);
  let contactPageName = null;
  if (env.EDIT_KEYS_KV) {
    contactPageName = await env.EDIT_KEYS_KV.get(`contact_page_name:${username}:${contactpagename}`);
  }
  if (!contactPageName) contactPageName = contactpagename === 'index' ? 'Main (index)' : contactpagename;

  return jsonResponse({ content, sha: data.sha, username, contactpagename, contactPageName });
}

async function handleUpdatePage(username, contactpagename, request, env) {
  const auth = await validateAuth(username, request, env);
  if (!auth.authorized) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  const canEdit = await requireEmailVerifiedForEdit(username, auth, env);
  if (!canEdit) {
    return jsonResponse({ error: 'Verify your email to edit contact pages.' }, 403);
  }

  const body = await request.json();
  const { content, sha, contactPageName } = body;

  if (!content || !sha) {
    return jsonResponse({ error: 'Missing content or sha' }, 400);
  }

  const contactPageNameTrim = (contactPageName != null && typeof contactPageName === 'string') ? contactPageName.trim() : null;
  if (contactPageNameTrim && contactPageNameTrim.length > 128) {
    return jsonResponse({ error: 'Contact page name must be 128 characters or less' }, 400);
  }
  if (env.EDIT_KEYS_KV && contactPageNameTrim) {
    const nameList = await env.EDIT_KEYS_KV.list({ prefix: `contact_page_name:${username}:` });
    for (const key of nameList.keys) {
      const slugForKey = key.name.replace(`contact_page_name:${username}:`, '');
      if (slugForKey === contactpagename) continue;
      const existing = await env.EDIT_KEYS_KV.get(key.name);
      if (existing && existing.trim().toLowerCase() === contactPageNameTrim.toLowerCase()) {
        return jsonResponse({ error: 'Another contact page already uses this Contact Page Name' }, 409);
      }
    }
  }

  const filePath = pagePath(username, contactpagename);
  const response = await fetch(
    `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${filePath}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'ContactPageEditor/1.0'
      },
      body: JSON.stringify({
        message: `Update contact: ${username}${auth.isAdmin ? ' (admin)' : ''}`,
        content: encodeBase64(content),
        sha,
        branch: CONFIG.branch
      })
    }
  );

  if (!response.ok) {
    const error = await response.json();
    return jsonResponse({ error: error.message || 'GitHub error' }, response.status);
  }

  const data = await response.json();
  if (env.EDIT_KEYS_KV && contactPageNameTrim !== null) {
    await env.EDIT_KEYS_KV.put(`contact_page_name:${username}:${contactpagename}`, contactPageNameTrim || (contactpagename === 'index' ? 'Main (index)' : contactpagename));
  }
  return jsonResponse({
    success: true,
    sha: data.content.sha,
    url: pageUrl(username, contactpagename)
  });
}

// ============ Admin Routes ============

async function handleListPages(request, env) {
  if (!await isAdmin(request, env)) {
    return jsonResponse({ error: 'Admin access required' }, 401);
  }

  const response = await fetch(
    `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${USER_PAGES_PREFIX}?ref=${CONFIG.branch}`,
    {
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ContactPageEditor/1.0'
      }
    }
  );

  if (!response.ok) {
    return jsonResponse({ error: 'GitHub error' }, 500);
  }

  const contents = await response.json();
  const usernames = (Array.isArray(contents) ? contents : [])
    .filter(item => item.type === 'dir' && item.name && !item.name.startsWith('.'))
    .map(item => item.name);

  const pages = [];
  for (const username of usernames) {
    try {
      const usernameResponse = await fetch(
        `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${USER_PAGES_PREFIX}/${username}?ref=${CONFIG.branch}`,
        {
          headers: {
            'Authorization': `token ${env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'ContactPageEditor/1.0'
          }
        }
      );
      const usernameContents = await usernameResponse.json();
      const files = Array.isArray(usernameContents) ? usernameContents : [];
      if (files.some(f => f.name && f.name.endsWith('.html'))) {
        pages.push(username);
      }
    } catch (e) {}
  }

  return jsonResponse({ pages });
}

/** GET /api/pages/summaries - List pages plus minimal summary per page (givenName, familyName, contactEmail, lastUpdated, updatedBy). Admin only. */
async function handlePageSummaries(request, env) {
  if (!await isAdmin(request, env)) {
    return jsonResponse({ error: 'Admin access required' }, 401);
  }
  const listRes = await fetch(
    `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${USER_PAGES_PREFIX}?ref=${CONFIG.branch}`,
    {
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ContactPageEditor/1.0'
      }
    }
  );
  if (!listRes.ok) {
    return jsonResponse({ error: 'GitHub error' }, 500);
  }
  const contents = await listRes.json();
  const usernames = (Array.isArray(contents) ? contents : [])
    .filter(item => item.type === 'dir' && item.name && !item.name.startsWith('.'))
    .map(item => item.name);

  const pages = [];
  const summaries = {};
  const authHeaders = {
    'Authorization': `token ${env.GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'ContactPageEditor/1.0'
  };

  const fetchSummary = async (username) => {
    try {
      const dirRes = await fetch(
        `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${USER_PAGES_PREFIX}/${username}?ref=${CONFIG.branch}`,
        { headers: authHeaders }
      );
      if (!dirRes.ok) return null;
      const dirContents = await dirRes.json();
      const files = Array.isArray(dirContents) ? dirContents : [];
      if (!files.some(f => f.name && f.name.endsWith('.html'))) return null;
      const filePath = pagePath(username, 'index');
      const fileRes = await fetch(
        `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${filePath}?ref=${CONFIG.branch}`,
        { headers: authHeaders }
      );
      if (!fileRes.ok) return { username, summary: null };
      const fileData = await fileRes.json();
      const html = decodeBase64(fileData.content);
      const summary = extractSummaryFromHtml(html);
      return { username, summary };
    } catch (e) {
      return { username, summary: null };
    }
  };

  const results = await Promise.all(usernames.map(fetchSummary));
  for (const r of results) {
    if (!r) continue;
    pages.push(r.username);
    summaries[r.username] = r.summary || { givenName: '', familyName: '', contactEmail: '', lastUpdated: null, updatedBy: null };
  }

  return jsonResponse({ pages, summaries });
}

/** GET /api/contact-pages/:username - List contact page names for a user (admin or same user via Bearer). */
async function handleListContactPages(username, request, env) {
  const u = (username || '').trim();
  const auth = await validateAuth(u, request, env);
  if (!auth.authorized) {
    return jsonResponse({ error: auth.isAdmin ? 'Admin access required' : 'Unauthorized' }, 401);
  }
  if (!u || !/^[a-zA-Z0-9_-]+$/.test(u)) {
    return jsonResponse({ error: 'Invalid username' }, 400);
  }
  const response = await fetch(
    `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${USER_PAGES_PREFIX}/${u}?ref=${CONFIG.branch}`,
    {
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ContactPageEditor/1.0'
      }
    }
  );
  if (!response.ok) {
    if (response.status === 404) return jsonResponse({ contactPages: [] });
    return jsonResponse({ error: 'GitHub error' }, 500);
  }
  const contents = await response.json();
  const files = Array.isArray(contents) ? contents : [];
  const slugs = files
    .filter(item => item.type === 'file' && item.name && item.name.endsWith('.html'))
    .map(item => item.name.replace(/\.html$/i, ''));
  const contactPages = [];
  for (const slug of slugs) {
    const name = env.EDIT_KEYS_KV
      ? (await env.EDIT_KEYS_KV.get(`contact_page_name:${u}:${slug}`)) || (slug === 'index' ? 'Main (index)' : slug)
      : (slug === 'index' ? 'Main (index)' : slug);
    contactPages.push({ slug, name });
  }
  return jsonResponse({ contactPages });
}

async function handleGetAccountEmails(request, env) {
  if (!await isAdmin(request, env)) {
    return jsonResponse({ error: 'Admin access required' }, 401);
  }
  if (!env.EDIT_KEYS_KV) {
    return jsonResponse({ accountEmails: {}, accountDetailsSent: {}, emailVerification: {} });
  }
  const keyNames = await listAllKvKeys(env, 'account_email:');
  const accountEmails = {};
  const originalSuffixByLower = {};
  for (const keyName of keyNames) {
    if (keyName.startsWith('account_email_to_folder:')) continue;
    const username = keyName.replace('account_email:', '');
    const value = await env.EDIT_KEYS_KV.get(keyName);
    if (value && username) {
      const keyLower = (username || '').trim().toLowerCase();
      accountEmails[keyLower] = value;
      originalSuffixByLower[keyLower] = username;
    }
  }
  const toFolderKeys = await listAllKvKeys(env, 'account_email_to_folder:');
  for (const keyName of toFolderKeys) {
    const email = keyName.replace('account_email_to_folder:', '').trim();
    const username = await env.EDIT_KEYS_KV.get(keyName);
    if (email && email.includes('@') && username) {
      const uLower = (username || '').trim().toLowerCase();
      if (!accountEmails[uLower]) {
        accountEmails[uLower] = email;
        if (!originalSuffixByLower[uLower]) originalSuffixByLower[uLower] = username;
      }
    }
  }
  const sentKeyNames = await listAllKvKeys(env, 'account_details_sent:');
  const accountDetailsSent = {};
  for (const keyName of sentKeyNames) {
    const username = keyName.replace('account_details_sent:', '');
    if (username) accountDetailsSent[username.toLowerCase()] = true;
  }
  const emailVerification = {};
  for (const keyLower of Object.keys(accountEmails)) {
    const orig = originalSuffixByLower[keyLower] || keyLower;
    const byAdmin = (await env.EDIT_KEYS_KV.get('email_verified_admin:' + orig)) === '1';
    const byUser = (await env.EDIT_KEYS_KV.get('email_verified:' + orig)) === '1';
    emailVerification[keyLower] = byAdmin ? 'admin' : byUser ? 'user' : null;
  }
  return jsonResponse(
    { accountEmails, accountDetailsSent, emailVerification },
    200,
    { 'Cache-Control': 'no-store' }
  );
}

async function handleGetAccountProfiles(request, env) {
  if (!await isAdmin(request, env)) return jsonResponse({ error: 'Admin access required' }, 401);
  let body; try { body = await request.json(); } catch (_) { return jsonResponse({ error: 'Invalid request' }, 400); }
  const usernames = Array.isArray(body.usernames) ? body.usernames : [];
  const profiles = {};
  if (!env.EDIT_KEYS_KV) return jsonResponse({ profiles });
  const lowerToOriginal = {};
  const addSuffix = (keyName, prefix) => {
    const suffix = keyName.replace(prefix, '');
    if (suffix) {
      const key = suffix.trim().toLowerCase();
      lowerToOriginal[key] = suffix;
    }
  };
  const firstNamesKeys = await listAllKvKeys(env, 'user_first_name:');
  for (const keyName of firstNamesKeys) addSuffix(keyName, 'user_first_name:');
  const lastNamesKeys = await listAllKvKeys(env, 'user_last_name:');
  for (const keyName of lastNamesKeys) addSuffix(keyName, 'user_last_name:');
  const accountEmailKeys = await listAllKvKeys(env, 'account_email:');
  for (const keyName of accountEmailKeys) {
    if (!keyName.startsWith('account_email_to_folder:')) addSuffix(keyName, 'account_email:');
  }
  const getFirst = async (u) => (await env.EDIT_KEYS_KV.get('user_first_name:' + u)) || '';
  const getLast = async (u) => (await env.EDIT_KEYS_KV.get('user_last_name:' + u)) || '';
  const getEmail = async (u) => (await env.EDIT_KEYS_KV.get('account_email:' + u)) || '';
  for (const username of usernames) {
    const u = (username || '').trim();
    const uLower = u.toLowerCase();
    const canonical = lowerToOriginal[uLower] || u;
    const firstName = (await getFirst(canonical)) || (await getFirst(uLower)) || '';
    const lastName = (await getLast(canonical)) || (await getLast(uLower)) || '';
    const accountEmail = (await getEmail(canonical)) || (await getEmail(uLower)) || '';
    profiles[username] = { firstName, lastName, accountEmail };
  }
  return jsonResponse({ profiles });
}

async function handleDebugUser(username, request, env) {
  if (!await isAdmin(request, env)) return jsonResponse({ error: 'Admin access required' }, 401);
  if (!username) return jsonResponse({ error: 'Username required' }, 400);
  if (!env.EDIT_KEYS_KV) return jsonResponse({ debug: { username, message: 'KV not configured' } });
  const u = username.trim();
  const uLower = u.toLowerCase();
  const accountEmailFromKey = await env.EDIT_KEYS_KV.get('account_email:' + u) || await env.EDIT_KEYS_KV.get('account_email:' + uLower);
  const firstName = await env.EDIT_KEYS_KV.get('user_first_name:' + u) || await env.EDIT_KEYS_KV.get('user_first_name:' + uLower);
  const lastName = await env.EDIT_KEYS_KV.get('user_last_name:' + u) || await env.EDIT_KEYS_KV.get('user_last_name:' + uLower);
  const toFolderKeys = await listAllKvKeys(env, 'account_email_to_folder:');
  const toFolderEntries = [];
  for (const keyName of toFolderKeys) {
    const email = keyName.replace('account_email_to_folder:', '').trim();
    const folder = await env.EDIT_KEYS_KV.get(keyName);
    const folderTrimmed = (folder || '').trim();
    const folderLower = folderTrimmed.toLowerCase();
    if (folderTrimmed === u || folderTrimmed === uLower || folderLower === uLower) {
      toFolderEntries.push({ email, folder: folderTrimmed });
    }
  }
  const allAccountEmailKeys = await listAllKvKeys(env, 'account_email:');
  const matchingAccountEmailKeys = allAccountEmailKeys.filter((keyName) => {
    if (keyName.startsWith('account_email_to_folder:')) return false;
    const suffix = keyName.replace('account_email:', '');
    return suffix.trim().toLowerCase() === uLower;
  });
  const resolvedEmail = accountEmailFromKey || (toFolderEntries.length ? toFolderEntries[0].email : null);
  return jsonResponse({
    debug: {
      username: u,
      usernameLower: uLower,
      accountEmailFromKey: accountEmailFromKey || null,
      accountEmailFromToFolder: toFolderEntries.length ? toFolderEntries[0].email : null,
      resolvedEmail: resolvedEmail || null,
      firstName: firstName || null,
      lastName: lastName || null,
      toFolderEntries,
      matchingAccountEmailKeys
    }
  });
}

async function handleSecretsStatus(request, env) {
  if (!await isAdmin(request, env)) {
    return jsonResponse({ error: 'Admin access required' }, 401);
  }
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return jsonResponse({ error: 'Invalid request body' }, 400);
  }
  const usernames = Array.isArray(body.usernames) ? body.usernames : [];
  const statuses = {};
  if (!env.EDIT_KEYS_KV) {
    for (const f of usernames) statuses[f] = { hasAccountEmail: false, hasDob: false, hasSecretQuestions: false, secretsComplete: false };
    return jsonResponse({ statuses });
  }
  const lowerToOriginal = {};
  const accountEmailKeys = await listAllKvKeys(env, 'account_email:');
  for (const keyName of accountEmailKeys) {
    if (!keyName.startsWith('account_email_to_folder:')) {
      const suffix = keyName.replace('account_email:', '');
      if (suffix) lowerToOriginal[suffix.toLowerCase()] = suffix;
    }
  }
  for (const username of usernames) {
    const u = (username || '').trim();
    const uLower = u.toLowerCase();
    const canonical = lowerToOriginal[uLower] || u;
    let accountEmail = await env.EDIT_KEYS_KV.get('account_email:' + canonical);
    if (accountEmail == null) accountEmail = await env.EDIT_KEYS_KV.get('account_email:' + uLower);
    let dob = await env.EDIT_KEYS_KV.get('user_dob:' + canonical);
    if (dob == null) dob = await env.EDIT_KEYS_KV.get('user_dob:' + uLower);
    let recoveryRaw = await env.EDIT_KEYS_KV.get('user_recovery:' + canonical);
    if (recoveryRaw == null) recoveryRaw = await env.EDIT_KEYS_KV.get('user_recovery:' + uLower);
    let secretQuestions = [];
    if (recoveryRaw) {
      try {
        const r = JSON.parse(recoveryRaw);
        secretQuestions = Array.isArray(r.secretQuestions) ? r.secretQuestions : [];
      } catch (_) {}
    }
    const hasAccountEmail = !!(accountEmail && accountEmail.includes('@'));
    const hasDob = !!(dob && dob.trim());
    const hasSecretQuestions = secretQuestions.length === 3 && secretQuestions.every(q => q && q.questionId && (q.answer || '').trim().length >= 4);
    const secretsComplete = hasAccountEmail && hasDob && hasSecretQuestions;
    statuses[username] = { hasAccountEmail, hasDob, hasSecretQuestions, secretsComplete };
  }
  return jsonResponse({ statuses });
}

async function handleGetKeys(request, env) {
  if (!await isAdmin(request, env)) {
    return jsonResponse({ error: 'Admin access required' }, 401);
  }

  if (!env.EDIT_KEYS_KV) {
    return jsonResponse({ editKeys: {} });
  }

  const list = await env.EDIT_KEYS_KV.list({ prefix: 'user_password_hash:' });
  const editKeys = {};
  for (const key of list.keys) {
    const username = key.name.replace('user_password_hash:', '');
    if (!username) continue;
    editKeys[username] = '1';
  }
  return jsonResponse({ editKeys });
}

async function handleAccountDetailsSent(username, request, env) {
  if (!await isAdmin(request, env)) {
    return jsonResponse({ error: 'Admin access required' }, 401);
  }
  if (!username || !env.EDIT_KEYS_KV) {
    return jsonResponse({ error: 'Invalid request' }, 400);
  }
  await env.EDIT_KEYS_KV.put(`account_details_sent:${username}`, '1');
  return jsonResponse({ success: true });
}

async function handleRecoveryCheck(request, env) {
  if (!env.EDIT_KEYS_KV) return jsonResponse({ error: 'KV not configured' }, 500);
  let body; try { body = await request.json(); } catch (_) { return jsonResponse({ error: 'Invalid request' }, 400); }
  const username = (body.username || '').trim().toLowerCase();
  if (!username || username.length < 3) return jsonResponse({ exists: false, canRecover: false });
  const pwHash = await env.EDIT_KEYS_KV.get('user_password_hash:' + username);
  if (!pwHash) return jsonResponse({ exists: false, canRecover: false });
  const accountEmail = await env.EDIT_KEYS_KV.get('account_email:' + username);
  const dob = await env.EDIT_KEYS_KV.get('user_dob:' + username);
  const recoveryRaw = await env.EDIT_KEYS_KV.get('user_recovery:' + username);
  let secretQuestions = [];
  if (recoveryRaw) { try { const r = JSON.parse(recoveryRaw); secretQuestions = Array.isArray(r.secretQuestions) ? r.secretQuestions : []; } catch (_) {} }
  const hasAccountEmail = !!(accountEmail && accountEmail.includes('@'));
  const hasDob = !!(dob && dob.trim());
  const hasSecretQuestions = secretQuestions.length === 3 && secretQuestions.every(q => q && q.questionId && (q.answer || '').trim().length >= 4);
  const canRecover = hasAccountEmail && hasDob && hasSecretQuestions;
  if (!canRecover) return jsonResponse({ exists: true, canRecover: false });
  const qIds = secretQuestions.map(q => q.questionId).filter(Boolean);
  const randomId = qIds[Math.floor(Math.random() * qIds.length)];
  return jsonResponse({ exists: true, canRecover: true, recoveryQuestionId: randomId });
}

async function handleRecoveryCheckByEmail(request, env) {
  if (!env.EDIT_KEYS_KV) return jsonResponse({ error: 'KV not configured' }, 500);
  let body; try { body = await request.json(); } catch (_) { return jsonResponse({ error: 'Invalid request' }, 400); }
  const accountEmail = (body.accountEmail || '').trim().toLowerCase();
  if (!accountEmail || !accountEmail.includes('@')) return jsonResponse({ exists: false, canRecover: false });
  const username = await env.EDIT_KEYS_KV.get('account_email_to_folder:' + accountEmail);
  if (!username) return jsonResponse({ exists: false, canRecover: false });
  const pwHash = await env.EDIT_KEYS_KV.get('user_password_hash:' + username);
  if (!pwHash) return jsonResponse({ exists: false, canRecover: false });
  const storedEmail = await env.EDIT_KEYS_KV.get('account_email:' + username);
  const dob = await env.EDIT_KEYS_KV.get('user_dob:' + username);
  const recoveryRaw = await env.EDIT_KEYS_KV.get('user_recovery:' + username);
  let secretQuestions = [];
  if (recoveryRaw) { try { const r = JSON.parse(recoveryRaw); secretQuestions = Array.isArray(r.secretQuestions) ? r.secretQuestions : []; } catch (_) {} }
  const hasAccountEmail = !!(storedEmail && storedEmail.includes('@'));
  const hasDob = !!(dob && dob.trim());
  const hasSecretQuestions = secretQuestions.length === 3 && secretQuestions.every(q => q && q.questionId && (q.answer || '').trim().length >= 4);
  const canRecover = hasAccountEmail && hasDob && hasSecretQuestions;
  if (!canRecover) return jsonResponse({ exists: true, canRecover: false });
  const qIds = secretQuestions.map(q => q.questionId).filter(Boolean);
  if (qIds.length < 2) return jsonResponse({ exists: true, canRecover: false });
  const shuffled = qIds.slice().sort(() => Math.random() - 0.5);
  const [id1, id2] = shuffled.slice(0, 2);
  return jsonResponse({ exists: true, canRecover: true, recoveryQuestionIds: [id1, id2] });
}
async function handleRecoveryVerify(request, env) {
  if (!env.EDIT_KEYS_KV) return jsonResponse({ error: 'KV not configured' }, 500);
  let body; try { body = await request.json(); } catch (_) { return jsonResponse({ error: 'Invalid request' }, 400); }
  let username = (body.username || '').trim().toLowerCase();
  const accountEmail = (body.accountEmail || '').trim().toLowerCase();
  const dobRaw = (body.dob || '').trim();
  const questionIds = body.questionIds;
  const answers = body.answers;
  const questionId = body.questionId != null ? parseInt(body.questionId, 10) : null;
  const answer = (body.answer || '').trim();

  if (questionIds && Array.isArray(questionIds) && answers && Array.isArray(answers)) {
    if (questionIds.length !== 2 || answers.length !== 2) return jsonResponse({ error: 'Recovery verification failed' }, 401);
    if (!accountEmail || !accountEmail.includes('@') || !dobRaw) return jsonResponse({ error: 'Recovery verification failed' }, 401);
    username = await env.EDIT_KEYS_KV.get('account_email_to_folder:' + accountEmail);
    if (!username) return jsonResponse({ error: 'Recovery verification failed' }, 401);
    const dobNorm = normalizeDob(dobRaw);
    if (!dobNorm) return jsonResponse({ error: 'Recovery verification failed' }, 401);
    const storedDob = await env.EDIT_KEYS_KV.get('user_dob:' + username);
    if (!storedDob || storedDob.trim() !== dobNorm) return jsonResponse({ error: 'Recovery verification failed' }, 401);
    const recoveryRaw = await env.EDIT_KEYS_KV.get('user_recovery:' + username);
    let secretQuestions = []; if (recoveryRaw) { try { const r = JSON.parse(recoveryRaw); secretQuestions = Array.isArray(r.secretQuestions) ? r.secretQuestions : []; } catch (_) {} }
    for (let i = 0; i < 2; i++) {
      const qid = parseInt(questionIds[i], 10);
      const ans = (answers[i] || '').trim();
      const q = secretQuestions.find(x => x && String(x.questionId) === String(qid));
      if (!q || (q.answer || '').trim().toLowerCase() !== ans.toLowerCase()) return jsonResponse({ error: 'Recovery verification failed' }, 401);
    }
    await env.EDIT_KEYS_KV.delete('account_details_sent:' + username);
    const secret = env.JWT_SECRET || env.SESSION_SECRET;
    const token = secret ? await signJwt({ username: username, exp: Math.floor(Date.now() / 1000) + 900 }, secret) : null;
    return jsonResponse({ success: true, username: username, token });
  }

  if (!username || !accountEmail || !dobRaw || !questionId || !answer) return jsonResponse({ error: 'Recovery verification failed' }, 401);
  const dobNorm = normalizeDob(dobRaw);
  if (!dobNorm) return jsonResponse({ error: 'Recovery verification failed' }, 401);
  const storedAccountEmail = await env.EDIT_KEYS_KV.get('account_email:' + username);
  const storedDob = await env.EDIT_KEYS_KV.get('user_dob:' + username);
  const recoveryRaw = await env.EDIT_KEYS_KV.get('user_recovery:' + username);
  if (!storedAccountEmail || storedAccountEmail.toLowerCase() !== accountEmail) return jsonResponse({ error: 'Recovery verification failed' }, 401);
  if (!storedDob || storedDob.trim() !== dobNorm) return jsonResponse({ error: 'Recovery verification failed' }, 401);
  let secretQuestions = []; if (recoveryRaw) { try { const r = JSON.parse(recoveryRaw); secretQuestions = Array.isArray(r.secretQuestions) ? r.secretQuestions : []; } catch (_) {} }
  const q = secretQuestions.find(x => x && String(x.questionId) === String(questionId));
  if (!q || (q.answer || '').trim().toLowerCase() !== answer.toLowerCase()) return jsonResponse({ error: 'Recovery verification failed' }, 401);
  await env.EDIT_KEYS_KV.delete('account_details_sent:' + username);
  const secret = env.JWT_SECRET || env.SESSION_SECRET;
  const token = secret ? await signJwt({ username: username, exp: Math.floor(Date.now() / 1000) + 900 }, secret) : null;
  return jsonResponse({ success: true, username: username, token });
}

async function handleResetAccess(username, request, env) {
  if (!await isAdmin(request, env)) return jsonResponse({ error: 'Admin access required' }, 401);
  if (!env.EDIT_KEYS_KV) return jsonResponse({ error: 'KV not configured' }, 500);
  await env.EDIT_KEYS_KV.delete(`access_revoked:${username}`);
  return jsonResponse({ success: true, username });
}

async function handleRevokeAccess(username, request, env) {
  if (!await isAdmin(request, env)) return jsonResponse({ error: 'Admin access required' }, 401);
  if (!env.EDIT_KEYS_KV) return jsonResponse({ error: 'KV not configured' }, 500);
  await env.EDIT_KEYS_KV.put(`access_revoked:${username}`, '1');
  return jsonResponse({ success: true, username });
}


async function handleGetProfile(username, request, env) {
  const auth = await validateAuth(username, request, env);
  if (!auth.authorized) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!username || !env.EDIT_KEYS_KV) return jsonResponse({ error: 'Invalid request' }, 400);
  const firstName = await env.EDIT_KEYS_KV.get('user_first_name:' + username);
  const lastName = await env.EDIT_KEYS_KV.get('user_last_name:' + username);
  const accountEmail = await env.EDIT_KEYS_KV.get('account_email:' + username);
  const emailVerified = (await env.EDIT_KEYS_KV.get('email_verified:' + username)) === '1';
  const dob = await env.EDIT_KEYS_KV.get('user_dob:' + username);
  const dobMasked = (dob && dob.length >= 4) ? '**/**/' + dob.slice(-4) : '';
  return jsonResponse({
    firstName: firstName || '',
    lastName: lastName || '',
    accountEmail: accountEmail || '',
    emailVerified,
    dobMasked
  });
}

async function handlePutProfile(username, request, env) {
  const auth = await validateAuth(username, request, env);
  if (!auth.authorized) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!username || !env.EDIT_KEYS_KV) return jsonResponse({ error: 'Invalid request' }, 400);
  let body; try { body = await request.json(); } catch (_) { return jsonResponse({ error: 'Invalid request body' }, 400); }
  const firstName = (body.firstName || '').trim();
  const lastName = (body.lastName || body.surname || '').trim();
  const accountEmail = (body.accountEmail || '').trim();
  if (accountEmail && !accountEmail.includes('@')) return jsonResponse({ error: 'Valid account email required' }, 400);
  if (accountEmail) {
    const accountEmailLower = accountEmail.toLowerCase();
    const existingFolder = await env.EDIT_KEYS_KV.get('account_email_to_folder:' + accountEmailLower);
    if (existingFolder && existingFolder !== username) return jsonResponse({ error: 'This account email is already in use' }, 409);
  }
  if (firstName) await env.EDIT_KEYS_KV.put('user_first_name:' + username, firstName);
  if (lastName) await env.EDIT_KEYS_KV.put('user_last_name:' + username, lastName);
  const oldAccountEmail = await env.EDIT_KEYS_KV.get('account_email:' + username);
  const oldEmailNorm = (oldAccountEmail || '').trim().toLowerCase();
  const newEmailNorm = accountEmail ? accountEmail.trim().toLowerCase() : '';

  if (accountEmail && newEmailNorm !== oldEmailNorm) {
    const code = generateOtpCode();
    await env.EDIT_KEYS_KV.put('otp_email_change:' + username, code, { expirationTtl: 600 });
    await env.EDIT_KEYS_KV.put('pending_email_change:' + username, JSON.stringify({ newEmail: accountEmail.trim() }), { expirationTtl: 600 });
    const subject = 'Verify your new email - Digital Contact Page';
    const text = `Your 6-digit verification code is: ${code}\n\nThis code expires in 10 minutes. Use it in the Contact Editor to complete your email change.\n\nIf you did not request this, please sign in and change your password.`;
    const html = `<p>Your 6-digit verification code is: <strong>${code}</strong></p><p>This code expires in 10 minutes. Use it in the Contact Editor to complete your email change.</p><p>If you did not request this, please sign in and change your password.</p>`;
    const sent = await sendEmail(env, { to: accountEmail.trim(), subject, text, html, username });
    if (!sent.ok) return jsonResponse({ error: sent.error || 'Failed to send verification code' }, 500);
    await env.EDIT_KEYS_KV.delete('email_verified:' + username);
    await env.EDIT_KEYS_KV.delete('email_verified_admin:' + username);
    return jsonResponse({ success: true, otpSent: true, message: 'Verification code sent to your new email.' });
  }

  if (accountEmail) {
    if (oldAccountEmail) await env.EDIT_KEYS_KV.delete('account_email_to_folder:' + oldAccountEmail.toLowerCase());
    await env.EDIT_KEYS_KV.put('account_email:' + username, accountEmail);
    await env.EDIT_KEYS_KV.put('account_email_to_folder:' + accountEmail.toLowerCase(), username);
    if (!oldAccountEmail || oldAccountEmail.toLowerCase() !== accountEmail.toLowerCase()) {
      await env.EDIT_KEYS_KV.delete('email_verified:' + username);
    }
  }
  return jsonResponse({ success: true });
}

async function handleVerifyEmailChange(request, env) {
  const authHeader = request.headers.get('Authorization');
  const token = (authHeader && authHeader.startsWith('Bearer ')) ? authHeader.slice(7) : null;
  const secret = env.JWT_SECRET || env.SESSION_SECRET;
  if (!token || !secret) return jsonResponse({ error: 'Unauthorized' }, 401);
  const payload = await verifyJwt(token, secret);
  if (!payload || !payload.username) return jsonResponse({ error: 'Invalid or expired session' }, 401);
  const username = (payload.username || '').trim().toLowerCase();
  if (!username || !env.EDIT_KEYS_KV) return jsonResponse({ error: 'Invalid request' }, 400);
  let body; try { body = await request.json(); } catch (_) { return jsonResponse({ error: 'Invalid request body' }, 400); }
  const code = (body.code || '').trim().replace(/\D/g, '');
  if (code.length !== 6) return jsonResponse({ error: 'Invalid code' }, 400);
  const stored = await env.EDIT_KEYS_KV.get('otp_email_change:' + username);
  if (!stored || stored !== code) return jsonResponse({ error: 'Invalid or expired code' }, 400);
  const pendingRaw = await env.EDIT_KEYS_KV.get('pending_email_change:' + username);
  if (!pendingRaw) return jsonResponse({ error: 'No pending email change' }, 400);
  let newEmail;
  try { newEmail = JSON.parse(pendingRaw).newEmail; } catch (_) { return jsonResponse({ error: 'Invalid pending data' }, 400); }
  if (!newEmail || !newEmail.includes('@')) return jsonResponse({ error: 'Invalid email' }, 400);
  const oldAccountEmail = await env.EDIT_KEYS_KV.get('account_email:' + username);
  if (oldAccountEmail) await env.EDIT_KEYS_KV.delete('account_email_to_folder:' + oldAccountEmail.toLowerCase().trim());
  await env.EDIT_KEYS_KV.put('account_email:' + username, newEmail);
  await env.EDIT_KEYS_KV.put('account_email_to_folder:' + newEmail.trim().toLowerCase(), username);
  await env.EDIT_KEYS_KV.put('email_verified:' + username, '1');
  await env.EDIT_KEYS_KV.delete('otp_email_change:' + username);
  await env.EDIT_KEYS_KV.delete('pending_email_change:' + username);
  return jsonResponse({ success: true });
}

async function handleGetSecrets(username, request, env) {
  const auth = await validateAuth(username, request, env);
  if (!auth.authorized) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  if (!username || !env.EDIT_KEYS_KV) {
    return jsonResponse({ error: 'Invalid request' }, 400);
  }
  const accountEmail = await env.EDIT_KEYS_KV.get('account_email:' + username);
  const dob = await env.EDIT_KEYS_KV.get('user_dob:' + username);
  const recoveryRaw = await env.EDIT_KEYS_KV.get('user_recovery:' + username);
  const emailVerified = (await env.EDIT_KEYS_KV.get('email_verified:' + username)) === '1';
  const passwordSet = !!(await env.EDIT_KEYS_KV.get('user_password_hash:' + username));
  let secretQuestions = [];
  if (recoveryRaw) {
    try {
      const r = JSON.parse(recoveryRaw);
      secretQuestions = Array.isArray(r.secretQuestions) ? r.secretQuestions : [];
    } catch (_) {}
  }
  return jsonResponse({ accountEmail: accountEmail || '', dob: dob || '', secretQuestions, emailVerified, passwordSet });
}

async function handlePutSecrets(username, request, env) {
  const auth = await validateAuth(username, request, env);
  if (!auth.authorized) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  if (!username || !env.EDIT_KEYS_KV) {
    return jsonResponse({ error: 'Invalid request' }, 400);
  }
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return jsonResponse({ error: 'Invalid request body' }, 400);
  }
  const accountEmail = (body.accountEmail || '').trim();
  const password = (body.password || '').trim();
  const dobRaw = (body.dob || '').trim();
  const secretQuestions = Array.isArray(body.secretQuestions) ? body.secretQuestions : [];

  if (password && password.length < 8) {
    return jsonResponse({ error: 'Password must be at least 8 characters' }, 400);
  }
  if (accountEmail && !accountEmail.includes('@')) {
    return jsonResponse({ error: 'Valid account email required' }, 400);
  }
  if (accountEmail) {
    const accountEmailLower = accountEmail.toLowerCase();
    const existingFolder = await env.EDIT_KEYS_KV.get('account_email_to_folder:' + accountEmailLower);
    if (existingFolder && existingFolder !== username) {
      return jsonResponse({ error: 'This account email is already in use' }, 409);
    }
  }
  const dobNorm = dobRaw ? normalizeDob(dobRaw) : null;
  if (dobRaw && !dobNorm) {
    return jsonResponse({ error: 'Valid date of birth required (dd/mm/yyyy)' }, 400);
  }
  if (secretQuestions.length > 0) {
    const validIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const ids = secretQuestions.map(q => q.questionId);
    if (secretQuestions.length !== 3 || ids.some(id => !validIds.includes(id)) || new Set(ids).size !== 3) {
      return jsonResponse({ error: 'Exactly 3 distinct security questions required' }, 400);
    }
    for (const q of secretQuestions) {
      const a = (q.answer || '').trim();
      if (a.length < 4 || a.length > 30) {
        return jsonResponse({ error: 'Each security answer must be 4-30 characters' }, 400);
      }
    }
  }

  const oldAccountEmail = await env.EDIT_KEYS_KV.get('account_email:' + username);
  if (oldAccountEmail) {
    await env.EDIT_KEYS_KV.delete('account_email_to_folder:' + oldAccountEmail.toLowerCase());
  }
  if (accountEmail) {
    await env.EDIT_KEYS_KV.put('account_email:' + username, accountEmail);
    await env.EDIT_KEYS_KV.put('account_email_to_folder:' + accountEmail.toLowerCase(), username);
  } else if (oldAccountEmail) {
    await env.EDIT_KEYS_KV.delete('account_email:' + username);
  }
  if (dobNorm) {
    await env.EDIT_KEYS_KV.put('user_dob:' + username, dobNorm);
  } else {
    await env.EDIT_KEYS_KV.delete('user_dob:' + username);
  }
  if (secretQuestions.length === 3) {
    const existing = await env.EDIT_KEYS_KV.get('user_recovery:' + username);
    let dobForRecovery = dobNorm || (existing ? (JSON.parse(existing).dob || '') : '') || (await env.EDIT_KEYS_KV.get('user_dob:' + username)) || '';
    await env.EDIT_KEYS_KV.put('user_recovery:' + username, JSON.stringify({
      dob: dobForRecovery,
      secretQuestions: secretQuestions.map(q => ({ questionId: q.questionId, answer: (q.answer || '').trim() }))
    }));
  } else {
    await env.EDIT_KEYS_KV.delete('user_recovery:' + username);
  }
  if (password) {
    const pwHash = await hashPassword(password);
    await env.EDIT_KEYS_KV.put('user_password_hash:' + username, pwHash);
  }
  if (auth.isAdmin && typeof body.emailVerified === 'boolean') {
    if (body.emailVerified) {
      await env.EDIT_KEYS_KV.put('email_verified:' + username, '1');
      await env.EDIT_KEYS_KV.put('email_verified_admin:' + username, '1');
    } else {
      await env.EDIT_KEYS_KV.delete('email_verified:' + username);
      await env.EDIT_KEYS_KV.delete('email_verified_admin:' + username);
    }
  }
  return jsonResponse({ success: true });
}

// ============ Utilities ============

function encodeBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(base64) {
  const binary = atob(base64.replace(/\n/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Extract display fields from contact page HTML. Keep in sync with admin extractInfo(). */
function extractSummaryFromHtml(html) {
  const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const g = (label) => {
    const re = new RegExp(`<span class="label">${esc(label)}[^<]*</span><span class="value">([^<]+)</span>`);
    const m = html.match(re);
    if (!m) return '';
    const v = (m[1] || '').trim();
    return (v === '?' || !v) ? '' : v;
  };
  const em = html.match(/href="mailto:([^"]+)"/);
  const contactEmail = em ? em[1] : '';
  const dataTimestampMatch = html.match(/data-timestamp="([^"]+)"/);
  const dataUpdatedByMatch = html.match(/data-updated-by="([^"]+)"/);
  let lastUpdated = null;
  let updatedBy = null;
  if (dataTimestampMatch && dataUpdatedByMatch) {
    lastUpdated = dataTimestampMatch[1];
    updatedBy = dataUpdatedByMatch[1];
  } else {
    const lastUpdatedText = g('Last Updated') || g('Last updated');
    if (lastUpdatedText) {
      const byMatch = lastUpdatedText.match(/ by (Admin|User)$/);
      if (byMatch) {
        updatedBy = byMatch[1].toLowerCase();
        lastUpdated = null;
      }
    }
  }
  return {
    givenName: g('Given Names') || g('Name'),
    familyName: g('Family Name') || g('Surname'),
    contactEmail: contactEmail || '',
    lastUpdated,
    updatedBy
  };
}
