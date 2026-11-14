import { findSession, readSessionToken } from '../auth/sessions.js';

const PUBLIC_ROUTES = [
  ['GET', '/health'],
  ['POST', '/auth/login'],
  ['POST', '/auth/logout'],
  ['GET', '/internal/traefik'],
];

export async function requireAuth(req, res, next) {
  const isPublic = PUBLIC_ROUTES.some(([method, path]) => req.method === method && req.path === path);
  if (isPublic) return next();

  const session = await findSession(readSessionToken(req));
  if (!session) {
    return res.status(401).json({ error: 'Sign in to continue.' });
  }
  req.session = session;
  next();
}