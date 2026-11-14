import { useEffect, useState } from 'react';
import { api } from './api.js';
import Login from './Login.jsx';
import Shell from './Shell.jsx';

export default function App() {
  const [auth, setAuth] = useState('checking');

  useEffect(() => {
    api('/auth/me')
      .then(() => setAuth('signed-in'))
      .catch(() => setAuth('signed-out'));
  }, []);

  if (auth === 'checking') return <p style={{ padding: 24 }}>Checking your session…</p>;
  if (auth === 'signed-out') return <Login onSignedIn={() => setAuth('signed-in')} />;
  return <Shell onSignedOut={() => setAuth('signed-out')} />;
}