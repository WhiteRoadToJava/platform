import { Environment } from '../models/Environment.js';
import { hostsOf } from './hosts.js';
import { HttpError } from './validation.js';

export async function productionEnvironment(projectId) {
  const environment = await Environment.findOne({ project: projectId, kind: 'production' });
  if (!environment) throw new HttpError(500, 'This project has no production environment.');
  return environment;
}

export async function environmentFor(projectId, environmentId) {
  if (!environmentId) return productionEnvironment(projectId);
  const environment = await Environment.findOne({ _id: environmentId, project: projectId });
  if (!environment) throw new HttpError(404, 'Environment not found in this project.');
  return environment;
}

export function isProduction(environment) {
  return !environment || environment.kind === 'production';
}

export function containerName(project, service, environment) {
  if (isProduction(environment)) return `${project.slug}-${service.slug}`;
  return `${project.slug}-${environment.name}-${service.slug}`;
}

export function hostsFor(service, project, environment) {
  const production = hostsOf(service, project);
  if (isProduction(environment) || !production.length) return production;
  return [`${environment.name}-${service.subdomain || project.slug}.${project.baseDomain}`];
}

export function branchFor(service, environment) {
  return isProduction(environment) ? service.branch : environment.branch;
}