import { describe, expect, it } from 'vitest';

import {
  daySpan,
  isMultiDay,
  isoUtcToLocalInput,
  isSameDay,
  isSameMonth,
  localInputToIsoUtc,
  monthGrid,
  occupiesDay,
  startOfWeek,
  weekDays,
} from './utils';

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

describe('grille mensuelle', () => {
  it('monthGrid renvoie 42 jours débutant un lundi', () => {
    const grid = monthGrid(new Date('2026-11-15T12:00:00'));
    expect(grid).toHaveLength(42);
    expect(grid[0].getDay()).toBe(1); // lundi
    // novembre 2026 : le 1er est un dimanche -> la grille démarre le lundi 26 oct.
    expect(ymd(grid[0])).toBe('2026-10-26');
  });
  it('isSameMonth compare le mois civil', () => {
    expect(isSameMonth(new Date('2026-11-30'), new Date('2026-11-01'))).toBe(true);
    expect(isSameMonth(new Date('2026-12-01'), new Date('2026-11-01'))).toBe(false);
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

describe('événements sur plusieurs jours', () => {
  // Dates en heure locale : c'est le jour civil de l'usager qui compte dans les vues.
  const d = (s: string) => new Date(s).toISOString();
  const day = (s: string) => new Date(`${s}T12:00:00`);

  it("occupiesDay couvre chaque jour entre le début et la fin", () => {
    const start = d('2026-11-16T14:00:00');
    const end = d('2026-11-18T10:00:00');
    expect(occupiesDay(start, end, day('2026-11-15'))).toBe(false);
    expect(occupiesDay(start, end, day('2026-11-16'))).toBe(true);
    expect(occupiesDay(start, end, day('2026-11-17'))).toBe(true); // jour entièrement couvert
    expect(occupiesDay(start, end, day('2026-11-18'))).toBe(true);
    expect(occupiesDay(start, end, day('2026-11-19'))).toBe(false);
  });

  it("une fin à minuit pile ne déborde pas sur le jour suivant", () => {
    const start = d('2026-11-16T20:00:00');
    const end = d('2026-11-17T00:00:00');
    expect(occupiesDay(start, end, day('2026-11-16'))).toBe(true);
    expect(occupiesDay(start, end, day('2026-11-17'))).toBe(false);
    expect(isMultiDay(start, end)).toBe(false);
  });

  it('un événement sur une seule journée reste sur son jour', () => {
    const start = d('2026-11-16T09:00:00');
    const end = d('2026-11-16T17:00:00');
    expect(occupiesDay(start, end, day('2026-11-16'))).toBe(true);
    expect(occupiesDay(start, end, day('2026-11-17'))).toBe(false);
    expect(isMultiDay(start, end)).toBe(false);
  });

  it('daySpan situe le jour dans la série', () => {
    const start = d('2026-11-16T14:00:00');
    const end = d('2026-11-18T10:00:00');
    expect(daySpan(start, end, day('2026-11-16'))).toBe('start');
    expect(daySpan(start, end, day('2026-11-17'))).toBe('middle');
    expect(daySpan(start, end, day('2026-11-18'))).toBe('end');
    expect(daySpan(start, d('2026-11-16T17:00:00'), day('2026-11-16'))).toBe('single');
  });

  it('des dates incohérentes ne font pas disparaître l’événement', () => {
    const start = d('2026-11-16T14:00:00');
    expect(occupiesDay(start, d('2026-11-15T10:00:00'), day('2026-11-16'))).toBe(true); // fin avant début
    expect(occupiesDay(start, undefined, day('2026-11-16'))).toBe(true); // pas de fin
    expect(occupiesDay('pas-une-date', start, day('2026-11-16'))).toBe(false);
  });
});
