import { createHash, randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { Session } from '../models/Session.js';

export const SESSION_COOKIE = 'platform_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(req) {
  const token = randomBytes(32).toString('base64url');
  await Session.create({
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  return token;
}

export async function findSession(token) {
  if (!token) return null;
  return Session.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } });
}

export async function deleteSession(token) {
  if (token) await Session.deleteOne({ tokenHash: hashToken(token) });
}

export function readSessionToken(req) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.COOKIE_SECURE,
    path: '/',
    maxAge: SESSION_TTL_MS,
  };
}