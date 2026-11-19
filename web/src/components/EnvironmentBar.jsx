import { useState } from 'react';
import { api } from '../api.js';

export default function EnvironmentBar({ environments, current, onSelect, projectId, onCreated }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [branch, setBranch] = useState('dev');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleCreate(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const environment = await api(`/projects/${projectId}/environments`, {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), branch: branch.trim() }),
      });
      await onCreated();
      onSelect(environment.name);
      setCreating(false);
      setName('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!current) return null;

  return (
    <div className="env-bar">
      <div className="env-tabs" role="tablist" aria-label="Environment">
        {environments.map((environment) => (
          <button
            key={environment._id}
            type="button"
            role="tab"
            aria-selected={environment._id === current._id}
            className="env-tab"
            onClick={() => onSelect(environment.name)}
          >
            {environment.name}
            {environment.kind === 'preview' && <span className="env-branch mono">{environment.branch}</span>}
          </button>
        ))}
        {onCreated && !creating && (
          <button type="button" className="button-link" onClick={() => setCreating(true)}>
            New environment
          </button>
        )}
      </div>

      {creating && (
        <form className="inline-form env-form" onSubmit={handleCreate}>
          <input
            className="mono"
            placeholder="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="Environment name"
            autoFocus
          />
          <input
            className="mono"
            placeholder="branch"
            value={branch}
            onChange={(event) => setBranch(event.target.value)}
            aria-label="Branch to deploy"
          />
          <button className="button-small" type="submit" disabled={busy || !name.trim() || !branch.trim()}>
            {busy ? 'Creating…' : 'Create'}
          </button>
          <button className="button-small" type="button" onClick={() => setCreating(false)}>
            Cancel
          </button>
        </form>
      )}
      {error && <p className="form-error">{error}</p>}

      {current.kind === 'preview' && (
        <p className="env-note">
          You are working on <strong>{current.name}</strong>. It deploys the <span className="mono">{current.branch}</span>{' '}
          branch and never touches production.
        </p>
      )}
    </div>
  );
}