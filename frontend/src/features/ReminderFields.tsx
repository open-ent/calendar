import { Checkbox } from '@open-ent/react';
import { useTranslation } from 'react-i18next';

import { EventReminder } from '../api';

export interface ReminderFieldsProps {
  reminder: EventReminder;
  onChange: (reminder: EventReminder) => void;
  /** Message de validation, vide si la saisie est cohérente. */
  error?: string;
}

/** Rappel d'un événement : par quel canal prévenir, et combien de temps à l'avance. */
export function ReminderFields({ reminder, onChange, error }: ReminderFieldsProps) {
  const { t } = useTranslation(['calendar', 'common']);

  const setType = (key: 'email' | 'timeline', value: boolean) =>
    onChange({ ...reminder, reminderType: { ...reminder.reminderType, [key]: value } });
  const setFrequency = (key: 'hour' | 'day' | 'week' | 'month', value: boolean) =>
    onChange({
      ...reminder,
      reminderFrequency: { ...reminder.reminderFrequency, [key]: value },
    });

  const frequencies: { key: 'hour' | 'day' | 'week' | 'month'; label: string }[] = [
    { key: 'hour', label: t('calendar.reminder.hour', { defaultValue: '1 heure avant' }) },
    { key: 'day', label: t('calendar.reminder.day', { defaultValue: '1 jour avant' }) },
    { key: 'week', label: t('calendar.reminder.week', { defaultValue: '1 semaine avant' }) },
    { key: 'month', label: t('calendar.reminder.month', { defaultValue: '1 mois avant' }) },
  ];

  return (
    <div className="mt-12 d-flex flex-column gap-12">
      <fieldset className="border-0 p-0 m-0">
        <legend className="form-label">
          {t('calendar.reminder.type', { defaultValue: 'Me prévenir par' })}
        </legend>
        <div className="d-flex flex-wrap gap-16">
          <Checkbox
            label={t('calendar.reminder.type.email', { defaultValue: 'E-mail' })}
            checked={reminder.reminderType.email}
            onChange={(e) => setType('email', e.target.checked)}
          />
          <Checkbox
            label={t('calendar.reminder.type.timeline', { defaultValue: 'Fil de nouveautés' })}
            checked={reminder.reminderType.timeline}
            onChange={(e) => setType('timeline', e.target.checked)}
          />
        </div>
      </fieldset>

      <fieldset className="border-0 p-0 m-0">
        <legend className="form-label">
          {t('calendar.reminder.frequency', { defaultValue: 'Quand' })}
        </legend>
        <div className="d-flex flex-wrap gap-16">
          {frequencies.map((f) => (
            <Checkbox
              key={f.key}
              label={f.label}
              checked={reminder.reminderFrequency[f.key]}
              onChange={(e) => setFrequency(f.key, e.target.checked)}
            />
          ))}
        </div>
      </fieldset>

      {error && (
        <p className="small text-danger m-0" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export default ReminderFields;
