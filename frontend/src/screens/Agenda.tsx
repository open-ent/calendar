import { AppHeader, Breadcrumb, Button, useEdificeClient, useHasWorkflow } from '@open-ent/react';
import { IconPlus } from '@open-ent/react/icons';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, Calendar, CalendarEvent } from '../api';
import { ConfirmModal } from '../components/ConfirmModal';
import { RecurrenceScope, RecurrenceScopeModal } from '../components/RecurrenceScopeModal';
import { AgendaToolbar } from '../features/AgendaToolbar';
import { DayView, ListView, MonthView, WeekView } from '../features/AgendaViews';
import { CalendarSidebar } from '../features/CalendarSidebar';
import { useCalendarVisibility } from '../hooks/useCalendarVisibility';
import {
  calendarRights,
  CalendarRights,
  CalendarType,
  eventRights,
  WORKFLOW,
} from '../rights';
import { AgendaView, calendarColor, periodLabel, shiftCursor } from '../utils';
import { CalendarDialog } from './CalendarDialog';
import { DeleteEventModal } from './DeleteEventModal';
import { IcsImportDialog } from './IcsImportDialog';

// Le formulaire et la fiche d'un événement embarquent l'éditeur riche (tiptap, ~800 ko) : on
// diffère leur chargement pour garder l'ouverture de l'agenda légère. La frontière `Suspense`
// est posée ICI, hors de toute fenêtre modale : suspendre à l'intérieur d'une modale du socle,
// animée par react-spring, lève une erreur React #321 et la fenêtre ne s'affiche jamais.
const EventDialog = lazy(() => import('./EventDialog'));
const EventDetails = lazy(() => import('./EventDetails'));
import { PortalPublishDialog } from './PortalPublishDialog';
import { ShareDialog } from './ShareDialog';

/** Couleur attribuée d'office à un agenda externe ajouté par URL. */
const EXTERNAL_CALENDAR_COLOR = '#e63b3b';

