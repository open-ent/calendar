import { Alert, Button, FormControl, Input, Label, Modal } from '@open-ent/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, Calendar, publicIcalUrl } from '../api';

/** Publication d'un agenda d'établissement sur le portail public (flux ICS anonyme). */
export function PortalPublishDialog({
  calendar,
  onClose,
}: {
  calendar: Calendar;
  onClose: () => void;
}) {
  const { t } = useTranslation(['calendar', 'common']);
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const url = publicIcalUrl(calendar._id);

  const publishMut = useMutation({
    mutationFn: () =>
      calendar.portalPublished
        ? api.unpublishCalendarPortal(calendar._id)
        : api.publishCalendarPortal(calendar._id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar', 'calendars'] }),
  });

  const copyUrl = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
  };

  const help = t('calendar.portalpublish.url.help', {
    defaultValue:
      "Cette URL renvoie le flux ICS de l'agenda de l'établissement. Elle peut être renseignée dans un widget calendrier du site public de l'établissement (WordPress).",
  });

  return (
    <Modal id={useId()} isOpen onModalClose={onClose} size="md">
      <Modal.Header onModalClose={onClose}>
        {t('calendar.portalpublish.title', { defaultValue: 'Publier sur le portail public' })}
      </Modal.Header>
      <Modal.Body>
        {calendar.portalPublished ? (
          <>
            <Alert type="success" className="mb-16">
              {t('calendar.portalpublish.published', {
                defaultValue: 'Cet agenda est publié sur le portail public.',
              })}
            </Alert>
            <FormControl id="portal-ics-url" isReadOnly>
              <Label>{help}</Label>
              <div className="d-flex gap-8 align-items-start">
                <Input
                  type="text"
                  size="md"
                  className="flex-fill"
                  value={url}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button type="button" color="tertiary" variant="outline" onClick={copyUrl}>
                  {copied
                    ? t('calendar.portalpublish.copy.ok', { defaultValue: 'Lien copié' })
                    : t('calendar.portalpublish.copy', { defaultValue: 'Copier le lien' })}
                </Button>
              </div>
            </FormControl>
          </>
        ) : (
          <p className="m-0">{help}</p>
        )}

        {publishMut.isError && (
          <Alert type="warning" className="mt-16">
            {t('calendar.portalpublish.error', {
              defaultValue: 'Une erreur est survenue lors de la publication.',
            })}
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" color="tertiary" variant="ghost" onClick={onClose}>
          {t('calendar.cancel', { defaultValue: 'Annuler' })}
        </Button>
        <Button
          type="button"
          color={calendar.portalPublished ? 'danger' : 'primary'}
          variant="filled"
          isLoading={publishMut.isPending}
          onClick={() => publishMut.mutate()}
        >
          {calendar.portalPublished
            ? t('calendar.portalpublish.unpublish', { defaultValue: 'Retirer du portail public' })
            : t('calendar.portalpublish.title', { defaultValue: 'Publier sur le portail public' })}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default PortalPublishDialog;
