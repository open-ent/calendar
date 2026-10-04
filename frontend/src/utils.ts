/** Fonctions pures du module Calendar (testables). */

/** Renvoie le lundi (00:00) de la semaine contenant `d`. */
export function startOfWeek(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay(); // 0 = dimanche
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

/** Les 7 dates (lundi→dimanche) de la semaine débutant à `monday`. */
export function weekDays(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

/** Même jour civil (heure locale) qu'une date ISO ? */
export function isSameDay(iso: string, d: Date): boolean {
  const b = new Date(iso);
  return b.getFullYear() === d.getFullYear() && b.getMonth() === d.getMonth() && b.getDate() === d.getDate();
}

/** Heure « HH:mm » (locale FR) d'une date ISO. */
export function isoTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

/** Date+heure « jj/mm/aaaa hh:mm » (locale FR) d'une date ISO. */
export function formatDateTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Valeur `<input type="datetime-local">` (heure locale) -> ISO UTC (« …Z ») pour le backend. */
export function localInputToIsoUtc(value: string): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

/** ISO (UTC) -> valeur `<input type="datetime-local">` (heure locale « yyyy-MM-ddTHH:mm »). */
export function isoUtcToLocalInput(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Premier jour (lundi) de la grille mensuelle contenant `d` (peut être en fin de mois précédent). */
export function startOfMonthGrid(d: Date): Date {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  return startOfWeek(first);
}

/** Grille mensuelle de 6 semaines × 7 jours (42 dates) débutant au lundi précédant le 1er du mois. */
export function monthGrid(d: Date): Date[] {
  const start = startOfMonthGrid(d);
  return Array.from({ length: 42 }, (_, i) => {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    return day;
  });
}

/** Même mois civil que `ref` ? */
export function isSameMonth(day: Date, ref: Date): boolean {
  return day.getFullYear() === ref.getFullYear() && day.getMonth() === ref.getMonth();
}

/** Couleur CSS d'un calendrier (repli). */
export function calendarColor(color?: string): string {
  return color && color.trim() ? color : '#2a9cc8';
}

/** Les quatre vues de l'agenda. */
export type AgendaView = 'day' | 'week' | 'month' | 'list';

/** Jours de la semaine (lundi → dimanche), en entier et en abrégé. */
export const DAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
export const DAY_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/** Décale le curseur d'une période (jour, semaine ou mois selon la vue). */
export function shiftCursor(cursor: Date, view: AgendaView, direction: number): Date {
  const d = new Date(cursor);
  if (view === 'day') d.setDate(d.getDate() + direction);
  else if (view === 'month') d.setMonth(d.getMonth() + direction);
  else d.setDate(d.getDate() + direction * 7);
  return d;
}

/** Libellé de la période affichée, selon la vue. */
export function periodLabel(cursor: Date, view: AgendaView): string {
  if (view === 'day') {
    return cursor.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }
  if (view === 'month') {
    return cursor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }
  const days = weekDays(startOfWeek(cursor));
  const from = days[0].toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  const to = days[6].toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  return `${from} – ${to}`;
}

/** Minuit (heure locale) du jour d'une date. */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * L'événement occupe-t-il ce jour ? Un événement sur plusieurs jours occupe chaque jour
 * entre son début et sa fin — c'est ce que faisait `multiDaysEventsUtils` côté AngularJS.
 * La fin est exclusive à minuit pile : un événement qui se termine à 00:00 ne déborde pas
 * sur le jour suivant.
 */
export function occupiesDay(startIso: string, endIso: string | undefined, day: Date): boolean {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return false;
  const end = endIso ? new Date(endIso) : start;
  if (Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
    return isSameDay(startIso, day);
  }
  const dayStart = startOfDay(day).getTime();
  const dayEnd = dayStart + 24 * 3600 * 1000;
  return start.getTime() < dayEnd && end.getTime() > dayStart;
}

/** L'événement s'étale-t-il sur plus d'un jour civil ? */
export function isMultiDay(startIso: string, endIso?: string): boolean {
  if (!endIso) return false;
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  if (end.getTime() <= start.getTime()) return false;
  // Une fin à minuit pile appartient au jour precedent.
  const lastInstant = new Date(end.getTime() - 1);
  return !isSameDay(start.toISOString(), startOfDay(lastInstant));
}

/** Où en est un événement multi-jours ce jour-là ? */
export type DaySpan = 'single' | 'start' | 'middle' | 'end';

export function daySpan(startIso: string, endIso: string | undefined, day: Date): DaySpan {
  if (!isMultiDay(startIso, endIso)) return 'single';
  const start = new Date(startIso);
  const lastInstant = new Date(new Date(endIso as string).getTime() - 1);
  const isFirst = isSameDay(start.toISOString(), day);
  const isLast = isSameDay(lastInstant.toISOString(), day);
  if (isFirst) return 'start';
  if (isLast) return 'end';
  return 'middle';
}

/**
 * Rend lisible la cause du refus d'un événement à l'import ICS. Le serveur renvoie selon les cas
 * une clé i18n (`calendar.ical.event.slot.problem`) ou le message brut d'une exception Java,
 * préfixé de son nom de classe — on retire alors le préfixe plutôt que d'afficher
 * « net.atos.entng.calendar.exception.UnhandledEventException: … » à l'usager.
 *
 * @param translate rend la traduction de la clé, ou une chaîne vide si la clé est inconnue.
 */
export function readableCause(
  cause: string | undefined,
  translate: (key: string) => string,
): string {
  if (!cause) return '';
  const translated = translate(cause);
  if (translated) return translated;
  const match = cause.match(/^(?:[\w.]+(?:Exception|Error)):\s*(.+)$/s);
  return match ? match[1] : cause;
}
