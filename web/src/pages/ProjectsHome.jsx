import { Link, useOutletContext } from 'react-router';

export default function ProjectsHome() {
  const { projects, projectsLoading, status } = useOutletContext();

  if (projectsLoading && !projects) return <p className="muted">Loading projects…</p>;

  if (!projects?.length) {
    return (
      <div className="page">
        <h1>Projects</h1>
        <div className="empty">
          <p>
            A project groups the services that make up one app, such as its frontend and backend. Add your
            first project to start.
          </p>
          <Link to="/projects/new" className="button-primary">
            New project
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Projects</h1>
        <Link to="/projects/new" className="button-primary">
          New project
        </Link>
      </div>
      <ul className="rows">
        {projects.map((project) => (
          <li key={project._id} className="row">
            <span className="lamp" data-state={status?.projects[project._id]} aria-hidden="true" />            <Link to={`/projects/${project._id}`} className="row-title">
              {project.baseDomain}
            </Link>
            <span className="row-meta">
              {status?.services[service._id]?.label ?? 'Checking…'} · {serviceAddress(service, project.baseDomain)}
            </span>
            <span className="row-aside">
              {project.services.length} {project.services.length === 1 ? 'service' : 'services'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}