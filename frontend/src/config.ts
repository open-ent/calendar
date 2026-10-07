// Drapeaux de configuration du module, posés par la vue backend (view-src/calendar-react.html)
// depuis la conf `ent-core.yaml`, exactement comme la vue AngularJS les pose pour son IHM.
//
// Ils ne sont PAS lisibles par API : `GET /calendar/config` est réservé aux super-administrateurs.
// En développement (serveur Vite), la vue backend n'est pas rendue : les drapeaux sont absents et
// les fonctions qu'ils gouvernent restent masquées.

declare global {
  interface Window {
    ENABLE_RBS?: boolean;
    ENABLE_ZIMBRA?: boolean;
    ENABLE_REMINDER?: boolean;
  }
}

const flag = (value: boolean | undefined): boolean => value === true;

/** Les rappels d'événement sont-ils actifs ? Quand `enableReminder` est faux côté serveur, le
 *  cron n'est pas programmé et les rappels ne sont jamais rattachés aux événements lus. */
export const isReminderEnabled = (): boolean => flag(window.ENABLE_REMINDER);

/** Le lien Calendar → RBS (réservation de ressources) est-il actif ? */
export const isRbsEnabled = (): boolean => flag(window.ENABLE_RBS);

/** L'agenda Zimbra est-il proposé comme source d'agenda externe ? */
export const isZimbraEnabled = (): boolean => flag(window.ENABLE_ZIMBRA);
