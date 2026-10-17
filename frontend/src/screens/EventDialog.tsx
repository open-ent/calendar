import {
  Alert,
  Button,
  Checkbox,
  FormControl,
  Input,
  Label,
  MediaLibrary,
  Modal,
  useEdificeClient,
  useMediaLibrary,
} from '@open-ent/react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  api,
  Calendar,
  CalendarEvent,
  EventAttachment,
  EventInput,
  EventReminder,
  EventResource,
} from '../api';
import { addAttachments, addResource, repairAttachment, toAttachment } from '../attachments';
import { RecurrenceScope } from '../components/RecurrenceScopeModal';
import { isRbsEnabled, isReminderEnabled } from '../config';
import { dateLocale } from '../locale';
import { RecurrenceFields } from '../features/RecurrenceFields';
import { AttachmentFields } from '../features/AttachmentFields';
import { DescriptionEditor } from '../features/DescriptionEditor';
import { ReminderFields } from '../features/ReminderFields';
import { MediacentrePicker } from './MediacentrePicker';
import { emptyReminder, isReminderEmpty, isReminderValid } from '../reminders';
import {
  defaultRecurrence,
  isOneDayEvent,
  isValidEnd,
  lengthsCompatible,
  occurrences,
  Recurrence,
} from '../recurrence';
import {
  dateRangeError,
  formatBookingDate,
  isoUtcToLocalInput,
  localInputToIsoUtc,
  rbsAvailableQuantity,
  recurrenceSummary,
  snapToSlotProfile,
  toLocalDateTimeSeconds,
} from '../utils';

export interface EventDialogProps {
  calendars: Calendar[];
  event?: CalendarEvent;
  defaultCalendarId?: string;
  /** Début proposé à la création (clic sur un créneau de la grille) ; fin = +1 h. */
  defaultStart?: Date;
  /**
   * Pour un événement récurrent : portée choisie en amont — cette occurrence seule, ou toute
   * la série (`POST …/updateAll`).
   */
  scope?: RecurrenceScope;
  /** Structure de l'usager, pour la section « Réserver une ressource » (RBS). */
  structureId?: string;
  onClose: () => void;
}

