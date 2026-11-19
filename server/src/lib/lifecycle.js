import { config } from '../config.js';
import { Deployment } from '../models/Deployment.js';
import { Environment } from '../models/Environment.js';
import { Variable } from '../models/Variable.js';
import { removeDatabase } from './databases.js';
import { run } from './process.js';
import { HttpError } from './validation.js';

export const IDLE_HOURS = 12;
const ACTIVE = ['queued', 'building', 'deploying'];

async function containerIds(environment, { all = false } = {}) {
  const args = ['ps', '-q', '--filter', `label=platform.environment=${environment._id}`];
  if (all) args.splice(1, 0, '-a');
  return (await run('docker', args)).split('\n').filter(Boolean);
}

function requirePreview(environment) {
  if (environment.kind !== 'preview') throw new HttpError(400, 'Production is never stopped or deleted here.');
}

async function requireIdle(environment) {
  if (await Deployment.exists({ environment: environment._id, status: { $in: ACTIVE } })) {
    throw new HttpError(409, `${environment.name} has a deployment in progress. Wait for it to finish.`);
  }
}

export async function stopEnvironment(environment, reason) {
  requirePreview(environment);
  await requireIdle(environment);
  const ids = await containerIds(environment);
  if (!ids.length) return 0;
  environment.stoppedAt = new Date();
  environment.stopReason = reason;
  await environment.save();
  await run('docker', ['stop', ...ids]);
  return ids.length;
}

export async function startEnvironment(environment) {
  requirePreview(environment);
  const ids = await containerIds(environment, { all: true });
  if (!ids.length) throw new HttpError(409, `${environment.name} has nothing to start. Deploy a service first.`);
  await run('docker', ['start', ...ids]);
  await markActive(environment);
  return ids.length;
}

export async function markActive(environment) {
  if (environment.kind !== 'preview') return;
  if (environment.stoppedAt) {
    const ids = await containerIds(environment, { all: true });
    if (ids.length) await run('docker', ['start', ...ids]);
  }
  await Environment.updateOne(
    { _id: environment._id },
    { activeAt: new Date(), $unset: { stoppedAt: 1, stopReason: 1 } },
  );
}

export async function deleteEnvironment(environment, project, { deleteData }) {
  requirePreview(environment);
  await requireIdle(environment);

  const ids = await containerIds(environment, { all: true });
  if (ids.length) await run('docker', ['rm', '-f', ...ids]);

  if (deleteData) {
    await removeDatabase(environment);
    await run('docker', [
      'run', '--rm',
      '-v', `${config.APPS_DATA_DIR}/${project.slug}:/target`,
      'alpine:3.20', 'rm', '-rf', `/target/${environment.name}`,
    ]);
  }

  await Variable.deleteMany({ environment: environment._id });
  await Deployment.deleteMany({ environment: environment._id });
  await environment.deleteOne();
}