import { useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router';
import { api } from '../api.js';
import { repoLabel, serviceAddress, useApi } from '../hooks.js';
import DatabasePanel from '../components/DatabasePanel.jsx';

export default function ProjectPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { reloadProjects, status } = useOutletContext();
  const { data: project, error, loading, reload } = useApi(`/projects/${projectId}`);
  const [deleteError, setDeleteError] = useState(null);

  if (error) return <p className="form-error">{error.message}</p>;
  if (loading && !project) return <p className="muted">Loading project…</p>;

  async function deleteProject() {
    if (!window.confirm(`Delete ${project.name}? This cannot be undone.`)) return;
    try {
      await api(`/projects/${projectId}`, { method: 'DELETE' });
      await reloadProjects();
      navigate('/');
    } catch (err) {
      setDeleteError(err.message);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{project.name}</h1>
          <p className="muted">Services are published under {project.baseDomain}</p>
        </div>
        <Link to={`/projects/${projectId}/services/new`} className="button-primary">
          Add service
        </Link>
      </div>

      <h2 className="section-title">Services</h2>
      {project.services.length ? (
        <ul className="rows">
          {project.services.map((service) => (
            <li key={service._id} className="row">
              <span className="lamp" data-state={status?.services[service._id]?.lamp} aria-hidden="true" />
              <Link to={`/services/${service._id}`} className="row-title">
                {service.name}
                <span className="row-meta">
                  {status?.services[service._id]?.label ?? 'Checking…'} · {serviceAddress(service, project.baseDomain)}
                </span>
              </Link>
              <span className="row-meta mono">{serviceAddress(service, project.baseDomain)}</span>
              <span className="row-aside mono">{repoLabel(service)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty">
          <p>No services yet. Add one for each GitHub repository in this app, such as the frontend and the backend.</p>
        </div>
      )}
      <DatabasePanel project={project} onChange={reload} />
      <div className="danger-zone">
        <p className="muted">Deleting a project removes its settings. Remove its services first.</p>
        <button className="button-danger" type="button" onClick={deleteProject}>
          Delete project
        </button>
        {deleteError && <p className="form-error">{deleteError}</p>}
      </div>
    </div>
  );
}