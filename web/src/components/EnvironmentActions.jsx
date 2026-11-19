import { useState } from 'react';
import { api } from '../api.js';
import { formatTime } from '../hooks.js';

const IDLE_HOURS = 12;

function stopTime(environment) {
  const since = environment.activeAt ?? environment.createdAt;
  return new Date(new Date(since).getTime() + IDLE_HOURS * 60 * 60 * 1000);
}

export default function EnvironmentActions({ environment, onChange, onDeleted }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [deleteData, setDeleteData] = useState(true);

  async function call(action, path, options) {
    setBusy(action);
    setError(null);
    try {
      await api(path, options);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function start() {
    if (await call('start', `/environments/${environment._id}/start`, { method: 'POST' })) await onChange();
  }

  async function stop() {
    if (await call('stop', `/environments/${environment._id}/stop`, { method: 'POST' })) await onChange();
  }

  async function remove(event) {
    event.preventDefault();
    const ok = await call('delete', `/environments/${environment._id}`, {
      method: 'DELETE',
      body: JSON.stringify({ confirm, deleteData }),
    });
    if (ok) await onDeleted();
  }

  const stopped = Boolean(environment.stoppedAt);

  return (
    <section className="panel-section">
      <h2 className="section-title">Environment</h2>
      <p className="muted">
        {stopped
          ? `Stopped ${environment.stopReason === 'auto' ? `automatically after ${IDLE_HOURS} hours without a deploy` : 'by you'} on ${formatTime(environment.stoppedAt)}. Its data and variables are kept.`
          : `Stops automatically around ${formatTime(stopTime(environment))} to save memory. A deploy or Start resets the timer.`}
      </p>

      <div className="button-row">
        {stopped ? (
          <button className="button-primary" type="button" onClick={start} disabled={busy !== null}>
            {busy === 'start' ? 'Starting…' : 'Start'}
          </button>
        ) : (
          <button className="button-quiet" type="button" onClick={stop} disabled={busy !== null}>
            {busy === 'stop' ? 'Stopping…' : 'Stop now'}
          </button>
        )}
        {!deleting && (
          <button className="button-danger" type="button" onClick={() => setDeleting(true)} disabled={busy !== null}>
            Delete environment
          </button>
        )}
      </div>

      {deleting && (
        <form className="delete-env" onSubmit={remove}>
          <p>
            Removes the {environment.name} containers, variables and deployment history. Production is not touched.
          </p>
          <label className="checkbox">
            <input type="checkbox" checked={deleteData} onChange={(event) => setDeleteData(event.target.checked)} />
            <span>
              Also delete its database <span className="mono">{environment.database?.name ?? ''}</span> and uploaded
              files
            </span>
          </label>
          <div className="inline-form">
            <input
              className="mono"
              placeholder={environment.name}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              aria-label={`Type ${environment.name} to confirm`}
              autoFocus
            />
            <button className="button-danger" type="submit" disabled={busy !== null || confirm !== environment.name}>
              {busy === 'delete' ? 'Deleting…' : `Delete ${environment.name}`}
            </button>
            <button className="button-small" type="button" onClick={() => setDeleting(false)} disabled={busy !== null}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && <p className="form-error">{error}</p>}
    </section>
  );
}