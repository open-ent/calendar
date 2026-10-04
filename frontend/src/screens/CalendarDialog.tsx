import { Alert, Button, FormControl, Input, Label, Modal } from '@open-ent/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CSSProperties, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, Calendar } from '../api';

/** Palette d'agendas (identique à la version AngularJS, pour ne pas dépayser les usagers). */
const COLORS = ['#2a9cc8', '#46bfaf', '#ecbe30', '#e13a3a', '#b930a2', '#763294', '#1a22a2', '#b0b0b0'];

/** Création / édition d'un agenda. `calendar` défini = édition. */
export function CalendarDialog({ calendar, onClose }: { calendar?: Calendar; onClose: () => void }) {
  const { t } = useTranslation(['calendar', 'common']);
  const qc = useQueryClient();
  const editing = !!calendar;

  const [title, setTitle] = useState(calendar?.title ?? '');
  const [color, setColor] = useState(calendar?.color ?? COLORS[0]);

  const saveMut = useMutation({
    mutationFn: () =>
      editing
        ? api.updateCalendar(calendar._id, { title: title.trim(), color })
        : api.createCalendar({ title: title.trim(), color }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar', 'calendars'] });
      onClose();
    },
  });

  return (
    <Modal id={useId()} isOpen onModalClose={onClose} size="sm">
      <Modal.Header onModalClose={onClose}>
        {editing
          ? t('calendar.edit.title', { defaultValue: "Modifier l'agenda" })
          : t('calendar.new.title', { defaultValue: 'Nouvel agenda' })}
      </Modal.Header>
      <Modal.Body>
        <FormControl id="calendar-title" isRequired className="mb-16">
          <Label>{t('calendar.name', { defaultValue: 'Nom' })}</Label>
          <Input type="text" size="md" value={title} autoFocus onChange={(e) => setTitle(e.target.value)} />
        </FormControl>

        <fieldset className="border-0 p-0 m-0">
          <legend className="form-label">{t('calendar.color', { defaultValue: 'Couleur' })}</legend>
          <div className="d-flex gap-8 flex-wrap">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className="agenda-color-option"
                style={{ '--agenda-color': c } as CSSProperties}
                aria-label={c}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </fieldset>

        {saveMut.isError && (
          <Alert type="warning" className="mt-16">
            {t('calendar.error', { defaultValue: 'Une erreur est survenue.' })}
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" color="tertiary" variant="ghost" onClick={onClose}>
          {t('calendar.cancel', { defaultValue: 'Annuler' })}
        </Button>
        <Button
          type="button"
          color="primary"
          variant="filled"
          isLoading={saveMut.isPending}
          disabled={!title.trim()}
          onClick={() => saveMut.mutate()}
        >
          {t('calendar.save', { defaultValue: 'Enregistrer' })}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default CalendarDialog;
