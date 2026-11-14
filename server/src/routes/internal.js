import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { config } from '../config.js';
import { buildTraefikConfig } from '../routing/traefik.js';

function tokenMatches(provided) {
  if (typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(config.TRAEFIK_PROVIDER_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const internalRouter = Router();

internalRouter.get('/traefik', async (req, res) => {
  if (!tokenMatches(req.get('x-provider-token'))) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json(await buildTraefikConfig());
});