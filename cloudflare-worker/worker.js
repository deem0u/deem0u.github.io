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
 * - admin:key = admin password
 * - admin:email = admin recovery email
 * - admin:setup_complete = "true" if setup is done
 */

const CONFIG = {
  owner: 'deem0u',
  repo: 'deem0u.github.io',
  branch: 'main'
};

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
    const path = url.pathname;

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

      // Page routes: GET/POST /api/page/{username} or /api/page/{username}/{contactpagename}
      if (request.method === 'GET' && path.startsWith('/api/page/')) {
        const { username, contactpagename } = parsePagePath(path);
        return await handleGetPage(username, contactpagename, request, env);
      }
      if (request.method === 'POST' && path.startsWith('/api/page/')) {
        const { username, contactpagename } = parsePagePath(path);
        return await handleUpdatePage(username, contactpagename, request, env);
      }

      // Admin routes
      if (request.method === 'GET' && path === '/api/pages') {
        return await handleListPages(request, env);
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
        const username = path.replace('/api/profile/', '').replace(/\/$/, '');
        return await handleGetProfile(username, request, env);
      }
      if (request.method === 'PUT' && path.startsWith('/api/profile/')) {
        const username = path.replace('/api/profile/', '').replace(/\/$/, '');
        return await handlePutProfile(username, request, env);
      }
      if (request.method === 'GET' && path.startsWith('/api/secrets/')) {
        const username = path.replace('/api/secrets/', '').replace(/\/$/, '');
        return await handleGetSecrets(username, request, env);
      }
      if (request.method === 'PUT' && path.startsWith('/api/secrets/')) {
        const username = path.replace('/api/secrets/', '').replace(/\/$/, '');
        return await handlePutSecrets(username, request, env);
      }

      return jsonResponse({ error: 'Not found' }, 404);
    } catch (error) {
      return jsonResponse({ error: error.message }, 500);
    }
  }
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
 * Send email via the relay (Vercel serverless with Nodemailer + Gmail SMTP).
 * Requires env: EMAIL_RELAY_URL, EMAIL_RELAY_SECRET.
 * When EMAIL_SEND_RESTRICTED is not 'false', all emails go to EMAIL_RESTRICTION_RECIPIENT.
 * To go live: set EMAIL_SEND_RESTRICTED='false' in Worker secrets.
 * @param {object} env - Worker env
 * @param {{ to: string, subject: string, html?: string, text?: string }} opts
 * @returns {{ ok: boolean, error?: string }}
 */
async function sendEmail(env, { to, subject, html, text }) {
  const url = env.EMAIL_RELAY_URL;
  const secret = env.EMAIL_RELAY_SECRET;
  if (!url || !secret) return { ok: false, error: 'Email not configured' };
  const restricted = env.EMAIL_SEND_RESTRICTED !== 'false';
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
  const { adminKey, adminEmail } = body;

  if (!adminKey || adminKey.length < 8) {
    return jsonResponse({ error: 'Admin key must be at least 8 characters' }, 400);
  }
  if (!adminEmail || !adminEmail.includes('@')) {
    return jsonResponse({ error: 'Valid email required for recovery' }, 400);
  }

  await env.EDIT_KEYS_KV.put('admin:key', adminKey);
  await env.EDIT_KEYS_KV.put('admin:email', adminEmail.toLowerCase());
  await env.EDIT_KEYS_KV.put('admin:setup_complete', 'true');

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

  // Step 2: Verify code and return password
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
    
    // Code is valid - delete it and return password
    await env.EDIT_KEYS_KV.delete('admin:recovery_code');
    const adminKey = await env.EDIT_KEYS_KV.get('admin:key');
    
    return jsonResponse({ 
      success: true,
      step: 'complete',
      adminKey,
      message: 'Recovery successful' 
    });
  }

  // Step 1: Generate code and return mailto link
  const recoveryCode = generateRecoveryCode();
  const expiresAt = Date.now() + (10 * 60 * 1000); // 10 minutes
  
  await env.EDIT_KEYS_KV.put('admin:recovery_code', JSON.stringify({ recoveryCode, expiresAt }));
  
  const subject = 'Contact Editor - Recovery Code';
  const body_text = `Your recovery code is:\n\n${recoveryCode}\n\nThis code expires in 10 minutes.\n\nIf you did not request this, please ignore this email.`;
  
  return jsonResponse({ 
    success: true,
    step: 'code_sent',
    email: storedEmail,
    mailto: `mailto:${storedEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body_text)}`,
    message: 'Recovery code generated' 
  });
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
  const { adminKey } = body;

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
  if ((await env.EDIT_KEYS_KV.get(`access_revoked:${username}`)) === '1') {
    return jsonResponse({ error: 'Access has been revoked. Please contact support.' }, 403);
  }
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
  const sent = await sendEmail(env, { to: accountEmail, subject, text, html });
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
  const sent = await sendEmail(env, { to: accountEmail, subject, text, html });
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
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Contact - ' + esc(givenName) + ' ' + esc(familyName) + '</title><style>' + css + '</style></head><body><div class="container"><div class="last-updated-block"><span class="last-updated-titles">' + titles + '</span><span class="last-updated-display" data-timestamp="' + now + '" data-updated-by="user">' + em + '</span></div><h1>' + sectionTitle + '</h1><div class="info"><span class="label">' + lblGiven + '</span><span class="value">' + esc(givenName) + '</span></div><div class="info"><span class="label">' + lblFamily + '</span><span class="value">' + esc(familyName) + '</span></div><div class="info"><span class="label">' + lblEmail + '</span><span class="value"><a href="mailto:' + esc(contactEmail) + '">' + esc(contactEmail) + '</a></span></div><div class="info"><span class="label">' + lblMobile + '</span><span class="value">' + mobileHtml + '</span></div><div class="info"><span class="label">' + lblCountry + '</span><span class="value">' + homeCountryHtml + '</span></div><div class="info"><span class="label">' + lblDest + '</span>' + destHtml + '</div><div class="info additional-info"><span class="label">' + lblAdditional + '</span>' + additionalHtml + '</div></div>' + script + '</body></html>';
}

