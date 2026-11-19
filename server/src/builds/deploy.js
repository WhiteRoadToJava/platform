import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { config } from '../config.js';
import { run } from '../lib/process.js';
import { resolveVariables } from '../lib/variables.js';
import { containerName } from '../routing/traefik.js';
import { saveContainerLogs } from '../monitor/logs.js';

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function inspect(name) {
  try {
    return JSON.parse(await run('docker', ['inspect', name]))[0];
  } catch {
    return null;
  }
}

function isManaged(container) {
  return container?.Config?.Labels?.['platform.managed'] === 'true';
}

function portOpen(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const finish = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(2000, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

async function giveFolderToImageUser(image, folder, log) {
  try {
    const identity = await run('docker', ['run', '--rm', '--entrypoint', 'id', image]);
    const uid = identity.match(/uid=(\d+)/)?.[1];
    const gid = identity.match(/gid=(\d+)/)?.[1];
    if (!uid || uid === '0') return;
    await run('docker', ['run', '--rm', '-v', `${folder}:/target`, 'alpine:3.20', 'chown', `${uid}:${gid}`, '/target'], {
      log,
    });
    log.write(`Gave ${folder} to the container user (${uid}:${gid})\n`);
  } catch {
    log.write(`Warning: could not set the owner of ${folder}. The app may not be able to write to it.\n`);
  }
}

async function waitUntilHealthy(name, service, log) {
  const deadline = Date.now() + config.HEALTHCHECK_TIMEOUT_SECONDS * 1000;
  const method = service.healthcheckPath ? `GET ${service.healthcheckPath}` : `port ${service.internalPort}`;
  log.write(`Checking ${method} every 2 seconds, for up to ${config.HEALTHCHECK_TIMEOUT_SECONDS} seconds\n`);

  while (Date.now() < deadline) {
    const container = await inspect(name);
    if (!container) throw new Error('The new container disappeared.');
    if (container.RestartCount > 0 || ['exited', 'dead', 'restarting'].includes(container.State.Status)) {
      throw new Error(`The new container stopped with exit code ${container.State.ExitCode}.`);
    }

    const ip = container.NetworkSettings.Networks?.platform?.IPAddress;
    if (ip) {
      if (service.healthcheckPath) {
        try {
          const response = await fetch(`http://${ip}:${service.internalPort}${service.healthcheckPath}`, {
            signal: AbortSignal.timeout(3000),
          });
          if (response.ok) {
            log.write(`Health check passed with ${response.status}\n`);
            return;
          }
        } catch {
          // Not ready yet.
        }
      } else if (await portOpen(ip, service.internalPort)) {
        log.write(`Port ${service.internalPort} is accepting connections\n`);
        return;
      }
    }
    await sleep(2000);
  }
  throw new Error(`The new container did not become healthy within ${config.HEALTHCHECK_TIMEOUT_SECONDS} seconds.`);
}

export async function deployContainer({ deployment, service, project, environment, log, step }) {
  const name = containerName(project, service);
  const nextName = `${name}-next`;

  const current = await inspect(name);
  if (current && !isManaged(current)) {
    throw new Error(
      `A container named ${name} exists but was not created by the platform. Remove it yourself (for example with docker compose down) and deploy again.`,
    );
  }

  step('Preparing variables');
  const { variables, errors, warnings } = await resolveVariables(service, environment);
  if (errors.length) throw new Error(errors.join(' '));
  warnings.forEach((warning) => log.write(`Warning: ${warning}\n`));
  for (const [key, { value }] of variables) {
    if (value.includes('\n')) throw new Error(`${key} contains a line break, which containers cannot receive.`);
  }
  log.write(`${variables.size} variables ready\n`);

  const volumeArgs = [];
  if (service.volumes.length) {
    step('Preparing persistent folders');
    for (const { containerPath } of service.volumes) {
      const folderName = containerPath.replace(/^\/+/, '').replace(/\//g, '_');
      const hostPath = path.join(config.APPS_DATA_DIR, project.slug, environment.name, service.slug, folderName);
      const isNew = !(await exists(hostPath));
      await mkdir(hostPath, { recursive: true });
      if (isNew) await giveFolderToImageUser(deployment.image, hostPath, log);
      volumeArgs.push('-v', `${hostPath}:${containerPath}`);
      log.write(`${containerPath} is stored in ${hostPath}\n`);
    }
  }

  const leftover = await inspect(nextName);
  if (leftover) {
    if (!isManaged(leftover)) throw new Error(`A container named ${nextName} exists and was not created by the platform.`);
    await run('docker', ['rm', '-f', nextName], { log });
  }

  step(`Starting the new container next to the current one`);
  const envFile = path.join(os.tmpdir(), `platform-${deployment._id}.env`);
  const envText = [...variables].map(([key, { value }]) => `${key}=${value}`).join('\n');
  await writeFile(envFile, `${envText}\n`, { mode: 0o600 });
  try {
    await run(
      'docker',
      [
        'run', '-d',
        '--name', nextName,
        '--network', 'platform',
        '--restart', 'unless-stopped',
        '--memory', `${service.memoryLimitMb}m`,
        '--label', 'platform.managed=true',
        '--label', `platform.service=${service._id}`,
        '--label', `platform.deployment=${deployment._id}`,
        '--env-file', envFile,
        ...volumeArgs,
        deployment.image,
      ],
      { log },
    );
  } finally {
    await rm(envFile, { force: true });
  }

  step('Waiting for the new container to become healthy');
  try {
    await waitUntilHealthy(nextName, service, log);
  } catch (err) {
    log.write('\nLast output from the new container:\n');
    await run('docker', ['logs', '--tail', '40', nextName], { log }).catch(() => {});
    await run('docker', ['rm', '-f', nextName]).catch(() => {});
    throw err;
  }

  step('Switching traffic to the new container');
    if (current) {
    await saveContainerLogs(name, current.Config.Labels?.['platform.deployment'], 'replaced');
    log.write('Saved the last 500 log lines of the previous version\n');
    await run('docker', ['rm', '-f', name], { log });
  }
  await run('docker', ['rename', nextName, name], { log });
}