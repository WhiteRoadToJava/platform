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


const BATCH_SIZE = 1000;

function connectAs(environment) {
  return new mongoose.mongo.MongoClient(databaseReferences(environment)['db.uri']);
}

export async function copyDatabase(sourceEnvironment, targetEnvironment) {
  const sourceName = sourceEnvironment.database?.name;
  const targetName = targetEnvironment.database?.name;
  if (!sourceName || !targetName || sourceName === targetName) {
    throw new HttpError(400, 'Source and target databases must be two different databases.');
  }

  const sourceClient = connectAs(sourceEnvironment);
  const targetClient = connectAs(targetEnvironment);
  try {
    const source = sourceClient.db(sourceName);
    const target = targetClient.db(targetName);

    for (const { name } of await target.listCollections({ type: 'collection' }).toArray()) {
      if (!name.startsWith('system.')) await target.collection(name).drop();
    }

    const collections = await source.listCollections({ type: 'collection' }).toArray();
    const copied = [];
    for (const { name, options } of collections) {
      if (name.startsWith('system.')) continue;
      await target.createCollection(name, options);

      let count = 0;
      let batch = [];
      for await (const document of source.collection(name).find()) {
        batch.push(document);
        if (batch.length === BATCH_SIZE) {
          await target.collection(name).insertMany(batch, { ordered: false });
          count += batch.length;
          batch = [];
        }
      }
      if (batch.length) {
        await target.collection(name).insertMany(batch, { ordered: false });
        count += batch.length;
      }

      const indexes = await source.collection(name).indexes();
      for (const { key, v, ns, ...options } of indexes) {
        if (options.name === '_id_') continue;
        await target.collection(name).createIndex(key, options);
      }

      copied.push({ name, count });
    }
    return copied;
  } finally {
    await Promise.all([sourceClient.close(), targetClient.close()]);
  }
}


export async function removeDatabase(environment) {
  if (environment.kind === 'production') throw new HttpError(400, 'The production database is never removed here.');
  if (!environment.database?.name) return;

  const client = connectAs(environment);
  try {
    const database = client.db(environment.database.name);
    for (const { name } of await database.listCollections({ type: 'collection' }).toArray()) {
      if (!name.startsWith('system.')) await database.collection(name).drop();
    }
  } finally {
    await client.close();
  }

  try {
    await mongoose.connection.getClient().db('admin').command({ dropUser: environment.database.username });
  } catch (err) {
    if (err.code !== 11) throw err;
  }
}