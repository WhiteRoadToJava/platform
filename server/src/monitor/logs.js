import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { run } from '../lib/process.js';

const RUNTIME_DIR = path.join(config.PLATFORM_DATA_DIR, 'logs', 'runtime');
const KEEP_PER_DEPLOYMENT = 10;
const SAVED_NAME = /^[0-9a-f]{24}--[0-9A-Za-z-]+--(crash|replaced)\.log$/;

export function readContainerLogs(container, lines = 300) {
  return run('docker', ['logs', '--tail', String(lines), '--timestamps', container]);
}

async function savedNames(deploymentId) {
  try {
    const names = await readdir(RUNTIME_DIR);
    return names.filter((name) => name.startsWith(`${deploymentId}--`)).sort().reverse();
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

export async function saveContainerLogs(container, deploymentId, reason) {
  if (!deploymentId) return;
  try {
    const text = await readContainerLogs(container, 500);
    await mkdir(RUNTIME_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await writeFile(path.join(RUNTIME_DIR, `${deploymentId}--${stamp}--${reason}.log`), text);
    const extra = (await savedNames(deploymentId)).slice(KEEP_PER_DEPLOYMENT);
    await Promise.all(extra.map((name) => unlink(path.join(RUNTIME_DIR, name))));
  } catch (err) {
    console.error(`Could not save the logs of ${container}: ${err.message}`);
  }
}

export async function listSavedLogs(deploymentId) {
  const names = await savedNames(deploymentId);
  return Promise.all(
    names.map(async (name) => ({
      name,
      reason: name.endsWith('--crash.log') ? 'crash' : 'replaced',
      at: (await stat(path.join(RUNTIME_DIR, name))).mtime,
    })),
  );
}

export async function readSavedLog(deploymentId, name) {
  if (!SAVED_NAME.test(name) || !name.startsWith(`${deploymentId}--`)) return null;
  try {
    return await readFile(path.join(RUNTIME_DIR, name), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}