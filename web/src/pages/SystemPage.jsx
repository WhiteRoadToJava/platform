import { useOutletContext } from 'react-router';
import { formatBytes, formatTime } from '../hooks.js';

export default function SystemPage() {
  const { system } = useOutletContext();

  if (!system || system.pending) return <p className="muted">Checking the server…</p>;

  const { containers, backup, disk } = system;

  return (
    <div className="page">
      <h1>Server</h1>
      <p className="muted">Checked {formatTime(system.checkedAt)}. Updates every minute.</p>

      <h2 className="section-title section-gap">Infrastructure</h2>
      <ul className="rows">
        {containers.map((container) => (
          <li key={container.name} className="row">
            <span className="lamp" data-state={container.lamp} aria-hidden="true" />
            <span className="row-title">{container.label}</span>
            <span className="row-meta">
              {container.text}
              {container.startedAt && ` since ${formatTime(container.startedAt)}`}
            </span>
            <span className="row-aside mono">{container.name}</span>
          </li>
        ))}
      </ul>

      <h2 className="section-title section-gap">Backups</h2>
      <div className="summary">
        <p className="service-status">
          <span className="lamp" data-state={backup.lamp} aria-hidden="true" />
          {backup.text}
        </p>
        {backup.last && (
          <dl className="facts">
            <dt>Last run</dt>
            <dd>{formatTime(backup.last.at)}</dd>
            <dt>File</dt>
            <dd className="mono">{backup.last.file}</dd>
            <dt>Size</dt>
            <dd>{formatBytes(backup.last.bytes)}</dd>
            <dt>Copies on this server</dt>
            <dd>{backup.files.length}</dd>
          </dl>
        )}
      </div>

      <h2 className="section-title section-gap">Disk</h2>
      <div className="summary">
        <p className="service-status">
          <span className="lamp" data-state={disk.lamp} aria-hidden="true" />
          {disk.text}
        </p>
        <div className="meter" role="img" aria-label={`Disk ${disk.percent}% used`}>
          <div className="meter-fill" data-state={disk.lamp} style={{ width: `${disk.percent}%` }} />
        </div>
        <p className="muted">
          {formatBytes(disk.used)} used, {formatBytes(disk.free)} free
        </p>
      </div>
    </div>
  );
}