import { useEffect, useState } from 'react';
import { api } from './api.js';

const STATUS_TEXT = {
  checking: 'Checking the server…',
  ok: 'Server and database are running.',
  fail: 'The server or database is not responding.',
};

export default function Login({ onSignedIn }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [server, setServer] = useState('checking');

  useEffect(() => {
    fetch('/api/health')
      .then((res) => setServer(res.ok ? 'ok' : 'fail'))
      .catch(() => setServer('fail'));
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/auth/login', { method: 'POST', body: JSON.stringify({ password }) });
      onSignedIn();
    } catch (err) {
      setError(err.message);
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="login-panel" onSubmit={handleSubmit}>
        <h1 className="login-title">
          <span className="lamp" data-state={server === 'checking' ? undefined : server} aria-hidden="true" />
          Platform
        </h1>
        <p className="login-status">{STATUS_TEXT[server]}</p>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button-primary" type="submit" disabled={busy || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}