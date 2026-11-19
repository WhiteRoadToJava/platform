import { Router } from 'express';
import { z } from 'zod';
import { Environment } from '../models/Environment.js';
import { Project } from '../models/Project.js';
import { copyDatabase, provisionDatabase } from '../lib/databases.js';
import { productionEnvironment } from '../lib/environments.js';
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