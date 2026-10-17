import { CSSProperties, KeyboardEvent, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { CalendarEvent } from '../api';
import { dateLocale } from '../locale';
import { allDayEvents, daySegments, slotStart, visibleHours } from '../timeGrid';
import { isoTime, isSameDay, toDateOnly } from '../utils';

const HOUR_PX = 48;

export interface TimeGridProps {
  days: Date[];
  events: CalendarEvent[];
  colorOf: (event: CalendarEvent) => string;
  tooltipOf: (event: CalendarEvent) => string;
  onOpen: (event: CalendarEvent) => void;
  /** Clic sur un créneau libre : début arrondi à la demi-heure. */
  onCreateAt?: (start: Date) => void;
  /** `week` ou `day`, repris en attribut pour les tests et le style. */
  kind: 'week' | 'day';
}

/**
 * Grille horaire (une colonne par jour) des vues Jour et Semaine, comme l'agenda AngularJS :
 * événements positionnés à l'heure, chevauchements côte à côte, bandeau « journée entière »,
 * clic sur un créneau libre pour créer.
 */
export function TimeGrid({ days, events, colorOf, tooltipOf, onOpen, onCreateAt, kind }: TimeGridProps) {
  const { t } = useTranslation(['calendar', 'common']);
  const today = new Date().toISOString();

  const perDay = useMemo(
    () => days.map((d) => ({ day: d, segments: daySegments(events, d), allDay: allDayEvents(events, d) })),
    [days, events],
  );
  const { from, to } = useMemo(() => visibleHours(perDay.flatMap((p) => p.segments)), [perDay]);
  const hours = Array.from({ length: to - from }, (_, i) => from + i);
  const hasAllDay = perDay.some((p) => p.allDay.length > 0);
  const colsTemplate = `3.5rem repeat(${days.length}, minmax(0, 1fr))`;
  const colorStyle = (e: CalendarEvent) => ({ '--agenda-color': colorOf(e) }) as CSSProperties;

  const onKey = (ev: KeyboardEvent, e: CalendarEvent) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      onOpen(e);
    }
  };

  return (
    <div className="agenda-timegrid" data-calendar-grid={kind} style={{ overflowX: 'auto' }}>
      <div className="d-grid agenda-timegrid-head" style={{ gridTemplateColumns: colsTemplate, minWidth: 40 + days.length * 90 }}>
        <div />
        {perDay.map(({ day }) => (
          <div
            key={day.toISOString()}
            data-day={toDateOnly(day)}
            className={`text-center small fw-bold py-4 ${isSameDay(today, day) ? 'agenda-day--today' : ''}`}
          >
            {day.toLocaleDateString(dateLocale(), { weekday: 'short', day: '2-digit', month: '2-digit' })}
          </div>
        ))}
      </div>

      {hasAllDay && (
        <div className="d-grid" style={{ gridTemplateColumns: colsTemplate, minWidth: 40 + days.length * 90 }}>
          <div className="small text-gray-700 p-4">{t('calendar.event.allday.short', { defaultValue: 'Journée' })}</div>
          {perDay.map(({ day, allDay }) => (
            <div key={day.toISOString()} className="p-2 border-start" style={{ minWidth: 0 }}>
              {allDay.map((e) => (
                <button
                  key={e._id}
                  type="button"
                  className="agenda-chip small text-truncate px-4 mb-2"
                  style={colorStyle(e)}
                  title={tooltipOf(e)}
                  onClick={() => onOpen(e)}
                >
                  {e.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="d-grid agenda-timegrid-body" style={{ gridTemplateColumns: colsTemplate, minWidth: 40 + days.length * 90 }}>
        <div>
          {hours.map((h) => (
            <div key={h} className="small text-gray-700 text-end pe-4" style={{ height: HOUR_PX }}>
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>
        {perDay.map(({ day, segments }) => (
          <div
            key={day.toISOString()}
            className="position-relative border-start"
            style={{ height: hours.length * HOUR_PX, minWidth: 0 }}
            data-day-column={toDateOnly(day)}
            onClick={(ev) => {
              if (!onCreateAt || ev.target !== ev.currentTarget) return;
              const y = ev.clientY - ev.currentTarget.getBoundingClientRect().top;
              onCreateAt(slotStart(day, from * 60 + Math.floor((y / HOUR_PX) * 60)));
            }}
          >
            {hours.map((h) => (
              <div key={h} style={{ height: HOUR_PX, borderTop: '1px solid var(--openent-gray-200)', pointerEvents: 'none' }} />
            ))}
            {segments.map((s) => (
              <div
                key={s.event._id}
                role="button"
                tabIndex={0}
                data-event-id={s.event._id}
                className="agenda-chip position-absolute overflow-hidden small px-4"
                style={{
                  ...colorStyle(s.event),
                  top: ((s.startMin - from * 60) / 60) * HOUR_PX,
                  height: Math.max(((s.endMin - s.startMin) / 60) * HOUR_PX - 2, 18),
                  left: `${(s.col / s.cols) * 100}%`,
                  width: `${100 / s.cols}%`,
                  cursor: 'pointer',
                }}
                title={tooltipOf(s.event)}
                onClick={() => onOpen(s.event)}
                onKeyDown={(ev) => onKey(ev, s.event)}
              >
                <strong>{isoTime(s.event.startMoment)}</strong> {s.event.title}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
