import fs from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { Deployment } from '../models/Deployment.js';
import { Environment } from '../models/Environment.js';
import { markActive } from '../lib/lifecycle.js';
import { Project } from '../models/Project.js';
import { Service } from '../models/Service.js';
import { run } from '../lib/process.js';
import { detectBuildType } from './detect.js';
import { deployContainer } from './deploy.js';

const LOGS_DIR = path.join(config.PLATFORM_DATA_DIR, 'logs');
const BUILDS_DIR = path.join(config.PLATFORM_DATA_DIR, 'builds');
const GIT_ENV = { GIT_TERMINAL_PROMPT: '0' };

export function logPath(deploymentId) {
  return path.join(LOGS_DIR, `${deploymentId}.log`);
}

async function imageExists(image) {
  try {
    await run('docker', ['image', 'inspect', image]);
    return true;
  } catch {
    return false;
  }
}

async function buildImage({ deployment, service, project, workdir, log, step }) {
  step(`Cloning ${service.repoUrl} (${deployment.branch})`);
  await run('git', ['clone', '--depth', '1', '--branch', deployment.branch, service.repoUrl, workdir], {
    env: GIT_ENV,
    log,
  });

  const sha = (await run('git', ['rev-parse', 'HEAD'], { cwd: workdir })).trim();
  const message = (await run('git', ['log', '-1', '--format=%s'], { cwd: workdir })).trim();
  deployment.commitSha = sha;
  deployment.commitMessage = message;
  await deployment.save();
  log.write(`Commit ${sha.slice(0, 12)}: ${message}\n`);

  step('Detecting how to build');
  const buildType = await detectBuildType(workdir, service.buildType);
  if (!buildType) {
    throw new Error('Could not detect how to build this repository. Add a Dockerfile or choose a build type.');
  }
  deployment.buildType = buildType;
  await deployment.save();
  log.write(`Build type: ${buildType}\n`);
  if (buildType !== 'dockerfile') {
    throw new Error(`Building "${buildType}" projects without a Dockerfile is not supported yet.`);
  }

  const image = `platform/${project.slug}-${service.slug}:${sha.slice(0, 12)}`;
  if (await imageExists(image)) {
    log.write(`Image ${image} already exists for this commit. Reusing it.\n`);
  } else {
    step(`Building image ${image}`);
    await run(
      'docker',
      ['build', '--progress=plain', '--label', `platform.service=${service._id}`, '-t', image, workdir],
      { env: { DOCKER_BUILDKIT: '1' }, log, timeoutMs: config.BUILD_TIMEOUT_MINUTES * 60 * 1000 },
    );
  }
  return image;
}

async function runDeployment(deployment) {
  const service = await Service.findById(deployment.service);
  const project = await Project.findById(service.project);
  const environment = await Environment.findById(deployment.environment);
  const workdir = path.join(BUILDS_DIR, deployment._id.toString());
  const log = fs.createWriteStream(logPath(deployment._id), { flags: 'a' });
  const step = (message) => log.write(`\n==> ${message}\n`);

  try {
    if (deployment.reusedFrom) {
      step(`Reusing the production image ${deployment.image}`);
      log.write(`This environment has no "${environment.branch}" branch in ${service.repoUrl}, so it runs the production version.\n`);
    } else {
      deployment.image = await buildImage({ deployment, service, project, workdir, log, step });
    } deployment.status = 'deploying';
    await deployment.save();

    await deployContainer({ deployment, service, project, environment, log, step });

    await Deployment.updateMany(
      { service: service._id, environment: environment._id, status: 'running', _id: { $ne: deployment._id } },
      { status: 'superseded' },
    );
    deployment.status = 'running';
    await markActive(environment);
    step('Deployment is live');
  } catch (err) {
    deployment.status = 'failed';
    deployment.error = err.message;
    log.write(`\nDeployment failed: ${err.message}\n`);
    log.write('Nothing was changed for visitors. The previous version, if any, is still running.\n');
  } finally {
    deployment.finishedAt = new Date();
    await deployment.save();
    log.end();
    await rm(workdir, { recursive: true, force: true });
  }
}

let busy = false;

async function tick() {
  if (busy) return;
  busy = true;
  try {
    const deployment = await Deployment.findOneAndUpdate(
      { status: 'queued' },
      { status: 'building', startedAt: new Date() },
      { sort: { createdAt: 1 }, returnDocument: 'after' },
    );
    if (deployment) await runDeployment(deployment);
  } catch (err) {
    console.error('Deployment worker error:', err);
  } finally {
    busy = false;
  }
}

export async function startBuildWorker() {
  await mkdir(LOGS_DIR, { recursive: true });
  await mkdir(BUILDS_DIR, { recursive: true });

  const interrupted = await Deployment.updateMany(
    { status: { $in: ['building', 'deploying'] } },
    { status: 'failed', error: 'Interrupted by a platform restart.', finishedAt: new Date() },
  );
  if (interrupted.modifiedCount) {
    console.log(`Marked ${interrupted.modifiedCount} interrupted deployment(s) as failed`);
  }

  setInterval(tick, 2000);
  console.log('Deployment worker started');
}