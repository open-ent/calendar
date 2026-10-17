import { describe, expect, it } from 'vitest';

import { CalendarEvent } from './api';
import { defaultListRange, filterByDates, nextSort, sortEvents } from './listView';

const ev = (id: string, title: string, start: string, end: string, cal = 'c1'): CalendarEvent => ({
  _id: id,
  title,
  startMoment: new Date(start).toISOString(),
  endMoment: new Date(end).toISOString(),
  calendar: [cal],
});

describe('liste : filtre de dates', () => {
  const list = [
    ev('a', 'A', '2026-10-10T09:00', '2026-10-12T10:00'),
    ev('b', 'B', '2026-10-20T09:00', '2026-10-20T10:00'),
    ev('c', 'C', '2026-11-05T09:00', '2026-11-05T10:00'),
  ];
  it('garde ce qui recoupe la période, bornes incluses', () => {
    expect(filterByDates(list, '2026-10-12', '2026-10-20').map((e) => e._id)).toEqual(['a', 'b']);
  });
  it('bornes vides : pas de filtre', () => {
    expect(filterByDates(list, '', '')).toHaveLength(3);
  });
  it('période par défaut : aujourd’hui → +2 mois', () => {
    expect(defaultListRange(new Date(2026, 9, 17))).toEqual({ from: '2026-10-17', to: '2026-12-17' });
  });
});

describe('liste : tri', () => {
  const list = [ev('1', 'beta', '2026-10-02T09:00', '2026-10-02T10:00', 'x'), ev('2', 'Alpha', '2026-10-01T09:00', '2026-10-01T10:00', 'y')];
  const cal = (e: CalendarEvent) => e.calendar[0];
  it('par titre sans casse, puis inverse', () => {
    expect(sortEvents(list, { key: 'title', reverse: false }, cal).map((e) => e._id)).toEqual(['2', '1']);
    expect(sortEvents(list, { key: 'title', reverse: true }, cal).map((e) => e._id)).toEqual(['1', '2']);
  });
  it('par agenda et par début', () => {
    expect(sortEvents(list, { key: 'calendar', reverse: false }, cal)[0]._id).toBe('1');
    expect(sortEvents(list, { key: 'startMoment', reverse: false }, cal)[0]._id).toBe('2');
  });
  it('en-tête actif inverse, autre en-tête repart croissant', () => {
    expect(nextSort({ key: 'title', reverse: false }, 'title')).toEqual({ key: 'title', reverse: true });
    expect(nextSort({ key: 'title', reverse: true }, 'endMoment')).toEqual({ key: 'endMoment', reverse: false });
  });
});
