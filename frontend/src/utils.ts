import { Recurrence } from './recurrence';

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

/**
 * Les 14 dates de la quinzaine débutant à `monday` (deux semaines lundi→dimanche).
 * Même cadrage que côté AngularJS (`libs/infra-front/src/ts/calendar.ts`, increment
 * `fortnight`) : la quinzaine démarre toujours un lundi, comme la semaine.
 */
export function fortnightDays(monday: Date): Date[] {
  return Array.from({ length: 14 }, (_, i) => {
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

/**
 * Date d'une réservation RBS. Le serveur ne les renvoie PAS en ISO mais déjà mises en forme
 * (« 25/08/26 15:48 ») — vérifié sur l'ENT local. On n'essaie donc de les formater que si elles
 * s'avèrent analysables, sinon on affiche la chaîne telle quelle plutôt qu'un blanc.
 */
export function formatBookingDate(value?: string): string {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : formatDateTime(value);
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

/**
 * Date civile (heure locale) au format `YYYY-MM-DD` sans heure — format exigé par les endpoints
 * `edt/.../common/courses` et `rbs/bookings/all` (regex stricte côté serveur pour ce dernier).
 */
export function toDateOnly(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * `edt/.../common/courses` renvoie `startDate`/`endDate` en « YYYY-MM-DD HH:mm:ss », une heure
 * LOCALE (Europe/Paris) sans zone — juste besoin du séparateur ISO pour que `new Date(...)` la
 * comprenne comme heure locale (comportement par défaut, correct ici).
 */
export function parseEdtLocalDateTime(raw: string): string {
  return raw.replace(' ', 'T');
}

/**
 * `rbs/bookings/all` renvoie `start_date`/`end_date` en TIMESTAMP Postgres déjà converti en UTC
 * au stockage (cf. mémoire bug-fuseau-horaire-edt-import-rbs) mais SANS indicateur de zone — à la
 * différence d'EDT, le front RBS les traite explicitement en UTC (`moment.utc(...)`, cf.
 * `calendar-rbs-booking.sniplet.ts`). Sans le suffixe `Z` ajouté ici, `new Date(...)` les
 * interpréterait à tort comme une heure locale et décalerait l'affichage d'1h/2h.
 */
export function parseRbsUtcDateTime(raw: string): string {
  const isoLike = raw.replace(' ', 'T');
  return /[zZ]|[+-]\d{2}:?\d{2}$/.test(isoLike) ? isoLike : `${isoLike}Z`;
}

/**
 * Le début d'un créneau tombe-t-il réellement dans `[rangeStart, rangeEnd)` ?
 *
 * Garde-fou constaté sur l'ENT local (pas documenté côté serveur) : `/rbs/bookings/all`
 * renvoie AUSSI l'enregistrement « parent » d'une série périodique, dont `start_date` porte la
 * date de la toute première occurrence (hors de la plage demandée) et `end_date` la date de fin
 * de la RÉCURRENCE (ex. fin d'année scolaire), pas une heure de fin réelle — un même défaut
 * existe dans l'Angular (`controller.ts`, aucun filtre), mais il y produit la même incohérence
 * (créneau affiché à 00:00). Ne garder que les créneaux dont le début tombe réellement dans la
 * période affichée évite ce bruit, côté EDT comme côté RBS.
 */
export function isWithinRange(startIso: string, rangeStart: Date, rangeEnd: Date): boolean {
  const ms = new Date(startIso).getTime();
  return ms >= rangeStart.getTime() && ms < rangeEnd.getTime();
}

/** Couleur CSS d'un calendrier (repli). */
export function calendarColor(color?: string): string {
  return color && color.trim() ? color : '#2a9cc8';
}

/** Les cinq vues de l'agenda. */
export type AgendaView = 'day' | 'week' | 'fortnight' | 'month' | 'list';

/** Jours de la semaine (lundi → dimanche), en entier et en abrégé. */
export const DAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
export const DAY_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/** Décale le curseur d'une période (jour, semaine, quinzaine ou mois selon la vue). */
export function shiftCursor(cursor: Date, view: AgendaView, direction: number): Date {
  const d = new Date(cursor);
  if (view === 'day') d.setDate(d.getDate() + direction);
  else if (view === 'month') d.setMonth(d.getMonth() + direction);
  else if (view === 'fortnight') d.setDate(d.getDate() + direction * 14);
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
  const days =
    view === 'fortnight' ? fortnightDays(startOfWeek(cursor)) : weekDays(startOfWeek(cursor));
  const from = days[0].toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  const to = days[days.length - 1].toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
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

/**
 * Phrase décrivant une récurrence (« Tous les 2 semaines, Lu, Je, Fin le 12/12/2026 »), pour
 * rappeler à l'usager ce qu'il modifie. Reprend les mêmes clés i18n que l'IHM AngularJS.
 */
export function recurrenceSummary(
  recurrence: Recurrence,
  translate: (key: string, options?: { defaultValue: string }) => string,
): string {
  // « Tous les 3 jours » mais « Toutes les 3 semaines » : le socle fournit les deux genres.
  // Au pas de 1, on reprend les libellés tout faits (« Tous les jours », « Toutes les semaines »).
  const daily = recurrence.type === 'every_day';
  const periodicity =
    recurrence.every === 1
      ? daily
        ? translate('calendar.recurrence.every.day', { defaultValue: 'Tous les jours' })
        : translate('calendar.recurrence.every.week', { defaultValue: 'Toutes les semaines' })
      : [
          daily
            ? translate('calendar.recurrence.every', { defaultValue: 'Tous les' })
            : translate('calendar.recurrence.every.female', { defaultValue: 'Toutes les' }),
          recurrence.every,
          daily
            ? translate('calendar.recurrence.days', { defaultValue: 'jours' })
            : translate('calendar.recurrence.weeks', { defaultValue: 'semaines' }),
        ].join(' ');
  const parts = [periodicity];

  if (recurrence.type === 'every_week') {
    const names: Record<number, [string, string]> = {
      1: ['calendar.recurrence.daymap.mon', 'Lu'],
      2: ['calendar.recurrence.daymap.tue', 'Ma'],
      3: ['calendar.recurrence.daymap.wed', 'Me'],
      4: ['calendar.recurrence.daymap.thu', 'Je'],
      5: ['calendar.recurrence.daymap.fri', 'Ve'],
      6: ['calendar.recurrence.daymap.sat', 'Sa'],
      7: ['calendar.recurrence.daymap.sun', 'Di'],
    };
    const days = [1, 2, 3, 4, 5, 6, 7]
      .filter((d) => recurrence.week_days?.[String(d)])
      .map((d) => translate(names[d][0], { defaultValue: names[d][1] }));
    if (days.length > 0) parts.push(days.join(', '));
  }

  if (recurrence.end_type === 'after' && recurrence.end_after) {
    parts.push(
      `${translate('calendar.recurrence.end.after', { defaultValue: 'Après' })} ${recurrence.end_after} ${translate('calendar.recurrence.occurrences', { defaultValue: 'occurrences' })}`,
    );
  } else if (recurrence.end_on) {
    const date = new Date(recurrence.end_on);
    if (!Number.isNaN(date.getTime())) {
      parts.push(
        `${translate('calendar.recurrence.until', { defaultValue: "jusqu'au" })} ${date.toLocaleDateString('fr-FR')}`,
      );
    }
  }
  return parts.join(' · ');
}
