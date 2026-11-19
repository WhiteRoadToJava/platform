import { IDLE_HOURS, stopEnvironment } from '../lib/lifecycle.js';
import { Environment } from '../models/Environment.js';

const CHECK_MS = 10 * 60 * 1000;

async function check() {
  const cutoff = new Date(Date.now() - IDLE_HOURS * 60 * 60 * 1000);
  const idle = await Environment.find({
    kind: 'preview',
    stoppedAt: null,
    $or: [{ activeAt: { $lt: cutoff } }, { activeAt: null, createdAt: { $lt: cutoff } }],
  });

  for (const environment of idle) {
    try {
      const stopped = await stopEnvironment(environment, 'auto');
      if (stopped) console.log(`Stopped ${environment.name} (${stopped} containers) after ${IDLE_HOURS} idle hours`);
    } catch (err) {
      console.error(`Auto-stop of ${environment.name} skipped:`, err.message);
    }
  }
}

export function startAutoStop() {
  const tick = () => check().catch((err) => console.error('Auto-stop error:', err.message));
  setTimeout(tick, 60 * 1000);
  setInterval(tick, CHECK_MS);
  console.log(`Auto-stop started: preview environments stop after ${IDLE_HOURS} idle hours`);
}