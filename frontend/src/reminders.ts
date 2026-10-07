// Rappels d'événement — modèle et règles, sans dépendance à React pour rester testables.
//
// Le serveur stocke des dates calculées à partir du début de l'événement, mais expose et accepte
// cette forme à cases (`ReminderConverter` côté Java). Un rappel n'est rattaché à l'événement lu
// que si `enableReminder` est actif dans la configuration du module.

import { EventReminder } from './api';

/** Rappel vide — aucun canal, aucune échéance. */
export function emptyReminder(): EventReminder {
  return {
    reminderType: { email: false, timeline: false },
    reminderFrequency: { hour: false, day: false, week: false, month: false },
  };
}

/** Aucun canal ni échéance cochés. */
export function isReminderEmpty(reminder: EventReminder): boolean {
  const { email, timeline } = reminder.reminderType;
  const { hour, day, week, month } = reminder.reminderFrequency;
  return !email && !timeline && !hour && !day && !week && !month;
}

/**
 * Au moins un canal ET au moins une échéance — ou alors rien du tout : ne pas demander de rappel
 * est un choix valide (parité `isEventReminderValid` de l'IHM AngularJS).
 */
export function isReminderValid(reminder: EventReminder): boolean {
  const { email, timeline } = reminder.reminderType;
  const { hour, day, week, month } = reminder.reminderFrequency;
  const hasType = email || timeline;
  const hasFrequency = hour || day || week || month;
  return (hasType && hasFrequency) || isReminderEmpty(reminder);
}
