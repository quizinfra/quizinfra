addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

/* -------------------------------------------------------------
   Content‑Security‑Policy – a “max‑security” baseline.
   * No external scripts (everything must come from the same origin).
   * Inline event‑handlers are allowed via 'unsafe-inline' because the
     app currently uses them; you can later refactor to remove them.
   * style‑src also needs 'unsafe-inline' because the page contains
     a <style> block.
   ------------------------------------------------------------- */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests"
].join('; ');

async function handleRequest(request) {
  // Let GitHub Pages serve the file first.
  const response = await fetch(request);

  // Clone the response so we can safely edit headers.
  const newHeaders = new Headers(response.headers);
  newHeaders.set('Content-Security-Policy', CSP);
  newHeaders.set('X-Content-Type-Options', 'nosniff');
  newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  newHeaders.set('X-Frame-Options', 'DENY');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
