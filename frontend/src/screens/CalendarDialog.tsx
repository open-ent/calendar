import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api, Calendar } from '../api';
import { Modal } from './Modal';

const COLORS = ['#2a9cc8', '#46bfaf', '#ecbe30', '#e13a3a', '#b930a2', '#763294', '#1a22a2', 'grey'];

/** Création / édition d'un calendrier. `calendar` défini = édition. */
export function CalendarDialog({ calendar, onClose }: { calendar?: Calendar; onClose: () => void }) {
  const { t } = useTranslation(['calendar', 'common']);
  const qc = useQueryClient();
  const editing = !!calendar;

  const [title, setTitle] = useState(calendar?.title ?? '');
  const [color, setColor] = useState(calendar?.color ?? COLORS[0]);

  const saveMut = useMutation({
    mutationFn: () =>
      editing
        ? api.updateCalendar(calendar!._id, { title: title.trim(), color })
        : api.createCalendar({ title: title.trim(), color }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar', 'calendars'] });
      onClose();
    },
  });

  return (
    <Modal
      title={editing ? t('calendar.edit', { defaultValue: 'Modifier le calendrier' }) : t('calendar.new', { defaultValue: 'Nouveau calendrier' })}
      onClose={onClose}
    >
      <div className="mb-12">
        <label htmlFor="cal-title" className="form-label">
          {t('calendar.name', { defaultValue: 'Nom' })}
        </label>
        <input id="cal-title" type="text" className="form-control" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </div>
      <div className="mb-16">
        <span className="form-label d-block">{t('calendar.color', { defaultValue: 'Couleur' })}</span>
        <div className="d-flex gap-8">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              style={{ width: 26, height: 26, borderRadius: 4, background: c, border: color === c ? '3px solid #333' : '1px solid #ccc', cursor: 'pointer' }}
            />
          ))}
        </div>
      </div>

      {saveMut.isError && (
        <div className="alert alert-warning" role="alert">
          {t('calendar.error', { defaultValue: 'Une erreur est survenue.' })}
        </div>
      )}

      <div className="d-flex justify-content-end gap-8">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          {t('calendar.cancel', { defaultValue: 'Annuler' })}
        </button>
        <button type="button" className="btn btn-primary" disabled={!title.trim() || saveMut.isPending} onClick={() => saveMut.mutate()}>
          {t('calendar.save', { defaultValue: 'Enregistrer' })}
        </button>
      </div>
    </Modal>
  );
}

export default CalendarDialog;
