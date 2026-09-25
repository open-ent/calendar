package net.atos.entng.calendar.services;

import io.vertx.core.Future;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;

/**
 * Propositions de réservation RBS sur un agenda partagé n'appartenant pas à l'auteur (point B2 du
 * chantier "vue consolidée EDT+RBS"). Collection Mongo dédiée, sans rapport avec la modération RBS
 * existante — cf. contexte dans le plan.
 */
public interface BookingProposalService {

    /**
     * Crée une proposition PENDING.
     * @param calendarId  id de l'agenda visé
     * @param eventId     id de l'événement déjà sauvegardé
     * @param proposedBy  {userId, displayName} de l'auteur de la proposition
     * @param owner       {userId, displayName} du propriétaire de l'agenda (approbateur)
     * @param bookingPayload le tableau des bookings proposés (même forme que CalendarEvent.bookings)
     * @return {@link Future<JsonObject>} la proposition créée
     */
    Future<JsonObject> create(String calendarId, String eventId, JsonObject proposedBy, JsonObject owner, JsonArray bookingPayload);

    /**
     * Récupère une proposition par id.
     */
    Future<JsonObject> retrieve(String id);

    /**
     * Liste les propositions d'un événement (tous statuts confondus).
     */
    Future<JsonArray> listByEvent(String eventId);

    /**
     * Marque une proposition ACCEPTED ou REFUSED.
     * @param refusalReason motif optionnel (REFUSED uniquement)
     */
    Future<Void> updateStatus(String id, String status, String refusalReason);
}
