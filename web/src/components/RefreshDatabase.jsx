import { useState } from 'react';
import { api } from '../api.js';

export default function RefreshDatabase({ environment, onChange }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  async function handleRefresh(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await api(`/environments/${environment._id}/database/refresh`, {
        method: 'POST',
        body: JSON.stringify({ confirm }),
      });
      setResult(data);
      setOpen(false);
      setConfirm('');
      await onChange();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const documents = result?.collections.reduce((sum, collection) => sum + collection.count, 0);

  return (
    <div className="refresh-db">
      <h3 className="subsection-title">Copy production data</h3>
      <p className="muted">
        Replaces everything in <span className="mono">{environment.database.name}</span> with a fresh copy of the
        production database. Production is only read, never changed.
      </p>

      {open ? (
        <form className="inline-form" onSubmit={handleRefresh}>
          <input
            className="mono"
            placeholder={environment.name}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            aria-label={`Type ${environment.name} to confirm`}
            autoFocus
          />
          <button className="button-danger" type="submit" disabled={busy || confirm !== environment.name}>
            {busy ? 'Copying…' : `Replace ${environment.name} data`}
          </button>
          <button className="button-small" type="button" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </button>
          <span className="field-hint">Type {environment.name} to confirm.</span>
        </form>
      ) : (
        <button className="button-quiet" type="button" onClick={() => setOpen(true)}>
          Refresh from production
        </button>
      )}

      {error && <p className="form-error">{error}</p>}
      {result && (
        <p className="muted">
          Copied {result.collections.length} collections ({documents} documents).{' '}
          {result.restarted
            ? `Restarted ${result.restarted} running container${result.restarted > 1 ? 's' : ''} so they read the new data.`
            : 'No containers were running.'}
        </p>
      )}
    </div>
  );
}