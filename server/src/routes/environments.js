import { Router } from 'express';
import { z } from 'zod';
import { Environment } from '../models/Environment.js';
import { Project } from '../models/Project.js';
import { copyDatabase, provisionDatabase } from '../lib/databases.js';
import { productionEnvironment } from '../lib/environments.js';
import { deleteEnvironment, startEnvironment, stopEnvironment } from '../lib/lifecycle.js';
import { run } from '../lib/process.js';
import { HttpError, parseBody, slug } from '../lib/validation.js';

const environmentInput = z.object({
  name: slug.refine((value) => value !== 'production', 'production is reserved.').refine(
    (value) => value.length <= 12,
    'Use 12 characters or fewer, like dev or staging.',
  ),
  branch: z
    .string()
    .trim()
    .regex(/^(?!-)[A-Za-z0-9._/-]+$/, 'Use a valid branch name, like dev.')
    .max(100),
});
const refreshInput = z.object({ confirm: z.string() });
const deleteInput = z.object({ confirm: z.string(), deleteData: z.boolean() });

const refreshing = new Set();

async function restartContainers(environment) {
  const ids = (await run('docker', ['ps', '-q', '--filter', `label=platform.environment=${environment._id}`]))
    .split('\n')
    .filter(Boolean);
  if (ids.length) await run('docker', ['restart', ...ids]);
  return ids.length;
}




export const environmentsRouter = Router();

environmentsRouter.post('/projects/:id/environments', async (req, res) => {
  const project = await Project.findById(req.params.id);
  if (!project) throw new HttpError(404, 'Project not found.');
  const input = parseBody(environmentInput, req.body);
  const environment = await Environment.create({ project: project._id, kind: 'preview', ...input });
  res.status(201).json(environment);
});

environmentsRouter.post('/environments/:id/database', async (req, res) => {
  const environment = await Environment.findById(req.params.id);
  if (!environment) throw new HttpError(404, 'Environment not found.');
  const project = await Project.findById(environment.project);
  await provisionDatabase(project, environment);
  res.status(201).json({ name: environment.database.name, username: environment.database.username });
});

environmentsRouter.post('/environments/:id/database/refresh', async (req, res) => {
  const environment = await Environment.findById(req.params.id);
  if (!environment) throw new HttpError(404, 'Environment not found.');
  if (environment.kind === 'production') throw new HttpError(400, 'Production is the source. It is never overwritten.');

  const { confirm } = parseBody(refreshInput, req.body);
  if (confirm !== environment.name) throw new HttpError(400, `Type ${environment.name} to confirm.`);

  const production = await productionEnvironment(environment.project);
  if (!production.database?.name) throw new HttpError(409, 'Production has no database to copy.');
  if (!environment.database?.name) throw new HttpError(409, `Create a database for ${environment.name} first.`);

  const key = environment._id.toString();
  if (refreshing.has(key)) throw new HttpError(409, 'A refresh is already running for this environment.');
  refreshing.add(key);
  try {
    const collections = await copyDatabase(production, environment); environment.database.refreshedAt = new Date();
    await environment.save();
    const restarted = await restartContainers(environment);
    res.json({ collections, restarted, refreshedAt: environment.database.refreshedAt });
  } finally {
    refreshing.delete(key);
  }
});


async function loadEnvironment(id) {
  const environment = await Environment.findById(id);
  if (!environment) throw new HttpError(404, 'Environment not found.');
  return environment;
}

environmentsRouter.post('/environments/:id/stop', async (req, res) => {
  const environment = await loadEnvironment(req.params.id);
  const stopped = await stopEnvironment(environment, 'manual');
  if (!stopped) throw new HttpError(409, `Nothing is running in ${environment.name}.`);
  res.json({ stopped });
});

environmentsRouter.post('/environments/:id/start', async (req, res) => {
  const environment = await loadEnvironment(req.params.id);
  const started = await startEnvironment(environment);
  res.json({ started });
});

environmentsRouter.delete('/environments/:id', async (req, res) => {
  const environment = await loadEnvironment(req.params.id);
  const { confirm, deleteData } = parseBody(deleteInput, req.body);
  if (confirm !== environment.name) throw new HttpError(400, `Type ${environment.name} to confirm.`);
  const project = await Project.findById(environment.project);
  await deleteEnvironment(environment, project, { deleteData });
  res.json({ ok: true });
});