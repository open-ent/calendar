import { Alert, Checkbox, FormControl, Input, Label, Radio } from '@open-ent/react';
import { useTranslation } from 'react-i18next';

import {
  EVERY_MAX,
  isOneDayEvent,
  OCCURRENCES_MAX,
  OCCURRENCES_MIN,
  Recurrence,
  RecurrenceType,
} from '../recurrence';
import { isoUtcToLocalInput } from '../utils';

/** Libellés courts des jours, repris des clés `calendar.recurrence.daymap.*`. */
const DAY_KEYS: Record<number, string> = {
  1: 'calendar.recurrence.daymap.mon',
  2: 'calendar.recurrence.daymap.tue',
  3: 'calendar.recurrence.daymap.wed',
  4: 'calendar.recurrence.daymap.thu',
  5: 'calendar.recurrence.daymap.fri',
  6: 'calendar.recurrence.daymap.sat',
  7: 'calendar.recurrence.daymap.sun',
};
const DAY_FALLBACK: Record<number, string> = {
  1: 'Lu',
  2: 'Ma',
  3: 'Me',
  4: 'Je',
  5: 'Ve',
  6: 'Sa',
  7: 'Di',
};

export interface RecurrenceFieldsProps {
  recurrence: Recurrence;
  start: Date;
  end: Date;
  onChange: (recurrence: Recurrence) => void;
  /** Message de validation (fin incohérente, événement trop long pour sa période). */
  error?: string;
}

/** Réglages d'une récurrence : périodicité, jours, et fin de série. */
export function RecurrenceFields({
  recurrence,
  start,
  end,
  onChange,
  error,
}: RecurrenceFieldsProps) {
  const { t } = useTranslation(['calendar', 'common']);
  const oneDay = isOneDayEvent(start, end);

  const set = (patch: Partial<Recurrence>) => onChange({ ...recurrence, ...patch });

  const toggleDay = (day: number) =>
    set({
      week_days: { ...recurrence.week_days, [String(day)]: !recurrence.week_days[String(day)] },
    });

  const everyOptions = Array.from({ length: EVERY_MAX }, (_, i) => i + 1);

  return (
    <div className="mt-12 d-flex flex-column gap-12">
      <div className="d-flex flex-wrap align-items-end gap-12">
        <div>
          <label className="form-label" htmlFor="recurrence-type">
            {t('calendar.reccurent', { defaultValue: 'Récurrent' })}
          </label>
          <select
            id="recurrence-type"
            className="form-select"
            value={recurrence.type}
            onChange={(e) => set({ type: e.target.value as RecurrenceType })}
          >
            {/* Un événement à cheval sur plusieurs jours ne peut pas se répéter quotidiennement. */}
            {oneDay && (
              <option value="every_day">
                {t('calendar.recurrence.every.day', { defaultValue: 'Tous les jours' })}
              </option>
            )}
            <option value="every_week">
              {t('calendar.recurrence.every.week', { defaultValue: 'Toutes les semaines' })}
            </option>
          </select>
        </div>

        <div>
          <label className="form-label" htmlFor="recurrence-every">
            {t('calendar.recurrence.every', { defaultValue: 'Tous les' })}
          </label>
          <div className="d-flex align-items-center gap-8">
            <select
              id="recurrence-every"
              className="form-select"
              value={recurrence.every}
              onChange={(e) => set({ every: Number(e.target.value) })}
            >
              {everyOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span>
              {recurrence.type === 'every_day'
                ? t('calendar.recurrence.days', { defaultValue: 'jours' })
                : t('calendar.recurrence.weeks', { defaultValue: 'semaines' })}
            </span>
          </div>
        </div>
      </div>

      {recurrence.type === 'every_week' && oneDay && (
        <fieldset className="border-0 p-0 m-0">
          <legend className="form-label">
            {t('calendar.recurrence.repeat.on', { defaultValue: 'Répéter le' })}
          </legend>
          <div className="d-flex flex-wrap gap-12">
            {[1, 2, 3, 4, 5, 6, 7].map((day) => (
              <Checkbox
                key={day}
                label={t(DAY_KEYS[day], { defaultValue: DAY_FALLBACK[day] })}
                checked={!!recurrence.week_days[String(day)]}
                onChange={() => toggleDay(day)}
              />
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="border-0 p-0 m-0">
        <legend className="form-label">
          {t('calendar.recurrence.end', { defaultValue: 'Fin' })}
        </legend>
        <div className="d-flex flex-column gap-8">
          <div className="d-flex align-items-center gap-12 flex-wrap">
            <Radio
              name="recurrence-end"
              model={recurrence.end_type}
              value="on"
              label={t('calendar.recurrence.end.on', { defaultValue: 'Le' })}
              checked={recurrence.end_type === 'on'}
              onChange={() => set({ end_type: 'on' })}
            />
            <FormControl id="recurrence-end-on" className="flex-fill">
              <Label className="visually-hidden">
                {t('calendar.recurrence.end.on', { defaultValue: 'Le' })}
              </Label>
              <Input
                type="date"
                size="md"
                disabled={recurrence.end_type !== 'on'}
                value={isoUtcToLocalInput(recurrence.end_on).slice(0, 10)}
                onChange={(e) =>
                  set({
                    end_on: e.target.value
                      ? new Date(`${e.target.value}T00:00:00`).toISOString()
                      : undefined,
                  })
                }
              />
            </FormControl>
          </div>

          <div className="d-flex align-items-center gap-12 flex-wrap">
            <Radio
              name="recurrence-end"
              model={recurrence.end_type}
              value="after"
              label={t('calendar.recurrence.end.after', { defaultValue: 'Après' })}
              checked={recurrence.end_type === 'after'}
              onChange={() => set({ end_type: 'after' })}
            />
            <FormControl id="recurrence-end-after">
              <Label className="visually-hidden">
                {t('calendar.recurrence.occurrences', { defaultValue: 'occurrences' })}
              </Label>
              <Input
                type="number"
                size="md"
                min={OCCURRENCES_MIN}
                max={OCCURRENCES_MAX}
                disabled={recurrence.end_type !== 'after'}
                value={recurrence.end_after ?? ''}
                onChange={(e) => set({ end_after: Number(e.target.value) })}
              />
            </FormControl>
            <span>{t('calendar.recurrence.occurrences', { defaultValue: 'occurrences' })}</span>
          </div>
        </div>
      </fieldset>

      {error && <Alert type="warning">{error}</Alert>}
    </div>
  );
}

export default RecurrenceFields;
