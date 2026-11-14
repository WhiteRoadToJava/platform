import { api } from './api.js';

export default function Shell({ onSignedOut }) {
  async function signOut() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    onSignedOut();
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-title">Platform</div>
        <div>
          <h2 className="sidebar-heading">Projects</h2>
          <p className="sidebar-empty">No projects yet.</p>
        </div>
        <div className="sidebar-footer">
          <button className="button-quiet" type="button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <h1>Projects</h1>
        <p>Projects you add will appear here, each with the status of its services.</p>
      </main>
    </div>
  );
}