/** Création / édition d'un événement. `event` défini = édition. */
export function EventDialog({
  calendars,
  event,
  defaultCalendarId,
  defaultStart,
  scope = 'one',
  structureId,
  onClose,
}: EventDialogProps) {
  const { t } = useTranslation(['calendar', 'common']);
  const qc = useQueryClient();
  const { appCode, user } = useEdificeClient();
  const myUserId = (user as { userId?: string } | undefined)?.userId ?? '';
  const editing = !!event;

  const [title, setTitle] = useState(event?.title ?? '');
  const [calendarId, setCalendarId] = useState(
    event?.calendar?.[0] ?? defaultCalendarId ?? calendars[0]?._id ?? '',
  );
  // Création seulement : copies de l'événement dans d'autres agendas (parité AngularJS, une copie par
  // agenda coché — le serveur ne crée que dans l'agenda de l'URL).
  const [extraCalendarIds, setExtraCalendarIds] = useState<string[]>([]);
  const [start, setStart] = useState(isoUtcToLocalInput(event?.startMoment ?? defaultStart?.toISOString()));
  const [end, setEnd] = useState(
    isoUtcToLocalInput(event?.endMoment ?? (defaultStart ? new Date(defaultStart.getTime() + 3_600_000).toISOString() : undefined)),
  );
  const [allday, setAllday] = useState(event?.allday ?? false);
  const [location, setLocation] = useState(event?.location ?? '');
  // La description est du HTML : l'ancienne interface l'écrit avec un éditeur riche, et le
  // formulaire React l'affichait jusqu'ici en balises brutes dans une zone de texte.
  const [description, setDescription] = useState(event?.description ?? '');
  const [formError, setFormError] = useState('');

  // Pièces jointes du workspace et ressources du médiacentre.
  const [attachments, setAttachments] = useState<EventAttachment[]>(
    () => event?.attachments ?? [],
  );
  const [resources, setResources] = useState<EventResource[]>(() => event?.resources ?? []);
  const [attachmentNotice, setAttachmentNotice] = useState('');
  const [mediacentreOpen, setMediacentreOpen] = useState(false);
  const { ref: mediaLibraryRef, ...mediaLibraryHandlers } = useMediaLibrary();

  /** Reprend les fichiers choisis dans la médiathèque, sans ré-ajouter ceux déjà joints. */
  const onPickFiles = (result: unknown) => {
    const picked = Array.isArray(result) ? result : [result];
    const incoming = picked
      .map((f) => toAttachment(f as Parameters<typeof toAttachment>[0]))
      .filter((a): a is EventAttachment => a !== null);
    const merged = addAttachments(attachments, incoming);
    setAttachments(merged.attachments);
    setAttachmentNotice(
      merged.duplicates > 0
        ? t('calendar.event.attachment.already.added', {
            defaultValue:
              'Certains documents sont déjà joints : seuls les nouveaux ont été ajoutés.',
          })
        : '',
    );
    mediaLibraryRef.current?.hide();
  };

  // La récurrence ne se règle qu'à la création : sur une série existante, le serveur ne sait
  // pas regénérer les occurrences, il ne fait que propager les champs.
  const [isRecurrent, setIsRecurrent] = useState(false);
  const [recurrence, setRecurrence] = useState<Recurrence | null>(null);

  // Rappel de l'usager sur cet événement. Le serveur le rattache à l'événement lu quand la
  // fonction est active, ce qui permet de le pré-remplir et donc de le METTRE À JOUR (via `_id`)
  // au lieu d'en créer un second.
  const remindersOn = isReminderEnabled();
  const [reminder, setReminder] = useState<EventReminder>(
    () => event?.reminders ?? emptyReminder(),
  );

  // Réservation RBS (I1 : création seulement, un seul créneau — pas de récurrence/multi-jours,
  // pas de délais min/max, pas de conflit EDT : cf. incréments suivants). Le pont serveur
  // (RbsHelper) n'accepte une réservation qu'à la création d'un événement non récurrent et
  // tenant sur un seul jour — même règle que `isBookingPossible()` côté AngularJS.
  const rbsOn = isRbsEnabled() && !!structureId && !editing;
  const [hasBooking, setHasBooking] = useState(false);
  const [rbsTypeId, setRbsTypeId] = useState<number | null>(null);
  const [rbsResourceId, setRbsResourceId] = useState<number | null>(null);

  // I4 : résumé en lecture seule des réservations déjà posées, en édition (pas de ré-sélection
  // de ressource ici — le pont serveur `syncBookingsOnUpdate` ne gère qu'un diff par id, modifier
  // la ressource depuis ce formulaire sortirait du périmètre de cet incrément).
  const existingBookings = isRbsEnabled() ? (event?.bookings ?? []) : [];

  // I6 : réservations proposées sur un agenda partagé qui n'appartient pas à l'auteur — jamais
  // créées directement dans RBS tant que le propriétaire de l'agenda ne les a pas validées (cf.
  // BookingProposalController côté serveur). On les charge dès l'édition d'un événement existant,
  // quel que soit le rôle de l'usager courant (auteur de la proposition, propriétaire approbateur,
  // ou simple collaborateur avec un droit de lecture sur l'événement).
  const proposalsQuery = useQuery({
    queryKey: ['calendar', 'rbs', 'proposals', event?._id],
    queryFn: () => api.fetchBookingProposalsByEvent(event!._id),
    enabled: isRbsEnabled() && editing && !!event?._id,
  });
  const proposals = proposalsQuery.data ?? [];

  const existingBookingResourceIds = [
    ...new Set([
      ...existingBookings.map((b) => b.resource_id),
      ...proposals.flatMap((p) => p.bookingPayload.map((b) => b.resource.id)),
    ].filter((id): id is number => id != null)),
  ];
  // Le serveur ne joint que `resource_id` à chaque réservation (ou chaque proposition) : un appel
  // par ressource distincte pour en afficher le nom.
  const existingBookingResourceQueries = useQueries({
    queries: existingBookingResourceIds.map((id) => ({
      queryKey: ['calendar', 'rbs', 'resource', id],
      queryFn: () => api.fetchRbsResource(id),
    })),
  });
  const existingBookingResourceNames = new Map(
    existingBookingResourceIds.map((id, i) => [id, existingBookingResourceQueries[i]?.data?.name]),
  );

  const processProposalMut = useMutation({
    mutationFn: ({ id, status, refusalReason }: { id: string; status: 'ACCEPTED' | 'REFUSED'; refusalReason?: string }) =>
      api.processBookingProposal(id, status, refusalReason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar', 'rbs', 'proposals', event?._id] });
      qc.invalidateQueries({ queryKey: ['calendar', 'events'] });
    },
  });
  const [refusalDraft, setRefusalDraft] = useState<Record<string, string>>({});

  const rbsTypesQuery = useQuery({
    queryKey: ['calendar', 'rbs', 'types', structureId],
    queryFn: () => api.fetchRbsResourceTypes(structureId!),
    enabled: rbsOn && hasBooking,
  });
  const rbsTypes = rbsTypesQuery.data ?? [];
  const rbsResourcesQuery = useQuery({
    queryKey: ['calendar', 'rbs', 'resources', rbsTypeId],
    queryFn: () => api.fetchRbsResources(rbsTypeId!),
    enabled: rbsOn && hasBooking && rbsTypeId !== null,
  });
  const rbsResources = rbsResourcesQuery.data ?? [];

  // Première option auto-sélectionnée dès que la liste arrive, comme `autoSelectResourceType`/
  // `autoSelectResource` côté AngularJS.
  useEffect(() => {
    if (hasBooking && rbsTypeId === null && rbsTypes.length > 0) setRbsTypeId(rbsTypes[0].id);
  }, [hasBooking, rbsTypeId, rbsTypes]);
  useEffect(() => {
    if (hasBooking && rbsResourceId === null && rbsResources.length > 0) {
      setRbsResourceId(rbsResources[0].id);
    }
  }, [hasBooking, rbsResourceId, rbsResources]);

  const startDate = useMemo(() => new Date(start), [start]);
  const endDate = useMemo(() => new Date(end), [end]);
  const datesValid =
    !Number.isNaN(startDate.getTime()) &&
    !Number.isNaN(endDate.getTime()) &&
    endDate.getTime() > startDate.getTime();

  // Bornes de saisie (parité AngularJS) : début avant 2000 ou fin à plus de 80 ans.
  const rangeProblem = datesValid ? dateRangeError(startDate, endDate) : null;
  const rangeError =
    rangeProblem === 'old'
      ? t('calendar.error.date.old', { defaultValue: 'La date de début doit être supérieure au 01/01/2000.' })
      : rangeProblem === 'far'
        ? t('calendar.error.date.far', { defaultValue: "La durée de l'événement ne doit pas excéder 80 ans." })
        : '';

  // I2 : disponibilité (quantité) et délais min/max de la ressource choisie, sur le créneau de
  // l'événement — même logique que `isResourceQuantityValid`/`bookingDelaysValid` côté AngularJS,
  // simplifiée (cf. `rbsAvailableQuantity`).
  const rbsResource = rbsResources.find((r) => r.id === rbsResourceId) ?? null;
  const rbsBookingsQuery = useQuery({
    queryKey: ['calendar', 'rbs', 'bookings', rbsResourceId],
    queryFn: () => api.fetchRbsResourceBookings(rbsResourceId!),
    enabled: rbsOn && hasBooking && rbsResourceId !== null,
  });

  // I5 : certains types imposent une grille de créneaux fixes (ex. les heures de cours d'un
  // établissement) — la réservation s'aligne alors sur le créneau qui englobe l'horaire de
  // l'événement, plutôt que de réserver exactement cet horaire (`handleBookingSlots` côté
  // AngularJS). Toutes les vérifications (I2, I3) et l'enregistrement portent sur cet horaire
  // aligné, pas sur l'horaire brut de l'événement.
  const rbsType = rbsTypes.find((t) => t.id === rbsTypeId) ?? null;
  const slotProfileQuery = useQuery({
    queryKey: ['calendar', 'rbs', 'slotprofile', rbsType?.slotprofile],
    queryFn: () => api.fetchSlotProfileSlots(rbsType!.slotprofile!),
    enabled: rbsOn && hasBooking && !!rbsType?.slotprofile,
  });
  const { start: bookingStartDate, end: bookingEndDate } =
    datesValid && slotProfileQuery.data
      ? snapToSlotProfile(startDate, endDate, slotProfileQuery.data)
      : { start: startDate, end: endDate };

  const rbsAvailable =
    rbsResource && datesValid
      ? rbsAvailableQuantity(
          rbsResource,
          rbsBookingsQuery.data ?? [],
          bookingStartDate.toISOString(),
          bookingEndDate.toISOString(),
        )
      : null;
  const rbsQuantityOk = rbsAvailable === null || rbsAvailable >= 1;

  const nowSeconds = Date.now() / 1000;
  const delaySeconds = datesValid ? bookingStartDate.getTime() / 1000 - nowSeconds : 0;
  const rbsMinDelayOk =
    !rbsResource?.min_delay || !datesValid || delaySeconds > rbsResource.min_delay;
  const rbsMaxDelayOk =
    !rbsResource?.max_delay || !datesValid || delaySeconds < rbsResource.max_delay;

  const rbsBookingValid =
    !rbsOn || !hasBooking || (rbsQuantityOk && rbsMinDelayOk && rbsMaxDelayOk);

  // I4 : la réservation ne suit l'événement qu'occurrence par occurrence (`syncBookingsOnUpdate`
  // diffuse par id, pas par créneau) — avertir, sans bloquer, si l'édition étale l'événement sur
  // plusieurs jours alors qu'une réservation existe déjà (même avertissement que
  // `recurrenceOrMultidaysAdded` côté AngularJS, réduit au cas multi-jours : la récurrence n'est
  // pas éditable depuis ce formulaire).
  const multidayWithBookingWarning =
    existingBookings.length > 0 && datesValid && !isOneDayEvent(startDate, endDate);

  // I3 : avertissement non bloquant si la salle est déjà prise par un cours de l'Emploi du
  // temps (même patron que `checkEdtRoomConflict` côté AngularJS — jamais utilisé pour refuser
  // la réservation, seulement pour prévenir).
  const edtConflictQuery = useQuery({
    queryKey: [
      'calendar',
      'rbs',
      'edt-conflict',
      structureId,
      rbsResource?.name,
      datesValid ? bookingStartDate.toISOString() : null,
      datesValid ? bookingEndDate.toISOString() : null,
    ],
    queryFn: () =>
      api.fetchEdtRoomConflicts(
        structureId!,
        toLocalDateTimeSeconds(bookingStartDate),
        toLocalDateTimeSeconds(bookingEndDate),
        rbsResource!.name,
      ),
    enabled: rbsOn && hasBooking && !!rbsResource && datesValid && !isRecurrent && isOneDayEvent(startDate, endDate),
    retry: false,
  });
  const edtConflict = (edtConflictQuery.data?.length ?? 0) > 0;

  // Un événement partagé ne peut pas devenir récurrent (parité AngularJS : la récurrence
  // dupliquerait l'événement sans dupliquer ses partages).
  const sharingBlocksRecurrence = (event?.shared?.length ?? 0) > 0;

  const toggleRecurrent = (checked: boolean) => {
    setIsRecurrent(checked);
    if (checked && datesValid) {
      setRecurrence(
        recurrence ?? defaultRecurrence(startDate, isOneDayEvent(startDate, endDate)),
      );
    }
  };

  /** Message de validation de la récurrence, vide si tout va bien. */
  const recurrenceError = (() => {
    if (!isRecurrent || !recurrence || !datesValid) return '';
    if (!lengthsCompatible(startDate, endDate, recurrence)) {
      return t('calendar.event.length.error', {
        defaultValue: "L'événement est plus long que sa période de répétition.",
      });
    }
    if (!isValidEnd(startDate, endDate, recurrence)) {
      return t('calendar.error.date.recurrence', {
        defaultValue: "La date de fin de récurrence n'est pas valide.",
      });
    }
    if (occurrences(start ? startDate.toISOString() : '', endDate.toISOString(), recurrence).length === 0) {
      return t('calendar.recurrence.empty', {
        defaultValue: 'Cette récurrence ne produit aucune occurrence.',
      });
    }
    return '';
  })();

  const reminderError =
    remindersOn && !isReminderValid(reminder)
      ? t('calendar.reminder.incomplete', {
          defaultValue: 'Choisissez au moins un canal et au moins une échéance.',
        })
      : '';

  const buildBody = (): EventInput => ({
    title: title.trim(),
    startMoment: localInputToIsoUtc(start),
    endMoment: localInputToIsoUtc(end),
    allday,
    // La récurrence n'est pas éditable ici : on REPORTE la valeur existante. Le backend fait un
    // $set aveugle de chaque champ du corps — forcer `false` détacherait l'événement de sa série.
    isRecurrent: editing ? (event?.isRecurrent ?? false) : isRecurrent,
    calendar: [calendarId],
    location: location.trim(),
    description: description.trim(),
    // `recurrence` DOIT accompagner `isRecurrent: true` : le serveur valide la fin de récurrence
    // avant d'enregistrer (`EventHelper#isRecurrentEndDateValid`) et répond 401 sans elle. En
    // édition on reporte donc la récurrence existante telle quelle.
    ...(editing
      ? event?.isRecurrent && event.recurrence
        ? { recurrence: event.recurrence }
        : {}
      : isRecurrent && recurrence
        ? { recurrence }
        : {}),
    // Un rappel vide n'est pas envoyé : le serveur créerait un rappel sans canal ni échéance.
    ...(remindersOn && !isReminderEmpty(reminder) ? { reminders: reminder } : {}),
    // Les pièces jointes existantes repartent telles quelles, propriétaire remis à plat : les
    // re-sérialiser ré-emboîtait `owner.userId` à chaque enregistrement (cf. `flattenOwner`).
    attachments: attachments.map(repairAttachment),
    resources,
    // Réservation RBS : seulement à la création, un événement non récurrent tenant sur un seul
    // jour (même condition que `isBookingPossible()` côté AngularJS — le pont serveur l'exige).
    ...(rbsOn && hasBooking && rbsResourceId !== null && !isRecurrent && datesValid && rbsBookingValid
      ? {
          hasBooking: true,
          bookings: [
            {
              resource: { id: rbsResourceId },
              booking_reason: t('calendar.booking.default.reason', {
                defaultValue: "Cette réservation a été effectuée depuis l'application Agenda",
              }),
              quantity: 1,
              slots: [
                {
                  start_date: Math.floor(bookingStartDate.getTime() / 1000),
                  end_date: Math.floor(bookingEndDate.getTime() / 1000),
                  iana: Intl.DateTimeFormat().resolvedOptions().timeZone,
                },
              ],
            },
          ],
        }
      : {}),
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = buildBody();
      if (editing) {
        if (scope === 'all' && event?.parentId) {
          return api.updateAllEvents(calendarId, event._id, body);
        }
        return api.updateEvent(calendarId, event!._id, body);
      }
      const series = isRecurrent && recurrence ? occurrences(body.startMoment, body.endMoment, recurrence) : null;
      const create = (id: string, b: EventInput) =>
        series ? api.createRecurrentEvents(id, b, series) : api.createEvent(id, b);
      const result = await create(calendarId, body);
      // Copies : sans la réservation de ressource, qui ne se fait qu'une fois (agenda principal).
      const { bookings: _bookings, ...copyBody } = body;
      for (const id of extraCalendarIds.filter((x) => x !== calendarId)) {
        await create(id, { ...copyBody, calendar: [id] });
      }
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar', 'events'] });
      onClose();
    },
    onError: (err: Error) => {
      // I6 : droit de réservation absent sur un agenda partagé qui n'appartient pas à l'auteur —
      // blocage total côté serveur (cf. `extractPendingBookingProposal`), message dédié plutôt que
      // l'erreur générique.
      if (err.message === 'calendar.booking.right.denied') {
        setFormError(
          t('calendar.booking.right.denied', {
            defaultValue:
              "Vous n'avez pas le droit d'associer une réservation de ressource sur cet agenda. Demandez-le à son propriétaire, ou décochez la réservation.",
          }),
        );
        return;
      }
      setFormError(t('calendar.event.error', { defaultValue: "L'enregistrement a échoué." }));
    },
  });

  const onSave = () => {
    if (!title.trim() || !start || !end) {
      setFormError(t('calendar.event.incomplete', { defaultValue: 'Renseignez un titre et des dates.' }));
      return;
    }
    if (!datesValid) {
      setFormError(
        t('calendar.event.badrange', { defaultValue: 'La fin doit être postérieure au début.' }),
      );
      return;
    }
    if (rangeError) {
      setFormError(rangeError);
      return;
    }
    if (recurrenceError) {
      setFormError(recurrenceError);
      return;
    }
    if (reminderError) {
      setFormError(reminderError);
      return;
    }
    if (hasBooking && (isRecurrent || !isOneDayEvent(startDate, endDate))) {
      setFormError(
        t('calendar.booking.conditions', {
          defaultValue:
            'La réservation de ressource ne peut porter que sur un événement non récurrent, sur une seule journée.',
        }),
      );
      return;
    }
    if (hasBooking && !rbsBookingValid) {
      setFormError(
        t('calendar.booking.invalid', {
          defaultValue: 'La réservation demandée ne respecte pas les règles de la ressource (disponibilité ou délai).',
        }),
      );
      return;
    }
    setFormError('');
    saveMut.mutate();
  };

  const seriesSize =
    isRecurrent && recurrence && datesValid && !recurrenceError
      ? occurrences(localInputToIsoUtc(start), localInputToIsoUtc(end), recurrence).length
      : 0;

  return (
    <Modal id={useId()} isOpen onModalClose={onClose} size="md" scrollable>
      <Modal.Header onModalClose={onClose}>
        {editing
          ? t('calendar.event.edit', { defaultValue: "Modifier l'événement" })
          : t('calendar.event.new', { defaultValue: 'Nouvel événement' })}
      </Modal.Header>
      <Modal.Body>
        {editing && event?.isRecurrent && (
          <Alert type="info" className="mb-16">
            {scope === 'all'
              ? t('calendar.event.all.recurrences', {
                  defaultValue: 'Toutes les occurrences de cette récurrence',
                })
              : t('calendar.event.only', { defaultValue: 'Cet événement uniquement' })}
            {event.recurrence ? ` — ${recurrenceSummary(event.recurrence, t)}` : ''}
          </Alert>
        )}

        <FormControl id="event-title" isRequired className="mb-16">
          <Label>{t('calendar.event.title', { defaultValue: 'Titre' })}</Label>
          <Input type="text" size="md" value={title} autoFocus onChange={(e) => setTitle(e.target.value)} />
        </FormControl>

        <div className="mb-16">
          <label className="form-label" htmlFor="event-calendar">
            {t('calendar.event.calendar', { defaultValue: 'Agenda' })}
          </label>
          <select
            id="event-calendar"
            className="form-select"
            value={calendarId}
            onChange={(e) => setCalendarId(e.target.value)}
          >
            {calendars.map((c) => (
              <option key={c._id} value={c._id}>
                {c.title}
              </option>
            ))}
          </select>
          {!editing && calendars.length > 1 && (
            <fieldset className="border-0 p-0 m-0 mt-8" data-event-extra-calendars>
              <legend className="small text-gray-700 mb-4">
                {t('calendar.event.also.in', { defaultValue: 'Ajouter aussi à' })}
              </legend>
              {calendars
                .filter((c) => c._id !== calendarId)
                .map((c) => (
                  <Checkbox
                    key={c._id}
                    label={c.title}
                    checked={extraCalendarIds.includes(c._id)}
                    onChange={(e) =>
                      setExtraCalendarIds((prev) =>
                        e.target.checked ? [...prev, c._id] : prev.filter((x) => x !== c._id),
                      )
                    }
                  />
                ))}
            </fieldset>
          )}
        </div>

        <div className="d-flex gap-16 flex-wrap mb-16">
          <FormControl id="event-start" isRequired className="flex-fill">
            <Label>{t('calendar.event.start', { defaultValue: 'Début' })}</Label>
            <Input
              type="datetime-local"
              size="md"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </FormControl>
          <FormControl id="event-end" isRequired className="flex-fill">
            <Label>{t('calendar.event.end', { defaultValue: 'Fin' })}</Label>
            <Input
              type="datetime-local"
              size="md"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </FormControl>
        </div>

        <div className="mb-16">
          <Checkbox
            label={t('calendar.event.allday', { defaultValue: 'Journée entière' })}
            checked={allday}
            onChange={(e) => setAllday(e.target.checked)}
          />
        </div>

        {!editing && (
          <fieldset className="border-0 p-0 m-0 mb-16">
            <Checkbox
              label={t('calendar.event.recurrence', { defaultValue: 'Récurrence' })}
              checked={isRecurrent}
              disabled={!datesValid || sharingBlocksRecurrence}
              onChange={(e) => toggleRecurrent(e.target.checked)}
            />
            {sharingBlocksRecurrence && (
              <p className="small text-gray-700 m-0 mt-4">
                {t('calendar.recurrence.impossible', {
                  defaultValue:
                    "Vous ne pouvez pas appliquer de récurrence sur un événement restreint.",
                })}
              </p>
            )}
            {isRecurrent && recurrence && (
              <>
                <RecurrenceFields
                  recurrence={recurrence}
                  start={startDate}
                  end={endDate}
                  onChange={setRecurrence}
                  error={recurrenceError}
                />
                {seriesSize > 0 && (
                  <p className="small text-gray-700 mt-8 mb-0">
                    {t('calendar.recurrence.preview', {
                      defaultValue: '[[count]] occurrence(s) seront créées.',
                      count: seriesSize,
                    })}
                  </p>
                )}
              </>
            )}
          </fieldset>
        )}

        {remindersOn && (
          <fieldset className="border-0 p-0 m-0 mb-16">
            <legend className="form-label">
              {t('calendar.reminder', { defaultValue: 'Rappel' })}
            </legend>
            <ReminderFields reminder={reminder} onChange={setReminder} error={reminderError} />
          </fieldset>
        )}

        <FormControl id="event-location" className="mb-16">
          <Label>{t('calendar.event.location', { defaultValue: 'Lieu' })}</Label>
          <Input type="text" size="md" value={location} onChange={(e) => setLocation(e.target.value)} />
        </FormControl>

        {existingBookings.length > 0 && (
          <fieldset className="border-0 p-0 m-0 mb-16">
            <p className="form-label mb-8">
              {t('calendar.booking.title', { defaultValue: 'Réservation de ressources' })}
            </p>
            <ul className="list-unstyled m-0">
              {existingBookings.map((b) => (
                <li key={b.id} className="small text-gray-700">
                  {(b.resource_id != null && existingBookingResourceNames.get(b.resource_id)) ?? '—'}
                  {b.start_date && ` — ${formatBookingDate(b.start_date)}`}
                  {b.end_date && ` → ${formatBookingDate(b.end_date)}`}
                </li>
              ))}
            </ul>
            {multidayWithBookingWarning && (
              <Alert type="warning" className="mt-8">
                {t('calendar.booking.multiday.warning', {
                  defaultValue:
                    "Étaler cet événement sur plusieurs jours ne modifiera pas la réservation existante, qui reste sur son créneau d'origine.",
                })}
              </Alert>
            )}
          </fieldset>
        )}

        {proposals.length > 0 && (
          <fieldset className="border-0 p-0 m-0 mb-16">
            <p className="form-label mb-8">
              {t('calendar.booking.proposal.title', {
                defaultValue: 'Proposition de réservation sur agenda partagé',
              })}
            </p>
            <ul className="list-unstyled m-0 d-flex flex-column gap-12">
              {proposals.map((p) => {
                const isApprover = !!myUserId && p.owner.userId === myUserId;
                const isProposer = !!myUserId && p.proposedBy.userId === myUserId;
                return (
                  <li key={p._id} className="small">
                    <ul className="list-unstyled m-0 text-gray-700">
                      {p.bookingPayload.map((b, i) => (
                        <li key={i}>{existingBookingResourceNames.get(b.resource.id) ?? '—'}</li>
                      ))}
                    </ul>
                    {p.status === 'PENDING' && isApprover && (
                      <div className="mt-4">
                        <Alert type="info" className="mb-8">
                          {t('calendar.booking.proposal.pending.approver', {
                            defaultValue: '[[name]] propose cette réservation sur votre agenda.',
                            name: p.proposedBy.displayName,
                          })}
                        </Alert>
                        <input
                          type="text"
                          className="form-control form-control-sm mb-8"
                          placeholder={t('calendar.booking.proposal.refusal.reason', {
                            defaultValue: 'Motif de refus (optionnel)',
                          })}
                          value={refusalDraft[p._id] ?? ''}
                          onChange={(e) =>
                            setRefusalDraft((d) => ({ ...d, [p._id]: e.target.value }))
                          }
                        />
                        <div className="d-flex gap-8">
                          <Button
                            type="button"
                            color="primary"
                            variant="filled"
                            size="sm"
                            isLoading={processProposalMut.isPending}
                            onClick={() => processProposalMut.mutate({ id: p._id, status: 'ACCEPTED' })}
                          >
                            {t('calendar.booking.proposal.accept', { defaultValue: 'Accepter' })}
                          </Button>
                          <Button
                            type="button"
                            color="danger"
                            variant="outline"
                            size="sm"
                            isLoading={processProposalMut.isPending}
                            onClick={() =>
                              processProposalMut.mutate({
                                id: p._id,
                                status: 'REFUSED',
                                refusalReason: refusalDraft[p._id] || undefined,
                              })
                            }
                          >
                            {t('calendar.booking.proposal.refuse', { defaultValue: 'Refuser' })}
                          </Button>
                        </div>
                        {processProposalMut.isError && processProposalMut.variables?.id === p._id && (
                          <Alert type="warning" className="mt-8">
                            {t('calendar.error', { defaultValue: 'Une erreur est survenue.' })}
                          </Alert>
                        )}
                      </div>
                    )}
                    {p.status === 'PENDING' && !isApprover && (
                      <Alert type="info">
                        {isProposer
                          ? t('calendar.booking.proposal.pending.proposer', {
                              defaultValue:
                                'Votre réservation est en attente de validation par [[name]].',
                              name: p.owner.displayName,
                            })
                          : t('calendar.booking.proposal.pending.other', {
                              defaultValue: 'Réservation en attente de validation par [[name]].',
                              name: p.owner.displayName,
                            })}
                      </Alert>
                    )}
                    {p.status === 'ACCEPTED' && (
                      <Alert type="info">
                        {t('calendar.booking.proposal.accepted', { defaultValue: 'Réservation acceptée.' })}
                      </Alert>
                    )}
                    {p.status === 'REFUSED' && (
                      <Alert type="warning">
                        {p.refusalReason
                          ? t('calendar.booking.proposal.refused.reason', {
                              defaultValue: 'Réservation refusée : [[reason]]',
                              reason: p.refusalReason,
                            })
                          : t('calendar.booking.proposal.refused', { defaultValue: 'Réservation refusée.' })}
                      </Alert>
                    )}
                  </li>
                );
              })}
            </ul>
          </fieldset>
        )}

        {rbsOn && (
          <fieldset className="border-0 p-0 m-0 mb-16">
            <Checkbox
              label={t('calendar.booking.title', { defaultValue: 'Réservation de ressources' })}
              checked={hasBooking}
              onChange={(e) => setHasBooking(e.target.checked)}
            />
            {hasBooking && (
              <div className="mt-8">
                <div className="mb-16">
                  <label className="form-label" htmlFor="booking-type">
                    {t('calendar.booking.type', { defaultValue: 'Type de ressource' })}
                  </label>
                  {rbsTypes.length > 0 ? (
                    <select
                      id="booking-type"
                      className="form-select"
                      value={rbsTypeId ?? ''}
                      onChange={(e) => {
                        setRbsTypeId(Number(e.target.value));
                        setRbsResourceId(null);
                      }}
                    >
                      {rbsTypes.map((rt) => (
                        <option key={rt.id} value={rt.id}>
                          {rt.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Alert type="warning">
                      {t('calendar.booking.no.types', {
                        defaultValue: "Aucun type de ressources disponible à la réservation pour cet établissement",
                      })}
                    </Alert>
                  )}
                </div>
                {rbsTypes.length > 0 && (
                  <div className="mb-16">
                    <label className="form-label" htmlFor="booking-resource">
                      {t('calendar.booking.resource', { defaultValue: 'Ressource' })}
                    </label>
                    {rbsResources.length > 0 ? (
                      <select
                        id="booking-resource"
                        className="form-select"
                        value={rbsResourceId ?? ''}
                        onChange={(e) => setRbsResourceId(Number(e.target.value))}
                      >
                        {rbsResources.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Alert type="warning">
                        {t('calendar.booking.no.resources', {
                          defaultValue: 'Aucune ressource disponible à la réservation pour ce type',
                        })}
                      </Alert>
                    )}
                  </div>
                )}
                {(isRecurrent || !isOneDayEvent(startDate, endDate)) && (
                  <Alert type="warning">
                    {t('calendar.booking.conditions', {
                      defaultValue:
                        'La réservation de ressource ne peut porter que sur un événement non récurrent, sur une seule journée.',
                    })}
                  </Alert>
                )}
                {rbsResource && datesValid && !isRecurrent && isOneDayEvent(startDate, endDate) && (
                  <>
                    {slotProfileQuery.data &&
                      (bookingStartDate.getTime() !== startDate.getTime() ||
                        bookingEndDate.getTime() !== endDate.getTime()) && (
                        <Alert type="info" className="mt-8">
                          {t('calendar.booking.slot.aligned', {
                            defaultValue:
                              'Cette ressource se réserve par créneau : la réservation portera sur [[start]] – [[end]].',
                            start: bookingStartDate.toLocaleTimeString(dateLocale(), {
                              hour: '2-digit',
                              minute: '2-digit',
                            }),
                            end: bookingEndDate.toLocaleTimeString(dateLocale(), {
                              hour: '2-digit',
                              minute: '2-digit',
                            }),
                          })}
                        </Alert>
                      )}
                    {rbsAvailable !== null && (
                      <Alert type={rbsQuantityOk ? 'info' : 'warning'} className="mt-8">
                        {rbsQuantityOk
                          ? t('calendar.booking.quantity.available', {
                              defaultValue: '[[available]] disponible(s) sur [[total]]',
                              available: rbsAvailable,
                              total: rbsResource.quantity ?? 0,
                            })
                          : t('calendar.booking.quantity.none', {
                              defaultValue: 'Aucune disponibilité pour ce créneau.',
                            })}
                      </Alert>
                    )}
                    {!rbsMinDelayOk && (
                      <Alert type="warning" className="mt-8">
                        {t('calendar.booking.min.delay', {
                          defaultValue:
                            "Cette ressource doit être réservée au moins [[days]] jour(s) à l'avance.",
                          days: Math.ceil((rbsResource.min_delay ?? 0) / 86400),
                        })}
                      </Alert>
                    )}
                    {!rbsMaxDelayOk && (
                      <Alert type="warning" className="mt-8">
                        {t('calendar.booking.max.delay', {
                          defaultValue:
                            'Cette ressource ne peut pas être réservée plus de [[days]] jour(s) à l\'avance.',
                          days: Math.floor((rbsResource.max_delay ?? 0) / 86400),
                        })}
                      </Alert>
                    )}
                    {edtConflict && (
                      <Alert type="warning" className="mt-8">
                        {t('calendar.booking.edt.conflict', {
                          defaultValue:
                            "Attention : la salle [[room]] est déjà occupée par un cours de l'emploi du temps sur ce créneau.",
                          room: rbsResource.name,
                        })}
                      </Alert>
                    )}
                  </>
                )}
              </div>
            )}
          </fieldset>
        )}

        <fieldset className="border-0 p-0 m-0 mb-16">
          <AttachmentFields
            attachments={attachments}
            resources={resources}
            eventId={event?._id}
            onAddFiles={() => {
              setAttachmentNotice('');
              mediaLibraryRef.current?.show('attachment');
            }}
            onRemoveAttachment={(id) => setAttachments(attachments.filter((a) => a._id !== id))}
            onAddResource={() => setMediacentreOpen(true)}
            onRemoveResource={(index) => setResources(resources.filter((_, i) => i !== index))}
          />
          {attachmentNotice && (
            <Alert type="info" className="mt-8">
              {attachmentNotice}
            </Alert>
          )}
        </fieldset>

        <FormControl id="event-description">
          <Label>{t('calendar.event.description', { defaultValue: 'Description' })}</Label>
          <DescriptionEditor
            id="event-description"
            content={description}
            mode="edit"
            onChange={setDescription}
          />
        </FormControl>

        {formError && (
          <Alert type="warning" className="mt-16">
            {formError}
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" color="tertiary" variant="ghost" onClick={onClose}>
          {t('calendar.cancel', { defaultValue: 'Annuler' })}
        </Button>
        <Button
          type="button"
          color="primary"
          variant="filled"
          isLoading={saveMut.isPending}
          onClick={onSave}
        >
          {t('calendar.save', { defaultValue: 'Enregistrer' })}
        </Button>
      </Modal.Footer>

      {mediacentreOpen && (
        <MediacentrePicker
          attached={resources}
          onAdd={(resource) => {
            const merged = addResource(resources, resource);
            setResources(merged.resources);
            return merged.added;
          }}
          onClose={() => setMediacentreOpen(false)}
        />
      )}

      <MediaLibrary
        appCode={appCode}
        ref={mediaLibraryRef}
        multiple
        visibility="protected"
        {...mediaLibraryHandlers}
        onSuccess={onPickFiles}
      />
    </Modal>
  );
}

export default EventDialog;
