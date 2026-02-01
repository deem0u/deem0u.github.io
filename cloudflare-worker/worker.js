/**
 * Contact Page Editor - Cloudflare Worker Backend
 * 
 * Features:
 * - User edit key management (stored in KV)
 * - Admin authentication with email-based recovery
 * - GitHub integration for page updates
 * 
 * KV Storage Structure:
 * - edit_key:{folder} = user's edit key
 * - admin:key = admin password
 * - admin:email = admin recovery email
 * - admin:setup_complete = "true" if setup is done
 */

const CONFIG = {
  owner: 'deem0u',
  repo: 'deem0u.github.io',
  branch: 'main'
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Edit-Key, X-Admin-Key',
  'Access-Control-Max-Age': '86400',
};

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

      // Auth check
      if (request.method === 'POST' && path === '/api/auth') {
        return await handleAuth(request, env);
      }


      // Check username availability (no auth)
      if (request.method === 'GET' && path.startsWith('/api/check-username/')) {
        const folder = path.replace('/api/check-username/', '').replace(/\/$/, '');
        return await handleCheckUsername(folder, env);
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

      // Route: DELETE /api/page/{folder} - Delete page (admin only)
      if (request.method === 'DELETE' && path.startsWith('/api/page/')) {
        const folder = path.replace('/api/page/', '').replace(/\/$/, '');
        return await handleDeletePage(folder, request, env);
      }

      // Page routes
      if (request.method === 'GET' && path.startsWith('/api/page/')) {
        const folder = path.replace('/api/page/', '').replace(/\/$/, '');
        return await handleGetPage(folder, request, env);
      }
      if (request.method === 'POST' && path.startsWith('/api/page/')) {
        const folder = path.replace('/api/page/', '').replace(/\/$/, '');
        return await handleUpdatePage(folder, request, env);
      }

      // Admin routes
      if (request.method === 'GET' && path === '/api/pages') {
        return await handleListPages(request, env);
      }
      if (request.method === 'GET' && path === '/api/account-emails') {
        return await handleGetAccountEmails(request, env);
      }
      if (request.method === 'POST' && path.startsWith('/api/account-details-sent/')) {
        const folder = path.replace('/api/account-details-sent/', '').replace(/\/$/, '');
        return await handleAccountDetailsSent(folder, request, env);
      }
      if (request.method === 'POST' && path === '/api/secrets-status') {
        return await handleSecretsStatus(request, env);
      }
      if (request.method === 'GET' && path === '/api/keys') {
        return await handleGetKeys(request, env);
      }
      if (request.method === 'POST' && path.startsWith('/api/keys/')) {
        const folder = path.replace('/api/keys/', '').replace(/\/$/, '');
        return await handleCreateKey(folder, request, env);
      }
      if (request.method === 'PUT' && path.startsWith('/api/keys/')) {
        const folder = path.replace('/api/keys/', '').replace(/\/$/, '');
        return await handleRegenerateKey(folder, request, env);
      }
      if (request.method === 'DELETE' && path.startsWith('/api/keys/')) {
        const folder = path.replace('/api/keys/', '').replace(/\/$/, '');
        return await handleDeleteKey(folder, request, env);
      }
      if (request.method === 'GET' && path.startsWith('/api/secrets/')) {
        const folder = path.replace('/api/secrets/', '').replace(/\/$/, '');
        return await handleGetSecrets(folder, request, env);
      }
      if (request.method === 'PUT' && path.startsWith('/api/secrets/')) {
        const folder = path.replace('/api/secrets/', '').replace(/\/$/, '');
        return await handlePutSecrets(folder, request, env);
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

/**
 * Send email via the relay (Vercel serverless with Nodemailer + Gmail SMTP).
 * Requires env: EMAIL_RELAY_URL, EMAIL_RELAY_SECRET.
 * @param {object} env - Worker env
 * @param {{ to: string, subject: string, html?: string, text?: string }} opts
 * @returns {{ ok: boolean, error?: string }}
 */
async function sendEmail(env, { to, subject, html, text }) {
  const url = env.EMAIL_RELAY_URL;
  const secret = env.EMAIL_RELAY_SECRET;
  if (!url || !secret) return { ok: false, error: 'Email not configured' };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Secret': secret
      },
      body: JSON.stringify({ to, subject, html: html || text, text: text || '' })
    });
    if (!res.ok) {
      const err = await res.text();
      return { ok: false, error: err };
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
// ============ Signup (User-driven page creation) ============


async function handleCheckUsername(folder, env) {
  if (!folder || !/^[a-zA-Z0-9_-]{3,32}$/.test(folder)) {
    return jsonResponse({ available: false, error: 'Invalid username format' });
  }
  const reserved = ['admin', 'edit', 'signup', 'home', 'add', 'terms-and-privacy'];
  if (reserved.includes(folder.toLowerCase())) {
    return jsonResponse({ available: false });
  }
  if (!env.GITHUB_TOKEN) {
    return jsonResponse({ available: true });
  }
  const res = await fetch(
    `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${folder}?ref=${CONFIG.branch}`,
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
  const surname = (body.surname || '').trim();
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

  const folder = username;
  const reserved = ['admin', 'edit', 'signup', 'home', 'add', 'terms-and-privacy', 'styles.css', 'countries-data.js', 'form-descriptions.js'];
  if (reserved.includes(folder)) {
    return jsonResponse({ error: 'This username is reserved' }, 400);
  }

  const checkRes = await fetch(
    `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${folder}?ref=${CONFIG.branch}`,
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

  const content = generateContactPageHTML(firstName, surname, contactPageEmail, '', '', '', '', '', '', '', '');
  const createRes = await fetch(
    `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${folder}/index.html`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'ContactPageEditor/1.0'
      },
      body: JSON.stringify({
        message: `Create contact page: ${folder} (signup)`,
        content: encodeBase64(content),
        branch: CONFIG.branch
      })
    }
  );
  if (!createRes.ok) {
    const err = await createRes.json();
    return jsonResponse({ error: err.message || 'Failed to create page' }, createRes.status);
  }

  const newKey = generateKey();
  await env.EDIT_KEYS_KV.put(`edit_key:${folder}`, newKey);
  await env.EDIT_KEYS_KV.put(`account_email_to_folder:${accountEmailLower}`, folder);
  await env.EDIT_KEYS_KV.put(`account_email:${folder}`, accountEmail);
  await env.EDIT_KEYS_KV.put(`user_dob:${folder}`, dobNorm);
  await env.EDIT_KEYS_KV.put(`user_recovery:${folder}`, JSON.stringify({
    dob: dobNorm,
    secretQuestions: secretQuestions.map(q => ({ questionId: q.questionId, answer: (q.answer || '').trim() }))
  }));

  return jsonResponse({
    success: true,
    folder,
    key: newKey,
    viewLink: `https://${CONFIG.owner}.github.io/${folder}/`,
    editLink: `https://${CONFIG.owner}.github.io/edit/?folder=${folder}&key=${newKey}`
  });
}

function normalizeDob(input) {
  const s = (input || '').trim().replace(/\s+/g, '');
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = parseInt(m[1], 10), mo = parseInt(m[2], 10), y = parseInt(m[3], 10);
  if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 1900 || y > 2100) return null;
  return String(d).padStart(2, '0') + '/' + String(mo).padStart(2, '0') + '/' + y;
}

