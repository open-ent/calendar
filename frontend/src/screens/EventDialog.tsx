import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, Calendar, CalendarEvent } from '../api';
import { isoUtcToLocalInput, localInputToIsoUtc } from '../utils';
import { Modal } from './Modal';

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
  const [calendarId, setCalendarId] = useState(event?.calendar?.[0] ?? defaultCalendarId ?? calendars[0]?._id ?? '');
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
      return editing
        ? api.updateEvent(calendarId, event!._id, body)
        : api.createEvent(calendarId, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar', 'events'] });
      onClose();
    },
    onError: () => setFormError(t('calendar.event.error', { defaultValue: "L'enregistrement a échoué." })),
  });

  const onSave = () => {
    if (!title.trim() || !start || !end) {
      setFormError(t('calendar.event.incomplete', { defaultValue: 'Renseignez un titre et des dates.' }));
      return;
    }
    if (new Date(end).getTime() <= new Date(start).getTime()) {
      setFormError(t('calendar.event.badrange', { defaultValue: 'La fin doit être postérieure au début.' }));
      return;
    }
    setFormError('');
    saveMut.mutate();
  };

  return (
    <Modal
      title={editing ? t('calendar.event.edit', { defaultValue: "Modifier l'événement" }) : t('calendar.event.new', { defaultValue: 'Nouvel événement' })}
      onClose={onClose}
    >
      <div className="mb-12">
        <label htmlFor="ev-title" className="form-label">
          {t('calendar.event.title', { defaultValue: 'Titre' })}
        </label>
        <input id="ev-title" type="text" className="form-control" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </div>

      <div className="mb-12">
        <label htmlFor="ev-cal" className="form-label">
          {t('calendar.event.calendar', { defaultValue: 'Calendrier' })}
        </label>
        <select id="ev-cal" className="form-select" value={calendarId} onChange={(e) => setCalendarId(e.target.value)}>
          {calendars.map((c) => (
            <option key={c._id} value={c._id}>
              {c.title}
            </option>
          ))}
        </select>
      </div>

      <div className="d-flex gap-16 flex-wrap mb-12">
        <div>
          <label htmlFor="ev-start" className="form-label">
            {t('calendar.event.start', { defaultValue: 'Début' })}
          </label>
          <input id="ev-start" type="datetime-local" className="form-control" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <label htmlFor="ev-end" className="form-label">
            {t('calendar.event.end', { defaultValue: 'Fin' })}
          </label>
          <input id="ev-end" type="datetime-local" className="form-control" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>

      <div className="form-check mb-12">
        <input id="ev-allday" type="checkbox" className="form-check-input" checked={allday} onChange={(e) => setAllday(e.target.checked)} />
        <label htmlFor="ev-allday" className="form-check-label">
          {t('calendar.event.allday', { defaultValue: 'Journée entière' })}
        </label>
      </div>

      <div className="mb-12">
        <label htmlFor="ev-loc" className="form-label">
          {t('calendar.event.location', { defaultValue: 'Lieu' })}
        </label>
        <input id="ev-loc" type="text" className="form-control" value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>
      <div className="mb-16">
        <label htmlFor="ev-desc" className="form-label">
          {t('calendar.event.description', { defaultValue: 'Description' })}
        </label>
        <textarea id="ev-desc" className="form-control" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      {formError && (
        <div className="alert alert-warning" role="alert">
          {formError}
        </div>
      )}

      <div className="d-flex justify-content-end gap-8">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          {t('calendar.cancel', { defaultValue: 'Annuler' })}
        </button>
        <button type="button" className="btn btn-primary" disabled={saveMut.isPending} onClick={onSave}>
          {t('calendar.save', { defaultValue: 'Enregistrer' })}
        </button>
      </div>
    </Modal>
  );
}

export default EventDialog;
