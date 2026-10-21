import { Button, Modal } from '@open-ent/react';
import { useQueries } from '@tanstack/react-query';
import { CSSProperties, useId } from 'react';
import { useTranslation } from 'react-i18next';

import { api, Calendar, CalendarEvent } from '../api';
import { isRbsEnabled, isReminderEnabled } from '../config';
import { AddToCalendar } from '../features/AddToCalendar';
import { AttachmentFields } from '../features/AttachmentFields';
import { DescriptionEditor } from '../features/DescriptionEditor';
import { calendarColor, formatBookingDate, formatDateTime, isMultiDay, isoTime } from '../utils';

/**
 * Détail d'un événement en LECTURE SEULE — ce que voit un usager qui n'a pas le droit de
 * le modifier (agenda partagé en lecture, flux externe, événement d'autrui). L'IHM React
 * ouvrait jusqu'ici un formulaire d'édition pour tout le monde, dont l'enregistrement
 * échouait côté serveur.
 */
export function EventDetails({
  event,
  calendars,
  onClose,
}: {
  event: CalendarEvent;
  calendars: Calendar[];
  onClose: () => void;
}) {
  const { t } = useTranslation(['calendar', 'common']);

  // Réservations de ressources (module de réservation actif) : le serveur ne joint que l'identifiant
  // de la ressource, on en récupère le nom — même rendu que dans le formulaire de modification.
  const bookings = isRbsEnabled() ? (event.bookings ?? []) : [];
  const resourceIds = [...new Set(bookings.map((b) => b.resource_id).filter((id): id is number => id != null))];
  const resourceQueries = useQueries({
    queries: resourceIds.map((id) => ({
      queryKey: ['calendar', 'rbs', 'resource', id],
      queryFn: () => api.fetchRbsResource(id),
      staleTime: 5 * 60_000,
    })),
  });
  const resourceNames = new Map<number, string>();
  resourceIds.forEach((id, i) => {
    const name = resourceQueries[i]?.data?.name;
    if (name) resourceNames.set(id, name);
  });

  // Rappel de l'usager sur cet événement (fonction active seulement).
  const reminder = isReminderEnabled() ? event.reminders : undefined;
  const reminderTypes = reminder
    ? [
        reminder.reminderType.email && t('calendar.reminder.type.email', { defaultValue: 'E-mail' }),
        reminder.reminderType.timeline && t('calendar.reminder.type.timeline', { defaultValue: 'Fil de nouveautés' }),
      ].filter(Boolean)
    : [];
  const reminderWhen = reminder
    ? [
        reminder.reminderFrequency.hour && t('calendar.reminder.hour', { defaultValue: '1 heure avant' }),
        reminder.reminderFrequency.day && t('calendar.reminder.day', { defaultValue: '1 jour avant' }),
        reminder.reminderFrequency.week && t('calendar.reminder.week', { defaultValue: '1 semaine avant' }),
        reminder.reminderFrequency.month && t('calendar.reminder.month', { defaultValue: '1 mois avant' }),
      ].filter(Boolean)
    : [];

  const hosts = calendars.filter((c) => event.calendar?.includes(c._id));
  const multiDay = isMultiDay(event.startMoment, event.endMoment);

  const when = event.allday
    ? t('calendar.event.allday', { defaultValue: 'Toute la journée' })
    : multiDay
      ? `${formatDateTime(event.startMoment)} → ${formatDateTime(event.endMoment)}`
      : `${formatDateTime(event.startMoment)} – ${isoTime(event.endMoment)}`;

  // Certains libellés viennent de l'IHM AngularJS, où ils précédaient la valeur sur la même
  // ligne et se terminent donc par « : » (ex. `calendar.event.date` = « Date : »). Ici ils
  // coiffent la valeur : on retire le deux-points plutôt que de dupliquer les traductions.
  const Line = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="mb-12">
      <div className="small text-gray-700">{label.replace(/\s*:\s*$/, '')}</div>
      <div>{children}</div>
    </div>
  );

  return (
    <Modal id={useId()} isOpen onModalClose={onClose} size="md" scrollable>
      <Modal.Header onModalClose={onClose}>{event.title}</Modal.Header>
      <Modal.Body>
        <Line label={t('calendar.event.date', { defaultValue: 'Date' })}>{when}</Line>

        {hosts.length > 0 && (
          <Line label={t('calendar.event.calendar', { defaultValue: 'Agenda' })}>
            <span className="d-flex flex-wrap align-items-center gap-8">
              {hosts.map((c) => (
                <span key={c._id} className="d-flex align-items-center gap-4">
                  <span
                    aria-hidden="true"
                    className="agenda-swatch"
                    style={{ '--agenda-color': calendarColor(c.color) } as CSSProperties}
                  />
                  {c.title}
                </span>
              ))}
            </span>
          </Line>
        )}

        {event.owner?.displayName && (
          <Line label={t('calendar.event.owner', { defaultValue: 'Créé par' })}>
            {event.owner.displayName}
          </Line>
        )}

        {event.location && (
          <Line label={t('calendar.event.location', { defaultValue: 'Lieu' })}>
            {event.location}
          </Line>
        )}

        {event.description && (
          <Line label={t('calendar.event.description', { defaultValue: 'Description' })}>
            {/* La description est du HTML (éditeur riche). L'éditeur du socle en mode lecture
                la rend proprement, et c'est lui qui assainit le contenu. */}
            <DescriptionEditor content={event.description} mode="read" />
          </Line>
        )}

        {((event.attachments?.length ?? 0) > 0 || (event.resources?.length ?? 0) > 0) && (
          <div className="mb-12">
            <AttachmentFields
              attachments={event.attachments ?? []}
              resources={event.resources ?? []}
              eventId={event._id}
              readOnly
            />
          </div>
        )}

        {bookings.length > 0 && (
          <Line label={t('calendar.booking.title', { defaultValue: 'Réservation de ressources' })}>
            <ul className="list-unstyled m-0" data-event-bookings>
              {bookings.map((b) => (
                <li key={b.id}>
                  {(b.resource_id != null && resourceNames.get(b.resource_id)) || '—'}
                  {b.start_date && ` — ${formatBookingDate(b.start_date)}`}
                  {b.end_date && ` → ${formatBookingDate(b.end_date)}`}
                </li>
              ))}
            </ul>
          </Line>
        )}

        {reminder && reminderTypes.length > 0 && reminderWhen.length > 0 && (
          <Line label={t('calendar.reminder', { defaultValue: 'Rappel' })}>
            <span data-event-reminder>
              {reminderTypes.join(', ')} — {reminderWhen.join(', ')}
            </span>
          </Line>
        )}

        {event.isRecurrent && (
          <p className="small text-gray-700 mb-12">
            {t('calendar.event.recurrent', { defaultValue: 'Événement récurrent.' })}
          </p>
        )}
        <AddToCalendar event={event} />
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" color="tertiary" variant="ghost" onClick={onClose}>
          {t('calendar.close', { defaultValue: 'Fermer' })}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default EventDetails;
