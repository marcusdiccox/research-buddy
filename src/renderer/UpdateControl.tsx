import { Download, RefreshCw } from 'lucide-react';
import type { UpdateStatus } from '../shared/contracts';

export function updateLabel(status: UpdateStatus | undefined): string {
  if (!status) return '';
  switch (status.phase) {
    case 'ready':
      return `Update ${status.version} ready · installs on quit`;
    case 'downloading':
      return `Downloading update · ${status.percent ?? 0}%`;
    case 'available':
      return 'Update found · preparing download';
    case 'checking':
      return 'Checking updates…';
    case 'current':
      return `Up to date · v${status.currentVersion}`;
    case 'error':
      return 'Updates unavailable · try again';
    case 'unsupported':
      return `v${status.currentVersion} · updates after install`;
    default:
      return `v${status.currentVersion}`;
  }
}
export function UpdateControl({
  status,
  onError,
}: {
  status?: UpdateStatus;
  onError: (error: unknown) => void;
}) {
  const label = updateLabel(status);
  return (
    <button
      type="button"
      className="floating-icon update-check"
      aria-label="Check for updates"
      title={label || 'Check for updates'}
      disabled={['checking', 'available', 'downloading', 'ready'].includes(status?.phase ?? '')}
      onClick={() => void window.buddy?.call('checkForUpdates').catch(onError)}
    >
      {status?.phase === 'ready' ? <Download size={14} /> : <RefreshCw size={14} />}
    </button>
  );
}
