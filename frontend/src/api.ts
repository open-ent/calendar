// Client REST du module Calendar (agenda) — cookies de session ENT, même origine.
// Mêmes endpoints que la version AngularJS (backend Java inchangé).
//
// ⚠️ SPÉCIFIQUE CALENDAR : le backend EXIGE le header `X-XSRF-TOKEN` (= cookie XSRF-TOKEN)
// sur toute mutation (POST/PUT/DELETE), sinon 401. (rbs/forum ne l'exigeaient pas.)

/**
 * Une entrée du tableau `shared` entcore : le destinataire (`userId` OU `groupId`) et,
 * à plat, chaque action accordée (`"net-atos-…|createEvent": true`).
 */
export interface SharedEntry {
  userId?: string;
  groupId?: string;
  [action: string]: string | boolean | undefined;
}

export interface Calendar {
  _id: string;
  title: string;
  color?: string;
  owner?: { userId: string; displayName: string };
  isDefault?: boolean;
  shared?: SharedEntry[];
  /** Agenda externe : alimenté par un flux ICS (icsLink), synchronisé côté serveur. */
  isExternal?: boolean;
  icsLink?: string;
  /** "structure" pour un agenda d'établissement (POST /calendar/calendars/structure). */
  type?: string;
  /** Publication sur le portail public (flux ICS anonyme GET /calendar/pub/:id/events.ics). */
  portalPublished?: boolean;
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
  shared?: SharedEntry[];
  /** Récurrence : identifiant de l'événement parent de la série. */
  parentId?: string;
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

/**
 * Crée un agenda. La nature choisie décide de l'endpoint, chacun étant gaté par son propre droit
 * de workflow côté serveur (`calendar.structure`, `calendar.group`) — exactement comme
 * `model/Calendar.ts#create()` de l'IHM AngularJS.
 */
export interface NewCalendar {
  title: string;
  color: string;
  type?: 'personal' | 'structure' | 'group';
  /** Requis pour un agenda d'établissement : la structure de rattachement. */
  structureId?: string;
}

export const createCalendar = async (data: NewCalendar): Promise<Calendar> => {
  const url =
    data.type === 'structure'
      ? '/calendar/calendars/structure'
      : data.type === 'group'
        ? '/calendar/calendars/group'
        : '/calendar/calendars';
  return json<Calendar>(
    await fetch(url, { ...base, method: 'POST', headers: mutHeaders(), body: JSON.stringify(data) }),
  );
};

/** Ajoute un agenda externe (flux ICS) — l'URL doit correspondre à une plateforme autorisée. */
export const addExternalCalendar = async (data: { title: string; color: string; icsLink: string }): Promise<void> => {
  const res = await fetch('/calendar/url', {
    ...base,
    method: 'POST',
    headers: mutHeaders(),
    body: JSON.stringify({ ...data, isExternal: true }),
  });
  if (!res.ok) throw new Error(String(res.status));
};

export const updateCalendar = async (id: string, data: { title: string; color: string }): Promise<Calendar> =>
  json<Calendar>(
    await fetch(`/calendar/${id}`, { ...base, method: 'PUT', headers: mutHeaders(), body: JSON.stringify(data) }),
  );

export const deleteCalendar = async (id: string): Promise<void> => {
  const res = await fetch(`/calendar/${id}`, { ...base, method: 'DELETE', headers: xsrfHeader() });
  if (!res.ok && res.status !== 204) throw new Error(String(res.status));
};

/** URL publique (anonyme) du flux ICS d'un agenda publié sur le portail — à coller dans WordPress. */
export const publicIcalUrl = (calendarId: string): string => `${window.location.origin}/calendar/pub/${calendarId}/events.ics`;

export const publishCalendarPortal = async (id: string): Promise<void> => {
  const res = await fetch(`/calendar/${id}/portal-publish`, { ...base, method: 'PUT', headers: mutHeaders() });
  if (!res.ok) throw new Error(String(res.status));
};

export const unpublishCalendarPortal = async (id: string): Promise<void> => {
  const res = await fetch(`/calendar/${id}/portal-publish`, { ...base, method: 'DELETE', headers: xsrfHeader() });
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

// ── Préférences d'affichage ───────────────────────────────────────────────────
// Mêmes clé et format que l'IHM AngularJS (`model/Calendar.ts#Preference`) : les agendas
// cochés suivent l'usager d'une interface à l'autre et d'une session à l'autre.

export interface CalendarPreference {
  selectedCalendars: string[];
}

export const getPreference = async (): Promise<CalendarPreference | null> => {
  const res = await fetch('/userbook/preference/calendar', base);
  if (!res.ok) return null;
  const body = (await res.json()) as { preference?: string } | null;
  if (!body?.preference) return null;
  try {
    const parsed = JSON.parse(body.preference) as Partial<CalendarPreference>;
    return Array.isArray(parsed?.selectedCalendars)
      ? { selectedCalendars: parsed.selectedCalendars }
      : null;
  } catch {
    // Préférence illisible (ancien format, écriture partielle) : on repart d'une page blanche.
    return null;
  }
};

export const savePreference = async (preference: CalendarPreference): Promise<void> => {
  await fetch('/userbook/preference/calendar', {
    ...base,
    method: 'PUT',
    headers: mutHeaders(),
    body: JSON.stringify(preference),
  });
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

// ── Partage d'un événement ────────────────────────────────────────────────────
export const getEventShare = async (eventId: string): Promise<ShareJson> =>
  json<ShareJson>(await fetch(`/calendar/calendarevent/share/json/${eventId}`, base));

export const shareEventBatch = async (eventId: string, batch: ShareBatch): Promise<void> => {
  const res = await fetch(`/calendar/calendarevent/share/resource/${eventId}`, {
    ...base,
    method: 'PUT',
    headers: mutHeaders(),
    body: JSON.stringify(batch),
  });
  if (!res.ok) throw new Error(String(res.status));
};

export const api = {
  addExternalCalendar,
  getPreference,
  savePreference,
  getCalendars,
  createCalendar,
  updateCalendar,
  deleteCalendar,
  publishCalendarPortal,
  unpublishCalendarPortal,
  getEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  getCalendarShare,
  shareCalendarBatch,
  getEventShare,
  shareEventBatch,
};
