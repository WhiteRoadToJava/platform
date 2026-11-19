import { config } from './config.js';
import { connectDb } from './db.js';
import { createApp } from './app.js';
import mongoose from 'mongoose';
import { startBuildWorker } from './builds/worker.js';
import { startMonitor } from './monitor/containers.js';

await connectDb(config.MONGODB_URI);
startMonitor();
if (config.WORKER_ENABLED) {
  await startBuildWorker();
} else {
  console.log('Deployment worker disabled (WORKER_ENABLED=false)');
}

const app = createApp();
const server = app.listen(config.PORT, config.HOST, () => {
  console.log(`Platform listening on http://${config.HOST}:${config.PORT}`);
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close();
  await mongoose.disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));