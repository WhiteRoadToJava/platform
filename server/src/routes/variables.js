import { Router } from 'express';
import { z } from 'zod';
import { Service } from '../models/Service.js';
import { Variable } from '../models/Variable.js';
import { decrypt, encrypt } from '../lib/crypto.js';
import { environmentFor } from '../lib/environments.js';
import { resolveVariables } from '../lib/variables.js';
import { HttpError, parseBody } from '../lib/validation.js';

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const KEY_MESSAGE = 'Use letters, numbers and underscores, starting with a letter or underscore.';

const variableInput = z.object({
  key: z.string().trim().regex(KEY_PATTERN, KEY_MESSAGE).max(128),
  value: z.string().max(32768),
  sensitive: z.boolean().optional(),
});

const sensitiveInput = z.object({ sensitive: z.boolean() });

const importInput = z.object({ text: z.string().max(200000) });

async function loadContext(serviceId, environmentId) {
  const service = await Service.findById(serviceId);
  if (!service) throw new HttpError(404, 'Service not found.');
  const environment = await environmentFor(service.project, environmentId);
  return { service, environment };
}

async function upsertVariable(service, environment, key, value, sensitive) {
  const update = { valueEncrypted: encrypt(value) };
  if (sensitive !== undefined) update.sensitive = sensitive;
  await Variable.findOneAndUpdate({ service: service._id, environment: environment._id, key }, update, {
    upsert: true,
  });
}

function parseEnvText(text) {
  const entries = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const separator = trimmed.indexOf('=');
    if (separator === -1) throw new HttpError(400, `Line ${index + 1} has no "=". Use KEY=value.`);
    const key = trimmed.slice(0, separator).trim().replace(/^export\s+/, '');
    let value = trimmed.slice(separator + 1).trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    if (!KEY_PATTERN.test(key)) throw new HttpError(400, `Line ${index + 1}: ${key} is not a valid name. ${KEY_MESSAGE}`);
    entries.push({ key, value });
  });
  return entries;
}

export const variablesRouter = Router();

variablesRouter.get('/services/:id/variables', async (req, res) => {
  const { service, environment } = await loadContext(req.params.id, req.query.environmentId);
  const variables = await Variable.find({ service: service._id, environment: environment._id })
    .select('key sensitive updatedAt')
    .sort({ key: 1 })
    .lean();
  res.json(variables);
});

variablesRouter.put('/services/:id/variables', async (req, res) => {
  const { service, environment } = await loadContext(req.params.id, req.body?.environmentId);
  const { key, value, sensitive } = parseBody(variableInput, req.body);
  await upsertVariable(service, environment, key, value, sensitive);
  res.json({ ok: true });
});

variablesRouter.post('/services/:id/variables/import', async (req, res) => {
  const { service, environment } = await loadContext(req.params.id, req.body?.environmentId);
  const { text } = parseBody(importInput, req.body);
  const entries = parseEnvText(text);
  if (!entries.length) throw new HttpError(400, 'No variables found. Paste lines like KEY=value.');
  for (const { key, value } of entries) {
    await upsertVariable(service, environment, key, value);
  }
  res.json({ count: entries.length });
});

variablesRouter.get('/services/:id/variables/resolved', async (req, res) => {
  const { service, environment } = await loadContext(req.params.id, req.query.environmentId);
  const { variables, errors, warnings } = await resolveVariables(service, environment);
  const list = [...variables.entries()]
    .map(([key, { source }]) => ({ key, source }))
    .sort((a, b) => a.key.localeCompare(b.key));
  res.json({ variables: list, errors, warnings });
});

variablesRouter.get('/variables/:id/value', async (req, res) => {
  const variable = await Variable.findById(req.params.id);
  if (!variable) throw new HttpError(404, 'Variable not found.');
  try {
    res.json({ value: decrypt(variable.valueEncrypted) });
  } catch {
    throw new HttpError(409, `${variable.key} cannot be decrypted. Delete it and add it again.`);
  }
});

variablesRouter.patch('/variables/:id', async (req, res) => {
  const { sensitive } = parseBody(sensitiveInput, req.body);
  const variable = await Variable.findByIdAndUpdate(req.params.id, { sensitive }, { returnDocument: 'after' });
  if (!variable) throw new HttpError(404, 'Variable not found.');
  res.json({ ok: true });
});

variablesRouter.delete('/variables/:id', async (req, res) => {
  const variable = await Variable.findByIdAndDelete(req.params.id);
  if (!variable) throw new HttpError(404, 'Variable not found.');
  res.json({ ok: true });
});