import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, Calendar, CalendarEvent } from '../api';
import { calendarColor, isoTime, isSameDay, isSameMonth, monthGrid, startOfWeek, weekDays } from '../utils';
import { CalendarDialog } from './CalendarDialog';
import { EventDialog } from './EventDialog';
import { ShareDialog } from './ShareDialog';

const DAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const DAY_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

type View = 'day' | 'week' | 'month';
type EventDialogState = { event?: CalendarEvent; defaultCalendarId?: string } | null;
type CalendarDialogState = { mode: 'new' } | { mode: 'edit'; calendar: Calendar } | null;
type ShareDialogState = { resourceId: string; resourceName: string; title: string; kind: 'calendar' | 'event' } | null;

/** Agenda : barre latérale des calendriers + vue Jour / Semaine / Mois des événements. */
export function Agenda() {
  const { t } = useTranslation(['calendar', 'common']);
  const qc = useQueryClient();

  const calendarsQuery = useQuery({ queryKey: ['calendar', 'calendars'], queryFn: api.getCalendars });
  const calendars = useMemo(() => calendarsQuery.data ?? [], [calendarsQuery.data]);

  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visibleCalendars = calendars.filter((c) => !hidden.has(c._id));

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

  const [view, setView] = useState<View>('week');
  const [cursor, setCursor] = useState(() => new Date());

  const shift = (dir: number) => {
    const d = new Date(cursor);
    if (view === 'day') d.setDate(d.getDate() + dir);
    else if (view === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setCursor(d);
  };

  const [eventDialog, setEventDialog] = useState<EventDialogState>(null);
  const [calendarDialog, setCalendarDialog] = useState<CalendarDialogState>(null);
  const [shareDialog, setShareDialog] = useState<ShareDialogState>(null);

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

  const eventsOfDay = (day: Date) =>
    events.filter((e) => isSameDay(e.startMoment, day)).sort((a, b) => a.startMoment.localeCompare(b.startMoment));

  // Étiquette de période selon la vue.
  const periodLabel = useMemo(() => {
    if (view === 'day') return cursor.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    if (view === 'month') return cursor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const days = weekDays(startOfWeek(cursor));
    return `${days[0].toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} – ${days[6].toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  }, [view, cursor]);

  /** Carte d'événement (compacte). */
  const EventCard = ({ e }: { e: CalendarEvent }) => (
    <div className="rounded p-4 mb-4" style={{ background: '#fff', borderLeft: `4px solid ${colorById.get(e.calendar?.[0]) ?? '#2a9cc8'}`, border: '1px solid #e0e0e0', fontSize: 12 }}>
      <div className="d-flex justify-content-between align-items-start gap-4">
        <strong>{e.allday ? t('calendar.event.allday.short', { defaultValue: 'Journée' }) : isoTime(e.startMoment)}</strong>
        <span className="d-flex gap-4">
          <button type="button" className="btn btn-link p-0" style={{ fontSize: 11 }} aria-label={`${t('calendar.share', { defaultValue: 'Partager' })} ${e.title}`} onClick={() => setShareDialog({ resourceId: e._id, resourceName: e.title, title: t('calendar.event.share.title', { defaultValue: "Partager l'événement" }), kind: 'event' })}>
            ⇄
          </button>
          <button type="button" className="btn btn-link p-0" style={{ fontSize: 11 }} aria-label={`${t('calendar.edit', { defaultValue: 'Modifier' })} ${e.title}`} onClick={() => setEventDialog({ event: e })}>
            ✎
          </button>
          <button
            type="button"
            className="btn btn-link p-0 text-danger"
            style={{ fontSize: 11 }}
            aria-label={`${t('calendar.delete', { defaultValue: 'Supprimer' })} ${e.title}`}
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
  );

  return (
    <div>
      {eventDialog && (
        <EventDialog calendars={calendars} event={eventDialog.event} defaultCalendarId={eventDialog.defaultCalendarId} onClose={() => setEventDialog(null)} />
      )}
      {calendarDialog && (
        <CalendarDialog calendar={calendarDialog.mode === 'edit' ? calendarDialog.calendar : undefined} onClose={() => setCalendarDialog(null)} />
      )}
      {shareDialog && (
        <ShareDialog
          resourceId={shareDialog.resourceId}
          resourceName={shareDialog.resourceName}
          title={shareDialog.title}
          getShare={shareDialog.kind === 'calendar' ? api.getCalendarShare : api.getEventShare}
          shareBatch={shareDialog.kind === 'calendar' ? api.shareCalendarBatch : api.shareEventBatch}
          onClose={() => setShareDialog(null)}
        />
      )}

      <div className="d-flex align-items-center justify-content-between mb-16">
        <h1 className="m-0">{t('calendar.title', { defaultValue: 'Agenda' })}</h1>
        <button type="button" className="btn btn-primary" disabled={calendars.length === 0} onClick={() => setEventDialog({ defaultCalendarId: visibleCalendars[0]?._id })}>
          {t('calendar.event.new', { defaultValue: 'Nouvel événement' })}
        </button>
      </div>

      <div className="d-flex gap-16" style={{ alignItems: 'flex-start' }}>
        {/* Barre latérale */}
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
                  <button type="button" className="btn btn-link p-0" aria-label={`${t('calendar.share', { defaultValue: 'Partager' })} ${c.title}`} onClick={() => setShareDialog({ resourceId: c._id, resourceName: c.title, title: t('calendar.share.title', { defaultValue: 'Partager le calendrier' }), kind: 'calendar' })}>
                    ⇄
                  </button>
                  <button type="button" className="btn btn-link p-0" aria-label={`${t('calendar.edit', { defaultValue: 'Modifier' })} ${c.title}`} onClick={() => setCalendarDialog({ mode: 'edit', calendar: c })}>
                    ✎
                  </button>
                  <button
                    type="button"
                    className="btn btn-link p-0 text-danger"
                    aria-label={`${t('calendar.delete', { defaultValue: 'Supprimer' })} ${c.title}`}
                    onClick={() => {
                      if (window.confirm(t('calendar.confirm.delete', { defaultValue: 'Supprimer ce calendrier et ses événements ?' }))) deleteCalMut.mutate(c._id);
                    }}
                  >
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </aside>

        {/* Zone de vue */}
        <div className="flex-grow-1">
          <div className="d-flex align-items-center justify-content-between mb-16 flex-wrap gap-8">
            <div className="btn-group" role="group" aria-label={t('calendar.views', { defaultValue: 'Vues' })}>
              {(['day', 'week', 'month'] as View[]).map((v) => (
                <button key={v} type="button" className={`btn btn-sm ${view === v ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={view === v} onClick={() => setView(v)}>
                  {v === 'day' ? t('calendar.view.day', { defaultValue: 'Jour' }) : v === 'week' ? t('calendar.view.week', { defaultValue: 'Semaine' }) : t('calendar.view.month', { defaultValue: 'Mois' })}
                </button>
              ))}
            </div>
            <div className="d-flex align-items-center gap-12">
              <button type="button" className="btn btn-link" onClick={() => shift(-1)} aria-label={t('calendar.prev', { defaultValue: 'Précédent' })}>←</button>
              <strong style={{ minWidth: 180, textAlign: 'center', textTransform: 'capitalize' }}>{periodLabel}</strong>
              <button type="button" className="btn btn-link" onClick={() => shift(1)} aria-label={t('calendar.next', { defaultValue: 'Suivant' })}>→</button>
              <button type="button" className="btn btn-link" onClick={() => setCursor(new Date())}>{t('calendar.today', { defaultValue: "Aujourd'hui" })}</button>
            </div>
          </div>

          {/* Vue Jour */}
          {view === 'day' && (
            <div className="border rounded p-12" style={{ minHeight: 200, background: '#fafafa' }}>
              {eventsOfDay(cursor).length === 0 ? (
                <p className="text-muted m-0">{t('calendar.noevents', { defaultValue: 'Aucun événement ce jour.' })}</p>
              ) : (
                eventsOfDay(cursor).map((e) => <EventCard key={e._id} e={e} />)
              )}
            </div>
          )}

          {/* Vue Semaine */}
          {view === 'week' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 8 }}>
              {weekDays(startOfWeek(cursor)).map((day, i) => (
                <div key={i} className="border rounded p-8" style={{ minHeight: 160, background: '#fafafa' }}>
                  <div className="fw-bold mb-8" style={{ fontSize: 13 }}>{DAY_LABELS[i]} {day.getDate()}</div>
                  {eventsOfDay(day).map((e) => <EventCard key={e._id} e={e} />)}
                </div>
              ))}
            </div>
          )}

          {/* Vue Mois */}
          {view === 'month' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4, marginBottom: 4 }}>
                {DAY_SHORT.map((d) => (
                  <div key={d} className="fw-bold text-center" style={{ fontSize: 12 }}>{d}</div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
                {monthGrid(cursor).map((day, i) => {
                  const inMonth = isSameMonth(day, cursor);
                  const dayEvents = eventsOfDay(day);
                  return (
                    <div key={i} className="border rounded p-4" style={{ minHeight: 90, background: inMonth ? '#fff' : '#f0f0f0', opacity: inMonth ? 1 : 0.6 }}>
                      <div className="text-end" style={{ fontSize: 12 }}>{day.getDate()}</div>
                      {dayEvents.slice(0, 3).map((e) => (
                        <div key={e._id} className="rounded px-4 mb-2 text-truncate" style={{ background: colorById.get(e.calendar?.[0]) ?? '#2a9cc8', color: '#fff', fontSize: 11, cursor: 'pointer' }} title={e.title} onClick={() => setEventDialog({ event: e })}>
                          {e.allday ? '' : `${isoTime(e.startMoment)} `}{e.title}
                        </div>
                      ))}
                      {dayEvents.length > 3 && <div className="text-muted" style={{ fontSize: 10 }}>+{dayEvents.length - 3}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Agenda;
