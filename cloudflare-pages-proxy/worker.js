/**
 * Front door for digiconid.danielmounnarath.com.
 * Fetches the same files from deem0u.github.io without setting a GitHub
 * Pages custom domain, so github.io is not redirected.
 */
export default {
  async fetch(request) {
    const dest = new URL(request.url);
    dest.hostname = 'deem0u.github.io';
    dest.protocol = 'https:';
    return fetch(dest, {
      method: request.method,
      headers: request.headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'manual'
    });
  }
};