function generateContactPageHTML(firstName, surname, email, mobile, mobileLink, homeCountry, destName, destAddress, destPhone, destEmail, additionalInfo) {
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
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Contact - ' + esc(firstName) + ' ' + esc(surname) + '</title><style>' + css + '</style></head><body><div class="container"><div class="last-updated-block"><span class="last-updated-titles">' + titles + '</span><span class="last-updated-display" data-timestamp="' + now + '" data-updated-by="user">' + em + '</span></div><h1>' + sectionTitle + '</h1><div class="info"><span class="label">' + lblGiven + '</span><span class="value">' + esc(firstName) + '</span></div><div class="info"><span class="label">' + lblFamily + '</span><span class="value">' + esc(surname) + '</span></div><div class="info"><span class="label">' + lblEmail + '</span><span class="value"><a href="mailto:' + esc(email) + '">' + esc(email) + '</a></span></div><div class="info"><span class="label">' + lblMobile + '</span><span class="value">' + mobileHtml + '</span></div><div class="info"><span class="label">' + lblCountry + '</span><span class="value">' + homeCountryHtml + '</span></div><div class="info"><span class="label">' + lblDest + '</span>' + destHtml + '</div><div class="info additional-info"><span class="label">' + lblAdditional + '</span>' + additionalHtml + '</div></div>' + script + '</body></html>';
}

