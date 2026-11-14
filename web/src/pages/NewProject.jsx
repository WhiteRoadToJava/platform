import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import { api } from '../api.js';
import { slugify } from '../hooks.js';

export default function NewProject() {
  const navigate = useNavigate();
  const { reloadProjects } = useOutletContext();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [baseDomain, setBaseDomain] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  function handleName(value) {
    setName(value);
    if (!slugEdited) setSlug(slugify(value));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const project = await api('/projects', {
        method: 'POST',
        body: JSON.stringify({ name, slug, baseDomain }),
      });
      await reloadProjects();
      navigate(`/projects/${project._id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h1>New project</h1>
      <form className="form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" value={name} onChange={(e) => handleName(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label htmlFor="slug">Slug</label>
          <input
            id="slug"
            className="mono"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugEdited(true);
            }}
            required
          />
          <span className="field-hint">
            Used in container and database names. Lowercase letters, numbers and hyphens.
          </span>
        </div>
        <div className="field">
          <label htmlFor="baseDomain">Domain</label>
          <input
            id="baseDomain"
            value={baseDomain}
            onChange={(e) => setBaseDomain(e.target.value)}
            placeholder="example.com"
            required
          />
          <span className="field-hint">
            Services get addresses under this domain, like app.example.com. The domain needs a wildcard route
            to your Cloudflare tunnel.
          </span>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button className="button-primary" type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create project'}
          </button>
        </div>
      </form>
    </div>
  );
}