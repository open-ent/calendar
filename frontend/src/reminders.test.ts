import { describe, expect, it } from 'vitest';

import { EventReminder } from './api';
import { emptyReminder, isReminderEmpty, isReminderValid } from './reminders';

const reminder = (
  type: Partial<EventReminder['reminderType']>,
  freq: Partial<EventReminder['reminderFrequency']>,
): EventReminder => ({
  reminderType: { email: false, timeline: false, ...type },
  reminderFrequency: { hour: false, day: false, week: false, month: false, ...freq },
});

describe('validation d’un rappel', () => {
  it('accepte un rappel entièrement vide : ne rien demander est valide', () => {
    expect(isReminderEmpty(emptyReminder())).toBe(true);
    expect(isReminderValid(emptyReminder())).toBe(true);
  });

  it('refuse un canal sans échéance', () => {
    expect(isReminderValid(reminder({ email: true }, {}))).toBe(false);
  });

  it('refuse une échéance sans canal', () => {
    expect(isReminderValid(reminder({}, { day: true }))).toBe(false);
  });

  it('accepte un canal et une échéance', () => {
    expect(isReminderValid(reminder({ timeline: true }, { week: true }))).toBe(true);
  });

  it('accepte plusieurs canaux et plusieurs échéances', () => {
    const r = reminder({ email: true, timeline: true }, { hour: true, month: true });
    expect(isReminderValid(r)).toBe(true);
    expect(isReminderEmpty(r)).toBe(false);
  });
});
