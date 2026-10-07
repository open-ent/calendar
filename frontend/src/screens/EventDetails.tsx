import { Button, Modal } from '@open-ent/react';
import { CSSProperties, useId } from 'react';
import { useTranslation } from 'react-i18next';

import { Calendar, CalendarEvent } from '../api';
import { AttachmentFields } from '../features/AttachmentFields';
import { DescriptionEditor } from '../features/DescriptionEditor';
import { calendarColor, formatDateTime, isMultiDay, isoTime } from '../utils';

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

        {event.isRecurrent && (
          <p className="small text-gray-700 m-0">
            {t('calendar.event.recurrent', { defaultValue: 'Événement récurrent.' })}
          </p>
        )}
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
