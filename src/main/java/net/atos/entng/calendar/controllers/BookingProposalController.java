package net.atos.entng.calendar.controllers;

import fr.wseduc.rs.ApiDoc;
import fr.wseduc.rs.Get;
import fr.wseduc.rs.Put;
import fr.wseduc.security.ActionType;
import fr.wseduc.security.SecuredAction;
import fr.wseduc.webutils.I18n;
import fr.wseduc.webutils.Either;
import fr.wseduc.webutils.http.Renders;
import fr.wseduc.webutils.request.RequestUtils;
import io.vertx.core.Future;
import io.vertx.core.Promise;
import io.vertx.core.eventbus.EventBus;
import io.vertx.core.http.HttpServerRequest;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.core.logging.Logger;
import io.vertx.core.logging.LoggerFactory;
import net.atos.entng.calendar.core.constants.Field;
import net.atos.entng.calendar.core.enums.BookingProposalStatus;
import net.atos.entng.calendar.helpers.RbsHelper;
import net.atos.entng.calendar.services.BookingProposalService;
import net.atos.entng.calendar.services.EventServiceMongo;
import net.atos.entng.calendar.services.ServiceFactory;
import org.entcore.common.mongodb.MongoDbControllerHelper;
import org.entcore.common.notification.TimelineHelper;
import org.entcore.common.service.CrudService;
import org.entcore.common.user.UserInfos;
import org.entcore.common.user.UserUtils;

import java.util.Collections;

/**
 * Circuit d'approbation réelle pour une réservation RBS proposée sur un agenda partagé
 * n'appartenant pas à l'auteur (point B2 du chantier "vue consolidée EDT+RBS"). Sécurité : PAS un
 * droit RBS (le propriétaire de l'agenda peut appartenir à un autre établissement, donc n'avoir
 * strictement aucun droit RBS sur la ressource visée) — juste une comparaison d'identité avec le
 * propriétaire enregistré sur la proposition, vérifiée manuellement (patron déjà utilisé ailleurs
 * dans l'ENT pour ce type de contrôle simple, ex. SessionManage côté cahier de textes).
 */
public class BookingProposalController extends MongoDbControllerHelper {

    private final BookingProposalService bookingProposalService;
    private final EventServiceMongo eventService;
    private final TimelineHelper notification;
    private final JsonObject config;
    protected static final Logger log = LoggerFactory.getLogger(BookingProposalController.class);

    public BookingProposalController(String collection, ServiceFactory serviceFactory, CrudService eventService,
                                      TimelineHelper timelineHelper, EventBus eb, JsonObject config) {
        super(collection);
        this.bookingProposalService = serviceFactory.bookingProposalService();
        this.eventService = (EventServiceMongo) eventService;
        this.notification = timelineHelper;
        this.config = config;
    }

    @Get("/booking-proposal/event/:eventId")
    @ApiDoc("Liste les propositions de réservation RBS d'un événement.")
    @SecuredAction(value = "calendar.read", type = ActionType.AUTHENTICATED)
    public void listByEvent(final HttpServerRequest request) {
        UserUtils.getAuthenticatedUserInfos(eb, request).onSuccess(user -> {
            String eventId = request.params().get(Field.EVENTID_CAMEL);
            bookingProposalService.listByEvent(eventId)
                    .onSuccess(res -> renderJson(request, res))
                    .onFailure(err -> renderError(request));
        });
    }

    @Put("/booking-proposal/:id/process")
    @ApiDoc("Accepte ou refuse une proposition de réservation RBS — réservé au propriétaire de l'agenda visé.")
    @SecuredAction(value = "calendar.read", type = ActionType.AUTHENTICATED)
    public void process(final HttpServerRequest request) {
        UserUtils.getAuthenticatedUserInfos(eb, request).onSuccess(user -> {
            String proposalId = request.params().get(Field.ID);
            RequestUtils.bodyToJson(request, body -> {
                String status = body.getString(Field.STATUS);
                String refusalReason = body.getString(Field.REFUSALREASON);
                boolean accepted = BookingProposalStatus.ACCEPTED.getValue().equalsIgnoreCase(status);
                boolean refused = BookingProposalStatus.REFUSED.getValue().equalsIgnoreCase(status);
                if (!accepted && !refused) {
                    Renders.badRequest(request, "calendar.booking.proposal.invalid.status");
                    return;
                }

                bookingProposalService.retrieve(proposalId).onSuccess(proposal -> {
                    if (proposal == null || proposal.isEmpty()) {
                        Renders.notFound(request);
                        return;
                    }
                    String ownerUserId = proposal.getJsonObject(Field.OWNER, new JsonObject()).getString(Field.USERID);
                    if (ownerUserId == null || !ownerUserId.equals(user.getUserId())) {
                        Renders.unauthorized(request);
                        return;
                    }
                    if (!BookingProposalStatus.PENDING.getValue().equalsIgnoreCase(proposal.getString(Field.STATUS))) {
                        Renders.badRequest(request, "calendar.booking.proposal.already.processed");
                        return;
                    }

                    if (accepted) {
                        processAcceptance(request, proposal, user);
                    } else {
                        processRefusal(request, proposal, user, refusalReason);
                    }
                }).onFailure(err -> renderError(request));
            });
        });
    }

