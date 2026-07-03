import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, Calendar, CalendarEvent } from '../api';
import { calendarColor, isoTime, isSameDay, startOfWeek, weekDays } from '../utils';
import { CalendarDialog } from './CalendarDialog';
import { EventDialog } from './EventDialog';

const DAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

type EventDialogState = { event?: CalendarEvent; defaultCalendarId?: string } | null;
type CalendarDialogState = { mode: 'new' } | { mode: 'edit'; calendar: Calendar } | null;

/** Vue agenda hebdomadaire : barre latérale des calendriers + grille 7 jours des événements. */
export function Agenda() {
  const { t } = useTranslation(['calendar', 'common']);
  const qc = useQueryClient();

  const calendarsQuery = useQuery({ queryKey: ['calendar', 'calendars'], queryFn: api.getCalendars });
  const calendars = useMemo(() => calendarsQuery.data ?? [], [calendarsQuery.data]);

  // Visibilité des calendriers (tous visibles par défaut).
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visibleCalendars = calendars.filter((c) => !hidden.has(c._id));

  // Un query d'événements par calendrier visible.
  const eventQueries = useQueries({
    queries: visibleCalendars.map((c) => ({
      queryKey: ['calendar', 'events', c._id],
      queryFn: () => api.getEvents(c._id),
    })),
  });
  const colorById = useMemo(() => {
    const m = new Map<string, string>();
    calendars.forEach((c) => m.set(c._id, calendarColor(c.color)));
    return m;
  }, [calendars]);

  const events: CalendarEvent[] = useMemo(
    () => eventQueries.flatMap((q) => (q.data as CalendarEvent[] | undefined) ?? []),
    [eventQueries],
  );

  const [monday, setMonday] = useState(() => startOfWeek(new Date()));
  const days = useMemo(() => weekDays(monday), [monday]);
  const shiftWeek = (weeks: number) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + weeks * 7);
    setMonday(d);
  };
  const weekLabel = `${monday.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} – ${days[6].toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}`;

  const [eventDialog, setEventDialog] = useState<EventDialogState>(null);
  const [calendarDialog, setCalendarDialog] = useState<CalendarDialogState>(null);

  const deleteCalMut = useMutation({
    mutationFn: (id: string) => api.deleteCalendar(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar', 'calendars'] }),
  });
  const deleteEventMut = useMutation({
    mutationFn: ({ calId, evId }: { calId: string; evId: string }) => api.deleteEvent(calId, evId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar', 'events'] }),
  });

  const toggleHidden = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div>
      {eventDialog && (
        <EventDialog
          calendars={calendars}
          event={eventDialog.event}
          defaultCalendarId={eventDialog.defaultCalendarId}
          onClose={() => setEventDialog(null)}
        />
      )}
      {calendarDialog && (
        <CalendarDialog
          calendar={calendarDialog.mode === 'edit' ? calendarDialog.calendar : undefined}
          onClose={() => setCalendarDialog(null)}
        />
      )}

      <div className="d-flex align-items-center justify-content-between mb-16">
        <h1 className="m-0">{t('calendar.title', { defaultValue: 'Agenda' })}</h1>
        <button
          type="button"
          className="btn btn-primary"
          disabled={calendars.length === 0}
          onClick={() => setEventDialog({ defaultCalendarId: visibleCalendars[0]?._id })}
        >
          {t('calendar.event.new', { defaultValue: 'Nouvel événement' })}
        </button>
      </div>

      <div className="d-flex gap-16" style={{ alignItems: 'flex-start' }}>
        {/* Barre latérale des calendriers */}
        <aside style={{ minWidth: 220 }}>
          <div className="d-flex align-items-center justify-content-between mb-8">
            <strong>{t('calendar.mycalendars', { defaultValue: 'Mes calendriers' })}</strong>
            <button type="button" className="btn btn-link p-0" onClick={() => setCalendarDialog({ mode: 'new' })}>
              + {t('calendar.new', { defaultValue: 'Nouveau' })}
            </button>
          </div>
          {calendarsQuery.isLoading && <p>{t('calendar.loading', { defaultValue: 'Chargement…' })}</p>}
          <ul className="list-unstyled">
            {calendars.map((c) => (
              <li key={c._id} className="d-flex align-items-center justify-content-between py-4">
                <label className="d-flex align-items-center gap-8 m-0" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={!hidden.has(c._id)} aria-label={c.title} onChange={() => toggleHidden(c._id)} />
                  <span aria-hidden style={{ width: 12, height: 12, borderRadius: 3, background: calendarColor(c.color), display: 'inline-block' }} />
                  {c.title}
                </label>
                <span className="d-flex gap-4">
                  <button type="button" className="btn btn-link p-0" aria-label={`${t('calendar.edit', { defaultValue: 'Modifier' })} ${c.title}`} onClick={() => setCalendarDialog({ mode: 'edit', calendar: c })}>
                    ✎
                  </button>
                  <button
                    type="button"
                    className="btn btn-link p-0 text-danger"
                    aria-label={`${t('calendar.delete', { defaultValue: 'Supprimer' })} ${c.title}`}
                    onClick={() => {
                      if (window.confirm(t('calendar.confirm.delete', { defaultValue: 'Supprimer ce calendrier et ses événements ?' })))
                        deleteCalMut.mutate(c._id);
                    }}
                  >
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </aside>

        {/* Grille hebdomadaire */}
        <div className="flex-grow-1">
          <div className="d-flex align-items-center justify-content-center gap-16 mb-16">
            <button type="button" className="btn btn-link" onClick={() => shiftWeek(-1)}>
              ← {t('calendar.week.prev', { defaultValue: 'Semaine précédente' })}
            </button>
            <strong style={{ minWidth: 220, textAlign: 'center' }}>{weekLabel}</strong>
            <button type="button" className="btn btn-link" onClick={() => shiftWeek(1)}>
              {t('calendar.week.next', { defaultValue: 'Semaine suivante' })} →
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 8 }}>
            {days.map((day, i) => {
              const dayEvents = events
                .filter((e) => isSameDay(e.startMoment, day))
                .sort((a, b) => a.startMoment.localeCompare(b.startMoment));
              return (
                <div key={i} className="border rounded p-8" style={{ minHeight: 160, background: '#fafafa' }}>
                  <div className="fw-bold mb-8" style={{ fontSize: 13 }}>
                    {DAY_LABELS[i]} {day.getDate()}
                  </div>
                  {dayEvents.map((e) => (
                    <div key={e._id} className="rounded p-4 mb-4" style={{ background: '#fff', borderLeft: `4px solid ${colorById.get(e.calendar?.[0]) ?? '#2a9cc8'}`, border: '1px solid #e0e0e0', fontSize: 12 }}>
                      <div className="d-flex justify-content-between align-items-start gap-4">
                        <strong>{e.allday ? t('calendar.event.allday.short', { defaultValue: 'Journée' }) : isoTime(e.startMoment)}</strong>
                        <span className="d-flex gap-4">
                          <button type="button" className="btn btn-link p-0" aria-label={`${t('calendar.edit', { defaultValue: 'Modifier' })} ${e.title}`} onClick={() => setEventDialog({ event: e })} style={{ fontSize: 11 }}>
                            ✎
                          </button>
                          <button
                            type="button"
                            className="btn btn-link p-0 text-danger"
                            aria-label={`${t('calendar.delete', { defaultValue: 'Supprimer' })} ${e.title}`}
                            style={{ fontSize: 11 }}
                            onClick={() => {
                              if (window.confirm(t('calendar.event.confirm.delete', { defaultValue: 'Supprimer cet événement ?' })))
                                deleteEventMut.mutate({ calId: e.calendar[0], evId: e._id });
                            }}
                          >
                            ✕
                          </button>
                        </span>
                      </div>
                      <div>{e.title}</div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Agenda;
