import { Button, IconButton, Tooltip } from '@open-ent/react';
import { IconDelete, IconDownload, IconPaperclip, IconPlus } from '@open-ent/react/icons';
import { useTranslation } from 'react-i18next';

import { api, EventAttachment, EventResource } from '../api';
import { attachmentLabel } from '../attachments';

export interface AttachmentFieldsProps {
  attachments: EventAttachment[];
  resources: EventResource[];
  /** Identifiant de l'événement : requis pour construire le lien de téléchargement. */
  eventId?: string;
  /** Lecture seule : on affiche sans proposer d'ajout ni de retrait. */
  readOnly?: boolean;
  onAddFiles?: () => void;
  onRemoveAttachment?: (attachmentId: string) => void;
  onAddResource?: () => void;
  onRemoveResource?: (index: number) => void;
}

/** Pièces jointes du workspace et ressources du médiacentre attachées à un événement. */
export function AttachmentFields({
  attachments,
  resources,
  eventId,
  readOnly,
  onAddFiles,
  onRemoveAttachment,
  onAddResource,
  onRemoveResource,
}: AttachmentFieldsProps) {
  const { t } = useTranslation(['calendar', 'common']);

  return (
    <div className="d-flex flex-column gap-16">
      <section>
        <div className="d-flex align-items-center justify-content-between gap-8 mb-8">
          <span className="form-label m-0">
            {t('calendar.event.attachments', { defaultValue: 'Pièces jointes' })}
          </span>
          {!readOnly && (
            <Button
              type="button"
              color="tertiary"
              variant="ghost"
              size="sm"
              leftIcon={<IconPlus />}
              onClick={onAddFiles}
            >
              {t('calendar.event.attachment.add', { defaultValue: 'Ajouter une pièce jointe' })}
            </Button>
          )}
        </div>

        {attachments.length === 0 ? (
          <p className="small text-gray-700 m-0">
            {t('calendar.event.attachment.none', { defaultValue: 'Aucune pièce jointe.' })}
          </p>
        ) : (
          <ul className="list-unstyled m-0 d-flex flex-column gap-4">
            {attachments.map((a) => {
              const label = attachmentLabel(a);
              return (
                <li key={a._id} className="d-flex align-items-center justify-content-between gap-8">
                  <span className="d-flex align-items-center gap-8 overflow-hidden">
                    <IconPaperclip />
                    <span className="text-truncate">{label}</span>
                  </span>
                  <span className="d-flex gap-2 flex-shrink-0">
                    {eventId && (
                      <Tooltip
                        message={t('calendar.event.attachment.download', {
                          defaultValue: 'Télécharger',
                        })}
                        placement="top"
                      >
                        <a
                          className="btn btn-ghost-tertiary btn-icon btn-sm"
                          href={api.attachmentDownloadUrl(eventId, a._id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`${t('calendar.event.attachment.download', { defaultValue: 'Télécharger' })} : ${label}`}
                        >
                          <IconDownload />
                        </a>
                      </Tooltip>
                    )}
                    {!readOnly && (
                      <Tooltip
                        message={t('calendar.delete', { defaultValue: 'Supprimer' })}
                        placement="top"
                      >
                        <IconButton
                          type="button"
                          color="danger"
                          variant="ghost"
                          size="sm"
                          icon={<IconDelete />}
                          aria-label={`${t('calendar.delete', { defaultValue: 'Supprimer' })} : ${label}`}
                          onClick={() => onRemoveAttachment?.(a._id)}
                        />
                      </Tooltip>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <div className="d-flex align-items-center justify-content-between gap-8 mb-8">
          <span className="form-label m-0">
            {t('calendar.event.resources', { defaultValue: 'Ressources du médiacentre' })}
          </span>
          {!readOnly && (
            <Button
              type="button"
              color="tertiary"
              variant="ghost"
              size="sm"
              leftIcon={<IconPlus />}
              onClick={onAddResource}
            >
              {t('calendar.event.resources.add.mediacentre', {
                defaultValue: 'Ajouter une ressource du médiacentre',
              })}
            </Button>
          )}
        </div>

        {resources.length === 0 ? (
          <p className="small text-gray-700 m-0">
            {t('calendar.event.resources.none', { defaultValue: 'Aucune ressource.' })}
          </p>
        ) : (
          <ul className="list-unstyled m-0 d-flex flex-column gap-4">
            {resources.map((r, index) => (
              <li
                key={`${r.type}-${r.id}`}
                className="d-flex align-items-center justify-content-between gap-8"
              >
                <span className="d-flex align-items-center gap-8 overflow-hidden">
                  {r.image && (
                    <img src={r.image} alt="" aria-hidden className="agenda-resource-thumb" />
                  )}
                  {r.url ? (
                    <a
                      className="text-truncate"
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {r.name}
                    </a>
                  ) : (
                    <span className="text-truncate">{r.name}</span>
                  )}
                </span>
                {!readOnly && (
                  <Tooltip message={t('calendar.delete', { defaultValue: 'Supprimer' })} placement="top">
                    <IconButton
                      type="button"
                      color="danger"
                      variant="ghost"
                      size="sm"
                      icon={<IconDelete />}
                      aria-label={`${t('calendar.delete', { defaultValue: 'Supprimer' })} : ${r.name}`}
                      onClick={() => onRemoveResource?.(index)}
                    />
                  </Tooltip>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default AttachmentFields;
