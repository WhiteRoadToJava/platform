import fs from 'node:fs';
import { open } from 'node:fs/promises';
import { Router } from 'express';
import { Deployment } from '../models/Deployment.js';
import { Service } from '../models/Service.js';
import { logPath } from '../builds/worker.js';
import { branchFor, environmentFor, isProduction, productionEnvironment } from '../lib/environments.js';
import { run } from '../lib/process.js';
import { HttpError } from '../lib/validation.js';

const FINAL_STATUSES = ['built', 'running', 'superseded', 'failed', 'cancelled'];
const MAX_CHUNK = 256 * 1024;

async function branchExists(repoUrl, branch) {
  const output = await run('git', ['ls-remote', '--heads', repoUrl, branch], { env: { GIT_TERMINAL_PROMPT: '0' } });
  return output.trim().length > 0;
}

export const deploymentsRouter = Router();

deploymentsRouter.post('/services/:id/deployments', async (req, res) => {
  const service = await Service.findById(req.params.id);
  if (!service) throw new HttpError(404, 'Service not found.');

  const environment = await environmentFor(service.project, req.body?.environmentId);

  const active = await Deployment.exists({
    service: service._id,
    environment: environment._id,
    status: { $in: ['queued', 'building', 'deploying'] },
  });
  if (active) throw new HttpError(409, 'A deployment for this service is already in progress in this environment.');

  const branch = branchFor(service, environment);
  let deployment;

  if (isProduction(environment) || (await branchExists(service.repoUrl, branch))) {
    deployment = await Deployment.create({ service: service._id, environment: environment._id, branch });
  } else {
    const productionEnv = await productionEnvironment(service.project);
    const production = await Deployment.findOne({
      service: service._id,
      environment: productionEnv._id,
      status: 'running',
    }).sort({ createdAt: -1 });
    if (!production) {
      throw new HttpError(
        409,
        `${service.repoUrl} has no "${branch}" branch, and production has no running version to reuse. Deploy production first.`,
      );
    }
    deployment = await Deployment.create({
      service: service._id,
      environment: environment._id,
      branch: production.branch,
      image: production.image,
      commitSha: production.commitSha,
      commitMessage: production.commitMessage,
      reusedFrom: production._id,
    });
  }
  fs.writeFileSync(logPath(deployment._id), `Queued at ${new Date().toISOString()}\n`);
  res.status(201).json(deployment);
});

deploymentsRouter.get('/services/:id/deployments', async (req, res) => {
  const service = await Service.findById(req.params.id);
  if (!service) throw new HttpError(404, 'Service not found.');
  const environment = await environmentFor(service.project, req.query.environmentId);
  const deployments = await Deployment.find({ service: service._id, environment: environment._id })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
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