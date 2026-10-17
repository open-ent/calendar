import { CalendarEvent } from './api';

export type ListSortKey = 'calendar' | 'title' | 'startMoment' | 'endMoment';
export interface ListSort {
  key: ListSortKey;
  reverse: boolean;
}

/** Jour `YYYY-MM-DD` (local) d'une date ISO. */
const localDay = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * Événements dont la période recoupe [from, to] (jours `YYYY-MM-DD`, bornes incluses).
 * Ex. un événement du 10 au 12 est gardé pour un filtre du 12 au 20 ; bornes vides = pas de filtre.
 */
export function filterByDates(events: CalendarEvent[], from: string, to: string): CalendarEvent[] {
  return events.filter((e) => {
    const start = localDay(e.startMoment);
    const end = localDay(e.endMoment) || start;
    return (!from || end >= from) && (!to || start <= to);
  });
}

/** Tri d'une colonne ; `calendarTitle` fournit le libellé de l'agenda pour la colonne « Agenda ». */
export function sortEvents(
  events: CalendarEvent[],
  sort: ListSort,
  calendarTitle: (e: CalendarEvent) => string,
): CalendarEvent[] {
  const value = (e: CalendarEvent): string => {
    if (sort.key === 'calendar') return calendarTitle(e);
    if (sort.key === 'title') return e.title ?? '';
    return (e[sort.key] as string | undefined) ?? '';
  };
  const sorted = [...events].sort((a, b) => value(a).localeCompare(value(b), undefined, { sensitivity: 'base' }));
  return sort.reverse ? sorted.reverse() : sorted;
}

/** Cliquer l'en-tête déjà actif inverse le sens, un autre en-tête repart en ordre croissant. */
export const nextSort = (current: ListSort, key: ListSortKey): ListSort =>
  current.key === key ? { key, reverse: !current.reverse } : { key, reverse: false };

/** Dates par défaut du filtre : aujourd'hui → dans 2 mois (parité AngularJS). */
export function defaultListRange(today = new Date()): { from: string; to: string } {
  const end = new Date(today);
  end.setMonth(end.getMonth() + 2);
  return { from: localDay(today.toISOString()), to: localDay(end.toISOString()) };
}
