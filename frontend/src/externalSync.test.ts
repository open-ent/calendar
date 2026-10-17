import { describe, expect, it } from 'vitest';

import { ExternalSyncError } from './api';
import { formatDuration, runExternalSync } from './externalSync';

const noWait = () => Promise.resolve();

describe('runExternalSync', () => {
  it('mise à jour terminée après quelques interrogations', async () => {
    let polls = 0;
    const r = await runExternalSync({ sync: async () => undefined, isSyncing: async () => ++polls < 3, wait: noWait });
    expect(r).toEqual({ kind: 'updated' });
    expect(polls).toBe(3);
  });
  it('401 = déjà à jour, avec le délai restant', async () => {
    const r = await runExternalSync({
      sync: async () => {
        throw new ExternalSyncError(401, 3600);
      },
      isSyncing: async () => false,
      wait: noWait,
    });
    expect(r).toEqual({ kind: 'already', retryAfter: 3600 });
  });
  it('autre erreur ou synchro sans fin = erreur', async () => {
    expect(
      (await runExternalSync({ sync: async () => { throw new ExternalSyncError(500); }, isSyncing: async () => false, wait: noWait })).kind,
    ).toBe('error');
    expect((await runExternalSync({ sync: async () => undefined, isSyncing: async () => true, wait: noWait }, 3)).kind).toBe('error');
  });
});

describe('formatDuration', () => {
  it('heures, minutes, secondes', () => {
    expect(formatDuration(3900)).toBe('1 h 05 min');
    expect(formatDuration(720)).toBe('12 min');
    expect(formatDuration(30)).toBe('30 s');
  });
});
