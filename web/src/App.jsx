import { useEffect, useState } from 'react';

export default function App() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then(setHealth)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <main>
      <h1>Platform</h1>
      {error && <p>Cannot reach the server: {error}</p>}
      {!error && !health && <p>Checking the server…</p>}
      {health && (
        <p>
          Server: {health.status}. Database: {health.db ? 'connected' : 'disconnected'}.
        </p>
      )}
    </main>
  );
}