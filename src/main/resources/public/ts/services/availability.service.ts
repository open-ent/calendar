import http, { AxiosResponse } from "axios";

export interface IAvailabilityResource {
    id: number;
    name: string;
    typeId: number;
    typeName: string;
}

export interface IAvailabilitySlot {
    source: 'edt' | 'rbs';
    start: string;
    end: string;
    label: string;
    resourceName: string;
}

export interface IAvailabilityService {
    fetchResources(structureId: string): Promise<Array<IAvailabilityResource>>;
    fetchCourses(structureId: string, startDate: string, endDate: string): Promise<Array<any>>;
    fetchAllBookings(startDate: string, endDate: string): Promise<Array<any>>;
}

// Panneau "Disponibilité EDT + RBS" de l'agenda d'établissement (partie 5 du chantier "vue
// consolidée EDT+RBS", cf. modules/rbs pour les parties 2-3 dont ce service reprend le principe).
// Contrairement à RBS (un aller-retour PAR ressource), ce service ne fait QU'UN appel par source
// pour toute la structure sur la période — plus efficace pour un agenda d'établissement qui doit
// pouvoir agréger "toutes les ressources" d'un coup, le tri par ressource se fait ensuite côté
// client (cf. controller.ts, loadAvailability).
export const availabilityService: IAvailabilityService = {
    fetchResources(structureId: string): Promise<Array<IAvailabilityResource>> {
        return Promise.all([http.get('/rbs/types'), http.get('/rbs/resources')])
            .then(([typesRes, resourcesRes]: [AxiosResponse, AxiosResponse]) => {
                const typeById: { [id: number]: any } = {};
                (typesRes.data || [])
                    .filter((t: any) => t.school_id === structureId)
                    .forEach((t: any) => { typeById[t.id] = t; });
                return (resourcesRes.data || [])
                    .filter((r: any) => typeById[r.type_id])
                    .map((r: any) => ({
                        id: r.id,
                        name: r.name,
                        typeId: r.type_id,
                        typeName: typeById[r.type_id].name,
                    }));
            });
    },

    // POST /structures/:structureId/common/courses/:startAt/:endAt (module edt, CourseController)
    // — teacherIds/groupIds/groupExternalIds/groupNames vides = aucun filtre, tous les cours de la
    // structure sur la période. Chaque cours porte roomLabels (JsonArray des salles concernées).
    // ATTENTION format : dates SANS heure (YYYY-MM-DD) — le voisin `/room-conflicts` (utilisé par
    // RBS) tronque systématiquement à la date avant d'appeler ce même service en interne
    // (CourseController.getRoomConflicts), ce endpoint direct attend donc la même granularité.
    fetchCourses(structureId: string, startDate: string, endDate: string): Promise<Array<any>> {
        return http.post(`/edt/structures/${structureId}/common/courses/${startDate}/${endDate}`, {
            teacherIds: [],
            groupIds: [],
            groupExternalIds: [],
            groupNames: [],
        }).then((response: AxiosResponse) => response.data || []);
    },

    // GET /rbs/bookings/all/:startdate/:enddate (module rbs, BookingController) — réservations
    // visibles par l'utilisateur courant (types partagés avec lui/ses groupes, dont il est owner,
    // + tous les types de l'école s'il est admin local) : mêmes règles de visibilité RBS que
    // partout ailleurs dans l'ENT, volontairement pas de vue élargie ici.
    // ATTENTION format : dates SANS heure aussi (regex stricte \d{4}-\d{2}-\d{2} côté serveur,
    // `startdate.matches(...)` dans BookingController — une requête mal formée renvoie 400).
    fetchAllBookings(startDate: string, endDate: string): Promise<Array<any>> {
        return http.get(`/rbs/bookings/all/${startDate}/${endDate}`)
            .then((response: AxiosResponse) => response.data || []);
    },
};
