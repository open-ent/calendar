import {
  Alert,
  Button,
  Checkbox,
  FormControl,
  Input,
  Label,
  Modal,
  TextArea,
} from '@open-ent/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, Calendar, CalendarEvent, EventInput } from '../api';
import { RecurrenceScope } from '../components/RecurrenceScopeModal';
import { RecurrenceFields } from '../features/RecurrenceFields';
import {
  defaultRecurrence,
  isOneDayEvent,
  isValidEnd,
  lengthsCompatible,
  occurrences,
  Recurrence,
} from '../recurrence';
import { isoUtcToLocalInput, localInputToIsoUtc, recurrenceSummary } from '../utils';

export interface EventDialogProps {
  calendars: Calendar[];
  event?: CalendarEvent;
  defaultCalendarId?: string;
  /**
   * Pour un événement récurrent : portée choisie en amont — cette occurrence seule, ou toute
   * la série (`POST …/updateAll`).
   */
  scope?: RecurrenceScope;
  onClose: () => void;
}

/** Création / édition d'un événement. `event` défini = édition. */
export function EventDialog({
  calendars,
  event,
  defaultCalendarId,
  scope = 'one',
  onClose,
}: EventDialogProps) {
  const { t } = useTranslation(['calendar', 'common']);
  const qc = useQueryClient();
  const editing = !!event;

  const [title, setTitle] = useState(event?.title ?? '');
  const [calendarId, setCalendarId] = useState(
    event?.calendar?.[0] ?? defaultCalendarId ?? calendars[0]?._id ?? '',
  );
  const [start, setStart] = useState(isoUtcToLocalInput(event?.startMoment));
  const [end, setEnd] = useState(isoUtcToLocalInput(event?.endMoment));
  const [allday, setAllday] = useState(event?.allday ?? false);
  const [location, setLocation] = useState(event?.location ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [formError, setFormError] = useState('');

  // La récurrence ne se règle qu'à la création : sur une série existante, le serveur ne sait
  // pas regénérer les occurrences, il ne fait que propager les champs.
  const [isRecurrent, setIsRecurrent] = useState(false);
  const [recurrence, setRecurrence] = useState<Recurrence | null>(null);

  const startDate = useMemo(() => new Date(start), [start]);
  const endDate = useMemo(() => new Date(end), [end]);
  const datesValid =
    !Number.isNaN(startDate.getTime()) &&
    !Number.isNaN(endDate.getTime()) &&
    endDate.getTime() > startDate.getTime();

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
      if (isRecurrent && recurrence) {
        const series = occurrences(body.startMoment, body.endMoment, recurrence);
        return api.createRecurrentEvents(calendarId, body, series);
      }
      return api.createEvent(calendarId, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar', 'events'] });
      onClose();
    },
    onError: () =>
      setFormError(t('calendar.event.error', { defaultValue: "L'enregistrement a échoué." })),
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
    if (recurrenceError) {
      setFormError(recurrenceError);
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

        <FormControl id="event-location" className="mb-16">
          <Label>{t('calendar.event.location', { defaultValue: 'Lieu' })}</Label>
          <Input type="text" size="md" value={location} onChange={(e) => setLocation(e.target.value)} />
        </FormControl>

        <FormControl id="event-description">
          <Label>{t('calendar.event.description', { defaultValue: 'Description' })}</Label>
          <TextArea size="md" value={description} rows={3} onChange={(e) => setDescription(e.target.value)} />
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
    </Modal>
  );
}

export default EventDialog;
