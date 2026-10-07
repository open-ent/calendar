import { Alert, Button, Modal, Radio } from '@open-ent/react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CalendarEvent } from '../api';
import { RecurrenceScope } from '../components/RecurrenceScopeModal';
import { formatBookingDate } from '../utils';

export interface DeleteEventModalProps {
  event: CalendarEvent;
  /** Les occurrences concernées si l'usager choisit « toute la récurrence ». */
  series: CalendarEvent[];
  isRecurrent: boolean;
  isLoading: boolean;
  /** Message d'erreur du serveur (réservations non supprimées, par exemple). */
  error?: string;
  onConfirm: (options: { scope: RecurrenceScope; deleteBookings: boolean }) => void;
  onCancel: () => void;
}

/**
 * Suppression d'un événement : portée de la récurrence et sort des réservations de ressources.
 *
 * Sans `deleteBookings`, les réservations RBS faites pour l'événement lui survivent dans le
 * module Réservations — c'est le choix que propose l'IHM AngularJS (`rbs-booking-delete-info`),
 * et que l'IHM React ne posait pas, supprimant donc toujours l'événement seul.
 */
export function DeleteEventModal({
  event,
  series,
  isRecurrent,
  isLoading,
  error,
  onConfirm,
  onCancel,
}: DeleteEventModalProps) {
  const { t } = useTranslation(['calendar', 'common']);

  const [scope, setScope] = useState<RecurrenceScope | null>(isRecurrent ? null : 'one');
  const [deleteBookings, setDeleteBookings] = useState<boolean | null>(null);

  // Réservations concernées : celles de l'occurrence, ou de toute la série selon la portée.
  const concerned = scope === 'all' ? series : [event];
  const bookings = concerned.flatMap((e) => e.bookings ?? []);
  const hasBookings = bookings.length > 0;

  const ready = scope !== null && (!hasBookings || deleteBookings !== null);

  return (
    <Modal id={useId()} isOpen onModalClose={onCancel} size="md" scrollable>
      <Modal.Header onModalClose={onCancel}>
        {isRecurrent
          ? t('calendar.confirm.delete.recurrent.event', {
              defaultValue: "Confirmer la suppression d'événements récurrents",
            })
          : t('calendar.event.delete.title', { defaultValue: "Supprimer l'événement" })}
      </Modal.Header>
      <Modal.Body>
        {isRecurrent ? (
          <>
            <p>
              {t('calendar.event.recurrence.deletion', { defaultValue: 'Vous souhaitez supprimer' })}
            </p>
            <div className="d-flex flex-column gap-8 mb-16">
              <Radio
                name="delete-scope"
                model={scope ?? ''}
                value="one"
                label={t('calendar.event.only', { defaultValue: 'Cet évènement seulement' })}
                checked={scope === 'one'}
                onChange={() => setScope('one')}
              />
              <Radio
                name="delete-scope"
                model={scope ?? ''}
                value="all"
                label={t('calendar.event.all.recurrences', {
                  defaultValue: 'Toutes les occurrences de cette récurrence',
                })}
                checked={scope === 'all'}
                onChange={() => setScope('all')}
              />
            </div>
          </>
        ) : (
          <p>{t('calendar.event.confirm.delete', { defaultValue: 'Supprimer cet événement ?' })}</p>
        )}

        {hasBookings && (
          <fieldset className="border-0 p-0 m-0">
            <p className="m-0">
              {t('calendar.rbs.sniplet.booking.warning', {
                defaultValue:
                  'Une réservation de ressources a été effectuée pour le(s) créneau(x) suivant(s) :',
              })}
            </p>
            <ul className="small text-gray-700">
              {bookings.map((b) => (
                <li key={b.id}>
                  {b.resource?.name ? `${b.resource.name} — ` : ''}
                  {formatBookingDate(b.start_date)}
                  {b.end_date ? ` → ${formatBookingDate(b.end_date)}` : ''}
                </li>
              ))}
            </ul>
            <legend className="form-label">
              {t('calendar.rbs.sniplet.deletion.wish', { defaultValue: 'Vous souhaitez supprimer :' })}
            </legend>
            <div className="d-flex flex-column gap-8">
              <Radio
                name="delete-bookings"
                model={deleteBookings === null ? '' : String(deleteBookings)}
                value="false"
                label={t('calendar.rbs.sniplet.event.only', {
                  defaultValue: 'Cet évènement seulement',
                })}
                checked={deleteBookings === false}
                onChange={() => setDeleteBookings(false)}
              />
              <Radio
                name="delete-bookings"
                model={deleteBookings === null ? '' : String(deleteBookings)}
                value="true"
                label={t('calendar.rbs.sniplet.event.and.booking', {
                  defaultValue: 'Cet évènement et ses réservations de ressources',
                })}
                checked={deleteBookings === true}
                onChange={() => setDeleteBookings(true)}
              />
            </div>
            {deleteBookings === false && (
              <p className="small text-gray-700 mt-8 mb-0">
                {t('calendar.rbs.sniplet.booking.deletion.advice.no.access', {
                  defaultValue:
                    "La suppression de l'évènement ne supprimera pas les réservations.",
                })}
              </p>
            )}
          </fieldset>
        )}

        {error && (
          <Alert type="warning" className="mt-16">
            {error}
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" color="tertiary" variant="ghost" onClick={onCancel}>
          {t('calendar.cancel', { defaultValue: 'Annuler' })}
        </Button>
        <Button
          type="button"
          color="danger"
          variant="filled"
          isLoading={isLoading}
          disabled={!ready}
          onClick={() =>
            scope && onConfirm({ scope, deleteBookings: deleteBookings === true })
          }
        >
          {t('calendar.delete', { defaultValue: 'Supprimer' })}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default DeleteEventModal;
