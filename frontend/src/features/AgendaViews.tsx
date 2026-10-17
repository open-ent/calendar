import { EmptyScreen } from '@open-ent/react';
import { CSSProperties, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import illuAgenda from '@images/emptyscreen/illu-homeworks.svg';

import { CalendarEvent } from '../api';
import { dateLocale, dayLabels, dayShort } from '../locale';
import { defaultListRange, filterByDates, ListSort, ListSortKey, nextSort, sortEvents } from '../listView';
import { EventRights } from '../rights';
import {
  daySpan,
  eventTooltip,
  fortnightDays,
  isSameDay,
  isSameMonth,
  isoTime,
  monthGrid,
  occupiesDay,
  startOfWeek,
  weekDays,
} from '../utils';
import { EventCard } from './EventCard';
import { TimeGrid } from './TimeGrid';

export interface ViewHandlers {
  colorOf: (event: CalendarEvent) => string;
  rightsOf: (event: CalendarEvent) => EventRights;
  onOpen: (event: CalendarEvent) => void;
  onShare: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
}

interface ViewProps extends ViewHandlers {
  cursor: Date;
  /** Bascule en vue Jour sur ce jour : cible du lien « +N autre(s) » des vues Mois et Quinzaine. */
  onShowDay: (day: Date) => void;
  /** Clic sur un créneau libre des vues Jour/Semaine : crée un événement à cette heure. */
  onCreateAt: (start: Date) => void;
  events: CalendarEvent[];
}

const byStart = (a: CalendarEvent, b: CalendarEvent) =>
  (a.startMoment || '').localeCompare(b.startMoment || '');

/** Les événements qui occupent ce jour — un événement sur plusieurs jours apparaît sur chacun. */
const eventsOfDay = (events: CalendarEvent[], day: Date) =>
  events.filter((e) => occupiesDay(e.startMoment, e.endMoment, day)).sort(byStart);


/** Infobulle riche des pastilles (titre, période, lieu, créateur) — parité avec l'AngularJS. */
function useTooltip() {
  const { t } = useTranslation(['calendar', 'common']);
  const labels = {
    location: t('calendar.event.location', { defaultValue: 'Lieu' }),
    owner: t('calendar.event.owner', { defaultValue: 'Créé par' }).replace(/\s*:\s*$/, ''),
    recurrent: t('calendar.event.recurrent', { defaultValue: 'Événement récurrent.' }),
    allday: t('calendar.event.allday', { defaultValue: 'Toute la journée' }),
  };
  return (e: CalendarEvent) => eventTooltip(e, labels);
}

/** Écran vide commun aux vues — illustration du socle. */
function NoEvents({ text }: { text: string }) {
  return (
    <div className="m-auto py-24">
      <EmptyScreen imageSrc={illuAgenda} title={text} />
    </div>
  );
}

/** Vue Jour : grille horaire d'une colonne. */
export function DayView({ cursor, events, colorOf, onOpen, onCreateAt }: ViewProps) {
  const tooltipOf = useTooltip();
  return (
    <TimeGrid kind="day" days={[cursor]} events={eventsOfDay(events, cursor)} colorOf={colorOf} tooltipOf={tooltipOf} onOpen={onOpen} onCreateAt={onCreateAt} />
  );
}

/** Vue Semaine : grille horaire, sept colonnes lundi → dimanche. */
export function WeekView({ cursor, events, colorOf, onOpen, onCreateAt, days }: ViewProps & { days?: Date[] }) {
  const tooltipOf = useTooltip();
  return (
    <TimeGrid
      kind="week"
      days={days ?? weekDays(startOfWeek(cursor))}
      events={events}
      colorOf={colorOf}
      tooltipOf={tooltipOf}
      onOpen={onOpen}
      onCreateAt={onCreateAt}
    />
  );
}

/**
 * Vue Quinzaine : deux semaines lundi → dimanche, en pastilles cliquables — reprend le rendu de
 * la vue Mois (pas celui de la vue Semaine), comme côté AngularJS où `schedule-fortnight`
 * réutilise intégralement le CSS `schedule-month` (seule la fenêtre de jours diffère : 14 jours
 * cadrés sur un lundi au lieu du mois calendaire). La date de chaque cellule est au format
 * jour/mois (et non juste le quantième) car une quinzaine peut chevaucher deux mois.
 */
export function FortnightView({ cursor, events, colorOf, onOpen, onShowDay }: ViewProps) {
  const { t } = useTranslation(['calendar', 'common']);
  const today = new Date().toISOString();
  const maxChips = 3;
  const tooltipOf = useTooltip();

  return (
    <div className="agenda-grid">
      {dayShort().map((label) => (
        <div key={label} className="agenda-weekday small fw-bold text-center py-4">
          {label}
        </div>
      ))}
      {fortnightDays(startOfWeek(cursor)).map((day) => {
        const dayEvents = eventsOfDay(events, day);
        return (
          <div
            key={day.toISOString()}
            className={`agenda-day p-4 ${isSameDay(today, day) ? 'agenda-day--today' : ''}`}
          >
            <div className="small text-end">
              {day.toLocaleDateString(dateLocale(), { day: '2-digit', month: '2-digit' })}
            </div>
            {dayEvents.slice(0, maxChips).map((e) => {
              const span = daySpan(e.startMoment, e.endMoment, day);
              return (
                <button
                  key={e._id}
                  type="button"
                  className="agenda-chip small text-truncate px-4 mb-2"
                  style={{ '--agenda-color': colorOf(e) } as CSSProperties}
                  title={tooltipOf(e)}
                  onClick={() => onOpen(e)}
                >
                  {e.allday || span === 'middle' || span === 'end' ? '' : `${isoTime(e.startMoment)} `}
                  {e.title}
                </button>
              );
            })}
            {dayEvents.length > maxChips && (
              <span
                role="button"
                tabIndex={0}
                className="small text-decoration-underline text-gray-700"
                style={{ cursor: 'pointer' }}
                onClick={() => onShowDay(day)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onShowDay(day)}
              >
                {t('calendar.month.more', {
                  defaultValue: '+[[count]] autre(s)',
                  count: dayEvents.length - maxChips,
                })}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Vue Mois : grille 6 × 7, les événements en pastilles cliquables. */
export function MonthView({ cursor, events, colorOf, onOpen, onShowDay }: ViewProps) {
  const { t } = useTranslation(['calendar', 'common']);
  const today = new Date().toISOString();
  const maxChips = 3;
  const tooltipOf = useTooltip();

  return (
    <div className="agenda-grid">
      {dayShort().map((label) => (
        <div key={label} className="agenda-weekday small fw-bold text-center py-4">
          {label}
        </div>
      ))}
      {monthGrid(cursor).map((day) => {
        const inMonth = isSameMonth(day, cursor);
        const dayEvents = eventsOfDay(events, day);
        return (
          <div
            key={day.toISOString()}
            className={[
              'agenda-day p-4',
              inMonth ? '' : 'agenda-day--outside',
              isSameDay(today, day) ? 'agenda-day--today' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className={`small text-end ${inMonth ? '' : 'text-gray-600'}`}>{day.getDate()}</div>
            {dayEvents.slice(0, maxChips).map((e) => {
              const span = daySpan(e.startMoment, e.endMoment, day);
              return (
                <button
                  key={e._id}
                  type="button"
                  className="agenda-chip small text-truncate px-4 mb-2"
                  style={{ '--agenda-color': colorOf(e) } as CSSProperties}
                  title={tooltipOf(e)}
                  onClick={() => onOpen(e)}
                >
                  {e.allday || span === 'middle' || span === 'end' ? '' : `${isoTime(e.startMoment)} `}
                  {e.title}
                </button>
              );
            })}
            {dayEvents.length > maxChips && (
              <span
                role="button"
                tabIndex={0}
                className="small text-decoration-underline text-gray-700"
                style={{ cursor: 'pointer' }}
                onClick={() => onShowDay(day)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onShowDay(day)}
              >
                {t('calendar.month.more', {
                  defaultValue: '+[[count]] autre(s)',
                  count: dayEvents.length - maxChips,
                })}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface ListProps extends ViewProps {
  calendarTitleOf: (event: CalendarEvent) => string;
  /** Suppression de plusieurs événements sélectionnés (une seule sélection passe par `onDelete`). */
  onDeleteMany: (events: CalendarEvent[]) => void;
}

/**
 * Vue Liste : tableau triable (agenda, titre, début, fin), filtre par dates (aujourd'hui → +2 mois
 * par défaut) et sélection multiple pour modifier / partager / supprimer, comme côté AngularJS.
 */
export function ListView({ events, colorOf, rightsOf, calendarTitleOf, onOpen, onShare, onDelete, onDeleteMany }: ListProps) {
  const { t } = useTranslation(['calendar', 'common']);
  const [range, setRange] = useState(() => defaultListRange());
  const [sort, setSort] = useState<ListSort>({ key: 'startMoment', reverse: false });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const rows = useMemo(
    () => sortEvents(filterByDates(events, range.from, range.to), sort, calendarTitleOf),
    [events, range, sort, calendarTitleOf],
  );
  // Cases proposées seulement quand on peut agir sur l'événement (parité `hasManageRightOrIsEventOwner`).
  const selectable = rows.filter((e) => rightsOf(e).edit);
  const chosen = rows.filter((e) => selected.has(e._id));
  const allChecked = selectable.length > 0 && selectable.every((e) => selected.has(e._id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const header = (key: ListSortKey, label: string) => (
    <th
      key={key}
      scope="col"
      tabIndex={0}
      className="text-nowrap"
      style={{ cursor: 'pointer' }}
      onClick={() => setSort(nextSort(sort, key))}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSort(nextSort(sort, key))}
      aria-sort={sort.key === key ? (sort.reverse ? 'descending' : 'ascending') : 'none'}>
      {label}
      {sort.key === key ? (sort.reverse ? ' ▲' : ' ▼') : ''}
    </th>
  );
  const when = (iso: string) => new Date(iso).toLocaleString(dateLocale(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="d-flex flex-column gap-8" data-calendar-list>
      <div className="d-flex flex-wrap align-items-center gap-16">
        <label className="d-flex align-items-center gap-8">
          {t('calendar.filters.date.from', { defaultValue: 'Du' })}
          <input type="date" className="form-control" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        </label>
        <label className="d-flex align-items-center gap-8">
          {t('calendar.filters.date.to', { defaultValue: 'au' })}
          <input type="date" className="form-control" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        </label>
      </div>

      {chosen.length > 0 && (
        <div className="d-flex flex-wrap gap-8" data-calendar-list-actions>
          {chosen.length === 1 && (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => onOpen(chosen[0])}>
                {t('calendar.event.edit', { defaultValue: "Modifier l'événement" })}
              </button>
              {rightsOf(chosen[0]).share && !chosen[0].parentId && (
                <button type="button" className="btn btn-secondary" onClick={() => onShare(chosen[0])}>
                  {t('calendar.share', { defaultValue: 'Partager' })}
                </button>
              )}
            </>
          )}
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              if (chosen.length === 1) onDelete(chosen[0]);
              else onDeleteMany(chosen.filter((e) => rightsOf(e).remove));
            }}
          >
            {t('calendar.delete', { defaultValue: 'Supprimer' })} ({chosen.length})
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <NoEvents text={t('calendar.list.empty', { defaultValue: 'Aucun événement.' })} />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table table-hover mb-0">
            <thead>
              <tr>
                <th scope="col" style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    aria-label={t('calendar.list.selectall', { defaultValue: 'Tout sélectionner' })}
                    checked={allChecked}
                    disabled={selectable.length === 0}
                    onChange={() => setSelected(allChecked ? new Set() : new Set(selectable.map((e) => e._id)))}
                  />
                </th>
                {header('calendar', t('calendar.title', { defaultValue: 'Agenda' }))}
                {header('title', t('calendar.event.title', { defaultValue: 'Titre' }))}
                {header('startMoment', t('calendar.event.start.date', { defaultValue: 'Début' }))}
                {header('endMoment', t('calendar.event.end.date', { defaultValue: 'Fin' }))}
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e._id} data-event-id={e._id}>
                  <td>
                    {rightsOf(e).edit && (
                      <input type="checkbox" aria-label={e.title} checked={selected.has(e._id)} onChange={() => toggle(e._id)} />
                    )}
                  </td>
                  <td>
                    <span className="d-inline-block rounded-circle me-8" style={{ width: 10, height: 10, background: colorOf(e) }} />
                    {calendarTitleOf(e)}
                  </td>
                  <td>
                    {/* Pas de `.btn-link` : invisible sur le thème (texte blanc sur fond blanc). */}
                    <span
                      role="button"
                      tabIndex={0}
                      className="text-decoration-underline"
                      style={{ cursor: 'pointer' }}
                      onClick={() => onOpen(e)}
                      onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && onOpen(e)}
                    >
                      {e.title}
                    </span>
                  </td>
                  <td>{when(e.startMoment)}</td>
                  <td>{when(e.endMoment)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
