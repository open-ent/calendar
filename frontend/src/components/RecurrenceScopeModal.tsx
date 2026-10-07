import { Button, Modal, Radio } from '@open-ent/react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Portée d'une action sur un événement récurrent. */
export type RecurrenceScope = 'one' | 'all';

export interface RecurrenceScopeModalProps {
  /** Titre de la fenêtre : « Modifier un évènement récurrent » ou son équivalent suppression. */
  title: string;
  /** Question posée : « Vous souhaitez modifier » ou « … supprimer ». */
  question: string;
  /** Libellé du bouton de validation. */
  confirmLabel: string;
  /** Action destructrice : le bouton passe en rouge. */
  danger?: boolean;
  isLoading?: boolean;
  onConfirm: (scope: RecurrenceScope) => void;
  onCancel: () => void;
}

/**
 * Demande si l'action porte sur cette seule occurrence ou sur toute la récurrence.
 * Reprend la lightbox `recurrent-event-edition-popup` de l'IHM AngularJS : aucun choix n'est
 * présélectionné, pour ne pas appliquer par inadvertance une modification à toute la série.
 */
export function RecurrenceScopeModal({
  title,
  question,
  confirmLabel,
  danger,
  isLoading,
  onConfirm,
  onCancel,
}: RecurrenceScopeModalProps) {
  const { t } = useTranslation(['calendar', 'common']);
  const [scope, setScope] = useState<RecurrenceScope | null>(null);

  return (
    <Modal id={useId()} isOpen onModalClose={onCancel} size="sm">
      <Modal.Header onModalClose={onCancel}>{title}</Modal.Header>
      <Modal.Body>
        <p>{question}</p>
        <div className="d-flex flex-column gap-8">
          <Radio
            name="recurrence-scope"
            model={scope ?? ''}
            value="one"
            label={t('calendar.event.only', { defaultValue: 'Cet événement uniquement' })}
            checked={scope === 'one'}
            onChange={() => setScope('one')}
          />
          <Radio
            name="recurrence-scope"
            model={scope ?? ''}
            value="all"
            label={t('calendar.event.all.recurrences', {
              defaultValue: 'Toutes les occurrences de cette récurrence',
            })}
            checked={scope === 'all'}
            onChange={() => setScope('all')}
          />
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" color="tertiary" variant="ghost" onClick={onCancel}>
          {t('calendar.cancel', { defaultValue: 'Annuler' })}
        </Button>
        <Button
          type="button"
          color={danger ? 'danger' : 'primary'}
          variant="filled"
          isLoading={isLoading}
          disabled={scope === null}
          onClick={() => scope && onConfirm(scope)}
        >
          {confirmLabel}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default RecurrenceScopeModal;
