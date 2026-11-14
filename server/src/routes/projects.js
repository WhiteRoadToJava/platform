import { Router } from 'express';
import { z } from 'zod';
import { Project } from '../models/Project.js';
import { Environment } from '../models/Environment.js';
import { Service } from '../models/Service.js';
import { HttpError, domain, parseBody, slug } from '../lib/validation.js';

const projectInput = z.object({
  name: z.string().trim().min(1, 'Enter a name.').max(60),
  slug,
  baseDomain: domain,
});

export const projectsRouter = Router();

projectsRouter.get('/', async (req, res) => {
  const projects = await Project.find().sort({ name: 1 }).lean();
  const services = await Service.find().select('name slug project').lean();
  res.json(
    projects.map((project) => ({
      ...project,
      services: services.filter((s) => s.project.equals(project._id)),
    })),
  );
});

projectsRouter.post('/', async (req, res) => {
  const input = parseBody(projectInput, req.body);
  const project = await Project.create(input);
  await Environment.create({ project: project._id, name: 'production', kind: 'production' });
  res.status(201).json(project);
});

projectsRouter.get('/:id', async (req, res) => {
  const project = await Project.findById(req.params.id).lean();
  if (!project) throw new HttpError(404, 'Project not found.');
  const [environments, services] = await Promise.all([
    Environment.find({ project: project._id }).select('-database.passwordEncrypted').lean(),
    Service.find({ project: project._id }).sort({ name: 1 }).lean(),
  ]);
  res.json({ ...project, environments, services });
});

projectsRouter.put('/:id', async (req, res) => {
  const input = parseBody(projectInput, req.body);
  const project = await Project.findByIdAndUpdate(req.params.id, input, { new: true, runValidators: true });
  if (!project) throw new HttpError(404, 'Project not found.');
  res.json(project);
});

projectsRouter.delete('/:id', async (req, res) => {
  const serviceCount = await Service.countDocuments({ project: req.params.id });
  if (serviceCount > 0) {
    throw new HttpError(409, 'Remove the services in this project before deleting it.');
  }
  const project = await Project.findByIdAndDelete(req.params.id);
  if (!project) throw new HttpError(404, 'Project not found.');
  await Environment.deleteMany({ project: project._id });
  res.json({ ok: true });
});