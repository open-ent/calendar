// Récurrence des événements — modèle et génération des occurrences.
//
// Le serveur ne génère RIEN : c'est le client qui crée un événement par occurrence, tous reliés
// par le même `parentId` et portant `isRecurrent: true` (c'est sur ce couple que
// `POST /:cal/event/:id/updateAll` retrouve la série). On reprend donc le modèle et les règles
// de l'IHM AngularJS (`controller.ts#handleEveryDayRecurrence` / `handleEveryWeekRecurrence`),
// pour que les deux interfaces produisent exactement les mêmes séries.
//
// Seules les récurrences quotidienne et hebdomadaire existent : le formulaire AngularJS affichait
// « tous les mois » / « tous les ans » sans jamais les relier au modèle ni les générer.

export type RecurrenceType = 'every_day' | 'every_week';
export type RecurrenceEndType = 'on' | 'after';

/** Jours cochés, indexés par jour ISO de la semaine : '1' = lundi … '7' = dimanche. */
export type WeekDays = Record<string, boolean>;

export interface Recurrence {
  type: RecurrenceType;
  /** Répéter tous les N jours (ou toutes les N semaines). */
  every: number;
  week_days: WeekDays;
  end_type: RecurrenceEndType;
  /** Date de fin (incluse), quand `end_type` vaut « on ». */
  end_on?: string;
  /** Nombre d'occurrences, quand `end_type` vaut « after ». */
  end_after?: number;
  /** Jour de départ de la série, posé à l'enregistrement (parité AngularJS). */
  start_on?: string;
}

export interface Occurrence {
  startMoment: string;
  endMoment: string;
}

/** Borne du formulaire AngularJS (`constantes/TIME.ts`), reprise telle quelle. */
export const EVERY_MAX = 9;

/**
 * Nombre d'occurrences accepté par le serveur. `EventHelper#isRecurrentEndDateValid` refuse
 * `end_after <= 1` et `end_after >= 365` (bornes STRICTES, `Field.end_after_min_value` et
 * `end_after_max_value`) : un événement à occurrence unique ou une série de 365 sont rejetés
 * en 401. On s'arrête donc aux valeurs réellement acceptées.
 */
export const OCCURRENCES_MIN = 2;
export const OCCURRENCES_MAX = 364;

/** Jour ISO de la semaine : 1 = lundi … 7 = dimanche (contrairement à `getDay`, où 0 = dimanche). */
export function isoWeekday(d: Date): number {
  const day = d.getDay();
  return day === 0 ? 7 : day;
}

/** Récurrence par défaut à l'activation de la case, comme `toggleIsRecurrent`. */
export function defaultRecurrence(start: Date, oneDayEvent: boolean): Recurrence {
  const weekDays: WeekDays = {};
  for (let d = 1; d <= 7; d += 1) weekDays[String(d)] = false;
  weekDays[String(isoWeekday(start))] = true;

  const endOn = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
  return {
    // Un événement à cheval sur plusieurs jours ne peut pas se répéter quotidiennement.
    type: oneDayEvent ? 'every_day' : 'every_week',
    every: 1,
    week_days: weekDays,
    end_type: 'on',
    end_on: endOn.toISOString(),
  };
}

/** L'événement tient-il dans une seule journée civile ? */
export function isOneDayEvent(start: Date, end: Date): boolean {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return true;
  return (
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate()
  );
}

/** Les jours cochés, en jours ISO croissants. */
export function selectedWeekDays(recurrence: Recurrence): number[] {
  return [1, 2, 3, 4, 5, 6, 7].filter((d) => recurrence.week_days?.[String(d)]);
}

/** Minuit (heure locale) du jour d'une date. */
function dayStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Dernier instant (heure locale) du jour d'une date : la date de fin « le … » est incluse. */
function dayEnd(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** Même jour que `base`, décalé de `days` jours, à l'heure de `time`. */
function shiftDay(base: Date, days: number, time: Date): Date {
  return new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate() + days,
    time.getHours(),
    time.getMinutes(),
    0,
    0,
  );
}

