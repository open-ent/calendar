import { IconButton, Tooltip } from '@open-ent/react';
import { IconDelete, IconEdit, IconSee, IconShare } from '@open-ent/react/icons';
import { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import { CalendarEvent } from '../api';
import { EventRights } from '../rights';
import { DaySpan, isoTime } from '../utils';

export interface EventCardProps {
  event: CalendarEvent;
  color: string;
  rights: EventRights;
  /** Où en est un événement sur plusieurs jours ce jour-là. */
  span?: DaySpan;
  /** Affiche la date complète en plus de l'heure (vue Liste, où les jours sont mélangés). */
  withDate?: boolean;
  /**
   * Version resserrée pour les colonnes étroites de la vue Semaine : la carte entière ouvre
   * l'événement, les actions restant accessibles depuis les vues Jour et Liste.
   */
  compact?: boolean;
  /** Ouvre l'événement : formulaire si modifiable, fiche en lecture seule sinon. */
  onOpen: () => void;
  onShare: () => void;
  onDelete: () => void;
}

/** Carte d'un événement : quand, titre, lieu, et les actions permises à l'usager. */
export function EventCard({
  event,
  color,
  rights,
  span = 'single',
  withDate,
  compact,
  onOpen,
  onShare,
  onDelete,
}: EventCardProps) {
  const { t } = useTranslation(['calendar', 'common']);

  const colorVar = { '--agenda-color': color } as CSSProperties;
  const openLabel = rights.edit
    ? t('calendar.event.edit', { defaultValue: "Modifier l'événement" })
    : t('calendar.event.see', { defaultValue: "Voir l'événement" });

  // Un événement sur plusieurs jours n'affiche que l'heure pertinente au jour affiché.
  const when = (() => {
    if (event.allday) return t('calendar.event.allday.short', { defaultValue: 'Journée' });
    switch (span) {
      case 'start':
        return t('calendar.event.span.start', {
          defaultValue: 'à partir de [[time]]',
          time: isoTime(event.startMoment),
        });
      case 'middle':
        return t('calendar.event.span.middle', { defaultValue: 'toute la journée (suite)' });
      case 'end':
        return t('calendar.event.span.end', {
          defaultValue: "jusqu'à [[time]]",
          time: isoTime(event.endMoment),
        });
      default:
        return `${isoTime(event.startMoment)} – ${isoTime(event.endMoment)}`;
    }
  })();

  const date = new Date(event.startMoment).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });

  if (compact) {
    return (
      <button
        type="button"
        className="agenda-event-card agenda-event-card--compact card bg-white text-start w-100 p-8 mb-8"
        style={colorVar}
        title={`${when} — ${event.title}`}
        onClick={onOpen}
      >
        <span className="d-block small text-gray-700">{when}</span>
        <span className="d-block fw-bold">{event.title}</span>
      </button>
    );
  }

  return (
    <div className="agenda-event-card card bg-white p-12 mb-8" style={colorVar}>
      <div className="d-flex justify-content-between align-items-start gap-8">
        <div className="flex-fill overflow-hidden">
          <div className="small text-gray-700">{withDate ? `${date} · ${when}` : when}</div>
          <div className="fw-bold text-truncate">{event.title}</div>
          {event.location && (
            <div className="small text-gray-700 text-truncate">{event.location}</div>
          )}
        </div>
        <div className="d-flex gap-2 flex-shrink-0">
          {rights.share && (
            <Tooltip message={t('calendar.share', { defaultValue: 'Partager' })} placement="top">
              <IconButton
                type="button"
                color="tertiary"
                variant="ghost"
                size="sm"
                icon={<IconShare />}
                aria-label={`${t('calendar.share', { defaultValue: 'Partager' })} : ${event.title}`}
                onClick={onShare}
              />
            </Tooltip>
          )}
          <Tooltip message={openLabel} placement="top">
            <IconButton
              type="button"
              color="tertiary"
              variant="ghost"
              size="sm"
              icon={rights.edit ? <IconEdit /> : <IconSee />}
              aria-label={`${openLabel} : ${event.title}`}
              onClick={onOpen}
            />
          </Tooltip>
          {rights.remove && (
            <Tooltip message={t('calendar.delete', { defaultValue: 'Supprimer' })} placement="top">
              <IconButton
                type="button"
                color="danger"
                variant="ghost"
                size="sm"
                icon={<IconDelete />}
                aria-label={`${t('calendar.delete', { defaultValue: 'Supprimer' })} : ${event.title}`}
                onClick={onDelete}
              />
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}

export default EventCard;
