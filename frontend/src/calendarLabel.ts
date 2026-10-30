import type { Calendar } from './api';

/**
 * Libellé affiché d'un agenda. Un agenda d'établissement porte le titre générique « Agenda de l'établissement »,
 * identique pour tous : on y ajoute le nom de l'établissement (`structureName`, résolu côté serveur) pour
 * distinguer le sien de celui d'un autre établissement qui le partage — comme l'interface AngularJS
 * (`side-bar.ts#getCalendarTitle`). Sans nom résolu, le titre de l'agenda est conservé.
 *
 * Ex. : « Agenda de l'établissement CLG-PIERRE MENDES FRANCE-MORLAIX ».
 */
export const calendarLabel = (
  calendar: Pick<Calendar, 'title' | 'type' | 'structureName'>,
  t: (key: string, options?: { defaultValue?: string }) => string,
): string =>
  calendar.type === 'structure' && calendar.structureName
    ? `${t('calendar.structure.calendar.title', { defaultValue: "Agenda de l'établissement" })} ${calendar.structureName}`
    : calendar.title;
