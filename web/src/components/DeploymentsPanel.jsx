import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../api.js';
import { DEPLOYMENT_STATUS, formatTime, useApi } from '../hooks.js';

export default function DeploymentsPanel({ serviceId }) {
  const navigate = useNavigate();
  const deployments = useApi(`/services/${serviceId}/deployments`);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const active = deployments.data?.some((d) => d.status === 'queued' || d.status === 'building');

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(deployments.reload, 3000);
    return () => clearInterval(timer);
  }, [active, deployments.reload]);

  async function startBuild() {
    setBusy(true);
    setError(null);
    try {
      const deployment = await api(`/services/${serviceId}/deployments`, { method: 'POST' });
      navigate(`/deployments/${deployment._id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel-section panel-first">
      <div className="page-header">
        <h2 className="section-title">Deployments</h2>
        <button className="button-primary" type="button" onClick={startBuild} disabled={busy || active}>
          {active ? 'Build in progress' : 'Build now'}
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}

      {deployments.data?.length ? (
        <ul className="rows">
          {deployments.data.map((deployment) => {
            const status = DEPLOYMENT_STATUS[deployment.status];
            return (
              <li key={deployment._id} className="row">
                <span className="lamp" data-state={status.lamp} aria-hidden="true" />
                <Link to={`/deployments/${deployment._id}`} className="row-title">
                  {status.label}
                  {deployment.commitSha && <span className="mono"> {deployment.commitSha.slice(0, 7)}</span>}
                </Link>
                <span className="row-meta">{deployment.error || deployment.commitMessage || deployment.branch}</span>
                <span className="row-aside">{formatTime(deployment.createdAt)}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        !deployments.loading && <p className="muted">No builds yet. Build the latest commit to create an image.</p>
      )}
    </section>
  );
}