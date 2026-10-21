import { CalendarEvent } from './api';

/**
 * « Ajouter à mon agenda » : recopie UN événement dans l'agenda personnel de l'usager, en un
 * clic, sans compte relié ni synchronisation serveur.
 *  - Google et Outlook : lien de création pré-rempli, ouvert dans un nouvel onglet ; l'usager
 *    n'a plus qu'à enregistrer dans son propre agenda.
 *  - Apple (et tout autre agenda) : fichier iCalendar d'un seul événement. Sur iPhone, iPad et
 *    Mac, son ouverture propose directement l'ajout dans Calendrier.
 *
 * Pour un événement récurrent, c'est l'occurrence affichée qui est ajoutée : chaque occurrence
 * est un événement à part entière côté serveur (cf. `api.createRecurrentEvents`).
 */

/** Ce qui part vers l'agenda de l'usager : texte brut, dates en `Date`. */
export interface ShareableEvent {
  uid: string;
  title: string;
  start: Date;
  end: Date;
  allday: boolean;
  location: string;
  /** Description en texte brut, suivie du lien de retour vers l'ENT. */
  details: string;
}

/** Aplatit la description HTML (éditeur riche) en texte : les agendas cibles n'en veulent pas. */
export function htmlToText(html: string): string {
  if (!html) return '';
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ');
  const doc = new DOMParser().parseFromString(withBreaks, 'text/html');
  return (doc.body.textContent ?? '')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Lien qui rouvre l'agenda de l'événement dans l'ENT (lien profond `#/view/:calendarId`). */
export function eventLink(event: CalendarEvent, origin = window.location.origin): string {
  const calendarId = event.calendar?.[0];
  return calendarId ? `${origin}/calendar#/view/${calendarId}` : `${origin}/calendar`;
}

export function toShareable(event: CalendarEvent, origin = window.location.origin): ShareableEvent {
  const text = htmlToText(event.description ?? '');
  const link = eventLink(event, origin);
  return {
    uid: `${event._id}@${new URL(origin).host}`,
    title: event.title,
    start: new Date(event.startMoment),
    end: new Date(event.endMoment),
    allday: !!event.allday,
    location: event.location ?? '',
    details: text ? `${text}\n\n${link}` : link,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `20261023T120000Z` — instant UTC, forme commune à Google et iCalendar. */
export function utcStamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/**
 * Bornes d'un événement « journée entière », en jours LOCAUX, fin EXCLUSIVE (convention
 * iCalendar, Google et Outlook). L'ENT stocke l'heure saisie (souvent 00:00 → 23:59) : on ne
 * garde que le jour, et le lendemain du dernier jour sert de borne de fin.
 */
export function alldayBounds(e: ShareableEvent): { first: Date; afterLast: Date } {
  const first = new Date(e.start.getFullYear(), e.start.getMonth(), e.start.getDate());
  const last = new Date(e.end.getFullYear(), e.end.getMonth(), e.end.getDate());
  const afterLast = new Date(Math.max(last.getTime(), first.getTime()));
  afterLast.setDate(afterLast.getDate() + 1);
  return { first, afterLast };
}

const dayStamp = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const dayIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function googleCalendarUrl(e: ShareableEvent): string {
  let dates: string;
  if (e.allday) {
    const { first, afterLast } = alldayBounds(e);
    dates = `${dayStamp(first)}/${dayStamp(afterLast)}`;
  } else {
    dates = `${utcStamp(e.start)}/${utcStamp(e.end)}`;
  }
  const params = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates, details: e.details });
  if (e.location) params.set('location', e.location);
  return `https://calendar.google.com/calendar/render?${params}`;
}

/**
 * Outlook sur le web. `outlook.live.com` (comptes personnels Outlook.com / Hotmail) : un compte
 * Microsoft 365 d'établissement y est redirigé vers sa boîte après authentification.
 */
export function outlookCalendarUrl(e: ShareableEvent): string {
  const params = new URLSearchParams({ path: '/calendar/action/compose', rru: 'addevent', subject: e.title, body: e.details });
  if (e.allday) {
    const { first, afterLast } = alldayBounds(e);
    params.set('startdt', dayIso(first));
    params.set('enddt', dayIso(afterLast));
    params.set('allday', 'true');
  } else {
    params.set('startdt', e.start.toISOString());
    params.set('enddt', e.end.toISOString());
  }
  if (e.location) params.set('location', e.location);
  return `https://outlook.live.com/calendar/0/action/compose?${params}`;
}

/** Échappement des valeurs texte iCalendar (RFC 5545 §3.3.11). */
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');

/** Repli des lignes à 75 octets (RFC 5545 §3.1), sans couper un caractère multi-octets. */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const bytes = encoder.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74; // les suites commencent par une espace
    if (size + bytes > limit) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/** Fichier iCalendar d'un seul événement. `now` est paramétrable pour les tests. */
export function buildIcs(e: ShareableEvent, now = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Open ENT//Agenda//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT'];
  lines.push(`UID:${e.uid}`, `DTSTAMP:${utcStamp(now)}`);
  if (e.allday) {
    const { first, afterLast } = alldayBounds(e);
    lines.push(`DTSTART;VALUE=DATE:${dayStamp(first)}`, `DTEND;VALUE=DATE:${dayStamp(afterLast)}`);
  } else {
    lines.push(`DTSTART:${utcStamp(e.start)}`, `DTEND:${utcStamp(e.end)}`);
  }
  lines.push(`SUMMARY:${icsText(e.title)}`);
  if (e.location) lines.push(`LOCATION:${icsText(e.location)}`);
  if (e.details) lines.push(`DESCRIPTION:${icsText(e.details)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

/** Nom de fichier lisible, sans caractères refusés par les systèmes de fichiers. */
export function icsFileName(title: string): string {
  const base = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'evenement'}.ics`;
}

/** Télécharge le fichier iCalendar : Calendrier (Apple) ou l'agenda par défaut l'ouvre. */
export function downloadIcs(e: ShareableEvent): void {
  const blob = new Blob([buildIcs(e)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = icsFileName(e.title);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
