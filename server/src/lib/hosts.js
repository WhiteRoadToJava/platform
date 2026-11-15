export function hostsOf(service, project) {
  const hosts = [];
  if (service.subdomain) hosts.push(`${service.subdomain}.${project.baseDomain}`);
  return [...new Set(hosts.concat(service.customDomains ?? []))];
}