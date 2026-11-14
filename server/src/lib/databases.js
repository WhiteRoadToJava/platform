import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { config } from '../config.js';
import { decrypt, encrypt } from './crypto.js';
import { HttpError } from './validation.js';

export function databaseNameFor(project, environment) {
  return `${project.slug}_${environment.name}`.replace(/-/g, '_');
}

export async function provisionDatabase(project, environment) {
  if (environment.database?.name) {
    throw new HttpError(409, 'This environment already has a database.');
  }

  const name = databaseNameFor(project, environment);
  const password = randomBytes(24).toString('hex');
  const admin = mongoose.connection.getClient().db('admin');

  try {
    await admin.command({
      createUser: name,
      pwd: password,
      roles: [{ role: 'readWrite', db: name }],
    });
  } catch (err) {
    if (err.code === 51003) {
      throw new HttpError(409, `A MongoDB user named ${name} already exists. Remove it before creating the database.`);
    }
    throw err;
  }

  environment.database = { name, username: name, passwordEncrypted: encrypt(password) };
  await environment.save();
}

export function databaseReferences(environment) {
  if (!environment.database?.name) return {};
  const { name, username, passwordEncrypted } = environment.database;
  const password = decrypt(passwordEncrypted);
  const host = config.APP_MONGODB_HOST;
  return {
    'db.name': name,
    'db.user': username,
    'db.password': password,
    'db.host': host,
    'db.uri': `mongodb://${username}:${password}@${host}/${name}?authSource=admin`,
  };
}