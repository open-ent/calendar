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
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, Calendar, CalendarEvent } from '../api';
import { isoUtcToLocalInput, localInputToIsoUtc } from '../utils';

/** Création / édition d'un événement. `event` défini = édition. */
export function EventDialog({
  calendars,
  event,
  defaultCalendarId,
  onClose,
}: {
  calendars: Calendar[];
  event?: CalendarEvent;
  defaultCalendarId?: string;
  onClose: () => void;
}) {
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

  const saveMut = useMutation({
    mutationFn: () => {
      const body = {
        title: title.trim(),
        startMoment: localInputToIsoUtc(start),
        endMoment: localInputToIsoUtc(end),
        allday,
        isRecurrent: false,
        calendar: [calendarId],
        location: location.trim(),
        description: description.trim(),
      };
      return editing ? api.updateEvent(calendarId, event._id, body) : api.createEvent(calendarId, body);
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
    if (new Date(end).getTime() <= new Date(start).getTime()) {
      setFormError(
        t('calendar.event.badrange', { defaultValue: 'La fin doit être postérieure au début.' }),
      );
      return;
    }
    setFormError('');
    saveMut.mutate();
  };

  return (
    <Modal id={useId()} isOpen onModalClose={onClose} size="md" scrollable>
      <Modal.Header onModalClose={onClose}>
        {editing
          ? t('calendar.event.edit', { defaultValue: "Modifier l'événement" })
          : t('calendar.event.new', { defaultValue: 'Nouvel événement' })}
      </Modal.Header>
      <Modal.Body>
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
