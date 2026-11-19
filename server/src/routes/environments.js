import { Router } from 'express';
import { z } from 'zod';
import { Environment } from '../models/Environment.js';
import { Project } from '../models/Project.js';
import { provisionDatabase } from '../lib/databases.js';
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