type EventDialogState = {
  event?: CalendarEvent;
  defaultCalendarId?: string;
  scope?: RecurrenceScope;
} | null;
/** Édition en attente du choix « cette occurrence / toute la récurrence ». */
type ScopePromptState = { event: CalendarEvent } | null;
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
  const canCreateStructure = useHasWorkflow(WORKFLOW.createStructureCalendar) === true;
  const canCreateGroup = useHasWorkflow(WORKFLOW.createGroupCalendar) === true;
  const canAddExternal = useHasWorkflow(WORKFLOW.importExternalCalendar) === true;
  const allowedCalendarTypes = useMemo<CalendarType[]>(() => {
    const types: CalendarType[] = [];
    if (canCreateStructure) types.push('structure');
    if (canCreateGroup) types.push('group');
    return types;
  }, [canCreateStructure, canCreateGroup]);
  // Un agenda d'établissement se rattache à la structure de l'usager (la première, comme l'Angular).
  const myStructureId = (user as { structures?: string[] } | undefined)?.structures?.[0];

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
  // Les agendas typés ont leur propre section (parité avec la barre latérale AngularJS) ;
  // « Mes agendas » ne garde donc que les agendas personnels dont je suis propriétaire.
  const structureCalendars = useMemo(
    () => notExternal.filter((c) => c.type === 'structure'),
    [notExternal],
  );
  const groupCalendars = useMemo(() => notExternal.filter((c) => c.type === 'group'), [notExternal]);
  const untyped = useMemo(
    () => notExternal.filter((c) => c.type !== 'structure' && c.type !== 'group'),
    [notExternal],
  );
  const myCalendars = useMemo(
    () => untyped.filter((c) => !myUserId || c.owner?.userId === myUserId),
    [untyped, myUserId],
  );
  const sharedCalendars = useMemo(
    () => untyped.filter((c) => myUserId && c.owner?.userId !== myUserId),
    [untyped, myUserId],
  );
  const externalCalendars = useMemo(() => calendars.filter((c) => c.isExternal), [calendars]);

  const [view, setView] = useState<AgendaView>('week');
  const [cursor, setCursor] = useState(() => new Date());

  const [eventDialog, setEventDialog] = useState<EventDialogState>(null);
  const [eventDetails, setEventDetails] = useState<CalendarEvent | null>(null);
  const [calendarDialog, setCalendarDialog] = useState<CalendarDialogState>(null);
  const [shareDialog, setShareDialog] = useState<ShareDialogState>(null);
  const [portalPublishDialog, setPortalPublishDialog] = useState<Calendar | null>(null);
  const [icsImportDialog, setIcsImportDialog] = useState<Calendar | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [scopePrompt, setScopePrompt] = useState<ScopePromptState>(null);
  const [eventToDelete, setEventToDelete] = useState<CalendarEvent | null>(null);

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
    mutationFn: async ({
      event,
      scope,
      deleteBookings,
    }: {
      event: CalendarEvent;
      scope: RecurrenceScope;
      deleteBookings: boolean;
    }) => {
      const targets = scope === 'all' ? seriesOf(event) : [event];
      for (const target of targets) {
        await api.deleteEvent(target.calendar[0], target._id, { deleteBookings });
      }
    },
    onSuccess: () => {
      setEventToDelete(null);
      qc.invalidateQueries({ queryKey: ['calendar', 'events'] });
    },
    // L'événement est supprimé même si ses réservations ne l'ont pas été : on rafraîchit
    // dans tous les cas et on laisse le message d'erreur à l'écran.
    onError: () => qc.invalidateQueries({ queryKey: ['calendar', 'events'] }),
  });

  /** Toutes les occurrences d'une série, retrouvées par `parentId` parmi les événements chargés. */
  const seriesOf = (event: CalendarEvent): CalendarEvent[] =>
    event.parentId ? events.filter((e) => e.parentId === event.parentId) : [event];

  /** Un événement récurrent demande toujours à l'usager sur quoi porte l'action. */
  const isSeries = (event: CalendarEvent) => !!event.isRecurrent && !!event.parentId;

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

  /**
   * Télécharge le flux iCalendar d'un agenda. La route est authentifiée par cookie de session :
   * une navigation suffit, le navigateur gère l'enregistrement du fichier.
   */
  const exportIcs = (calendar: Calendar) => {
    window.location.assign(api.icalExportUrl(calendar._id));
  };

  /** Ouvre le formulaire si l'usager peut modifier, la fiche en lecture seule sinon. */
  const openEvent = (event: CalendarEvent) => {
    if (!rightsOfEvent(event).edit) {
      setEventDetails(event);
      return;
    }
    if (isSeries(event)) setScopePrompt({ event });
    else setEventDialog({ event });
  };

  const viewProps = {
    cursor,
    events,
    colorOf,
    rightsOf: rightsOfEvent,
    onOpen: openEvent,
    onShare: (event: CalendarEvent) => openShare('event', event._id, event.title),
    onDelete: (event: CalendarEvent) => {
      // Repart d'un état propre : sans cela, l'échec d'une suppression précédente afficherait
      // son message d'erreur dès l'ouverture de la fenêtre suivante.
      deleteEventMut.reset();
      setEventToDelete(event);
    },
  };

  const confirmTexts = () => {
    if (!confirm) return null;
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
          structureCalendars={structureCalendars}
          groupCalendars={groupCalendars}
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
          onImportIcs={setIcsImportDialog}
          onExportIcs={exportIcs}
          rightsOf={rightsOfCalendar}
          canCreateCalendar={canCreateCalendar}
          myOwnerId={myUserId}
          externalForm={{
            isOpen: addingExternal,
            title: externalTitle,
            url: externalUrl,
            isPending: externalMut.isPending,
            isError: externalMut.isError,
            canAdd: canAddExternal,
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

      <Suspense fallback={null}>
      {eventDialog && (
        <EventDialog
          calendars={writableCalendars}
          event={eventDialog.event}
          defaultCalendarId={eventDialog.defaultCalendarId}
          scope={eventDialog.scope}
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
      </Suspense>
      {calendarDialog && (
        <CalendarDialog
          calendar={calendarDialog.mode === 'edit' ? calendarDialog.calendar : undefined}
          allowedTypes={allowedCalendarTypes}
          structureId={myStructureId}
          onCreated={(created) => {
            reveal(created._id);
            if (created.type === 'structure' || created.type === 'group') {
              openShare('calendar', created._id, created.title);
            }
          }}
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
      {icsImportDialog && (
        <IcsImportDialog calendar={icsImportDialog} onClose={() => setIcsImportDialog(null)} />
      )}
      {portalPublishDialog && (
        <PortalPublishDialog
          calendar={portalPublishDialog}
          onClose={() => setPortalPublishDialog(null)}
        />
      )}
      {scopePrompt && (
        <RecurrenceScopeModal
          title={t('calendar.edit.recurrent.event', {
            defaultValue: 'Modifier un évènement récurrent',
          })}
          question={t('calendar.event.recurrence.edition', {
            defaultValue: 'Vous souhaitez modifier',
          })}
          confirmLabel={t('calendar.utils.edit', { defaultValue: 'Modifier' })}
          onConfirm={(scope) => {
            setEventDialog({ event: scopePrompt.event, scope });
            setScopePrompt(null);
          }}
          onCancel={() => setScopePrompt(null)}
        />
      )}
      {eventToDelete && (
        <DeleteEventModal
          event={eventToDelete}
          series={seriesOf(eventToDelete)}
          isRecurrent={isSeries(eventToDelete)}
          isLoading={deleteEventMut.isPending}
          error={
            deleteEventMut.isError
              ? t('calendar.rbs.sniplet.error.booking.deletion', {
                  defaultValue:
                    "Une erreur est survenue : toutes les réservations de ressources de l'évènement n'ont pas pu être supprimées.",
                })
              : undefined
          }
          onConfirm={({ scope, deleteBookings }) =>
            deleteEventMut.mutate({ event: eventToDelete, scope, deleteBookings })
          }
          onCancel={() => {
            deleteEventMut.reset();
            setEventToDelete(null);
          }}
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
