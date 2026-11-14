import fs from 'node:fs';
import { open } from 'node:fs/promises';
import { Router } from 'express';
import { Deployment } from '../models/Deployment.js';
import { Service } from '../models/Service.js';
import { logPath } from '../builds/worker.js';
import { productionEnvironment } from '../lib/environments.js';
import { HttpError } from '../lib/validation.js';

const FINAL_STATUSES = ['built', 'running', 'superseded', 'failed', 'cancelled'];
const MAX_CHUNK = 256 * 1024;

export const deploymentsRouter = Router();

deploymentsRouter.post('/services/:id/deployments', async (req, res) => {
  const service = await Service.findById(req.params.id);
  if (!service) throw new HttpError(404, 'Service not found.');

  const active = await Deployment.exists({
    service: service._id,
    status: { $in: ['queued', 'building', 'deploying'] },
  });
  if (active) throw new HttpError(409, 'A deployment for this service is already in progress.');
  if (active) throw new HttpError(409, 'A build for this service is already queued or running.');

  const environment = await productionEnvironment(service.project);
  const deployment = await Deployment.create({
    service: service._id,
    environment: environment._id,
    branch: service.branch,
  });
  fs.writeFileSync(logPath(deployment._id), `Queued at ${new Date().toISOString()}\n`);
  res.status(201).json(deployment);
});

deploymentsRouter.get('/services/:id/deployments', async (req, res) => {
  const deployments = await Deployment.find({ service: req.params.id }).sort({ createdAt: -1 }).limit(20).lean();
  res.json(deployments);
});

deploymentsRouter.get('/deployments/:id', async (req, res) => {
  const deployment = await Deployment.findById(req.params.id).populate('service', 'name').lean();
  if (!deployment) throw new HttpError(404, 'Deployment not found.');
  res.json(deployment);
});

deploymentsRouter.get('/deployments/:id/log', async (req, res) => {
  const deployment = await Deployment.findById(req.params.id).select('status').lean();
  if (!deployment) throw new HttpError(404, 'Deployment not found.');

  const offset = Math.max(0, Number(req.query.offset) || 0);
  let text = '';
  let next = offset;

  try {
    const file = await open(logPath(deployment._id), 'r');
    try {
      const { size } = await file.stat();
      const length = Math.min(size - offset, MAX_CHUNK);
      if (length > 0) {
        const buffer = Buffer.alloc(length);
        await file.read(buffer, 0, length, offset);
        text = buffer.toString('utf8');
        next = offset + length;
      }
    } finally {
      await file.close();
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const done = FINAL_STATUSES.includes(deployment.status) && text === '';
  res.json({ text, offset: next, status: deployment.status, done });
});