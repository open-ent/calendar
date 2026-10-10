import { EmptyScreen } from '@open-ent/react';
import { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import illuAgenda from '@images/emptyscreen/illu-homeworks.svg';

import { CalendarEvent } from '../api';
import { EventRights } from '../rights';
import {
  DAY_LABELS,
  DAY_SHORT,
  daySpan,
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

export interface ViewHandlers {
  colorOf: (event: CalendarEvent) => string;
  rightsOf: (event: CalendarEvent) => EventRights;
  onOpen: (event: CalendarEvent) => void;
  onShare: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
}

interface ViewProps extends ViewHandlers {
  cursor: Date;
  events: CalendarEvent[];
}

const byStart = (a: CalendarEvent, b: CalendarEvent) =>
  (a.startMoment || '').localeCompare(b.startMoment || '');

/** Les événements qui occupent ce jour — un événement sur plusieurs jours apparaît sur chacun. */
const eventsOfDay = (events: CalendarEvent[], day: Date) =>
  events.filter((e) => occupiesDay(e.startMoment, e.endMoment, day)).sort(byStart);

/** Écran vide commun aux vues — illustration du socle. */
function NoEvents({ text }: { text: string }) {
  return (
    <div className="m-auto py-24">
      <EmptyScreen imageSrc={illuAgenda} title={text} />
    </div>
  );
}

/** Vue Jour : les événements du jour pointé, en cartes détaillées. */
export function DayView({ cursor, events, colorOf, rightsOf, onOpen, onShare, onDelete }: ViewProps) {
  const { t } = useTranslation(['calendar', 'common']);
  const dayEvents = eventsOfDay(events, cursor);

  if (dayEvents.length === 0) {
    return <NoEvents text={t('calendar.noevents', { defaultValue: 'Aucun événement ce jour.' })} />;
  }

  return (
    <div className="d-flex flex-column">
      {dayEvents.map((e) => (
        <EventCard
          key={e._id}
          event={e}
          color={colorOf(e)}
          rights={rightsOf(e)}
          span={daySpan(e.startMoment, e.endMoment, cursor)}
          onOpen={() => onOpen(e)}
          onShare={() => onShare(e)}
          onDelete={() => onDelete(e)}
        />
      ))}
    </div>
  );
}

/** Vue Semaine : sept colonnes lundi → dimanche. */
export function WeekView({ cursor, events, colorOf, rightsOf, onOpen, onShare, onDelete }: ViewProps) {
  const today = new Date().toISOString();

  return (
    <div className="agenda-grid">
      {weekDays(startOfWeek(cursor)).map((day, i) => {
        const dayEvents = eventsOfDay(events, day);
        return (
          <div
            key={day.toISOString()}
            className={`agenda-day agenda-day--week p-8 ${isSameDay(today, day) ? 'agenda-day--today' : ''}`}
          >
            <div className="small fw-bold mb-8">
              {DAY_LABELS[i]} {day.getDate()}
            </div>
            {dayEvents.map((e) => (
              <EventCard
                key={e._id}
                event={e}
                color={colorOf(e)}
                rights={rightsOf(e)}
                span={daySpan(e.startMoment, e.endMoment, day)}
                compact
                onOpen={() => onOpen(e)}
                onShare={() => onShare(e)}
                onDelete={() => onDelete(e)}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Vue Quinzaine : deux semaines lundi → dimanche, en pastilles cliquables — reprend le rendu de
 * la vue Mois (pas celui de la vue Semaine), comme côté AngularJS où `schedule-fortnight`
 * réutilise intégralement le CSS `schedule-month` (seule la fenêtre de jours diffère : 14 jours
 * cadrés sur un lundi au lieu du mois calendaire). La date de chaque cellule est au format
 * jour/mois (et non juste le quantième) car une quinzaine peut chevaucher deux mois.
 */
export function FortnightView({ cursor, events, colorOf, onOpen }: ViewProps) {
  const { t } = useTranslation(['calendar', 'common']);
  const today = new Date().toISOString();
  const maxChips = 3;

  return (
    <div className="agenda-grid">
      {DAY_SHORT.map((label) => (
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
              {day.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
            </div>
            {dayEvents.slice(0, maxChips).map((e) => {
              const span = daySpan(e.startMoment, e.endMoment, day);
              return (
                <button
                  key={e._id}
                  type="button"
                  className="agenda-chip small text-truncate px-4 mb-2"
                  style={{ '--agenda-color': colorOf(e) } as CSSProperties}
                  title={e.title}
                  onClick={() => onOpen(e)}
                >
                  {e.allday || span === 'middle' || span === 'end' ? '' : `${isoTime(e.startMoment)} `}
                  {e.title}
                </button>
              );
            })}
            {dayEvents.length > maxChips && (
              <div className="small text-gray-700">
                {t('calendar.month.more', {
                  defaultValue: '+[[count]] autre(s)',
                  count: dayEvents.length - maxChips,
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Vue Mois : grille 6 × 7, les événements en pastilles cliquables. */
export function MonthView({ cursor, events, colorOf, onOpen }: ViewProps) {
  const { t } = useTranslation(['calendar', 'common']);
  const today = new Date().toISOString();
  const maxChips = 3;

  return (
    <div className="agenda-grid">
      {DAY_SHORT.map((label) => (
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
                  title={e.title}
                  onClick={() => onOpen(e)}
                >
                  {e.allday || span === 'middle' || span === 'end' ? '' : `${isoTime(e.startMoment)} `}
                  {e.title}
                </button>
              );
            })}
            {dayEvents.length > maxChips && (
              <div className="small text-gray-700">
                {t('calendar.month.more', {
                  defaultValue: '+[[count]] autre(s)',
                  count: dayEvents.length - maxChips,
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Vue Liste : tous les événements visibles, par ordre chronologique. */
export function ListView({ events, colorOf, rightsOf, onOpen, onShare, onDelete }: ViewProps) {
  const { t } = useTranslation(['calendar', 'common']);

  if (events.length === 0) {
    return <NoEvents text={t('calendar.list.empty', { defaultValue: 'Aucun événement.' })} />;
  }

  return (
    <div className="d-flex flex-column">
      {[...events].sort(byStart).map((e) => (
        <EventCard
          key={e._id}
          event={e}
          color={colorOf(e)}
          rights={rightsOf(e)}
          withDate
          onOpen={() => onOpen(e)}
          onShare={() => onShare(e)}
          onDelete={() => onDelete(e)}
        />
      ))}
    </div>
  );
}
