import { Button, Modal } from '@open-ent/react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

/** Confirmation d'une action destructrice — remplace `window.confirm`, hors socle. */
export function ConfirmModal({
  title,
  text,
  confirmLabel,
  isLoading,
  onConfirm,
  onCancel,
}: {
  title: string;
  text: string;
  confirmLabel?: string;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation(['calendar', 'common']);

  return (
    <Modal id={useId()} isOpen onModalClose={onCancel} size="sm">
      <Modal.Header onModalClose={onCancel}>{title}</Modal.Header>
      <Modal.Body>
        <p className="m-0">{text}</p>
      </Modal.Body>
      <Modal.Footer>
        <Button color="tertiary" variant="ghost" onClick={onCancel}>
          {t('calendar.cancel', { defaultValue: 'Annuler' })}
        </Button>
        <Button color="danger" variant="filled" isLoading={isLoading} onClick={onConfirm}>
          {confirmLabel ?? t('calendar.delete', { defaultValue: 'Supprimer' })}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default ConfirmModal;