/**
 * Les occurrences d'une récurrence, la première étant l'événement lui-même (sauf en hebdomadaire,
 * où la série commence au premier jour coché à partir du jour de départ).
 *
 * La durée de l'événement est conservée à l'identique sur chaque occurrence. Les dates sont
 * calculées en heure locale puis converties : un passage à l'heure d'été ne décale pas l'horaire
 * affiché.
 */
export function occurrences(startIso: string, endIso: string, recurrence: Recurrence): Occurrence[] {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  const durationMs = Math.max(0, end.getTime() - start.getTime());
  const every = Math.max(1, Math.min(EVERY_MAX, Math.floor(recurrence.every) || 1));

  const maxCount =
    recurrence.end_type === 'after'
      ? Math.max(0, Math.min(OCCURRENCES_MAX, Math.floor(recurrence.end_after ?? 0)))
      : OCCURRENCES_MAX;
  if (maxCount === 0) return [];

  const until =
    recurrence.end_type === 'on' && recurrence.end_on ? dayEnd(new Date(recurrence.end_on)) : null;
  if (until && Number.isNaN(until.getTime())) return [];

  const push = (occStart: Date, out: Occurrence[]) =>
    out.push({
      startMoment: occStart.toISOString(),
      endMoment: new Date(occStart.getTime() + durationMs).toISOString(),
    });

  const out: Occurrence[] = [];

  if (recurrence.type === 'every_day') {
    for (let i = 0; out.length < maxCount; i += 1) {
      const occStart = shiftDay(start, i * every, start);
      if (until && occStart.getTime() > until.getTime()) break;
      push(occStart, out);
      // Garde-fou : sans date de fin ni compte, on s'arrêterait au plafond d'occurrences.
      if (!until && recurrence.end_type !== 'after') break;
    }
    return out;
  }

  const days = selectedWeekDays(recurrence);
  if (days.length === 0) return [];

  // Lundi de la semaine du jour de départ : la grille des semaines part de là.
  const monday = dayStart(shiftDay(start, 1 - isoWeekday(start), start));
  const firstDay = dayStart(start).getTime();

  for (let week = 0; out.length < maxCount; week += every) {
    let producedBeforeWeek = out.length;
    for (const day of days) {
      const occStart = shiftDay(monday, week * 7 + (day - 1), start);
      // Rien avant le jour de départ : dans la première semaine, les jours déjà passés sont ignorés.
      if (occStart.getTime() < firstDay) continue;
      if (until && occStart.getTime() > until.getTime()) return out;
      push(occStart, out);
      if (out.length >= maxCount) return out;
    }
    // Sans date de fin, le compte d'occurrences finit toujours par être atteint ; avec une date
    // de fin, la boucle sort ci-dessus. Ce garde-fou couvre les semaines entièrement ignorées.
    if (!until && out.length === producedBeforeWeek && week > OCCURRENCES_MAX * 7) break;
    producedBeforeWeek = out.length;
  }
  return out;
}

/**
 * La date de fin de récurrence est-elle cohérente ? Elle doit tomber après la fin de l'événement
 * (parité `isValidRecurrentEndDate`).
 */
export function isValidEnd(start: Date, end: Date, recurrence: Recurrence): boolean {
  if (recurrence.end_type === 'after') {
    const count = Math.floor(recurrence.end_after ?? 0);
    return count >= OCCURRENCES_MIN && count <= OCCURRENCES_MAX;
  }
  if (!recurrence.end_on) return false;
  const endOn = dayEnd(new Date(recurrence.end_on));
  if (Number.isNaN(endOn.getTime())) return false;
  return endOn.getTime() > end.getTime() && endOn.getTime() > start.getTime();
}

/**
 * L'événement tient-il dans la période de répétition ? Un événement de dix jours ne peut pas se
 * répéter toutes les semaines (parité `areRecurrenceAndEventLengthsCompatible`).
 */
export function lengthsCompatible(start: Date, end: Date, recurrence: Recurrence): boolean {
  if (isOneDayEvent(start, end)) return true;
  if (recurrence.type !== 'every_week') return false;
  const spannedDays =
    Math.round((dayStart(end).getTime() - dayStart(start).getTime()) / 86400000) + 1;
  return spannedDays <= recurrence.every * 7;
}
