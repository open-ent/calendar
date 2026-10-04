import { AppHeader, Breadcrumb, Button, useEdificeClient, useHasWorkflow } from '@open-ent/react';
import { IconPlus } from '@open-ent/react/icons';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, Calendar, CalendarEvent } from '../api';
import { ConfirmModal } from '../components/ConfirmModal';
import { AgendaToolbar } from '../features/AgendaToolbar';
import { DayView, ListView, MonthView, WeekView } from '../features/AgendaViews';
import { CalendarSidebar } from '../features/CalendarSidebar';
import { useCalendarVisibility } from '../hooks/useCalendarVisibility';
import { calendarRights, CalendarRights, eventRights, WORKFLOW } from '../rights';
import { AgendaView, calendarColor, periodLabel, shiftCursor } from '../utils';
import { CalendarDialog } from './CalendarDialog';
import { EventDetails } from './EventDetails';
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
  const me = user as { userId?: string; groupsIds?: string[] } | undefined;
  const myUserId = me?.userId ?? '';
  const myGroupIds = useMemo(() => me?.groupsIds ?? [], [me]);

  const canCreateCalendar = useHasWorkflow(WORKFLOW.createCalendar) === true;

  const calendarsQuery = useQuery({ queryKey: ['calendar', 'calendars'], queryFn: api.getCalendars });
  const calendars = useMemo(() => calendarsQuery.data ?? [], [calendarsQuery.data]);

  const { isVisible, toggle, reveal } = useCalendarVisibility(calendars);
  const visibleCalendars = useMemo(
    () => calendars.filter((c) => isVisible(c._id)),
    [calendars, isVisible],
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

  const calendarsById = useMemo(() => {
    const m = new Map<string, Calendar>();
    calendars.forEach((c) => m.set(c._id, c));
    return m;
  }, [calendars]);

  // Droits de l'usager sur chaque agenda, calculés une fois (tableau `shared` entcore).
  const rightsById = useMemo(() => {
    const m = new Map<string, CalendarRights>();
    calendars.forEach((c) => m.set(c._id, calendarRights(c, myUserId, myGroupIds)));
    return m;
  }, [calendars, myUserId, myGroupIds]);

  const rightsOfCalendar = (c: Calendar) =>
    rightsById.get(c._id) ?? calendarRights(c, myUserId, myGroupIds);
  const rightsOfEvent = (e: CalendarEvent) =>
    eventRights(e, calendarsById, rightsById, myUserId, myGroupIds);

  const colorById = useMemo(() => {
    const m = new Map<string, string>();
    calendars.forEach((c) => m.set(c._id, calendarColor(c.color)));
    return m;
  }, [calendars]);
  const colorOf = (e: CalendarEvent) => colorById.get(e.calendar?.[0]) ?? calendarColor();

  /** Agendas dans lesquels l'usager peut écrire — seuls ceux-là acceptent un événement. */
  const writableCalendars = useMemo(
    () => calendars.filter((c) => !c.isExternal && rightsById.get(c._id)?.contrib),
    [calendars, rightsById],
  );
  const notExternal = useMemo(() => calendars.filter((c) => !c.isExternal), [calendars]);
  const myCalendars = useMemo(
    () => notExternal.filter((c) => !myUserId || c.owner?.userId === myUserId),
    [notExternal, myUserId],
  );
  const sharedCalendars = useMemo(
    () => notExternal.filter((c) => myUserId && c.owner?.userId !== myUserId),
    [notExternal, myUserId],
  );
  const externalCalendars = useMemo(() => calendars.filter((c) => c.isExternal), [calendars]);

  const [view, setView] = useState<AgendaView>('week');
  const [cursor, setCursor] = useState(() => new Date());

  const [eventDialog, setEventDialog] = useState<EventDialogState>(null);
  const [eventDetails, setEventDetails] = useState<CalendarEvent | null>(null);
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

  /** Ouvre le formulaire si l'usager peut modifier, la fiche en lecture seule sinon. */
  const openEvent = (event: CalendarEvent) => {
    if (rightsOfEvent(event).edit) setEventDialog({ event });
    else setEventDetails(event);
  };

  const viewProps = {
    cursor,
    events,
    colorOf,
    rightsOf: rightsOfEvent,
    onOpen: openEvent,
    onShare: (event: CalendarEvent) => openShare('event', event._id, event.title),
    onDelete: (event: CalendarEvent) => setConfirm({ kind: 'event', event }),
  };

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
                defaultCalendarId:
                  writableCalendars.find((c) => isVisible(c._id))?._id ?? writableCalendars[0]?._id,
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
          isVisible={isVisible}
          onToggle={toggle}
          onCreate={() => setCalendarDialog({ mode: 'new' })}
          onEdit={(calendar) => setCalendarDialog({ mode: 'edit', calendar })}
          onShare={(calendar) => openShare('calendar', calendar._id, calendar.title)}
          onDelete={(calendar) =>
            setConfirm({ kind: calendar.isExternal ? 'external' : 'calendar', calendar })
          }
          onPortalPublish={setPortalPublishDialog}
          rightsOf={rightsOfCalendar}
          canCreateCalendar={canCreateCalendar}
          externalForm={{
            isOpen: addingExternal,
            title: externalTitle,
            url: externalUrl,
            isPending: externalMut.isPending,
            isError: externalMut.isError,
            canAdd: canCreateCalendar,
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
      {eventDetails && (
        <EventDetails
          event={eventDetails}
          calendars={calendars}
          onClose={() => setEventDetails(null)}
        />
      )}
      {calendarDialog && (
        <CalendarDialog
          calendar={calendarDialog.mode === 'edit' ? calendarDialog.calendar : undefined}
          onCreated={reveal}
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
