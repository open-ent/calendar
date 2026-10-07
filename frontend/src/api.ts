import { Occurrence, Recurrence } from './recurrence';

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

/**
 * Une réservation de ressource (module RBS) rattachée à un événement. Le serveur la joint à
 * l'événement ; sa suppression se demande au moment de supprimer l'événement.
 */
export interface EventBooking {
  id: number;
  start_date?: string;
  end_date?: string;
  resource?: { name?: string };
}

/**
 * Rappel d'un événement, pour l'usager courant. Le serveur stocke des dates calculées mais
 * renvoie et accepte cette forme à cases (`ReminderConverter`), et ne rattache le rappel à
 * l'événement lu que si `enableReminder` est actif dans la configuration du module.
 */
export interface EventReminder {
  /** Présent quand le rappel existe déjà : c'est lui qui fait choisir au serveur mise à jour
   *  plutôt que création. */
  _id?: string;
  eventId?: string;
  reminderType: { email: boolean; timeline: boolean };
  reminderFrequency: { hour: boolean; day: boolean; week: boolean; month: boolean };
}

/**
 * Pièce jointe d'un événement : un document du workspace, recopié dans l'événement sous la
 * forme que produisait `Document.toJSON()` côté AngularJS.
 */
export interface EventAttachment {
  _id: string;
  name: string;
  title?: string;
  created?: string;
  eParent?: string | null;
  eType?: string;
  metadata?: Record<string, unknown>;
  version?: number;
  link?: string;
  icon?: string;
  /** Peut arriver imbriqué dans les données existantes — cf. `flattenOwner`. */
  owner?: unknown;
  shared?: unknown[];
}

/** Ressource du médiacentre rattachée à un événement. */
export interface EventResource {
  type: 'mediacentre' | string;
  id: string;
  name: string;
  url: string;
  image: string;
}

/** Une ressource telle que la renvoie la recherche du médiacentre. */
export interface MediacentreResource {
  id?: string | number;
  title?: string;
  link?: string;
  url?: string;
  image?: string;
}

