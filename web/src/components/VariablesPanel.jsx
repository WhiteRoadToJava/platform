import { useState } from 'react';
import { api } from '../api.js';
import { useApi } from '../hooks.js';

const SOURCE_LABELS = {
  yours: 'Set here',
  reference: 'Uses a reference',
  platform: 'Added by the platform',
};

export default function VariablesPanel({ serviceId }) {
  const list = useApi(`/services/${serviceId}/variables`);
  const resolved = useApi(`/services/${serviceId}/variables/resolved`);
  const [revealed, setRevealed] = useState({});
  const [editing, setEditing] = useState(null);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [error, setError] = useState(null);

  async function refresh() {
    setRevealed({});
    await Promise.all([list.reload(), resolved.reload()]);
  }

  async function save(key, value) {
    setError(null);
    try {
      await api(`/services/${serviceId}/variables`, { method: 'PUT', body: JSON.stringify({ key, value }) });
      setEditing(null);
      await refresh();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }

  async function toggleReveal(variable) {
    if (variable._id in revealed) {
      setRevealed(({ [variable._id]: _, ...rest }) => rest);
      return;
    }
    const { value } = await api(`/variables/${variable._id}/value`);
    setRevealed((current) => ({ ...current, [variable._id]: value }));
  }

  async function startEdit(variable) {
    const { value } = await api(`/variables/${variable._id}/value`);
    setEditing({ key: variable.key, value });
  }

  async function remove(variable) {
    if (!window.confirm(`Delete ${variable.key}?`)) return;
    await api(`/variables/${variable._id}`, { method: 'DELETE' });
    await refresh();
  }

  async function handleAdd(event) {
    event.preventDefault();
    if (await save(newKey.trim(), newValue)) {
      setNewKey('');
      setNewValue('');
    }
  }

  async function handleImport(event) {
    event.preventDefault();
    setError(null);
    try {
      await api(`/services/${serviceId}/variables/import`, {
        method: 'POST',
        body: JSON.stringify({ text: importText }),
      });
      setImportText('');
      setImportOpen(false);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="panel-section">
      <h2 className="section-title">Variables</h2>
      <p className="muted">Values are encrypted and stay hidden until you show them.</p>

      {list.data?.length ? (
        <ul className="rows var-list">
          {list.data.map((variable) => (
            <li key={variable._id} className="var-row">
              <span className="mono var-key">{variable.key}</span>
              {editing?.key === variable.key ? (
                <form
                  className="inline-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    save(editing.key, editing.value);
                  }}
                >
                  <input
                    className="mono"
                    value={editing.value}
                    onChange={(event) => setEditing({ ...editing, value: event.target.value })}
                    autoFocus
                  />
                  <button className="button-small" type="submit">
                    Save
                  </button>
                  <button className="button-small" type="button" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <span className="mono var-value">{revealed[variable._id] ?? '••••••••'}</span>
                  <span className="var-actions">
                    <button className="button-small" type="button" onClick={() => toggleReveal(variable)}>
                      {variable._id in revealed ? 'Hide' : 'Show'}
                    </button>
                    <button className="button-small" type="button" onClick={() => startEdit(variable)}>
                      Edit
                    </button>
                    <button className="button-small" type="button" onClick={() => remove(variable)}>
                      Delete
                    </button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        !list.loading && <p className="muted">No variables yet.</p>
      )}

      <form className="add-variable" onSubmit={handleAdd}>
        <input
          className="mono"
          placeholder="NAME"
          value={newKey}
          onChange={(event) => setNewKey(event.target.value)}
          aria-label="Variable name"
        />
        <input
          className="mono"
          placeholder="value"
          value={newValue}
          onChange={(event) => setNewValue(event.target.value)}
          aria-label="Variable value"
        />
        <button className="button-quiet" type="submit" disabled={!newKey.trim()}>
          Add variable
        </button>
      </form>

      {importOpen ? (
        <form className="import-form" onSubmit={handleImport}>
          <textarea
            className="mono"
            rows={8}
            placeholder={'KEY=value\nOTHER_KEY=other value'}
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            aria-label="Variables in .env format"
          />
          <div className="form-actions">
            <button className="button-primary" type="submit" disabled={!importText.trim()}>
              Import variables
            </button>
            <button className="button-quiet" type="button" onClick={() => setImportOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button className="button-link" type="button" onClick={() => setImportOpen(true)}>
          Paste from a .env file
        </button>
      )}

      {error && <p className="form-error">{error}</p>}

      <h3 className="subsection-title">What the app receives</h3>
      {resolved.data?.errors.map((message) => (
        <p key={message} className="form-error">
          {message}
        </p>
      ))}
      {resolved.data?.warnings.map((message) => (
        <p key={message} className="form-warning">
          {message}
        </p>
      ))}
      {resolved.data && (
        <ul className="rows var-list">
          {resolved.data.variables.map((variable) => (
            <li key={variable.key} className="var-row var-row-resolved">
              <span className="mono var-key">{variable.key}</span>
              <span className="tag">{SOURCE_LABELS[variable.source]}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}