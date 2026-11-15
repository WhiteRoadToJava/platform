import { Project } from '../models/Project.js';
import { Service } from '../models/Service.js';
import { hostsOf } from '../lib/hosts.js';

export function containerName(project, service) {
  return `${project.slug}-${service.slug}`;
}

export async function buildTraefikConfig() {
  const [projects, services] = await Promise.all([
    Project.find().lean(),
    Service.find().lean(),
  ]);
  const projectsById = new Map(projects.map((p) => [p._id.toString(), p]));

  const routers = {};
  const backends = {};
  const middlewares = {};

  for (const service of services) {
    const project = projectsById.get(service.project.toString());
    if (!project) continue;

    const hosts = hostsOf(service, project);
    if (!hosts.length) continue;

    const name = containerName(project, service);
    const hostRule = hosts.map((host) => `Host(\`${host}\`)`).join(' || ');
    const rule = service.pathPrefix
      ? `(${hostRule}) && PathPrefix(\`${service.pathPrefix}\`)`
      : hostRule;

    routers[name] = { rule, entryPoints: ['web'], service: name };


    if (service.pathPrefix && service.stripPrefix) {
      const middleware = `${name}-strip`;
      middlewares[middleware] = { stripPrefix: { prefixes: [service.pathPrefix] } };
      routers[name].middlewares = [middleware];
    }

    backends[name] = {
      loadBalancer: { servers: [{ url: `http://${name}:${service.internalPort}` }] },
    };
  }

  const http = { routers, services: backends };
  if (Object.keys(middlewares).length) http.middlewares = middlewares;
  return { http };
}