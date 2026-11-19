import { Router } from 'express';
import { Deployment } from '../models/Deployment.js';
import { Service } from '../models/Service.js';
import { run } from '../lib/process.js';
import { HttpError } from '../lib/validation.js';
import { containerName, environmentFor } from '../lib/environments.js';
import { Project } from '../models/Project.js';
import { listSavedLogs, readContainerLogs, readSavedLog } from '../monitor/logs.js';

export const logsRouter = Router();

logsRouter.get('/services/:id/logs', async (req, res) => {
  const service = await Service.findById(req.params.id);
  if (!service) throw new HttpError(404, 'Service not found.');

   const [project, environment] = await Promise.all([
    Project.findById(service.project),
    environmentFor(service.project, req.query.environmentId),
  ]);
  const container = containerName(project, service, environment);
  try {
    await run('docker', ['inspect', '--format', '{{.Id}}', container]);
  } catch {
    throw new HttpError(404, 'This service has no container in this environment yet. Deploy it first.');
  }
  const lines = Math.min(Math.max(Number(req.query.lines) || 300, 10), 2000);
  res.json({ container, text: await readContainerLogs(container, lines) });
});

logsRouter.get('/deployments/:id/saved-logs', async (req, res) => {
  const deployment = await Deployment.findById(req.params.id).select('_id').lean();
  if (!deployment) throw new HttpError(404, 'Deployment not found.');
  res.json(await listSavedLogs(deployment._id.toString()));
});

logsRouter.get('/deployments/:id/saved-logs/:name', async (req, res) => {
  const deployment = await Deployment.findById(req.params.id).select('_id').lean();
  if (!deployment) throw new HttpError(404, 'Deployment not found.');
  const text = await readSavedLog(deployment._id.toString(), req.params.name);
  if (text === null) throw new HttpError(404, 'Log not found.');
  res.json({ text });
});