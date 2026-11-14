import { Router } from 'express';
import { Environment } from '../models/Environment.js';
import { Project } from '../models/Project.js';
import { provisionDatabase } from '../lib/databases.js';
import { HttpError } from '../lib/validation.js';

export const environmentsRouter = Router();

environmentsRouter.post('/environments/:id/database', async (req, res) => {
  const environment = await Environment.findById(req.params.id);
  if (!environment) throw new HttpError(404, 'Environment not found.');
  const project = await Project.findById(environment.project);
  await provisionDatabase(project, environment);
  res.status(201).json({ name: environment.database.name, username: environment.database.username });
});