// ============ Auth Helpers ============

async function isAdmin(request, env) {
  const adminKey = request.headers.get('X-Admin-Key');
  if (!adminKey || !env.EDIT_KEYS_KV) return false;
  const storedKey = await env.EDIT_KEYS_KV.get('admin:key');
  return storedKey && adminKey === storedKey;
}

async function getEditKey(folder, env) {
  if (!env.EDIT_KEYS_KV) return null;
  return await env.EDIT_KEYS_KV.get(`edit_key:${folder}`);
}

async function validateAuth(folder, request, env) {
  const adminKey = request.headers.get('X-Admin-Key');
  const editKey = request.headers.get('X-Edit-Key');

  // Check admin
  if (adminKey && env.EDIT_KEYS_KV) {
    const storedAdmin = await env.EDIT_KEYS_KV.get('admin:key');
    if (storedAdmin && adminKey === storedAdmin) {
      return { authorized: true, isAdmin: true };
    }
  }

  // Check user key
  if (editKey && env.EDIT_KEYS_KV) {
    const storedKey = await env.EDIT_KEYS_KV.get(`edit_key:${folder}`);
    if (storedKey && editKey === storedKey) {
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
  const { folder, content, accountEmail } = body;

  if (!folder || !content) {
    return jsonResponse({ error: 'Missing folder or content' }, 400);
  }

  const folderTrim = folder.trim().toLowerCase();
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

  // Validate folder name (alphanumeric, hyphens, underscores only)
  if (!/^[a-zA-Z0-9_-]+$/.test(folder)) {
    return jsonResponse({ error: 'Invalid folder name. Use only letters, numbers, hyphens, and underscores.' }, 400);
  }

  // Check reserved names
  if (['admin', 'edit', 'signup', 'home', 'add', 'terms-and-privacy', 'styles.css', 'countries-data.js', 'form-descriptions.js'].includes(folder.toLowerCase())) {
    return jsonResponse({ error: 'This folder name is reserved' }, 400);
  }

  // Check if folder already exists
  const checkResponse = await fetch(
    `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${folder}?ref=${CONFIG.branch}`,
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

  // Create the file
  const response = await fetch(
    `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${folder}/index.html`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'ContactPageEditor/1.0'
      },
      body: JSON.stringify({
        message: `Create contact page: ${folder}`,
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

  // Store account email in KV (user secrets) when provided
  if (accountEmailVal && accountEmailVal.includes('@') && env.EDIT_KEYS_KV) {
    const accountEmailLower = accountEmailVal.toLowerCase();
    await env.EDIT_KEYS_KV.put('account_email:' + folderTrim, accountEmailVal);
    await env.EDIT_KEYS_KV.put('account_email_to_folder:' + accountEmailLower, folderTrim);
  }

  return jsonResponse({
    success: true,
    folder,
    sha: data.content.sha,
    url: `https://${CONFIG.owner}.github.io/${folder}/`
  });
}

/**
 * DELETE /api/page/{folder} - Delete a contact page (admin only)
 */
async function handleDeletePage(folder, request, env) {
  if (!await isAdmin(request, env)) {
    return jsonResponse({ error: 'Admin access required' }, 401);
  }

  // Get the file's SHA first
  const getResponse = await fetch(
    `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${folder}/index.html?ref=${CONFIG.branch}`,
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

  // Delete the file
  const deleteResponse = await fetch(
    `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${folder}/index.html`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'ContactPageEditor/1.0'
      },
      body: JSON.stringify({
        message: `Delete contact page: ${folder}`,
        sha: fileData.sha,
        branch: CONFIG.branch
      })
    }
  );

  if (!deleteResponse.ok) {
    const error = await deleteResponse.json();
    return jsonResponse({ error: error.message || 'Failed to delete page' }, deleteResponse.status);
  }

  // Also delete all KV data for this user
  if (env.EDIT_KEYS_KV) {
    const accountEmail = await env.EDIT_KEYS_KV.get(`account_email:${folder}`);
    await env.EDIT_KEYS_KV.delete(`edit_key:${folder}`);
    await env.EDIT_KEYS_KV.delete(`account_email:${folder}`);
    if (accountEmail && accountEmail.includes('@')) {
      await env.EDIT_KEYS_KV.delete(`account_email_to_folder:${accountEmail.toLowerCase().trim()}`);
    }
    await env.EDIT_KEYS_KV.delete(`user_dob:${folder}`);
    await env.EDIT_KEYS_KV.delete(`user_recovery:${folder}`);
    await env.EDIT_KEYS_KV.delete(`account_details_sent:${folder}`);
  }

  return jsonResponse({
    success: true,
    folder,
    message: `Page ${folder} deleted`
  });
}

async function handleGetPage(folder, request, env) {
  const auth = await validateAuth(folder, request, env);
  if (!auth.authorized) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const response = await fetch(
    `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${folder}/index.html?ref=${CONFIG.branch}`,
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

  return jsonResponse({ content, sha: data.sha, folder });
}

async function handleUpdatePage(folder, request, env) {
  const auth = await validateAuth(folder, request, env);
  if (!auth.authorized) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const body = await request.json();
  const { content, sha } = body;

  if (!content || !sha) {
    return jsonResponse({ error: 'Missing content or sha' }, 400);
  }

  const response = await fetch(
    `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${folder}/index.html`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'ContactPageEditor/1.0'
      },
      body: JSON.stringify({
        message: `Update contact: ${folder}${auth.isAdmin ? ' (admin)' : ''}`,
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
    url: `https://${CONFIG.owner}.github.io/${folder}/`
  });
}

// ============ Admin Routes ============

async function handleListPages(request, env) {
  if (!await isAdmin(request, env)) {
    return jsonResponse({ error: 'Admin access required' }, 401);
  }

  const response = await fetch(
    `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents?ref=${CONFIG.branch}`,
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
  const folders = contents
    .filter(item => item.type === 'dir' && !item.name.startsWith('.') && !['admin', 'edit', 'signup', 'home', 'terms-and-privacy'].includes(item.name.toLowerCase()))
    .map(item => item.name);

  const pages = [];
  for (const folder of folders) {
    try {
      const folderResponse = await fetch(
        `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${folder}?ref=${CONFIG.branch}`,
        {
          headers: {
            'Authorization': `token ${env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'ContactPageEditor/1.0'
          }
        }
      );
      const folderContents = await folderResponse.json();
      if (folderContents.some(f => f.name === 'index.html')) {
        pages.push(folder);
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
    return jsonResponse({ accountEmails: {}, accountDetailsSent: {} });
  }
  const list = await env.EDIT_KEYS_KV.list({ prefix: 'account_email:' });
  const accountEmails = {};
  for (const key of list.keys) {
    if (key.name.startsWith('account_email_to_folder:')) continue;
    const folder = key.name.replace('account_email:', '');
    const value = await env.EDIT_KEYS_KV.get(key.name);
    if (value && folder) accountEmails[folder] = value;
  }
  const sentList = await env.EDIT_KEYS_KV.list({ prefix: 'account_details_sent:' });
  const accountDetailsSent = {};
  for (const key of sentList.keys) {
    const folder = key.name.replace('account_details_sent:', '');
    if (folder) accountDetailsSent[folder] = true;
  }
  return jsonResponse({ accountEmails, accountDetailsSent });
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
  const folders = Array.isArray(body.folders) ? body.folders : [];
  const statuses = {};
  if (!env.EDIT_KEYS_KV) {
    for (const f of folders) statuses[f] = { hasAccountEmail: false, hasDob: false, hasSecretQuestions: false, secretsComplete: false };
    return jsonResponse({ statuses });
  }
  for (const folder of folders) {
    const accountEmail = await env.EDIT_KEYS_KV.get('account_email:' + folder);
    const dob = await env.EDIT_KEYS_KV.get('user_dob:' + folder);
    const recoveryRaw = await env.EDIT_KEYS_KV.get('user_recovery:' + folder);
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
    statuses[folder] = { hasAccountEmail, hasDob, hasSecretQuestions, secretsComplete };
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

  const list = await env.EDIT_KEYS_KV.list({ prefix: 'edit_key:' });
  const editKeys = {};

  for (const key of list.keys) {
    const folder = key.name.replace('edit_key:', '');
    const value = await env.EDIT_KEYS_KV.get(key.name);
    if (value) editKeys[folder] = value;
  }

  return jsonResponse({ editKeys });
}

async function handleCreateKey(folder, request, env) {
  if (!await isAdmin(request, env)) {
    return jsonResponse({ error: 'Admin access required' }, 401);
  }

  if (!env.EDIT_KEYS_KV) {
    return jsonResponse({ error: 'KV not configured' }, 500);
  }

  const existing = await env.EDIT_KEYS_KV.get(`edit_key:${folder}`);
  if (existing) {
    return jsonResponse({ error: 'Key exists. Use PUT to regenerate.' }, 409);
  }

  const newKey = generateKey();
  await env.EDIT_KEYS_KV.put(`edit_key:${folder}`, newKey);
  await env.EDIT_KEYS_KV.delete(`account_details_sent:${folder}`);

  return jsonResponse({ success: true, folder, key: newKey });
}

async function handleAccountDetailsSent(folder, request, env) {
  if (!await isAdmin(request, env)) {
    return jsonResponse({ error: 'Admin access required' }, 401);
  }
  if (!folder || !env.EDIT_KEYS_KV) {
    return jsonResponse({ error: 'Invalid request' }, 400);
  }
  await env.EDIT_KEYS_KV.put(`account_details_sent:${folder}`, '1');
  return jsonResponse({ success: true });
}

async function handleRecoveryCheck(request, env) {
  if (!env.EDIT_KEYS_KV) return jsonResponse({ error: 'KV not configured' }, 500);
  let body; try { body = await request.json(); } catch (_) { return jsonResponse({ error: 'Invalid request' }, 400); }
  const username = (body.username || '').trim().toLowerCase();
  if (!username || username.length < 3) return jsonResponse({ exists: false, canRecover: false });
  const existingKey = await env.EDIT_KEYS_KV.get('edit_key:' + username);
  if (!existingKey) return jsonResponse({ exists: false, canRecover: false });
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
  const folder = await env.EDIT_KEYS_KV.get('account_email_to_folder:' + accountEmail);
  if (!folder) return jsonResponse({ exists: false, canRecover: false });
  const existingKey = await env.EDIT_KEYS_KV.get('edit_key:' + folder);
  if (!existingKey) return jsonResponse({ exists: false, canRecover: false });
  const storedEmail = await env.EDIT_KEYS_KV.get('account_email:' + folder);
  const dob = await env.EDIT_KEYS_KV.get('user_dob:' + folder);
  const recoveryRaw = await env.EDIT_KEYS_KV.get('user_recovery:' + folder);
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
    const newKey = generateKey();
    await env.EDIT_KEYS_KV.put('edit_key:' + username, newKey);
    await env.EDIT_KEYS_KV.delete('account_details_sent:' + username);
    return jsonResponse({ success: true, folder: username, key: newKey });
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
  const newKey = generateKey();
  await env.EDIT_KEYS_KV.put('edit_key:' + username, newKey);
  await env.EDIT_KEYS_KV.delete('account_details_sent:' + username);
  return jsonResponse({ success: true, folder: username, key: newKey });
}

async function handleRegenerateKey(folder, request, env) {
  if (!await isAdmin(request, env)) {
    return jsonResponse({ error: 'Admin access required' }, 401);
  }

  if (!env.EDIT_KEYS_KV) {
    return jsonResponse({ error: 'KV not configured' }, 500);
  }

  const newKey = generateKey();
  await env.EDIT_KEYS_KV.put(`edit_key:${folder}`, newKey);
  await env.EDIT_KEYS_KV.delete(`account_details_sent:${folder}`);

  return jsonResponse({ success: true, folder, key: newKey });
}

async function handleDeleteKey(folder, request, env) {
  if (!await isAdmin(request, env)) {
    return jsonResponse({ error: 'Admin access required' }, 401);
  }

  if (!env.EDIT_KEYS_KV) {
    return jsonResponse({ error: 'KV not configured' }, 500);
  }

  const accountEmail = await env.EDIT_KEYS_KV.get(`account_email:${folder}`);
  await env.EDIT_KEYS_KV.delete(`edit_key:${folder}`);
  await env.EDIT_KEYS_KV.delete(`account_email:${folder}`);
  if (accountEmail && accountEmail.includes('@')) {
    await env.EDIT_KEYS_KV.delete(`account_email_to_folder:${accountEmail.toLowerCase().trim()}`);
  }
  await env.EDIT_KEYS_KV.delete(`user_dob:${folder}`);
  await env.EDIT_KEYS_KV.delete(`user_recovery:${folder}`);
  await env.EDIT_KEYS_KV.delete(`account_details_sent:${folder}`);

  return jsonResponse({ success: true, folder });
}


async function handleGetSecrets(folder, request, env) {
  const auth = await validateAuth(folder, request, env);
  if (!auth.authorized) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  if (!folder || !env.EDIT_KEYS_KV) {
    return jsonResponse({ error: 'Invalid request' }, 400);
  }
  const accountEmail = await env.EDIT_KEYS_KV.get('account_email:' + folder);
  const dob = await env.EDIT_KEYS_KV.get('user_dob:' + folder);
  const recoveryRaw = await env.EDIT_KEYS_KV.get('user_recovery:' + folder);
  let secretQuestions = [];
  if (recoveryRaw) {
    try {
      const r = JSON.parse(recoveryRaw);
      secretQuestions = Array.isArray(r.secretQuestions) ? r.secretQuestions : [];
    } catch (_) {}
  }
  return jsonResponse({ accountEmail: accountEmail || '', dob: dob || '', secretQuestions });
}

async function handlePutSecrets(folder, request, env) {
  const auth = await validateAuth(folder, request, env);
  if (!auth.authorized) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  if (!folder || !env.EDIT_KEYS_KV) {
    return jsonResponse({ error: 'Invalid request' }, 400);
  }
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return jsonResponse({ error: 'Invalid request body' }, 400);
  }
  const accountEmail = (body.accountEmail || '').trim();
  const dobRaw = (body.dob || '').trim();
  const secretQuestions = Array.isArray(body.secretQuestions) ? body.secretQuestions : [];

  if (accountEmail && !accountEmail.includes('@')) {
    return jsonResponse({ error: 'Valid account email required' }, 400);
  }
  if (accountEmail) {
    const accountEmailLower = accountEmail.toLowerCase();
    const existingFolder = await env.EDIT_KEYS_KV.get('account_email_to_folder:' + accountEmailLower);
    if (existingFolder && existingFolder !== folder) {
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

  const oldAccountEmail = await env.EDIT_KEYS_KV.get('account_email:' + folder);
  if (oldAccountEmail) {
    await env.EDIT_KEYS_KV.delete('account_email_to_folder:' + oldAccountEmail.toLowerCase());
  }
  if (accountEmail) {
    await env.EDIT_KEYS_KV.put('account_email:' + folder, accountEmail);
    await env.EDIT_KEYS_KV.put('account_email_to_folder:' + accountEmail.toLowerCase(), folder);
  } else if (oldAccountEmail) {
    await env.EDIT_KEYS_KV.delete('account_email:' + folder);
  }
  if (dobNorm) {
    await env.EDIT_KEYS_KV.put('user_dob:' + folder, dobNorm);
  } else {
    await env.EDIT_KEYS_KV.delete('user_dob:' + folder);
  }
  if (secretQuestions.length === 3) {
    const existing = await env.EDIT_KEYS_KV.get('user_recovery:' + folder);
    let dobForRecovery = dobNorm || (existing ? (JSON.parse(existing).dob || '') : '') || (await env.EDIT_KEYS_KV.get('user_dob:' + folder)) || '';
    await env.EDIT_KEYS_KV.put('user_recovery:' + folder, JSON.stringify({
      dob: dobForRecovery,
      secretQuestions: secretQuestions.map(q => ({ questionId: q.questionId, answer: (q.answer || '').trim() }))
    }));
  } else {
    await env.EDIT_KEYS_KV.delete('user_recovery:' + folder);
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
