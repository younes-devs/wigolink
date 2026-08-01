export function createSecurityHeaders({
  newRequestId,
  supabaseUrl = '',
  supabaseRealtimeOrigin = '',
}) {
  const realtimeConnectSrc = supabaseUrl
    ? ` ${supabaseUrl} ${supabaseRealtimeOrigin}`
    : '';
  const googleOrigin = 'https://accounts.google.com';
  const contentSecurityPolicy = `default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' ${googleOrigin}; frame-src ${googleOrigin}; connect-src 'self' ${googleOrigin}${realtimeConnectSrc}; font-src 'self' data:`;

  return function securityHeaders(req, res, next) {
    const requestId = req.headers['x-request-id'] || newRequestId();
    req.requestId = String(requestId);
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', contentSecurityPolicy);
    return next();
  };
}
