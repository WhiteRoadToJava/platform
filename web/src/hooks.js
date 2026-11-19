import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

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

export function serviceAddress(service, baseDomain) {
  const hosts = [
    ...(service.subdomain ? [`${service.subdomain}.${baseDomain}`] : []),
    ...(service.customDomains ?? []),
  ];
  if (!hosts.length) return 'No public address';
  const extra = hosts.length > 1 ? ` and ${hosts.length - 1} more` : '';
  return `${hosts[0]}${service.pathPrefix}${extra}`;
}

export function repoLabel(service) {
  return `${service.repoUrl.replace('https://github.com/', '')} (${service.branch})`;
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