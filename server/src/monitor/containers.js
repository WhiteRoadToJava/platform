import { EventEmitter } from 'node:events';
import { run } from '../lib/process.js';
import { Deployment } from '../models/Deployment.js';
import { Environment } from '../models/Environment.js';
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
  const [containers, services, environments, active] = await Promise.all([
    inspectManagedContainers(),
    Service.find().select('project name').lean(),
    Environment.find().select('project kind').lean(),
    Deployment.find({ status: { $in: ACTIVE } }).select('service environment').lean(),
  ]);

  const productionOf = new Map(
    environments.filter((env) => env.kind === 'production').map((env) => [env.project.toString(), env._id.toString()]),
  );
  const deploying = new Set(active.map((d) => `${d.service}:${d.environment}`));

  const byKey = new Map();
  for (const container of containers) {
    if (container.Name.endsWith('-next')) continue;
    const labels = container.Config.Labels ?? {};
    const serviceId = labels['platform.service'];
    if (!serviceId) continue;
    const service = services.find((s) => s._id.toString() === serviceId);
    const environmentId = labels['platform.environment'] ?? productionOf.get(service?.project.toString());
    byKey.set(`${serviceId}:${environmentId}`, container);
  }

  const next = { services: {}, byEnvironment: {}, projects: {}, checkedAt: new Date().toISOString() };

  for (const service of services) {
    const projectEnvironments = environments.filter((env) => env.project.equals(service.project));
    for (const environment of projectEnvironments) {
      const key = `${service._id}:${environment._id}`;
      const container = byKey.get(key);
      const record = observed.get(key) ?? {};

      if (container) {
        if (detectCrash(container, record)) {
          record.lastCrashAt = Date.now();
          monitorEvents.emit('crash', { service, environment, container });
        }
        record.containerId = container.Id;
        record.restartCount = container.RestartCount;
        record.status = container.State.Status;
      }

      const status = describe(container, record, deploying.has(key));
      if (record.lamp === 'fail' && status.lamp === 'ok') monitorEvents.emit('recover', { service, environment });
      record.lamp = status.lamp;
      observed.set(key, record);

      next.byEnvironment[key] = status;
      if (environment.kind === 'production') {
        next.services[service._id] = status;
        const projectId = service.project.toString();
        const current = next.projects[projectId];
        if (!current || RANK[status.lamp] > RANK[current]) next.projects[projectId] = status.lamp;
      }
    }
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