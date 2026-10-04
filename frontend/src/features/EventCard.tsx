import { IconButton, Tooltip } from '@open-ent/react';
import { IconDelete, IconEdit, IconShare } from '@open-ent/react/icons';
import { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import { CalendarEvent } from '../api';
import { isoTime } from '../utils';

export interface EventCardProps {
  event: CalendarEvent;
  color: string;
  /** Affiche la date complète en plus de l'heure (vue Liste, où les jours sont mélangés). */
  withDate?: boolean;
  onEdit: () => void;
  onShare: () => void;
  onDelete: () => void;
}

/** Carte d'un événement : heure, titre, lieu, et les actions du socle. */
export function EventCard({ event, color, withDate, onEdit, onShare, onDelete }: EventCardProps) {
  const { t } = useTranslation(['calendar', 'common']);

  const allDayLabel = t('calendar.event.allday.short', { defaultValue: 'Journée' });
  const when = event.allday
    ? allDayLabel
    : `${isoTime(event.startMoment)} – ${isoTime(event.endMoment)}`;
  const date = new Date(event.startMoment).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });

  return (
    <div
      className="agenda-event-card card bg-white p-12 mb-8"
      style={{ '--agenda-color': color } as CSSProperties}
    >
      <div className="d-flex justify-content-between align-items-start gap-8">
        <div className="overflow-hidden">
          <div className="small text-gray-700">
            {withDate ? `${date} · ${when}` : when}
          </div>
          <div className="fw-bold text-truncate">{event.title}</div>
          {event.location && (
            <div className="small text-gray-700 text-truncate">{event.location}</div>
          )}
        </div>
        <div className="d-flex gap-2 flex-shrink-0">
          <Tooltip message={t('calendar.share', { defaultValue: 'Partager' })} placement="top">
            <IconButton
              type="button"
              color="tertiary"
              variant="ghost"
              size="sm"
              icon={<IconShare />}
              aria-label={`${t('calendar.share', { defaultValue: 'Partager' })} ${event.title}`}
              onClick={onShare}
            />
          </Tooltip>
          <Tooltip message={t('calendar.event.edit', { defaultValue: "Modifier l'événement" })} placement="top">
            <IconButton
              type="button"
              color="tertiary"
              variant="ghost"
              size="sm"
              icon={<IconEdit />}
              aria-label={`${t('calendar.event.edit', { defaultValue: "Modifier l'événement" })} : ${event.title}`}
              onClick={onEdit}
            />
          </Tooltip>
          <Tooltip message={t('calendar.delete', { defaultValue: 'Supprimer' })} placement="top">
            <IconButton
              type="button"
              color="danger"
              variant="ghost"
              size="sm"
              icon={<IconDelete />}
              aria-label={`${t('calendar.delete', { defaultValue: 'Supprimer' })} ${event.title}`}
              onClick={onDelete}
            />
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

export default EventCard;
