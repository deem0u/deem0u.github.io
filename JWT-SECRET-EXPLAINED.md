# JWT Secret — What It Is and What You Need to Know

Plain-language explanation of the **JWT secret** in this project: what it does, why it matters, and how to set it.

---

## What is it?

When a **user** (not an admin) signs in to **My Account** with their email and password, the Worker doesn’t send their password back to the browser. Instead it creates a **token** (a short string) that means “this person is logged in as username X.” The browser stores that token and sends it with every request (e.g. “load my contact pages”, “save my profile”). The Worker then **checks the token** to know who is making the request.

That token is a **JWT** (JSON Web Token). It’s like a signed slip: it contains the username and an expiry time, and it’s **signed** with a secret that only the Worker knows. Signing means: only someone who has that secret can create a valid token or change what’s inside it without the Worker noticing.

The **JWT secret** is that secret. In your project it’s the value you set in Cloudflare under the name **JWT_SECRET** (or, for backwards compatibility, **SESSION_SECRET**). The Worker uses it to:

- **Sign** the token when the user logs in (so the token can’t be forged by someone who doesn’t have the secret).
- **Verify** the token on every later request (so it knows the token wasn’t tampered with and was issued by this Worker).

So: **JWT secret = the key the Worker uses to create and validate user login tokens.**

---

## Why does it matter?

- **If the secret is weak or guessable:** Someone could guess it (or try many possibilities) and then **create their own tokens**. They could make a token that says “I am user Alice” and call your API as Alice — without ever knowing Alice’s password. So the secret must be **long and random** so it can’t be guessed.
- **If the secret is leaked** (e.g. copied from your Cloudflare dashboard, or committed to a repo): Anyone with that value can forge tokens and sign in as any user. So you must **keep it private** and only store it in Cloudflare as a **Secret** (not in code or in a file you commit).
- **If you use different secrets in different places** (e.g. one value in production and another in staging): A token created in one environment won’t verify in the other. So use **one** secret per environment and document the name (we use **JWT_SECRET** as the main name).

---

## What you need to do

1. **Set it in Cloudflare**  
   Workers & Pages → your Worker → **Settings** → **Variables and Secrets** → **Add** → **Secret**  
   - **Name:** `JWT_SECRET` (preferred; the code also accepts `SESSION_SECRET` if you already use that).  
   - **Value:** A **long, random** string (e.g. at least 32 characters). Use a password generator or something like `openssl rand -base64 32` and paste the result.  
   - Save. Never put this value in your repo or in `wrangler.toml` as plain text.

2. **Use one name**  
   Prefer **JWT_SECRET**. If you have both **JWT_SECRET** and **SESSION_SECRET** set, the Worker uses **JWT_SECRET** first. You can keep **SESSION_SECRET** for backwards compatibility or remove it and use only **JWT_SECRET**.

3. **Keep it strong**  
   No short or guessable values (e.g. `"secret"`, `"myjwtkey"`). Long and random is the rule.

4. **If you think it was leaked**  
   Generate a **new** long random value and update **JWT_SECRET** in Cloudflare. All existing user tokens will then fail verification (users will need to sign in again). That’s expected and correct: you’ve invalidated the old “signed slips.”

---

## Where it’s used in this project

- **Worker** (`worker.js`): When a user signs in (email + password or OTP), the Worker calls `signJwt({ username, exp }, secret)` and returns that token to the browser. On every later request that needs “who is this user?”, it reads the `Authorization: Bearer <token>` header and calls `verifyJwt(token, secret)`. The `secret` comes from `env.JWT_SECRET || env.SESSION_SECRET`.
- **My Account** (`myaccount/index.html`): After sign-in, the token is stored in `sessionStorage` and sent with API requests. The Worker uses the JWT secret only on the server; the browser never sees the secret.

---

## Quick checklist

| Do | Don’t |
|----|--------|
| Set **JWT_SECRET** (or **SESSION_SECRET**) in Cloudflare as a **Secret** | Put the value in code or in a file you commit |
| Use a long, random value (32+ characters) | Use short or guessable values like `"secret"` |
| Use the same secret for all requests in one environment | Use different secrets in different places without reason |
| Rotate the secret (set a new value) if you suspect it was leaked | Share the secret or store it in plain text |

---

**Summary:** The JWT secret is the key the Worker uses to sign and verify user login tokens. Set it in Cloudflare as **JWT_SECRET**, keep it long and random, and never commit it. If it’s weak or leaked, someone could forge tokens and sign in as any user.
