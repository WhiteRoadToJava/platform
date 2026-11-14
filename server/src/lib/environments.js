import { Environment } from '../models/Environment.js';
import { HttpError } from './validation.js';

export async function productionEnvironment(projectId) {
  const environment = await Environment.findOne({ project: projectId, kind: 'production' });
  if (!environment) throw new HttpError(500, 'This project has no production environment.');
  return environment;
}