export async function resolveVariables(service, environment) {
  const stored = await Variable.find({ service: service._id, environment: environment._id }).lean();
  const refs = databaseReferences(environment);
  const variables = new Map();
  const errors = [];
  const warnings = [];

  variables.set('PORT', { value: String(service.internalPort), source: 'platform' });
  if (refs['db.uri']) {
    variables.set('SPRING_DATA_MONGODB_URI', { value: refs['db.uri'], source: 'platform' });
    variables.set('SPRING_DATA_MONGODB_DATABASE', { value: refs['db.name'], source: 'platform' });
  }

  for (const variable of stored) {
    const raw = decrypt(variable.valueEncrypted);
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
    variables.set(variable.key, { value, source: usesReference ? 'reference' : 'yours' });
  }

  return { variables, errors, warnings };
}