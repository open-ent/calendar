// Client REST du module Calendar (agenda) — cookies de session ENT, même origine.
// Mêmes endpoints que la version AngularJS (backend Java inchangé).
//
// ⚠️ SPÉCIFIQUE CALENDAR : le backend EXIGE le header `X-XSRF-TOKEN` (= cookie XSRF-TOKEN)
// sur toute mutation (POST/PUT/DELETE), sinon 401. (rbs/forum ne l'exigeaient pas.)

export interface Calendar {
  _id: string;
  title: string;
  color?: string;
  owner?: { userId: string; displayName: string };
  isDefault?: boolean;
  shared?: unknown[];
}

/** Un événement. Dates ISO (UTC) dans `startMoment`/`endMoment`. */
export interface CalendarEvent {
  _id: string;
  title: string;
  startMoment: string;
  endMoment: string;
  allday?: boolean;
  isRecurrent?: boolean;
  location?: string;
  description?: string;
  calendar: string[];
  owner?: { userId: string; displayName: string };
}

/** Corps de création/màj d'un événement. */
export interface EventInput {
  title: string;
  startMoment: string;
  endMoment: string;
  allday: boolean;
  isRecurrent: boolean;
  calendar: string[];
  location?: string;
  description?: string;
}

// ── Partage (modèle entcore batch, comme forum/rbs) ──────────────────────────
export interface ShareAction {
  name: string[];
  displayName: string;
  type: string;
}
export interface ShareVisible {
  id: string;
  name?: string;
  username?: string;
}
export interface ShareJson {
  actions: ShareAction[];
  groups: { visibles: ShareVisible[]; checked: Record<string, string[]> };
  users: { visibles: ShareVisible[]; checked: Record<string, string[]> };
}
export interface ShareBatch {
  users: Record<string, string[]>;
  groups: Record<string, string[]>;
  bookmarks: Record<string, string[]>;
}

/** Lit le cookie XSRF-TOKEN pour l'injecter en header (protection CSRF entcore). */
function xsrfHeader(): Record<string, string> {
  const m = typeof document !== 'undefined' ? document.cookie.match(/XSRF-TOKEN=([^;]+)/) : null;
  return m ? { 'X-XSRF-TOKEN': decodeURIComponent(m[1]) } : {};
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(String(res.status));
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

const base = { credentials: 'include' as const };
const jsonHeaders = { 'Content-Type': 'application/json' };
const mutHeaders = () => ({ ...jsonHeaders, ...xsrfHeader() });

// ── Calendriers ──────────────────────────────────────────────────────────────
export const getCalendars = async (): Promise<Calendar[]> =>
  json<Calendar[]>(await fetch('/calendar/calendars', base));

export const createCalendar = async (data: { title: string; color: string }): Promise<Calendar> =>
  json<Calendar>(
    await fetch('/calendar/calendars', { ...base, method: 'POST', headers: mutHeaders(), body: JSON.stringify(data) }),
  );

export const updateCalendar = async (id: string, data: { title: string; color: string }): Promise<Calendar> =>
  json<Calendar>(
    await fetch(`/calendar/${id}`, { ...base, method: 'PUT', headers: mutHeaders(), body: JSON.stringify(data) }),
  );

export const deleteCalendar = async (id: string): Promise<void> => {
  const res = await fetch(`/calendar/${id}`, { ...base, method: 'DELETE', headers: xsrfHeader() });
  if (!res.ok && res.status !== 204) throw new Error(String(res.status));
};

// ── Événements ────────────────────────────────────────────────────────────────
export const getEvents = async (calendarId: string): Promise<CalendarEvent[]> =>
  json<CalendarEvent[]>(await fetch(`/calendar/${calendarId}/events`, base));

export const createEvent = async (calendarId: string, data: EventInput): Promise<CalendarEvent> =>
  json<CalendarEvent>(
    await fetch(`/calendar/${calendarId}/events`, { ...base, method: 'POST', headers: mutHeaders(), body: JSON.stringify(data) }),
  );

export const updateEvent = async (calendarId: string, eventId: string, data: EventInput): Promise<CalendarEvent> =>
  json<CalendarEvent>(
    await fetch(`/calendar/${calendarId}/event/${eventId}`, { ...base, method: 'PUT', headers: mutHeaders(), body: JSON.stringify(data) }),
  );

export const deleteEvent = async (calendarId: string, eventId: string): Promise<void> => {
  const res = await fetch(`/calendar/${calendarId}/event/${eventId}`, { ...base, method: 'DELETE', headers: xsrfHeader() });
  if (!res.ok && res.status !== 204) throw new Error(String(res.status));
};

// ── Partage d'un calendrier ───────────────────────────────────────────────────
export const getCalendarShare = async (calendarId: string): Promise<ShareJson> =>
  json<ShareJson>(await fetch(`/calendar/share/json/${calendarId}`, base));

export const shareCalendarBatch = async (calendarId: string, batch: ShareBatch): Promise<void> => {
  const res = await fetch(`/calendar/share/resource/${calendarId}`, {
    ...base,
    method: 'PUT',
    headers: mutHeaders(),
    body: JSON.stringify(batch),
  });
  if (!res.ok) throw new Error(String(res.status));
};

export const api = {
  getCalendars,
  createCalendar,
  updateCalendar,
  deleteCalendar,
  getEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  getCalendarShare,
  shareCalendarBatch,
};
