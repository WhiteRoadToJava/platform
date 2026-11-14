import { Router } from 'express';
import { z } from 'zod';
import { Admin } from '../models/Admin.js';
import { verifyPassword } from '../auth/password.js';
import { checkLoginAllowed, recordFailure, clearFailures } from '../auth/rateLimit.js';
import {
  SESSION_COOKIE,
  createSession,
  deleteSession,
  readSessionToken,
  sessionCookieOptions,
} from '../auth/sessions.js';

const loginSchema = z.object({ password: z.string().min(1).max(256) });

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const gate = checkLoginAllowed(req.ip);
  if (!gate.allowed) {
    const minutes = Math.ceil(gate.retryAfterMs / 60000);
    return res.status(429).json({
      error: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    });
  }

  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Enter your password.' });
  }

  const admin = await Admin.findOne();
  if (!admin) {
    return res.status(503).json({
      error: 'No password is set yet. Run "npm run set-password" on the server.',
    });
  }

  const valid = await verifyPassword(parsed.data.password, admin.passwordHash);
  if (!valid) {
    recordFailure(req.ip);
    return res.status(401).json({ error: 'Incorrect password.' });
  }

  clearFailures(req.ip);
  const token = await createSession(req);
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
  res.json({ ok: true });
});

authRouter.post('/logout', async (req, res) => {
  await deleteSession(readSessionToken(req));
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  res.json({ signedIn: true });
});