    private void processAcceptance(HttpServerRequest request, JsonObject proposal, UserInfos owner) {
        String proposedByUserId = proposal.getJsonObject(Field.PROPOSEDBY, new JsonObject()).getString(Field.USERID);
        String eventId = proposal.getString(Field.EVENTID_CAMEL);
        String calendarId = proposal.getString(Field.CALENDARID);
        JsonArray bookingPayload = proposal.getJsonArray(Field.BOOKINGPAYLOAD, new JsonArray());

        // La réservation RBS doit être créée avec les droits de l'AUTEUR de la proposition, jamais
        // ceux de l'approbateur (qui peut n'avoir aucun droit RBS sur cette ressource, cf. contexte
        // du plan) — mêmes UserInfos fraîches que RbsHelper.EventBusController#save-bookings côté rbs.
        UserUtils.getUserInfos(eb, proposedByUserId, authorUser -> {
            if (authorUser == null) {
                renderError(request);
                return;
            }
            JsonObject toSync = new JsonObject()
                    .put(Field.BOOKINGS, bookingPayload)
                    .put(Field.HASBOOKING, true);

            RbsHelper.saveBookingsInRbs(request, toSync, authorUser, config, eb)
                    .compose(v -> {
                        JsonObject update = new JsonObject()
                                .put(Field.BOOKINGS, toSync.getJsonArray(Field.BOOKINGS, new JsonArray()))
                                .put(Field.HASBOOKING, toSync.getBoolean(Field.HASBOOKING, false));
                        return updateEvent(calendarId, eventId, update, authorUser);
                    })
                    .compose(res -> bookingProposalService.updateStatus(proposal.getString(Field._ID),
                            BookingProposalStatus.ACCEPTED.getValue(), null))
                    .onSuccess(res -> {
                        notifyResult(request, proposal, owner, proposedByUserId, true);
                        Renders.ok(request);
                    })
                    .onFailure(err -> {
                        log.error("[Calendar@BookingProposalController::processAcceptance] " + err.getMessage(), err);
                        renderError(request);
                    });
        });
    }

    private void processRefusal(HttpServerRequest request, JsonObject proposal, UserInfos owner, String refusalReason) {
        String proposedByUserId = proposal.getJsonObject(Field.PROPOSEDBY, new JsonObject()).getString(Field.USERID);
        bookingProposalService.updateStatus(proposal.getString(Field._ID), BookingProposalStatus.REFUSED.getValue(), refusalReason)
                .onSuccess(res -> {
                    notifyResult(request, proposal, owner, proposedByUserId, false);
                    Renders.ok(request);
                })
                .onFailure(err -> renderError(request));
    }

    /** Enrobe EventServiceMongo#update (callback) dans un Future, sur le patron déjà utilisé côté RbsHelper. */
    private Future<JsonObject> updateEvent(String calendarId, String eventId, JsonObject body, UserInfos user) {
        Promise<JsonObject> promise = Promise.promise();
        eventService.update(calendarId, eventId, body, user, (Either<String, JsonObject> event) -> {
            if (event.isRight()) {
                promise.complete(event.right().getValue());
            } else {
                promise.fail(event.left().getValue());
            }
        });
        return promise.future();
    }

    private void notifyResult(HttpServerRequest request, JsonObject proposal, UserInfos sender, String recipientUserId, boolean accepted) {
        String template = accepted ? "calendar.booking-proposal-accepted" : "calendar.booking-proposal-refused";
        JsonObject params = new JsonObject()
                .put("uri", "/userbook/annuaire#" + sender.getUserId() + "#")
                .put("username", sender.getUsername())
                .put("calendarUri", "/calendar#/view/" + proposal.getString(Field.CALENDARID));
        JsonObject pushNotif = new JsonObject()
                .put("title", accepted ? "push.notif.booking.proposal.accepted" : "push.notif.booking.proposal.refused")
                .put("body", sender.getUsername() + " " + I18n.getInstance().translate(
                        accepted ? "calendar.booking.proposal.accepted.push.notif.body" : "calendar.booking.proposal.refused.push.notif.body",
                        getHost(request), I18n.acceptLanguage(request)));
        params.put("pushNotif", pushNotif);

        notification.notifyTimeline(request, template, sender, Collections.singletonList(recipientUserId),
                proposal.getString(Field.CALENDARID), proposal.getString(Field.EVENTID_CAMEL), params, true);
    }
}
