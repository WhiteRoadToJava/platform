const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const failures = new Map();

export function checkLoginAllowed(ip) {
  const entry = failures.get(ip);
  if (!entry) return { allowed: true };
  const elapsed = Date.now() - entry.firstAt;
  if (elapsed > WINDOW_MS) {
    failures.delete(ip);
    return { allowed: true };
  }
  if (entry.count >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfterMs: WINDOW_MS - elapsed };
  }
  return { allowed: true };
}

export function recordFailure(ip) {
  const entry = failures.get(ip);
  if (!entry || Date.now() - entry.firstAt > WINDOW_MS) {
    failures.set(ip, { count: 1, firstAt: Date.now() });
  } else {
    entry.count += 1;
  }
}

export function clearFailures(ip) {
  failures.delete(ip);
}