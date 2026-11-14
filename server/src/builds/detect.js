import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

export async function detectBuildType(dir, requested) {
  if (requested !== 'auto') return requested;
  if (await exists(path.join(dir, 'Dockerfile'))) return 'dockerfile';
  if (await exists(path.join(dir, 'pom.xml'))) return 'java';

  const packageFile = path.join(dir, 'package.json');
  if (await exists(packageFile)) {
    const pkg = JSON.parse(await readFile(packageFile, 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    return deps.vite ? 'react' : 'node';
  }
  return null;
}