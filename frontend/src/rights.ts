// Droits du module Agenda — mêmes clés que l'IHM AngularJS (`ts/model/constantes/RIGHTS.ts`),
// pour que les deux interfaces accordent exactement les mêmes permissions.
//
// Deux familles :
//  - workflow : porté par la session (`authorizedActions`), lu via `useHasWorkflow` du socle ;
//  - ressource : porté par le tableau `shared` de l'agenda (modèle entcore), chaque entrée
//    valant `{ userId | groupId, "<action>": true }`. Le propriétaire a tous les droits.

import { Calendar, CalendarEvent, SharedEntry } from './api';

/** Droits de workflow (clés en points, comme dans la session). */
export const WORKFLOW = {
  createCalendar: 'net.atos.entng.calendar.controllers.CalendarController|createCalendar',
  createStructureCalendar:
    'net.atos.entng.calendar.controllers.CalendarController|createStructureCalendar',
  createGroupCalendar: 'net.atos.entng.calendar.controllers.CalendarController|createGroupCalendar',
} as const;

/** Droits de ressource (clés en tirets, comme dans `shared`). */
export const RESOURCE = {
  /** Créer / modifier un événement de cet agenda. */
  contrib: 'net-atos-entng-calendar-controllers-EventController|createEvent',
  updateEvent: 'net-atos-entng-calendar-controllers-EventController|updateEvent',
  deleteEvent: 'net-atos-entng-calendar-controllers-EventController|deleteEvent',
  shareEvent: 'net-atos-entng-calendar-controllers-EventController|shareEvent',
  /** Gérer l'agenda lui-même. */
  manage: 'net-atos-entng-calendar-controllers-CalendarController|updateCalendar',
  deleteCalendar: 'net-atos-entng-calendar-controllers-CalendarController|deleteCalendar',
  shareCalendar: 'net-atos-entng-calendar-controllers-CalendarController|shareCalendar',
} as const;

/** Ce que l'utilisateur courant peut faire sur un agenda. */
export interface CalendarRights {
  /** Y créer ou y modifier des événements. */
  contrib: boolean;
  /** Le renommer, le recolorer. */
  manage: boolean;
  /** Le partager. */
  share: boolean;
  /** Le supprimer. */
  remove: boolean;
}

const NO_RIGHTS: CalendarRights = { contrib: false, manage: false, share: false, remove: false };
const ALL_RIGHTS: CalendarRights = { contrib: true, manage: true, share: true, remove: true };

/** L'entrée de partage vise-t-elle cet utilisateur (directement ou par un de ses groupes) ? */
function targetsMe(entry: SharedEntry, userId: string, groupIds: string[]): boolean {
  if (entry.userId) return entry.userId === userId;
  if (entry.groupId) return groupIds.includes(entry.groupId);
  return false;
}

/** Une des entrées de partage qui me visent accorde-t-elle cette action ? */
function shareGrants(shared: SharedEntry[] | undefined, action: string, userId: string, groupIds: string[]): boolean {
  return (shared ?? []).some((entry) => targetsMe(entry, userId, groupIds) && entry[action] === true);
}

/**
 * Droits de l'utilisateur courant sur un agenda.
 * Un agenda externe (flux ICS) est en lecture seule : seule sa suppression reste possible,
 * et uniquement pour son propriétaire.
 */
export function calendarRights(
  calendar: Calendar,
  userId: string,
  groupIds: string[],
): CalendarRights {
  const isOwner = !!userId && calendar.owner?.userId === userId;

  if (calendar.isExternal) {
    return { ...NO_RIGHTS, remove: isOwner };
  }
  if (isOwner) return ALL_RIGHTS;
  // Sans session connue, on n'affiche aucune action plutôt que d'en proposer qui échoueront.
  if (!userId) return NO_RIGHTS;

  const granted = (action: string) => shareGrants(calendar.shared, action, userId, groupIds);
  const manage = granted(RESOURCE.manage);
  return {
    contrib: manage || granted(RESOURCE.contrib),
    manage,
    share: manage || granted(RESOURCE.shareCalendar),
    remove: manage || granted(RESOURCE.deleteCalendar),
  };
}

/** Ce que l'utilisateur courant peut faire sur un événement. */
export interface EventRights {
  edit: boolean;
  share: boolean;
  remove: boolean;
}

export const NO_EVENT_RIGHTS: EventRights = { edit: false, share: false, remove: false };

/**
 * Droits sur un événement. Parité avec l'Angular (`hasManageRightOrIsEventOwner` +
 * `hasRightOnSharedEvent`) : on prend le droit le PLUS FAIBLE parmi les agendas qui le portent
 * — un événement publié dans un agenda où je ne suis que lecteur n'y est pas modifiable —
 * et un partage posé sur l'événement lui-même peut encore restreindre un non-propriétaire.
 */
export function eventRights(
  event: CalendarEvent,
  calendarsById: Map<string, Calendar>,
  rightsById: Map<string, CalendarRights>,
  userId: string,
  groupIds: string[],
): EventRights {
  const hosts = (event.calendar ?? []).filter((id) => calendarsById.has(id));
  if (hosts.length === 0) return NO_EVENT_RIGHTS;
  // Un événement d'un agenda externe n'est jamais modifiable.
  if (hosts.some((id) => calendarsById.get(id)?.isExternal)) return NO_EVENT_RIGHTS;

  const everyHost = (pick: (r: CalendarRights) => boolean) =>
    hosts.every((id) => pick(rightsById.get(id) ?? NO_RIGHTS));

  const isOwner = !!userId && event.owner?.userId === userId;
  // Le propriétaire d'un agenda (droit « manage ») garde la main sur tout ce qu'il contient ;
  // un simple contributeur ne touche que ses propres événements.
  const base = everyHost((r) => r.manage) || (isOwner && everyHost((r) => r.contrib));
  if (!base) return NO_EVENT_RIGHTS;

  // Partage posé sur l'événement : il restreint les destinataires, jamais le propriétaire.
  if (!isOwner && event.shared && event.shared.length > 0) {
    return {
      edit: shareGrants(event.shared, RESOURCE.updateEvent, userId, groupIds),
      share: shareGrants(event.shared, RESOURCE.shareEvent, userId, groupIds),
      remove: shareGrants(event.shared, RESOURCE.deleteEvent, userId, groupIds),
    };
  }
  return { edit: true, share: true, remove: true };
}
