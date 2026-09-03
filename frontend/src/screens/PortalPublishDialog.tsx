import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, Calendar, publicIcalUrl } from '../api';
import { Modal } from './Modal';

/** Publication d'un agenda d'établissement sur le portail public (flux ICS anonyme). */
export function PortalPublishDialog({ calendar, onClose }: { calendar: Calendar; onClose: () => void }) {
  const { t } = useTranslation(['calendar', 'common']);
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const url = publicIcalUrl(calendar._id);

  const publishMut = useMutation({
    mutationFn: () => (calendar.portalPublished ? api.unpublishCalendarPortal(calendar._id) : api.publishCalendarPortal(calendar._id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar', 'calendars'] }),
  });

  const copyUrl = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  };

  return (
    <Modal title={t('calendar.portalpublish.title', { defaultValue: 'Publier sur le portail public' })} onClose={onClose}>
      {calendar.portalPublished ? (
        <>
          <p className="text-success">
            ✓ {t('calendar.portalpublish.published', { defaultValue: 'Cet agenda est publié sur le portail public.' })}
          </p>
          <div className="mb-16">
            <label htmlFor="portal-ics-url" className="form-label d-block">
              {t('calendar.portalpublish.url.help', {
                defaultValue:
                  "Cette URL renvoie le flux ICS de l'agenda de l'établissement. Elle peut être renseignée dans un widget calendrier du site public de l'établissement (WordPress).",
              })}
            </label>
            <div className="d-flex gap-8">
              <input id="portal-ics-url" type="text" className="form-control" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="btn btn-secondary" onClick={copyUrl}>
                {copied ? t('calendar.portalpublish.copy.ok', { defaultValue: 'Lien copié.' }) : t('calendar.portalpublish.copy', { defaultValue: 'Copier le lien' })}
              </button>
            </div>
          </div>
        </>
      ) : (
        <p>{t('calendar.portalpublish.url.help', { defaultValue: "Cette URL renvoie le flux ICS de l'agenda de l'établissement." })}</p>
      )}

      {publishMut.isError && (
        <div className="alert alert-warning" role="alert">
          {t('calendar.portalpublish.error', { defaultValue: 'Une erreur est survenue lors de la publication.' })}
        </div>
      )}

      <div className="d-flex justify-content-end gap-8">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          {t('calendar.cancel', { defaultValue: 'Annuler' })}
        </button>
        <button type="button" className={`btn ${calendar.portalPublished ? 'btn-danger' : 'btn-primary'}`} disabled={publishMut.isPending} onClick={() => publishMut.mutate()}>
          {calendar.portalPublished
            ? t('calendar.portalpublish.unpublish', { defaultValue: 'Retirer du portail public' })
            : t('calendar.portalpublish.title', { defaultValue: 'Publier sur le portail public' })}
        </button>
      </div>
    </Modal>
  );
}

export default PortalPublishDialog;
