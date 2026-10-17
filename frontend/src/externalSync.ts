import { ExternalSyncError } from './api';

export type SyncOutcome =
  | { kind: 'updated' }
  | { kind: 'already'; retryAfter?: number }
  | { kind: 'error' };

interface SyncDeps {
  sync: () => Promise<void>;
  isSyncing: () => Promise<boolean>;
  /** Attente entre deux interrogations (injectée pour les tests). */
  wait: (ms: number) => Promise<void>;
}

/**
 * Resynchronise un agenda externe : demande la mise à jour, laisse le serveur travailler, puis
 * interroge jusqu'à la fin. Ex. HTTP 401 avec `error: "3600"` → « déjà à jour, réessayer dans 1 h ».
 */
export async function runExternalSync({ sync, isSyncing, wait }: SyncDeps, maxPolls = 20): Promise<SyncOutcome> {
  try {
    await sync();
    await wait(3000);
    for (let i = 0; i < maxPolls; i += 1) {
      if (!(await isSyncing())) return { kind: 'updated' };
      await wait(3000);
    }
    return { kind: 'error' };
  } catch (e) {
    if (e instanceof ExternalSyncError && e.status === 401) return { kind: 'already', retryAfter: e.retryAfter };
    return { kind: 'error' };
  }
}

/** « 1 h 05 min » / « 12 min » / « 30 s » pour une durée en secondes. */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m > 0) return `${m} min`;
  return `${s} s`;
}
