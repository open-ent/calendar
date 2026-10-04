import { AppHeader, Breadcrumb, Button, useEdificeClient } from '@open-ent/react';
import { IconPlus } from '@open-ent/react/icons';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, Calendar, CalendarEvent } from '../api';
import { ConfirmModal } from '../components/ConfirmModal';
import { AgendaToolbar } from '../features/AgendaToolbar';
import { DayView, ListView, MonthView, WeekView } from '../features/AgendaViews';
import { CalendarSidebar } from '../features/CalendarSidebar';
import { AgendaView, calendarColor, periodLabel, shiftCursor } from '../utils';
import { CalendarDialog } from './CalendarDialog';
import { EventDialog } from './EventDialog';
import { PortalPublishDialog } from './PortalPublishDialog';
import { ShareDialog } from './ShareDialog';

/** Couleur attribuée d'office à un agenda externe ajouté par URL. */
const EXTERNAL_CALENDAR_COLOR = '#e63b3b';

type EventDialogState = { event?: CalendarEvent; defaultCalendarId?: string } | null;
type CalendarDialogState = { mode: 'new' } | { mode: 'edit'; calendar: Calendar } | null;
type ShareDialogState = {
  resourceId: string;
  resourceName: string;
  title: string;
  kind: 'calendar' | 'event';
} | null;
type ConfirmState =
  | { kind: 'calendar'; calendar: Calendar }
  | { kind: 'external'; calendar: Calendar }
  | { kind: 'event'; event: CalendarEvent }
  | null;

