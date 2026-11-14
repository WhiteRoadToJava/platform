import { Router } from 'express';
import { z } from 'zod';
import { Project } from '../models/Project.js';
import { Service } from '../models/Service.js';
import { HttpError, parseBody, slug } from '../lib/validation.js';
import { Variable } from '../models/Variable.js';

const serviceInput = z.object({
  name: z.string().trim().min(1, 'Enter a name.').max(60),
  slug,
  repoUrl: z
    .string()
    .trim()
    .regex(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/, 'Enter a GitHub URL like https://github.com/owner/repo.'),
  branch: z
    .string()
    .trim()
    .regex(/^(?!-)[A-Za-z0-9._/-]+$/, 'Use a valid branch name, like main or feature/login.')
    .max(100),
     buildType: z.enum(['auto', 'dockerfile', 'java', 'react', 'node']),
  internalPort: z.coerce.number().int().min(1).max(65535),
  subdomain: z.union([slug, z.literal('')]),
  pathPrefix: z.union([z.string().regex(/^\/[a-z0-9/_-]*[a-z0-9_-]$/, 'Use a path like /api.'), z.literal('')]),
  stripPrefix: z.boolean(),
  healthcheckPath: z.union([z.string().startsWith('/', 'Start the path with /.'), z.literal('')]),
  memoryLimitMb: z.coerce.number().int().min(64).max(8192),
  volumes: z.array(z.object({ containerPath: z.string().startsWith('/', 'Start the path with /.') })).max(5),
});

async function assertRouteIsFree(project, input, excludeId) {
  if (!input.subdomain) return;
  const filter = { subdomain: input.subdomain, pathPrefix: input.pathPrefix };
  if (excludeId) filter._id = { $ne: excludeId };
  const candidates = await Service.find(filter).populate('project', 'baseDomain name');
  const clash = candidates.find((s) => s.project?.baseDomain === project.baseDomain);
  if (clash) {
    const route = `${input.subdomain}.${project.baseDomain}${input.pathPrefix || '/'}`;
    throw new HttpError(409, `${route} is already used by ${clash.name} in ${clash.project.name}.`);
  }
}

export const servicesRouter = Router();

servicesRouter.post('/projects/:projectId/services', async (req, res) => {
  const project = await Project.findById(req.params.projectId);
  if (!project) throw new HttpError(404, 'Project not found.');
  const input = parseBody(serviceInput, req.body);
  input.repoUrl = input.repoUrl.replace(/\.git$/, '');
  await assertRouteIsFree(project, input);
  const service = await Service.create({ ...input, project: project._id });
  res.status(201).json(service);
});

servicesRouter.get('/services/:id', async (req, res) => {
  const service = await Service.findById(req.params.id).populate('project').lean();
  if (!service) throw new HttpError(404, 'Service not found.');
  res.json(service);
});

servicesRouter.put('/services/:id', async (req, res) => {
  const service = await Service.findById(req.params.id);
  if (!service) throw new HttpError(404, 'Service not found.');
  const project = await Project.findById(service.project);
  const input = parseBody(serviceInput, req.body);
  input.repoUrl = input.repoUrl.replace(/\.git$/, '');
  await assertRouteIsFree(project, input, service._id);
  service.set(input);
  await service.save();
  res.json(service);
});

servicesRouter.delete('/services/:id', async (req, res) => {
  const service = await Service.findByIdAndDelete(req.params.id);
  if (!service) throw new HttpError(404, 'Service not found.');
  await Variable.deleteMany({ service: service._id });
  res.json({ ok: true });
});