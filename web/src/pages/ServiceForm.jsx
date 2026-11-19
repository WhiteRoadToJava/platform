import { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router';
import { api } from '../api.js';
import { slugify, useApi } from '../hooks.js';
import VariablesPanel from '../components/VariablesPanel.jsx';
import DeploymentsPanel from '../components/DeploymentsPanel.jsx';
import LogsPanel from '../components/LogsPanel.jsx';

const DEFAULTS = {
  name: '',
  slug: '',
  repoUrl: '',
  branch: 'main',
  buildType: 'auto',
  internalPort: 8080,
  subdomain: '',
  pathPrefix: '',
  stripPrefix: false,
  healthcheckPath: '',
  memoryLimitMb: 512,
  customDomains: [],
};

const BUILD_TYPES = [
  ['auto', 'Detect automatically'],
  ['dockerfile', "Use the repository's Dockerfile"],
  ['java', 'Java with Maven'],
  ['react', 'React with Vite (static files)'],
  ['node', 'Node.js'],
];

export default function ServiceForm() {
  const { projectId, serviceId } = useParams();
  const editing = Boolean(serviceId);
  const navigate = useNavigate();
  const { status } = useOutletContext();
  const live = editing ? status?.services[serviceId] : null;
  const source = useApi(editing ? `/services/${serviceId}` : `/projects/${projectId}`);
  const [form, setForm] = useState(null);
  const [volumesText, setVolumesText] = useState('');
  const [slugEdited, setSlugEdited] = useState(editing);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [domainsText, setDomainsText] = useState('');

  useEffect(() => {
    if (!source.data) return;
    if (editing) {
      const { _id, project, createdAt, updatedAt, __v, volumes, ...fields } = source.data;
      setForm(fields);
      setVolumesText(volumes.map((v) => v.containerPath).join('\n'));
      setDomainsText((fields.customDomains ?? []).join('\n'));
    } else {
      setForm(DEFAULTS);
    }
  }, [source.data, editing]);

  if (source.error) return <p className="form-error">{source.error.message}</p>;
  if (!form) return <p className="muted">Loading…</p>;

  const project = editing ? source.data.project : source.data;
  const addresses = [
    ...(form.subdomain ? [`${form.subdomain}.${project.baseDomain}`] : []),
    ...domainsText.split('\n').map((line) => line.trim().toLowerCase()).filter(Boolean),
  ].map((host) => `https://${host}${form.pathPrefix}`);


  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleName(value) {
    setForm((current) => ({ ...current, name: value, slug: slugEdited ? current.slug : slugify(value) }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      ...form,
      internalPort: Number(form.internalPort),
      memoryLimitMb: Number(form.memoryLimitMb),
      volumes: volumesText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((containerPath) => ({ containerPath })),
      customDomains: domainsText
        .split('\n')
        .map((line) => line.trim().toLowerCase())
        .filter(Boolean),
    };
    try {
      if (editing) {
        await api(`/services/${serviceId}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await api(`/projects/${projectId}/services`, { method: 'POST', body: JSON.stringify(body) });
      }
      navigate(`/projects/${project._id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function deleteService() {
    if (!window.confirm(`Delete ${form.name}? This cannot be undone.`)) return;
    try {
      await api(`/services/${serviceId}`, { method: 'DELETE' });
      navigate(`/projects/${project._id}`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="page">
      <h1>{editing ? form.name || 'Service' : 'Add service'}</h1>
      <p className="muted">In {project.name}</p>
      {live && (
        <p className="service-status">
          <span className="lamp" data-state={live.lamp} aria-hidden="true" />
          {live.label}
        </p>
      )}

      {editing && <DeploymentsPanel serviceId={serviceId} />}
      {editing && <LogsPanel serviceId={serviceId} />}

      <form className="form" onSubmit={handleSubmit}>
        <fieldset>
          <legend>Source</legend>
          <div className="field-row">
            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" value={form.name} onChange={(e) => handleName(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="slug">Slug</label>
              <input
                id="slug"
                className="mono"
                value={form.slug}
                onChange={(e) => {
                  update('slug', e.target.value);
                  setSlugEdited(true);
                }}
                required
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="repoUrl">GitHub repository</label>
            <input
              id="repoUrl"
              value={form.repoUrl}
              onChange={(e) => update('repoUrl', e.target.value)}
              placeholder="https://github.com/owner/repo"
              required
            />
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="branch">Branch</label>
              <input id="branch" className="mono" value={form.branch} onChange={(e) => update('branch', e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="buildType">Build</label>
              <select id="buildType" value={form.buildType} onChange={(e) => update('buildType', e.target.value)}>
                {BUILD_TYPES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Network</legend>
          <div className="field-row">
            <div className="field">
              <label htmlFor="internalPort">Port</label>
              <input
                id="internalPort"
                type="number"
                value={form.internalPort}
                onChange={(e) => update('internalPort', e.target.value)}
                required
              />
              <span className="field-hint">The port your app listens on. Spring Boot uses 8080, static frontends 80.</span>
            </div>
            <div className="field">
              <label htmlFor="subdomain">Subdomain</label>
              <input id="subdomain" className="mono" value={form.subdomain} onChange={(e) => update('subdomain', e.target.value)} />
              <span className="field-hint">Leave empty to keep the service private.</span>
            </div>
          </div>
          <div className="field">
            <label htmlFor="pathPrefix">Path prefix</label>
            <input
              id="pathPrefix"
              className="mono"
              value={form.pathPrefix}
              onChange={(e) => update('pathPrefix', e.target.value)}
              placeholder="/api"
            />
            <span className="field-hint">
              Send only requests under this path to the service. Leave empty to receive everything else on the subdomain.
            </span>
          </div>
          <label className="checkbox">
            <input type="checkbox" checked={form.stripPrefix} onChange={(e) => update('stripPrefix', e.target.checked)} />
            <span>
              Remove the prefix before forwarding
              <span className="field-hint">Turn on if your app expects /users rather than /api/users.</span>
            </span>
          </label>
          <div className="address-preview">
            <span className="field-hint">{addresses.length > 1 ? 'Public addresses' : 'Public address'}</span>
            {addresses.length ? (
              addresses.map((address) => (
                <span key={address} className="mono">
                  {address}
                </span>
              ))
            ) : (
              <span className="mono">This service has no public address.</span>
            )}
          </div>
        </fieldset>

        <fieldset>
          <legend>Runtime</legend>
          <div className="field-row">
            <div className="field">
              <label htmlFor="memoryLimitMb">Memory limit (MB)</label>
              <input
                id="memoryLimitMb"
                type="number"
                value={form.memoryLimitMb}
                onChange={(e) => update('memoryLimitMb', e.target.value)}
                required
              />
              <span className="field-hint">The container stops if it uses more. Java apps need 768 or more.</span>
            </div>
            <div className="field">
              <label htmlFor="healthcheckPath">Health check path</label>
              <input
                id="healthcheckPath"
                className="mono"
                value={form.healthcheckPath}
                onChange={(e) => update('healthcheckPath', e.target.value)}
                placeholder="/api/health"
              />
              <span className="field-hint">Returns 200 when the app is ready. Used to verify new deployments.</span>
            </div>
          </div>
          <div className="field">
            <label htmlFor="customDomains">Custom domains</label>
            <textarea
              id="customDomains"
              className="mono"
              rows={2}
              value={domainsText}
              onChange={(e) => setDomainsText(e.target.value)}
              placeholder={'example.com\nwww.example.com'}
            />
            <span className="field-hint">
              Full domains this service also answers on, one per line. Each needs a public route to your tunnel in
              Cloudflare.
            </span>
          </div>
          <div className="field">
            <label htmlFor="volumes">Persistent folders</label>
            <textarea
              id="volumes"
              className="mono"
              rows={3}
              value={volumesText}
              onChange={(e) => setVolumesText(e.target.value)}
              placeholder="/app/uploads"
            />
            <span className="field-hint">
              Folders inside the container whose files must survive redeploys, such as uploads. One path per line.
            </span>
          </div>
        </fieldset>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button className="button-primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Add service'}
          </button>
          <Link to={`/projects/${project._id}`} className="button-quiet">
            Cancel
          </Link>
        </div>
      </form>
      {editing && <VariablesPanel serviceId={serviceId} />}
      {editing && (
        <div className="danger-zone">
          <p className="muted">Deleting a service removes its settings.</p>
          <button className="button-danger" type="button" onClick={deleteService}>
            Delete service
          </button>
        </div>
      )}
    </div>
  );
}