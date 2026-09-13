import { useStore } from '../state/store';
import type { SyncStatus } from '../state/useSync';

const LABEL: Record<SyncStatus, string> = {
  idle: 'Synced',
  syncing: 'Syncing…',
  offline: 'Offline',
  signedOut: 'Sign in',
  error: 'Sync failed',
  wrongAccount: 'Wrong account',
};

interface Props {
  status: SyncStatus;
  pendingCount: number;
  conflict: { date: string; mine: unknown } | null;
  onSync: () => void;
  onSignIn: () => void;
}

export function SyncChip({ status, pendingCount, onSync, onSignIn }: Props) {
  const clickable = status === 'signedOut' ? onSignIn : onSync;
  const label = status === 'idle' && pendingCount > 0
    ? `${pendingCount} to sync`
    : LABEL[status];

  return (
    <button className={`sync ${status}`} onClick={clickable} aria-label={`Sync status: ${label}`}>
      <span className="dotv" />
      {label}
    </button>
  );
}

/**
 * A losing conflict is kept rather than discarded, so the version that lost can
 * still be recovered. Silence here would mean silent data loss.
 */
export function ConflictBanner({ date, onRestore, onDismiss }: {
  date: string; onRestore: () => void; onDismiss: () => void;
}) {
  return (
    <div className="note warn" role="alert">
      <b>Another device had a newer version of {date}.</b> Its version is now
      showing. Your version from this device was kept.
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="mini" onClick={onRestore}>Restore my version</button>
        <button className="mini" onClick={onDismiss}>Keep theirs</button>
      </div>
    </div>
  );
}

export function SignedOutNote({ onSignIn }: { onSignIn: () => void }) {
  const { store } = useStore();
  const n = Object.keys(store.sessions).length;
  return (
    <div className="note">
      <b>Not syncing.</b> {n > 0 ? `${n} session${n === 1 ? '' : 's'} are` : 'Your data is'} stored
      on this device only. Signing in backs them up and syncs across devices —
      training works either way.
      <div style={{ marginTop: 10 }}>
        <button className="mini" onClick={onSignIn}>Sign in with GitHub</button>
      </div>
    </div>
  );
}