// ============ Auth Helpers ============

async function isAdmin(request, env) {
  const adminKey = request.headers.get('X-Admin-Key');
  if (!adminKey || !env.EDIT_KEYS_KV) return false;
  const storedKey = await env.EDIT_KEYS_KV.get('admin:key');
  return storedKey && adminKey === storedKey;
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

  // Store account email and profile names in KV when provided
  if (env.EDIT_KEYS_KV) {
    if (accountEmailVal && accountEmailVal.includes('@')) {
      const accountEmailLower = accountEmailVal.toLowerCase();
      await env.EDIT_KEYS_KV.put('account_email:' + usernameTrim, accountEmailVal);
      await env.EDIT_KEYS_KV.put('account_email_to_folder:' + accountEmailLower, usernameTrim);
    }
    if (firstName) await env.EDIT_KEYS_KV.put('user_first_name:' + usernameTrim, firstName);
    if (lastName) await env.EDIT_KEYS_KV.put('user_last_name:' + usernameTrim, lastName);
  }

  return jsonResponse({
    success: true,
    username,
    contactpagename,
    sha: data.content.sha,
    url: pageUrl(username, contactpagename)
  });
}

/**
 * DELETE /api/page/{username} - Delete entire user (all contact pages under user/{username}/) and KV (admin only)
 */
async function handleDeletePage(username, _contactpagename, request, env) {
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
  }

  return jsonResponse({
    success: true,
    username,
    message: `Page ${username} deleted`
  });
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

  return jsonResponse({ content, sha: data.sha, username, contactpagename });
}

async function handleUpdatePage(username, contactpagename, request, env) {
  const auth = await validateAuth(username, request, env);
  if (!auth.authorized) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const body = await request.json();
  const { content, sha } = body;

  if (!content || !sha) {
    return jsonResponse({ error: 'Missing content or sha' }, 400);
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


async function handleGetAccountEmails(request, env) {
  if (!await isAdmin(request, env)) {
    return jsonResponse({ error: 'Admin access required' }, 401);
  }
  if (!env.EDIT_KEYS_KV) {
    return jsonResponse({ accountEmails: {}, accountDetailsSent: {}, emailVerification: {} });
  }
  const list = await env.EDIT_KEYS_KV.list({ prefix: 'account_email:' });
  const accountEmails = {};
  const usernames = [];
  for (const key of list.keys) {
    if (key.name.startsWith('account_email_to_folder:')) continue;
    const username = key.name.replace('account_email:', '');
    const value = await env.EDIT_KEYS_KV.get(key.name);
    if (value && username) { accountEmails[username] = value; usernames.push(username); }
  }
  const sentList = await env.EDIT_KEYS_KV.list({ prefix: 'account_details_sent:' });
  const accountDetailsSent = {};
  for (const key of sentList.keys) {
    const username = key.name.replace('account_details_sent:', '');
    if (username) accountDetailsSent[username] = true;
  }
  const emailVerification = {};
  for (const username of usernames) {
    const byAdmin = (await env.EDIT_KEYS_KV.get('email_verified_admin:' + username)) === '1';
    const byUser = (await env.EDIT_KEYS_KV.get('email_verified:' + username)) === '1';
    emailVerification[username] = byAdmin ? 'admin' : byUser ? 'user' : null;
  }
  return jsonResponse({ accountEmails, accountDetailsSent, emailVerification });
}

async function handleGetAccountProfiles(request, env) {
  if (!await isAdmin(request, env)) return jsonResponse({ error: 'Admin access required' }, 401);
  let body; try { body = await request.json(); } catch (_) { return jsonResponse({ error: 'Invalid request' }, 400); }
  const usernames = Array.isArray(body.usernames) ? body.usernames : [];
  const profiles = {};
  if (!env.EDIT_KEYS_KV) return jsonResponse({ profiles });
  for (const username of usernames) {
    const firstName = await env.EDIT_KEYS_KV.get('user_first_name:' + username);
    const lastName = await env.EDIT_KEYS_KV.get('user_last_name:' + username);
    const accountEmail = await env.EDIT_KEYS_KV.get('account_email:' + username);
    profiles[username] = { firstName: firstName || '', lastName: lastName || '', accountEmail: accountEmail || '' };
  }
  return jsonResponse({ profiles });
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
  for (const username of usernames) {
    const accountEmail = await env.EDIT_KEYS_KV.get('account_email:' + username);
    const dob = await env.EDIT_KEYS_KV.get('user_dob:' + username);
    const recoveryRaw = await env.EDIT_KEYS_KV.get('user_recovery:' + username);
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
    const revoked = await env.EDIT_KEYS_KV.get(`access_revoked:${username}`);
    if (revoked !== '1') editKeys[username] = '1';
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