/** Une trame de réponse du médiacentre : une par source interrogée. */
export interface MediacentreFrame {
  status?: 'ok' | 'ko' | string;
  error?: { source?: string; error?: string };
  data?: { resources?: MediacentreResource[] };
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
  /** Récurrence : identifiant qui relie toutes les occurrences d'une même série. */
  parentId?: string;
  /** Réglages de la récurrence, recopiés sur chaque occurrence. */
  recurrence?: Recurrence;
  /** Rang de l'occurrence dans sa série. */
  index?: number;
  /** Réservations de ressources RBS faites pour cet événement. */
  bookings?: EventBooking[];
  /** Rappel de l'usager courant sur cet événement, si la fonction est active. */
  reminders?: EventReminder;
  /** Documents du workspace joints à l'événement. */
  attachments?: EventAttachment[];
  /** Ressources du médiacentre rattachées à l'événement. */
  resources?: EventResource[];
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
  /** Récurrence portée par chaque occurrence de la série. */
  recurrence?: Recurrence | false;
  /** Rattache l'occurrence à sa série ; c'est sur lui que `updateAll` la retrouve. */
  parentId?: string;
  /** Rang de l'occurrence dans la série. */
  index?: number;
  /** `false` pour ne pas déclencher de notification (occurrences intermédiaires). */
  sendNotif?: boolean;
  /**
   * Rappel à poser sur l'événement. Le serveur l'extrait du corps avant d'enregistrer
   * l'événement, puis crée ou met à jour le rappel selon la présence de `_id`.
   */
  reminders?: EventReminder;
  attachments?: EventAttachment[];
  resources?: EventResource[];
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

/**
 * Applique une modification à TOUTE la série. Le serveur retrouve les occurrences par
 * `{parentId, isRecurrent: true}` et n'y propage ni les dates ni l'index — seulement l'horaire
 * si celui-ci a changé.
 */
export const updateAllEvents = async (
  calendarId: string,
  eventId: string,
  data: EventInput,
): Promise<void> => {
  const res = await fetch(`/calendar/${calendarId}/event/${eventId}/updateAll`, {
    ...base,
    method: 'POST',
    headers: mutHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(String(res.status));
};

/**
 * Crée une série récurrente, dans la forme exacte que produit l'IHM AngularJS : un événement
 * « ancre » sert uniquement à obtenir l'identifiant qui reliera la série, chaque occurrence est
 * créée avec cet identifiant en `parentId`, puis l'ancre est supprimée. Aucune occurrence n'a
 * donc d'`_id` égal au `parentId` — c'est ce que `updateAll` attend.
 *
 * L'ancre est créée avec `sendNotif: false` : elle est supprimée dans la foulée, la notifier
 * enverrait un avis pour un événement qui n'existe plus.
 */
export const createRecurrentEvents = async (
  calendarId: string,
  data: EventInput,
  series: Occurrence[],
): Promise<void> => {
  if (series.length === 0) throw new Error('empty-recurrence');

  const anchor = await createEvent(calendarId, { ...data, sendNotif: false });
  try {
    for (let i = 0; i < series.length; i += 1) {
      await createEvent(calendarId, {
        ...data,
        startMoment: series[i].startMoment,
        endMoment: series[i].endMoment,
        parentId: anchor._id,
        index: i,
      });
    }
  } finally {
    // Même en cas d'échec en cours de route, l'ancre ne doit pas rester dans l'agenda.
    await deleteEvent(calendarId, anchor._id).catch(() => undefined);
  }
};

/**
 * Supprime un événement. `deleteBookings` demande au serveur de supprimer AUSSI les réservations
 * de ressources RBS attachées : sans ce paramètre elles restent, orphelines, dans le module RBS.
 *
 * Le serveur répond 400 quand il n'a pas pu toutes les supprimer (l'usager n'est ni propriétaire
 * de la réservation ni de la ressource) : l'événement est alors bien supprimé, pas les réservations.
 */
export const deleteEvent = async (
  calendarId: string,
  eventId: string,
  options: { deleteBookings?: boolean } = {},
): Promise<void> => {
  const query = options.deleteBookings ? '?deleteBookings=true' : '';
  const res = await fetch(`/calendar/${calendarId}/event/${eventId}${query}`, {
    ...base,
    method: 'DELETE',
    headers: xsrfHeader(),
  });
  if (res.status === 400) throw new Error('bookings-deletion-failed');
  if (!res.ok && res.status !== 204) throw new Error(String(res.status));
};

// ── Import / export iCalendar (.ics) ─────────────────────────────────────────

/** Un événement du fichier que le serveur a refusé d'importer. */
export interface InvalidIcsEvent {
  title?: string;
  startMoment?: string;
  endMoment?: string;
  /** Clé i18n expliquant le refus (ex. `calendar.ical.event.slot.problem`). */
  errorCause?: string;
}

/** Compte rendu d'un import ICS, tel que le renvoie `PUT /calendar/:id/ical`. */
export interface IcsImportReport {
  createdEvents: number;
  invalidEvents: InvalidIcsEvent[];
}

/** URL de téléchargement du flux ICS d'un agenda (route authentifiée, droit de lecture). */
export const icalExportUrl = (calendarId: string): string => `/calendar/${calendarId}/ical`;

export const importIcal = async (calendarId: string, ics: string): Promise<IcsImportReport> => {
  const res = await fetch(`/calendar/${calendarId}/ical`, {
    ...base,
    method: 'PUT',
    headers: mutHeaders(),
    body: JSON.stringify({ ics }),
  });
  if (!res.ok) throw new Error(String(res.status));
  const body = (await res.json()) as Partial<IcsImportReport> | null;
  return {
    createdEvents: body?.createdEvents ?? 0,
    invalidEvents: body?.invalidEvents ?? [],
  };
};

// ── Pièces jointes et médiacentre ────────────────────────────────────────────

/**
 * URL de téléchargement d'une pièce jointe. On passe toujours par la route du module plutôt
 * que par le workspace : elle vérifie l'accès À L'ÉVÉNEMENT, ce qui la rend valable aussi bien
 * pour le propriétaire du document que pour quelqu'un à qui l'événement a été partagé.
 */
export const attachmentDownloadUrl = (eventId: string, attachmentId: string): string =>
  `/calendar/calendarevent/${eventId}/attachment/${attachmentId}`;

/** Sources interrogées par la recherche du médiacentre, reprises de l'IHM AngularJS. */
export const MEDIACENTRE_SOURCES = [
  'fr.openent.mediacentre.source.GAR',
  'fr.openent.mediacentre.source.Signet',
  'fr.openent.mediacentre.source.Moodle',
  'fr.openent.mediacentre.source.PMB',
];

/** Interroge le médiacentre. Chaque source répond sa propre trame, succès ou échec. */
export const searchMediacentre = async (query: string): Promise<MediacentreFrame[]> => {
  const jsondata = JSON.stringify({
    state: 'PLAIN_TEXT',
    event: 'search',
    sources: MEDIACENTRE_SOURCES,
    data: { query },
  });
  const res = await fetch(`/mediacentre/search?jsondata=${encodeURIComponent(jsondata)}`, base);
  if (!res.ok) throw new Error(String(res.status));
  const body = (await res.json()) as MediacentreFrame[] | null;
  return Array.isArray(body) ? body : [];
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
  icalExportUrl,
  importIcal,
  attachmentDownloadUrl,
  searchMediacentre,
  getCalendars,
  createCalendar,
  updateCalendar,
  deleteCalendar,
  publishCalendarPortal,
  unpublishCalendarPortal,
  getEvents,
  createEvent,
  createRecurrentEvents,
  updateEvent,
  updateAllEvents,
  deleteEvent,
  getCalendarShare,
  shareCalendarBatch,
  getEventShare,
  shareEventBatch,
};
