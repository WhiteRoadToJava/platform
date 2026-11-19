import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { api } from './api.js';
import Login from './Login.jsx';
import Shell from './Shell.jsx';
import ProjectsHome from './pages/ProjectsHome.jsx';
import NewProject from './pages/NewProject.jsx';
import ProjectPage from './pages/ProjectPage.jsx';
import ServiceForm from './pages/ServiceForm.jsx';
import DeploymentPage from './pages/DeploymentPage.jsx';
import SystemPage from './pages/SystemPage.jsx';

export default function App() {
  const [auth, setAuth] = useState('checking');

  useEffect(() => {
    api('/auth/me')
      .then(() => setAuth('signed-in'))
      .catch(() => setAuth('signed-out'));
  }, []);

  if (auth === 'checking') return <p style={{ padding: 24 }}>Checking your session…</p>;
  if (auth === 'signed-out') return <Login onSignedIn={() => setAuth('signed-in')} />;

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell onSignedOut={() => setAuth('signed-out')} />}>
          <Route index element={<ProjectsHome />} />
          <Route path="projects/new" element={<NewProject />} />
          <Route path="projects/:projectId" element={<ProjectPage />} />
          <Route path="projects/:projectId/services/new" element={<ServiceForm />} />
          <Route path="services/:serviceId" element={<ServiceForm />} />
          <Route path="deployments/:deploymentId" element={<DeploymentPage />} />
          <Route path="system" element={<SystemPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}