/** Agenda : barre latérale des agendas + vues Jour / Semaine / Mois / Liste des événements. */
export function Agenda() {
  const { t } = useTranslation(['calendar', 'common']);
  const qc = useQueryClient();
  const { currentApp, user } = useEdificeClient();
  const myUserId = (user as { userId?: string } | undefined)?.userId ?? '';

  const calendarsQuery = useQuery({ queryKey: ['calendar', 'calendars'], queryFn: api.getCalendars });
  const calendars = useMemo(() => calendarsQuery.data ?? [], [calendarsQuery.data]);

  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visibleCalendars = useMemo(
    () => calendars.filter((c) => !hidden.has(c._id)),
    [calendars, hidden],
  );

  const eventQueries = useQueries({
    queries: visibleCalendars.map((c) => ({
      queryKey: ['calendar', 'events', c._id],
      queryFn: () => api.getEvents(c._id),
    })),
  });
  const events: CalendarEvent[] = useMemo(
    () => eventQueries.flatMap((q) => (q.data as CalendarEvent[] | undefined) ?? []),
    [eventQueries],
  );

  const colorById = useMemo(() => {
    const m = new Map<string, string>();
    calendars.forEach((c) => m.set(c._id, calendarColor(c.color)));
    return m;
  }, [calendars]);
  const colorOf = (e: CalendarEvent) => colorById.get(e.calendar?.[0]) ?? calendarColor();

  // Les agendas externes (flux ICS) sont en lecture seule : exclus de toute écriture.
  const writableCalendars = useMemo(() => calendars.filter((c) => !c.isExternal), [calendars]);
  const myCalendars = useMemo(
    () => writableCalendars.filter((c) => !myUserId || c.owner?.userId === myUserId),
    [writableCalendars, myUserId],
  );
  const sharedCalendars = useMemo(
    () => writableCalendars.filter((c) => myUserId && c.owner?.userId !== myUserId),
    [writableCalendars, myUserId],
  );
  const externalCalendars = useMemo(() => calendars.filter((c) => c.isExternal), [calendars]);

  const [view, setView] = useState<AgendaView>('week');
  const [cursor, setCursor] = useState(() => new Date());

  const [eventDialog, setEventDialog] = useState<EventDialogState>(null);
  const [calendarDialog, setCalendarDialog] = useState<CalendarDialogState>(null);
  const [shareDialog, setShareDialog] = useState<ShareDialogState>(null);
  const [portalPublishDialog, setPortalPublishDialog] = useState<Calendar | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  // Ajout d'un agenda externe (flux ICS, URL sur liste blanche des plateformes).
  const [addingExternal, setAddingExternal] = useState(false);
  const [externalTitle, setExternalTitle] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const externalMut = useMutation({
    mutationFn: () =>
      api.addExternalCalendar({
        title: externalTitle.trim(),
        color: EXTERNAL_CALENDAR_COLOR,
        icsLink: externalUrl.trim(),
      }),
    onSuccess: () => {
      setAddingExternal(false);
      setExternalTitle('');
      setExternalUrl('');
      qc.invalidateQueries({ queryKey: ['calendar'] });
    },
  });

  const deleteCalMut = useMutation({
    mutationFn: (id: string) => api.deleteCalendar(id),
    onSuccess: () => {
      setConfirm(null);
      qc.invalidateQueries({ queryKey: ['calendar'] });
    },
  });
  const deleteEventMut = useMutation({
    mutationFn: ({ calId, evId }: { calId: string; evId: string }) => api.deleteEvent(calId, evId),
    onSuccess: () => {
      setConfirm(null);
      qc.invalidateQueries({ queryKey: ['calendar', 'events'] });
    },
  });

  const toggleHidden = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const openShare = (kind: 'calendar' | 'event', id: string, name: string) =>
    setShareDialog({
      resourceId: id,
      resourceName: name,
      kind,
      title:
        kind === 'calendar'
          ? t('calendar.share.title', { defaultValue: "Partager l'agenda" })
          : t('calendar.event.share.title', { defaultValue: "Partager l'événement" }),
    });

  const viewHandlers = {
    colorOf,
    onEdit: (event: CalendarEvent) => setEventDialog({ event }),
    onShare: (event: CalendarEvent) => openShare('event', event._id, event.title),
    onDelete: (event: CalendarEvent) => setConfirm({ kind: 'event', event }),
  };
  const viewProps = { cursor, events, ...viewHandlers };

  const confirmTexts = () => {
    if (!confirm) return null;
    if (confirm.kind === 'event') {
      return {
        title: t('calendar.event.delete.title', { defaultValue: "Supprimer l'événement" }),
        text: t('calendar.event.confirm.delete', { defaultValue: 'Supprimer cet événement ?' }),
        isLoading: deleteEventMut.isPending,
        onConfirm: () =>
          deleteEventMut.mutate({ calId: confirm.event.calendar[0], evId: confirm.event._id }),
      };
    }
    return {
      title:
        confirm.kind === 'external'
          ? t('calendar.external.delete.title', { defaultValue: "Supprimer l'agenda externe" })
          : t('calendar.delete.title', { defaultValue: "Supprimer l'agenda" }),
      text:
        confirm.kind === 'external'
          ? t('calendar.external.confirm.delete', { defaultValue: 'Supprimer cet agenda externe ?' })
          : t('calendar.confirm.delete', {
              defaultValue: 'Supprimer cet agenda et tous ses événements ?',
            }),
      isLoading: deleteCalMut.isPending,
      onConfirm: () => deleteCalMut.mutate(confirm.calendar._id),
    };
  };
  const confirmProps = confirmTexts();

  return (
    <>
      <AppHeader
        render={() => (
          <Button
            type="button"
            color="primary"
            variant="filled"
            leftIcon={<IconPlus />}
            disabled={writableCalendars.length === 0}
            onClick={() =>
              setEventDialog({
                defaultCalendarId: visibleCalendars.find((c) => !c.isExternal)?._id,
              })
            }
          >
            {t('calendar.event.new', { defaultValue: 'Nouvel événement' })}
          </Button>
        )}
      >
        {currentApp && <Breadcrumb app={currentApp} />}
      </AppHeader>

      <div className="d-flex flex-fill flex-column flex-lg-row">
        <CalendarSidebar
          myCalendars={myCalendars}
          sharedCalendars={sharedCalendars}
          externalCalendars={externalCalendars}
          isLoading={calendarsQuery.isLoading}
          hidden={hidden}
          onToggle={toggleHidden}
          onCreate={() => setCalendarDialog({ mode: 'new' })}
          onEdit={(calendar) => setCalendarDialog({ mode: 'edit', calendar })}
          onShare={(calendar) => openShare('calendar', calendar._id, calendar.title)}
          onDelete={(calendar) =>
            setConfirm({ kind: calendar.isExternal ? 'external' : 'calendar', calendar })
          }
          onPortalPublish={setPortalPublishDialog}
          externalForm={{
            isOpen: addingExternal,
            title: externalTitle,
            url: externalUrl,
            isPending: externalMut.isPending,
            isError: externalMut.isError,
            onOpenChange: setAddingExternal,
            onTitleChange: setExternalTitle,
            onUrlChange: setExternalUrl,
            onSubmit: () => externalMut.mutate(),
          }}
        />

        <div className="flex-fill py-16 ps-lg-16 d-flex flex-column overflow-hidden">
          <AgendaToolbar
            view={view}
            periodLabel={periodLabel(cursor, view)}
            onViewChange={setView}
            onShift={(direction) => setCursor(shiftCursor(cursor, view, direction))}
            onToday={() => setCursor(new Date())}
          />

          {view === 'day' && <DayView {...viewProps} />}
          {view === 'week' && <WeekView {...viewProps} />}
          {view === 'month' && <MonthView {...viewProps} />}
          {view === 'list' && <ListView {...viewProps} />}
        </div>
      </div>

      {eventDialog && (
        <EventDialog
          calendars={writableCalendars}
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
      {portalPublishDialog && (
        <PortalPublishDialog
          calendar={portalPublishDialog}
          onClose={() => setPortalPublishDialog(null)}
        />
      )}
      {confirmProps && (
        <ConfirmModal
          title={confirmProps.title}
          text={confirmProps.text}
          isLoading={confirmProps.isLoading}
          onConfirm={confirmProps.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

export default Agenda;
