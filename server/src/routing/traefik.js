import { Environment } from '../models/Environment.js';
import { Project } from '../models/Project.js';
import { Service } from '../models/Service.js';
import { containerName, hostsFor } from '../lib/environments.js';

export async function buildTraefikConfig() {
  const [projects, services, environments] = await Promise.all([
    Project.find().lean(),
    Service.find().lean(),
    Environment.find().lean(),
  ]);
  const projectsById = new Map(projects.map((p) => [p._id.toString(), p]));

  const routers = {};
  const backends = {};
  const middlewares = {};

  for (const service of services) {
    const project = projectsById.get(service.project.toString());
    if (!project) continue;

    for (const environment of environments.filter((env) => env.project.equals(project._id))) {
      const hosts = hostsFor(service, project, environment);
      if (!hosts.length) continue;

      const name = containerName(project, service, environment);
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
  }

  const http = { routers, services: backends };
  if (Object.keys(middlewares).length) http.middlewares = middlewares;
  return { http };
}