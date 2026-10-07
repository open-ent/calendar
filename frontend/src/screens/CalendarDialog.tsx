import { Alert, Button, FormControl, Input, Label, Modal, Radio } from '@open-ent/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CSSProperties, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, Calendar } from '../api';
import { CalendarType } from '../rights';

/** Palette d'agendas (identique à la version AngularJS, pour ne pas dépayser les usagers). */
const COLORS = ['#2a9cc8', '#46bfaf', '#ecbe30', '#e13a3a', '#b930a2', '#763294', '#1a22a2', '#b0b0b0'];

export interface CalendarDialogProps {
  calendar?: Calendar;
  /** Natures d'agenda que l'usager a le droit de créer, hors « personnel » toujours permis. */
  allowedTypes: CalendarType[];
  /** Structure de rattachement d'un agenda d'établissement (première structure de l'usager). */
  structureId?: string;
  /** Rend visible l'agenda qu'on vient de créer (préférence d'affichage). */
  onCreated?: (calendar: Calendar) => void;
  onClose: () => void;
}

/** Création / édition d'un agenda. `calendar` défini = édition. */
export function CalendarDialog({
  calendar,
  allowedTypes,
  structureId,
  onCreated,
  onClose,
}: CalendarDialogProps) {
  const { t } = useTranslation(['calendar', 'common']);
  const qc = useQueryClient();
  const editing = !!calendar;

  const [title, setTitle] = useState(calendar?.title ?? '');
  const [color, setColor] = useState(calendar?.color ?? COLORS[0]);
  const [type, setType] = useState<CalendarType>((calendar?.type as CalendarType) ?? 'personal');

  // La nature d'un agenda ne se change pas après coup : le serveur route sur l'endpoint de création.
  const allTypes: { value: CalendarType; label: string }[] = [
    { value: 'personal', label: t('calendar.type.personal', { defaultValue: 'Personnel' }) },
    { value: 'structure', label: t('calendar.type.structure', { defaultValue: 'Établissement' }) },
    { value: 'group', label: t('calendar.type.group', { defaultValue: 'Groupe' }) },
  ];
  const types = allTypes.filter((o) => o.value === 'personal' || allowedTypes.includes(o.value));

  const saveMut = useMutation({
    mutationFn: () =>
      editing
        ? api.updateCalendar(calendar._id, { title: title.trim(), color })
        : api.createCalendar({
            title: title.trim(),
            color,
            type,
            ...(type === 'structure' && structureId ? { structureId } : {}),
          }),
    onSuccess: (saved) => {
      if (!editing && saved?._id) onCreated?.({ ...saved, type, title: title.trim(), color });
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

        {!editing && types.length > 1 && (
          <fieldset className="border-0 p-0 m-0 mb-16">
            <legend className="form-label">
              {t('calendar.type', { defaultValue: "Type d'agenda" })}
            </legend>
            <div className="d-flex flex-wrap gap-16">
              {types.map((o) => (
                <Radio
                  key={o.value}
                  name="calendar-type"
                  model={type}
                  value={o.value}
                  label={o.label}
                  checked={type === o.value}
                  onChange={() => setType(o.value)}
                />
              ))}
            </div>
            {type !== 'personal' && (
              <Alert type="info" className="mt-12">
                {t('calendar.type.share.hint', {
                  defaultValue:
                    'Après enregistrement, choisissez avec qui partager cet agenda.',
                })}
              </Alert>
            )}
          </fieldset>
        )}

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
