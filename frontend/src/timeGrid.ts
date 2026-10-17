import { CalendarEvent } from './api';

/** Un événement placé dans la colonne d'un jour : minutes depuis minuit, colonne parmi `cols` chevauchantes. */
export interface Segment {
  event: CalendarEvent;
  startMin: number;
  endMin: number;
  col: number;
  cols: number;
}

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Durée minimale affichée (30 min) : un événement très court reste lisible et cliquable. */
export const MIN_DURATION_MIN = 30;

/**
 * Événements horaires d'un jour, coupés aux bornes du jour, avec leur colonne quand ils se chevauchent
 * (deux événements 9h-10h côte à côte, chacun à 50 % de largeur). Les événements « journée entière »
 * ne sont pas ici : voir `allDayEvents`.
 */
export function daySegments(events: CalendarEvent[], day: Date): Segment[] {
  const from = dayStart(day);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);

  const items = events
    .filter((e) => !e.allday)
    .map((event) => ({ event, s: new Date(event.startMoment).getTime(), e: new Date(event.endMoment || event.startMoment).getTime() }))
    .filter((x) => x.s < to.getTime() && x.e > from.getTime() - (x.e === x.s ? 1 : 0))
    .map((x) => {
      const startMin = Math.round((Math.max(x.s, from.getTime()) - from.getTime()) / 60000);
      const rawEnd = Math.round((Math.min(x.e, to.getTime()) - from.getTime()) / 60000);
      return { event: x.event, startMin, endMin: Math.max(rawEnd, Math.min(startMin + MIN_DURATION_MIN, 24 * 60)) };
    })
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  const out: Segment[] = [];
  let cluster: Segment[] = [];
  let clusterEnd = -1;
  const close = () => {
    const cols = Math.max(1, ...cluster.map((s) => s.col + 1));
    cluster.forEach((s) => (s.cols = cols));
    out.push(...cluster);
    cluster = [];
  };
  items.forEach((item) => {
    if (cluster.length && item.startMin >= clusterEnd) close();
    let col = 0;
    while (cluster.some((s) => s.col === col && s.endMin > item.startMin)) col += 1;
    cluster.push({ ...item, col, cols: 1 });
    clusterEnd = Math.max(clusterEnd, item.endMin);
  });
  if (cluster.length) close();
  return out;
}

/** Événements « journée entière » touchant ce jour. */
export function allDayEvents(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const from = dayStart(day).getTime();
  const to = from + 86_400_000;
  return events.filter((e) => e.allday && new Date(e.startMoment).getTime() < to && new Date(e.endMoment || e.startMoment).getTime() >= from);
}

/**
 * Plage d'heures affichée : 7h → 20h par défaut, élargie pour qu'aucun événement ne soit coupé.
 * Ex. un événement 6h30-8h donne 6h→20h ; un 19h-21h30, 7h→22h.
 */
export function visibleHours(segments: Segment[], from = 7, to = 20): { from: number; to: number } {
  let lo = from;
  let hi = to;
  segments.forEach((s) => {
    lo = Math.min(lo, Math.floor(s.startMin / 60));
    hi = Math.max(hi, Math.ceil(s.endMin / 60));
  });
  return { from: lo, to: Math.min(24, hi) };
}

/** Début d'un créneau cliqué : jour + minutes depuis minuit (arrondies à la demi-heure), heure locale. */
export function slotStart(day: Date, minutes: number): Date {
  const snapped = Math.floor(minutes / 30) * 30;
  const d = dayStart(day);
  d.setMinutes(snapped);
  return d;
}
