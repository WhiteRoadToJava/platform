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
  if (!service.subdomain) return 'No public address';
  return `${service.subdomain}.${baseDomain}${service.pathPrefix}`;
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