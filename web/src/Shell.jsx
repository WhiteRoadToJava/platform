import { Link, NavLink, Outlet } from 'react-router';
import { api } from './api.js';
import { useApi } from './hooks.js';

export default function Shell({ onSignedOut }) {
  const projects = useApi('/projects');

  async function signOut() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    onSignedOut();
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link to="/" className="sidebar-title">
          Platform
        </Link>
        <nav aria-label="Projects">
          <h2 className="sidebar-heading">Projects</h2>
          {projects.data?.length ? (
            <ul className="nav-list">
              {projects.data.map((project) => (
                <li key={project._id}>
                  <NavLink to={`/projects/${project._id}`} className="nav-link">
                    <span className="lamp" aria-hidden="true" />
                    {project.name}
                  </NavLink>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sidebar-empty">{projects.loading ? 'Loading…' : 'No projects yet.'}</p>
          )}
        </nav>
        <Link to="/projects/new" className="button-quiet">
          New project
        </Link>
        <div className="sidebar-footer">
          <button className="button-quiet" type="button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet
          context={{
            projects: projects.data,
            projectsLoading: projects.loading,
            reloadProjects: projects.reload,
          }}
        />
      </main>
    </div>
  );
}