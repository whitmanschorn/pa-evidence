import type { RequestHandler } from 'express';

// API responses carry member data, so no browser or proxy may cache them, and the browser must not sniff types.
export function securityHeaders(): RequestHandler {
  return (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  };
}
