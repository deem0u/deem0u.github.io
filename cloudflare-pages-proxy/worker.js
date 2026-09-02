/**
 * Front door for digiconid.danielmounnarath.com.
 * Fetches the same files from deem0u.github.io without a GitHub Pages
 * custom domain, so github.io is not redirected.
 * GitHub directory redirects (e.g. /myaccount → /myaccount/) are rewritten
 * onto this host instead of sending the browser to github.io.
 */
export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const dest = new URL(request.url);
    dest.hostname = 'deem0u.github.io';
    dest.protocol = 'https:';
    const res = await fetch(dest, {
      method: request.method,
      headers: request.headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'manual'
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('Location');
      if (loc) {
        const next = new URL(loc, dest);
        if (next.hostname === 'deem0u.github.io') {
          next.hostname = incoming.hostname;
          next.protocol = incoming.protocol;
          const headers = new Headers(res.headers);
          headers.set('Location', next.toString());
          return new Response(null, { status: res.status, headers });
        }
      }
    }
    return res;
  }
};
