import readline from 'node:readline';
import mongoose from 'mongoose';
import { config } from '../src/config.js';
import { connectDb } from '../src/db.js';
import { Admin } from '../src/models/Admin.js';
import { Session } from '../src/models/Session.js';
import { hashPassword } from '../src/auth/password.js';

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    process.stdout.write(question);
    rl._writeToOutput = () => {};
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

const password = await askHidden('New password: ');
if (password.length < 12) {
  console.error('Password must be at least 12 characters.');
  process.exit(1);
}

const confirmation = await askHidden('Repeat password: ');
if (password !== confirmation) {
  console.error('Passwords do not match.');
  process.exit(1);
}

await connectDb(config.MONGODB_URI);
const passwordHash = await hashPassword(password);
await Admin.findOneAndUpdate({}, { passwordHash }, { upsert: true });
const { deletedCount } = await Session.deleteMany({});
console.log(`Password saved. Signed out ${deletedCount} existing session(s).`);
await mongoose.disconnect();