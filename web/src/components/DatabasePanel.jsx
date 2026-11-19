import { useState } from 'react';
import { api } from '../api.js';

const REFERENCES = ['db.uri', 'db.name', 'db.user', 'db.password', 'db.host'];

export default function DatabasePanel({ environment, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const database = environment.database;

  async function createDatabase() {
    setBusy(true);
    setError(null);
    try {
      await api(`/environments/${environment._id}/database`, { method: 'POST' });
      await onChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel-section">
      <h2 className="section-title">Database</h2>
      {database?.name ? (
        <>
          <dl className="facts">
            <dt>Database</dt>
            <dd className="mono">{database.name}</dd>
            <dt>User</dt>
            <dd className="mono">{database.username}</dd>
            <dt>Password</dt>
            <dd>Generated and encrypted. Your services receive it through references.</dd>
          </dl>
          <p className="muted">
            Use these references in a service's variables:{' '}
            {REFERENCES.map((ref, index) => (
              <span key={ref}>
                <code className="mono">{`\${{${ref}}}`}</code>
                {index < REFERENCES.length - 1 ? ', ' : '.'}
              </span>
            ))}
          </p>
        </>
      ) : (
        <div className="empty">
          <p>
            {environment.kind === 'production'
              ? 'This project has no database yet. Create one to get a MongoDB database and its own user with a generated password.'
              : `${environment.name} has no database yet. Create one to give it its own empty MongoDB database, separate from production.`}
          </p>
          <button className="button-primary" type="button" onClick={createDatabase} disabled={busy}>
            {busy ? 'Creating…' : 'Create database'}
          </button>
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
    </section>
  );
}