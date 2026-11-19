import { readdir, readFile, statfs } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { run } from '../lib/process.js';
import { monitorEvents } from './containers.js';

const POLL_MS = 60000;
const BACKUP_MAX_AGE_MS = 26 * 60 * 60 * 1000;
const DISK_ALERT_PERCENT = 80;
const RANK = { fail: 3, busy: 2, ok: 1, none: 0 };

const INFRA = [
  { name: 'mongodb', label: 'Database (MongoDB)' },
  { name: 'traefik', label: 'Router (Traefik)' },
  { name: 'cloudflared', label: 'Cloudflare tunnel' },
  { name: 'platform', label: 'Platform' },
  { name: 'backup', label: 'Nightly backups' },
];

let snapshot = { pending: true };
const lastLamp = new Map();

async function containerStatus({ name, label }) {
  const base = { key: `container:${name}`, name, label };
  try {
    const [container] = JSON.parse(await run('docker', ['inspect', name]));
    const state = container.State;
    const health = state.Health?.Status;
    if (state.Status === 'restarting') return { ...base, lamp: 'fail', text: 'Crashing and restarting' };
    if (state.Status !== 'running') return { ...base, lamp: 'fail', text: `Stopped (exit code ${state.ExitCode})` };
    if (health === 'unhealthy') return { ...base, lamp: 'fail', text: 'Running, but its health check fails' };
    if (health === 'starting') return { ...base, lamp: 'busy', text: 'Starting' };
    return { ...base, lamp: 'ok', text: 'Running', startedAt: state.StartedAt };
  } catch {
    return { ...base, lamp: 'fail', text: 'Container not found' };
  }
}

async function backupStatus() {
  const files = (await readdir(config.BACKUPS_DIR).catch(() => []))
    .filter((name) => /^backup-.*\.tar\.age$/.test(name))
    .sort()
    .reverse();

  let last;
  try {
    last = JSON.parse(await readFile(path.join(config.BACKUPS_DIR, 'last-run.json'), 'utf8'));
  } catch {
    return { key: 'backup', lamp: 'fail', text: 'No backup has run yet', last: null, files };
  }

  if (last.status !== 'ok') {
    return { key: 'backup', lamp: 'fail', text: `The last backup failed: ${last.error}`, last, files };
  }
  if (Date.now() - Date.parse(last.at) > BACKUP_MAX_AGE_MS) {
    return { key: 'backup', lamp: 'fail', text: 'No successful backup in the last 26 hours', last, files };
  }
  return { key: 'backup', lamp: 'ok', text: 'The last backup succeeded', last, files };
}

async function diskStatus() {
  const stats = await statfs(config.BACKUPS_DIR);
  const used = (stats.blocks - stats.bfree) * stats.bsize;
  const free = stats.bavail * stats.bsize;
  const percent = Math.round((used / (used + free)) * 100);
  const full = percent >= DISK_ALERT_PERCENT;
  return {
    key: 'disk',
    lamp: full ? 'fail' : 'ok',
    text: full ? `${percent}% used. Free some space soon.` : `${percent}% used`,
    percent,
    used,
    free,
  };
}

async function check() {
  const [containers, backup, disk] = await Promise.all([
    Promise.all(INFRA.map(containerStatus)),
    backupStatus(),
    diskStatus(),
  ]);

  const items = [...containers, backup, disk];
  for (const item of items) {
    const previous = lastLamp.get(item.key);
    if (previous && previous !== 'fail' && item.lamp === 'fail') {
      monitorEvents.emit('problem', { key: item.key, message: item.text });
    }
    if (previous === 'fail' && item.lamp !== 'fail') {
      monitorEvents.emit('resolved', { key: item.key });
    }
    lastLamp.set(item.key, item.lamp);
  }

  const lamp = items.reduce((worst, item) => (RANK[item.lamp] > RANK[worst] ? item.lamp : worst), 'none');
  snapshot = { lamp, containers, backup, disk, checkedAt: new Date().toISOString() };
}

export function getSystemStatus() {
  return snapshot;
}

export function startSystemMonitor() {
  const tick = () => check().catch((err) => console.error('System monitor error:', err.message));
  tick();
  setInterval(tick, POLL_MS);
  console.log('System monitor started');
}