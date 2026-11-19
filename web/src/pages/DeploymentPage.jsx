import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../api.js';
import { DEPLOYMENT_STATUS, formatTime, useApi } from '../hooks.js';

export default function DeploymentPage() {
  const { deploymentId } = useParams();
  const info = useApi(`/deployments/${deploymentId}`);
  const [log, setLog] = useState('');
  const [status, setStatus] = useState(null);
  const offset = useRef(0);
  const logRef = useRef(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    let cancelled = false;
    let timer;
    offset.current = 0;
    setLog('');

    async function poll() {
      try {
        const data = await api(`/deployments/${deploymentId}/log?offset=${offset.current}`);
        if (cancelled) return;
        if (data.text) setLog((current) => current + data.text);
        offset.current = data.offset;
        setStatus(data.status);
        if (!data.done) timer = setTimeout(poll, 1000);
      } catch {
        if (!cancelled) timer = setTimeout(poll, 3000);
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [deploymentId]);

  useEffect(() => {
    info.reload();
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const element = logRef.current;
    if (element && stickToBottom.current) element.scrollTop = element.scrollHeight;
  }, [log]);

  function handleScroll() {
    const element = logRef.current;
    stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
  }

  const deployment = info.data;
  const currentStatus = status || deployment?.status || 'queued';
  const current = DEPLOYMENT_STATUS[currentStatus] ?? { label: currentStatus };
  return (
    <div className="page page-wide">
      {deployment && (
        <p className="muted">
          <Link to={`/services/${deployment.service._id}`}>{deployment.service.name}</Link>
        </p>
      )}
      <h1 className="status-line">
        <span className="lamp" data-state={current.lamp} aria-hidden="true" />
        {current.label}
        {deployment?.commitSha && <span className="mono"> {deployment.commitSha.slice(0, 7)}</span>}
      </h1>
      {deployment && (
        <p className="muted">
          {deployment.commitMessage || deployment.branch}. Started {formatTime(deployment.createdAt)}.
        </p>
      )}
      {deployment?.error && <p className="form-error">{deployment.error}</p>}
      <pre className="log" ref={logRef} onScroll={handleScroll}>
        {log || 'Waiting for the build to start…'}
      </pre>
      <SavedLogs deploymentId={deploymentId} />
    </div>
  );
}


function SavedLogs({ deploymentId }) {
  const saved = useApi(`/deployments/${deploymentId}/saved-logs`);
  const [openName, setOpenName] = useState(null);
  const [text, setText] = useState('');

  if (!saved.data?.length) return null;

  async function toggle(name) {
    if (openName === name) {
      setOpenName(null);
      return;
    }
    const data = await api(`/deployments/${deploymentId}/saved-logs/${encodeURIComponent(name)}`);
    setText(data.text);
    setOpenName(name);
  }

  return (
    <section className="panel-section">
      <h2 className="section-title">Saved runtime logs</h2>
      <p className="muted">Saved when this version crashed or was replaced by a newer deployment.</p>
      <ul className="rows">
        {saved.data.map((file) => (
          <li key={file.name} className="row">
            <span className="lamp" data-state={file.reason === 'crash' ? 'fail' : undefined} aria-hidden="true" />
            <button className="row-title button-plain" type="button" onClick={() => toggle(file.name)}>
              {file.reason === 'crash' ? 'Crash' : 'Replaced by a newer version'}
            </button>
            <span className="row-aside">{formatTime(file.at)}</span>
          </li>
        ))}
      </ul>
      {openName && <pre className="log log-short">{text}</pre>}
    </section>
  );
}