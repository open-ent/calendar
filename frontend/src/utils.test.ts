import { describe, expect, it } from 'vitest';

import { isoUtcToLocalInput, isSameDay, localInputToIsoUtc, startOfWeek, weekDays } from './utils';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('semaine', () => {
  it('startOfWeek ramène au lundi', () => {
    expect(ymd(startOfWeek(new Date('2026-11-18T12:00:00')))).toBe('2026-11-16'); // mercredi -> lundi
    expect(ymd(startOfWeek(new Date('2026-11-22T12:00:00')))).toBe('2026-11-16'); // dimanche -> lundi
  });
  it('weekDays renvoie 7 jours lundi→dimanche', () => {
    const days = weekDays(startOfWeek(new Date('2026-11-18T12:00:00')));
    expect(days).toHaveLength(7);
    expect(ymd(days[0])).toBe('2026-11-16');
    expect(ymd(days[6])).toBe('2026-11-22');
  });
});

describe('isSameDay', () => {
  it('compare le jour civil local', () => {
    expect(isSameDay('2026-11-16T09:00:00.000Z', new Date('2026-11-16T20:00:00'))).toBe(true);
    expect(isSameDay('2026-11-17T09:00:00.000Z', new Date('2026-11-16T20:00:00'))).toBe(false);
  });
});

describe('conversions datetime-local ↔ ISO UTC', () => {
  it('aller-retour cohérent', () => {
    const local = '2026-09-10T10:00';
    const iso = localInputToIsoUtc(local);
    expect(iso).toMatch(/Z$/);
    expect(isoUtcToLocalInput(iso)).toBe(local);
  });
  it('renvoie une chaîne vide pour une entrée absente/invalide', () => {
    expect(localInputToIsoUtc('')).toBe('');
    expect(isoUtcToLocalInput(undefined)).toBe('');
    expect(isoUtcToLocalInput('pas-une-date')).toBe('');
  });
});
