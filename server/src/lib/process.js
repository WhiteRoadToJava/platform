import { spawn } from 'node:child_process';

export function run(command, args, { cwd, env, log, timeoutMs } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env } });
    let output = '';

    const collect = (chunk) => {
      output += chunk;
      if (output.length > 100000) output = output.slice(-50000);
      log?.write(chunk);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);

    const timer = timeoutMs ? setTimeout(() => child.kill('SIGKILL'), timeoutMs) : null;

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) return resolve(output);
      reject(new Error(signal === 'SIGKILL' ? `${command} timed out` : `${command} exited with code ${code}`));
    });
  });
}