import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

export default function LogsPanel({serviceId, environmentId }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [follow, setFollow] = useState(false);
  const logRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await api(`/services/${serviceId}/logs?environmentId=${environmentId}`);
      setText(data.text);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [serviceId, environmentId]);

  useEffect(() => {
    load();
    if (!follow) return;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [load, follow]);

  useEffect(() => {
    const element = logRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [text]);

  return (
    <section className="panel-section">
      <div className="panel-header">
        <h2 className="section-title">Logs</h2>
        <div className="panel-actions">
          <label className="checkbox-inline">
            <input type="checkbox" checked={follow} onChange={(event) => setFollow(event.target.checked)} />
            Follow
          </label>
          <button className="button-small" type="button" onClick={load}>
            Refresh
          </button>
        </div>
      </div>
      <p className="muted">
        The last 300 lines from the running container. Logs of crashed and replaced versions are saved on each
        deployment's page.
      </p>
      {error ? (
        <p className="form-error">{error}</p>
      ) : (
        <pre className="log log-short" ref={logRef}>
          {text || (loading ? 'Loading…' : 'No output yet.')}
        </pre>
      )}
    </section>
  );
}