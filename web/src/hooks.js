import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { useSearchParams } from 'react-router';

export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: true });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true }));
    try {
      const data = await api(path);
      setState({ data, error: null, loading: false });
    } catch (error) {
      setState({ data: null, error, loading: false });
    }
  }, [path]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}

export function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/, '');
}

export function serviceHosts(service, project, environment) {
  const hosts = [
    ...(service.subdomain ? [`${service.subdomain}.${project.baseDomain}`] : []),
    ...(service.customDomains ?? []),
  ];
  if (!environment || environment.kind === 'production' || !hosts.length) return hosts;
  return [`${environment.name}-${service.subdomain || project.slug}.${project.baseDomain}`];
}

export function serviceAddress(service, project, environment) {
  const hosts = serviceHosts(service, project, environment);
  if (!hosts.length) return 'No public address';
  const extra = hosts.length > 1 ? ` and ${hosts.length - 1} more` : '';
  return `${hosts[0]}${service.pathPrefix}${extra}`;
}

export function repoLabel(service, environment) {
  const branch = environment?.kind === 'preview' ? environment.branch : service.branch;
  return `${service.repoUrl.replace('https://github.com/', '')} (${branch})`;
}

export function useEnvironment(environments) {
  const [params, setParams] = useSearchParams();
  const sorted = [...(environments ?? [])].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'production' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  const wanted = params.get('env');
  const environment = sorted.find((env) => env.name === wanted) ?? sorted[0] ?? null;

  function select(name) {
    setParams(name === 'production' ? {} : { env: name }, { replace: true });
  }

  return { environments: sorted, environment, select };
}

export function envQuery(environment) {
  return environment && environment.kind !== 'production' ? `?env=${environment.name}` : '';
}


export const DEPLOYMENT_STATUS = {
  queued: { label: 'Queued', lamp: 'busy' },
  building: { label: 'Building', lamp: 'busy' },
  deploying: { label: 'Starting', lamp: 'busy' },
  running: { label: 'Live', lamp: 'ok' },
  superseded: { label: 'Replaced', lamp: undefined },
  failed: { label: 'Failed', lamp: 'fail' },
  cancelled: { label: 'Cancelled', lamp: undefined },
  built: { label: 'Built', lamp: undefined },
};

export const ACTIVE_STATUSES = ['queued', 'building', 'deploying'];

export function formatTime(value) {
  return value ? new Date(value).toLocaleString() : '';
}


export function formatBytes(bytes) {
  if (bytes === undefined || bytes === null) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}