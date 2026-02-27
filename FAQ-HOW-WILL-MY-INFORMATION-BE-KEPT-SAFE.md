# How will my information be kept safe?

*This FAQ is for **users and prospects** — people who use or are considering the site. It answers common questions in plain language, without technical jargon.*

---

## Who is this for?

You might be someone who:
- Has or is thinking about creating a contact page on the site
- Signs in to “My Account” to edit your details
- Wants to know what happens to your name, email, and other information

This page explains how your information is protected and what we’ve done to keep it safe.

---

## What information do you hold about me?

- **What you give us:** When you create an account or edit your contact page, we store things like your name, email, contact number, and the content of your contact page. If you set up account recovery, we also store your date of birth and your answers to security questions (only to help you recover access if you forget your password).
- **Who can see it:** Only you (when you’re signed in) and the site’s administrators (who need it to run the service and help you if you ask for support). We don’t sell your data or share it with third parties for marketing.

---

## How is my information protected?

- **Access control**  
  Your data is tied to your account. Only someone who can sign in as you (with your email and password, or through the recovery process) can see or change your details. The site’s administrators can see user data only for running the service and helping you when you need it.

- **Secure connections**  
  When you sign in or when your browser talks to our systems, the connection is encrypted. That means other people on the same network can’t easily read what you send or receive.

- **Limits on sign-in attempts**  
  We limit how many times someone can try to log in or request a recovery code from the same place in a short time. That helps stop someone from guessing passwords or recovery codes by trying over and over.

- **No sharing of your data with other websites**  
  Our systems are set up so that only our own site (and our own tools) can use the parts that handle your login and data. Other websites can’t use your session to read your information.

- **Careful handling of messages and alerts**  
  Text that comes from the server or from forms is treated as plain text when we show it to you, so it can’t be used to run hidden code in your browser. That helps keep your session and account safe.

- **Strong recovery and setup**  
  When you or an administrator uses “forgot password” or similar features, we use longer, one-time codes and the same limits on attempts. Our own setup tools also require a long, secret key so only authorised people can change critical settings.

---

## What have you done recently to improve security?

We’ve carried out a security review and made a number of improvements:

- **Tighter control over who can use the site’s API**  
  Only our official site (and our own development tools) can talk to the systems that handle your data. Other websites can’t.

- **Better handling of admin and user sessions**  
  Administrator access is no longer stored in a way that stays on the device after the browser is closed, which reduces the chance of someone else using it later.

- **Limits on repeated attempts**  
  We now limit how many login or recovery attempts can be made from the same place in a short time. That makes it much harder for anyone to guess passwords or recovery codes.

- **No technical error details shown to the public**  
  If something goes wrong on the server, you’ll see a simple message like “Something went wrong.” We don’t show technical details that could help someone attack the site.

- **Safer display of messages**  
  Any messages we show you (e.g. alerts or banners) are shown in a safe way so they can’t run hidden code. That protects your session and account.

- **Stronger recovery and setup**  
  Recovery codes are longer and harder to guess. Our internal setup process requires a long, secret key so only authorised people can change it.

We’ve also added clearer documentation and checks for things like the secrecy of login tokens and how we log when an administrator views sensitive recovery data.

---

## What if I forget my password or lose access?

You can use the account recovery flow. You’ll need the email address (or user name) for your account and to answer your security questions. We may send you a one-time code by email. We limit how often these steps can be tried, so no one can easily guess their way in.

---

## Who should I contact if I’m worried about my information?

Use the contact details given on the site (e.g. the “Contact” or “Email me” link). If you think your password or recovery details have been compromised, change your password as soon as you can and, if the site offers it, review your security questions.

---

## Summary

- We keep your information only for running the service and helping you.
- Access is restricted to you (when signed in) and to the site’s administrators when needed.
- We use encrypted connections, limits on sign-in and recovery attempts, and safe display of messages.
- We’ve recently strengthened how we control access, protect sessions, and handle errors and recovery.
- If you have questions or concerns about your data, use the site’s contact details.

*For a more technical summary of the security review and fixes, see SECURITY-AUDIT-SUMMARY.md. That document is aimed at operators and auditors.*
