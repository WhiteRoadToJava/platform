import { Environment } from '../models/Environment.js';
import { Variable } from '../models/Variable.js';
import { decrypt } from './crypto.js';
import { databaseReferences } from './databases.js';

const REFERENCE = /\$\{\{\s*([a-z.]+)\s*\}\}/g;

async function inheritedVariables(service, environment, ownKeys, warnings) {
  if (environment.kind === 'production') return [];
  const production = await Environment.findOne({ project: service.project, kind: 'production' }).lean();
  if (!production) return [];

  const fromProduction = await Variable.find({ service: service._id, environment: production._id }).lean();
  const inherited = [];
  for (const variable of fromProduction) {
    if (ownKeys.has(variable.key)) continue;
    if (variable.sensitive) {
      warnings.push(
        `${variable.key} is sensitive, so it is not copied from production. Set a value for ${environment.name} if the app needs it.`,
      );
      continue;
    }
    inherited.push({ ...variable, inherited: true });
  }
  return inherited;
}

export async function resolveVariables(service, environment) {
  const own = await Variable.find({ service: service._id, environment: environment._id }).lean();
  const variables = new Map();
  const errors = [];
  const warnings = [];
  const inherited = await inheritedVariables(service, environment, new Set(own.map((v) => v.key)), warnings);
  const stored = [...inherited, ...own];

  let refs = {};
  try {
    refs = databaseReferences(environment);
  } catch {
    errors.push('The database password cannot be decrypted. The master key changed after the database was created.');
  }

  variables.set('PORT', { value: String(service.internalPort), source: 'platform' });
  if (refs['db.uri']) {
    variables.set('SPRING_DATA_MONGODB_URI', { value: refs['db.uri'], source: 'platform' });
    variables.set('SPRING_DATA_MONGODB_DATABASE', { value: refs['db.name'], source: 'platform' });
  }

  for (const variable of stored) {
    let raw;
    try {
      raw = decrypt(variable.valueEncrypted);
    } catch {
      errors.push(`${variable.key} cannot be decrypted. It was saved with a different master key. Edit it and save its value again.`);
      continue;
    }

    let usesReference = false;
    const value = raw.replace(REFERENCE, (match, name) => {
      usesReference = true;
      if (name in refs) return refs[name];
      const hint = name.startsWith('db.') ? ' Create a database for this project first.' : '';
      errors.push(`${variable.key} uses \${{${name}}}, which is not available.${hint}`);
      return match;
    });
    if (!value.trim()) {
      warnings.push(`${variable.key} is empty. Most apps treat an empty value as missing.`);
    }
    const source = variable.inherited ? 'inherited' : usesReference ? 'reference' : 'yours';
    variables.set(variable.key, { value, source });
  }

  return { variables, errors, warnings };
}