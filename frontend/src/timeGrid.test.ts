import { describe, expect, it } from 'vitest';

import { CalendarEvent } from './api';
import { allDayEvents, daySegments, slotStart, visibleHours } from './timeGrid';

const day = new Date(2026, 9, 17);
const ev = (id: string, sh: number, eh: number, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  _id: id,
  title: id,
  startMoment: new Date(2026, 9, 17, sh).toISOString(),
  endMoment: new Date(2026, 9, 17, eh).toISOString(),
  calendar: ['c'],
  ...extra,
});

describe('daySegments', () => {
  it('deux événements simultanés se partagent la largeur', () => {
    const [a, b] = daySegments([ev('a', 9, 10), ev('b', 9, 11)], day);
    expect(a.cols).toBe(2);
    expect(b.cols).toBe(2);
    expect(new Set([a.col, b.col]).size).toBe(2);
  });
  it('événements successifs : pas de partage', () => {
    const segs = daySegments([ev('a', 9, 10), ev('b', 10, 11)], day);
    expect(segs.every((s) => s.cols === 1 && s.col === 0)).toBe(true);
  });
  it('un événement à cheval sur minuit est coupé à la fin du jour', () => {
    const [s] = daySegments([ev('n', 22, 26)], day);
    expect(s.startMin).toBe(22 * 60);
    expect(s.endMin).toBe(24 * 60);
  });
  it('durée minimale de 30 min, journée entière exclue', () => {
    const [s] = daySegments([ev('c', 9, 9), ev('j', 0, 23, { allday: true })], day);
    expect(s.endMin - s.startMin).toBe(30);
    expect(daySegments([ev('j', 0, 23, { allday: true })], day)).toHaveLength(0);
  });
});

describe('allDayEvents, visibleHours, slotStart', () => {
  it('journée entière sur le jour', () => {
    expect(allDayEvents([ev('j', 0, 23, { allday: true }), ev('a', 9, 10)], day).map((e) => e._id)).toEqual(['j']);
  });
  it('plage 7h-20h élargie par un événement tôt/tard', () => {
    expect(visibleHours([])).toEqual({ from: 7, to: 20 });
    expect(visibleHours(daySegments([ev('t', 6, 8), ev('u', 19, 22)], day))).toEqual({ from: 6, to: 22 });
  });
  it('créneau cliqué arrondi à la demi-heure', () => {
    const d = slotStart(day, 9 * 60 + 40);
    expect([d.getHours(), d.getMinutes()]).toEqual([9, 30]);
  });
});
