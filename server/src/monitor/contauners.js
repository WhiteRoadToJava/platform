import { EventEmitter } from 'node:events';
import { run } from '../lib/process.js';
import { Deployment } from '../models/Deployment.js';
import { Service } from '../models/Service.js';

const POLL_MS = 15000;
const CRASH_WINDOW_MS = 10 * 60 * 1000;
const ACTIVE = ['queued', 'building', 'deploying'];
const RANK = { fail: 3, busy: 2, ok: 1, none: 0 };

export const monitorEvents = new EventEmitter();

const observed = new Map();
let snapshot = { services: {}, projects: {}, checkedAt: null };

async function inspectManagedContainers() {
  const ids = (await run('docker', ['ps', '-aq', '--filter', 'label=platform.managed=true']))
    .split('\n')
    .filter(Boolean);
  if (!ids.length) return [];
  return JSON.parse(await run('docker', ['inspect', ...ids]));
}

function describe(container, record, deploying) {
  if (deploying) return { lamp: 'busy', label: 'Deploying' };
  if (!container) return { lamp: 'none', label: 'Not deployed' };
  const state = container.State.Status;
  if (state === 'restarting') return { lamp: 'fail', label: 'Crashing and restarting' };
  if (state !== 'running') return { lamp: 'fail', label: `Stopped (exit code ${container.State.ExitCode})` };
  if (record.lastCrashAt && Date.now() - record.lastCrashAt < CRASH_WINDOW_MS) {
    return { lamp: 'fail', label: 'Restarted after a crash' };
  }
  return { lamp: 'ok', label: 'Running' };
}

function detectCrash(container, record) {
  if (record.containerId === container.Id) {
    return (
      container.RestartCount > record.restartCount ||
      (record.status === 'running' && container.State.Status !== 'running')
    );
  }
  const startedAgo = Date.now() - Date.parse(container.State.StartedAt);
  return container.RestartCount > 0 && startedAgo < CRASH_WINDOW_MS;
}

async function check() {
  const [containers, services, active] = await Promise.all([
    inspectManagedContainers(),
    Service.find().select('project name').lean(),
    Deployment.find({ status: { $in: ACTIVE } }).select('service').lean(),
  ]);

  const deploying = new Set(active.map((d) => d.service.toString()));
  const byService = new Map();
  for (const container of containers) {
    if (container.Name.endsWith('-next')) continue;
    const serviceId = container.Config.Labels?.['platform.service'];
    if (serviceId) byService.set(serviceId, container);
  }

  const next = { services: {}, projects: {}, checkedAt: new Date().toISOString() };

  for (const service of services) {
    const id = service._id.toString();
    const container = byService.get(id);
    const record = observed.get(id) ?? {};

    if (container) {
      if (detectCrash(container, record)) {
        record.lastCrashAt = Date.now();
        monitorEvents.emit('crash', { service, container });
      }
      record.containerId = container.Id;
      record.restartCount = container.RestartCount;
      record.status = container.State.Status;
    }

    const status = describe(container, record, deploying.has(id));
    if (record.lamp === 'fail' && status.lamp === 'ok') monitorEvents.emit('recover', { service });
    record.lamp = status.lamp;
    observed.set(id, record);

    next.services[id] = status;
    const projectId = service.project.toString();
    const current = next.projects[projectId];
    if (!current || RANK[status.lamp] > RANK[current]) next.projects[projectId] = status.lamp;
  }

  snapshot = next;
}

export function getStatus() {
  return snapshot;
}

export function startMonitor() {
  const tick = () => check().catch((err) => console.error('Monitor error:', err.message));
  tick();
  setInterval(tick, POLL_MS);
  console.log('Container monitor started');
}