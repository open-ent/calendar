// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import {
  alldayBounds,
  buildIcs,
  foldIcsLine,
  googleCalendarUrl,
  htmlToText,
  icsFileName,
  outlookCalendarUrl,
  toShareable,
} from './addToCalendar';
import { CalendarEvent } from './api';

const ORIGIN = 'https://ent.example.fr';

const event = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  _id: 'evt1',
  title: 'Conseil de classe',
  startMoment: '2026-10-23T10:00:00.000Z',
  endMoment: '2026-10-23T11:30:00.000Z',
  calendar: ['cal1'],
  location: 'Salle 3, bâtiment B',
  description: '<p>Ordre du jour :</p><ul><li>bilan</li><li>orientation</li></ul>',
  ...over,
});

describe('toShareable', () => {
  it('aplatit la description et ajoute le lien de retour vers l’agenda', () => {
    const e = toShareable(event(), ORIGIN);
    expect(e.details).toBe('Ordre du jour :\n• bilan\n• orientation\n\nhttps://ent.example.fr/calendar#/view/cal1');
    expect(e.uid).toBe('evt1@ent.example.fr');
  });

  it('se contente du lien sans description', () => {
    expect(toShareable(event({ description: '' }), ORIGIN).details).toBe('https://ent.example.fr/calendar#/view/cal1');
  });
});

describe('htmlToText', () => {
  it('décode les entités et garde les sauts de ligne', () => {
    expect(htmlToText('<p>A &amp; B</p><p>C<br>D</p>')).toBe('A & B\nC\nD');
  });
});

describe('googleCalendarUrl', () => {
  it('passe les bornes en UTC', () => {
    const url = new URL(googleCalendarUrl(toShareable(event(), ORIGIN)));
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('text')).toBe('Conseil de classe');
    expect(url.searchParams.get('dates')).toBe('20261023T100000Z/20261023T113000Z');
    expect(url.searchParams.get('location')).toBe('Salle 3, bâtiment B');
  });

  it('journée entière : jours locaux, fin exclusive', () => {
    const start = new Date(2026, 9, 23, 0, 0);
    const end = new Date(2026, 9, 24, 23, 59);
    const e = toShareable(event({ allday: true, startMoment: start.toISOString(), endMoment: end.toISOString() }), ORIGIN);
    expect(new URL(googleCalendarUrl(e)).searchParams.get('dates')).toBe('20261023/20261025');
  });
});

describe('outlookCalendarUrl', () => {
  it('passe sujet, bornes ISO et lieu', () => {
    const url = new URL(outlookCalendarUrl(toShareable(event(), ORIGIN)));
    expect(url.host).toBe('outlook.live.com');
    expect(url.searchParams.get('subject')).toBe('Conseil de classe');
    expect(url.searchParams.get('startdt')).toBe('2026-10-23T10:00:00.000Z');
    expect(url.searchParams.get('enddt')).toBe('2026-10-23T11:30:00.000Z');
    expect(url.searchParams.get('allday')).toBeNull();
  });

  it('journée entière', () => {
    const start = new Date(2026, 9, 23, 8, 0);
    const e = toShareable(event({ allday: true, startMoment: start.toISOString(), endMoment: start.toISOString() }), ORIGIN);
    const url = new URL(outlookCalendarUrl(e));
    expect(url.searchParams.get('startdt')).toBe('2026-10-23');
    expect(url.searchParams.get('enddt')).toBe('2026-10-24');
    expect(url.searchParams.get('allday')).toBe('true');
  });
});

describe('alldayBounds', () => {
  it('une fin antérieure au début ne produit pas d’intervalle vide', () => {
    const e = toShareable(
      event({ allday: true, startMoment: new Date(2026, 9, 23).toISOString(), endMoment: new Date(2026, 9, 22).toISOString() }),
      ORIGIN,
    );
    const { first, afterLast } = alldayBounds(e);
    expect(afterLast.getTime() - first.getTime()).toBe(24 * 3600 * 1000);
  });
});

describe('buildIcs', () => {
  const ics = buildIcs(toShareable(event(), ORIGIN), new Date('2026-10-21T08:00:00Z'));

  it('produit un VEVENT complet, lignes terminées par CRLF', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics).toContain('\r\nUID:evt1@ent.example.fr\r\n');
    expect(ics).toContain('\r\nDTSTAMP:20261021T080000Z\r\n');
    expect(ics).toContain('\r\nDTSTART:20261023T100000Z\r\nDTEND:20261023T113000Z\r\n');
    expect(ics.endsWith('END:VEVENT\r\nEND:VCALENDAR\r\n')).toBe(true);
  });

  it('échappe virgules, points-virgules et sauts de ligne', () => {
    expect(ics).toContain('LOCATION:Salle 3\\, bâtiment B');
    expect(ics.replace(/\r\n /g, '')).toContain('DESCRIPTION:Ordre du jour :\\n• bilan');
  });

  it('journée entière en VALUE=DATE', () => {
    const d = new Date(2026, 9, 23, 0, 0);
    const allday = buildIcs(toShareable(event({ allday: true, startMoment: d.toISOString(), endMoment: d.toISOString() }), ORIGIN));
    expect(allday).toContain('DTSTART;VALUE=DATE:20261023\r\nDTEND;VALUE=DATE:20261024');
  });
});

describe('foldIcsLine', () => {
  it('replie à 75 octets sans couper un caractère accentué', () => {
    const folded = foldIcsLine('SUMMARY:' + 'é'.repeat(80));
    const encoder = new TextEncoder();
    for (const part of folded.split('\r\n')) expect(encoder.encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe('SUMMARY:' + 'é'.repeat(80));
  });
});

describe('icsFileName', () => {
  it('retire accents et caractères spéciaux', () => {
    expect(icsFileName('Réunion parents / profs : 3e B')).toBe('Reunion-parents-profs-3e-B.ics');
    expect(icsFileName('???')).toBe('evenement.ics');
  });
});
