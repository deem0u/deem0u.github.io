/**
 * Send DigiCon pages from the GitHub host to the public custom domain.
 * Leaves the github.io root and /marama/ alone.
 */
(function () {
  var CANONICAL = 'digiconid.danielmounnarath.com';
  var host = (location.hostname || '').toLowerCase();
  if (host !== 'deem0u.github.io') return;
  var path = location.pathname || '/';
  if (path === '/' || path === '/index.html') return;
  if (path === '/marama' || path.indexOf('/marama/') === 0) return;
  location.replace('https://' + CANONICAL + path + location.search + location.hash);
})();
