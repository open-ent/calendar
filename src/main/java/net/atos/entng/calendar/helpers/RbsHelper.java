package net.atos.entng.calendar.helpers;

import fr.wseduc.webutils.http.Renders;
import io.vertx.core.Future;
import io.vertx.core.Promise;
import io.vertx.core.eventbus.EventBus;
import io.vertx.core.http.HttpServerRequest;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.core.logging.Logger;
import io.vertx.core.logging.LoggerFactory;
import net.atos.entng.calendar.core.constants.Field;
import net.atos.entng.calendar.core.enums.RbsEventBusActions;
import org.entcore.common.user.UserInfos;

import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import static net.atos.entng.calendar.helpers.FutureHelper.*;

public class RbsHelper {
    protected static final Logger log = LoggerFactory.getLogger(Renders.class);

    public static Future<Void> saveBookingsInRbs(HttpServerRequest request, JsonObject object, UserInfos user, JsonObject config, EventBus eb) {
        Promise<Void> promise = Promise.promise();

        Future<JsonArray> eventFuture = Future.succeededFuture();
        if (canEventHaveBooking(object, config)) {
            eventFuture = saveBookings(object, user, eb);
        }

        eventFuture
            .onComplete((res) -> {
                if(res.succeeded()) {
                    if (res.result() != null && !res.result().isEmpty()) {
                        object.put(Field.BOOKINGS, res.result());
                    } else {
                        object.remove(Field.BOOKINGS);
                        object.remove(Field.HASBOOKING);
                    }
                } else {
                    String message = String.format("[Calendar@RbsHelper::saveBookingsInRbs] An error has occured" +
                            " when saving bookings: %s", res.cause());
                    log.error(message, res.cause());
                    // Ne jamais persister une réservation fictive (sans id RBS réel) suite à un
                    // échec de création : retirer le champ plutôt que de laisser croire à l'agenda
                    // qu'une réservation existe alors qu'elle n'a jamais été créée côté RBS.
                    object.remove(Field.BOOKINGS);
                    object.remove(Field.HASBOOKING);
                }
                // BUG CORRIGÉ : cette Promise n'était jamais résolue en cas d'échec (ni complete()
                // ni fail() appelé dans la branche ci-dessus) — tout appelant restait bloqué
                // indéfiniment dès qu'une création RBS échouait (confirmé par un blocage réel de
                // 30s+ lors des tests de synchronisation à la modification, cf. syncBookingsOnUpdate).
                // Toujours résoudre en succès : une réservation RBS en échec ne doit jamais bloquer
                // la sauvegarde de l'événement lui-même (avertissement non bloquant, cohérent avec
                // le reste de ce fichier).
                promise.complete();
            });

        return promise.future();
    }

    /**
     * Checks if module has RBS booking right and if bookings can be saved
     * @param object the event to be saved
     * @return true if the bookings can be saved
     */
    public static boolean canEventHaveBooking(JsonObject object, JsonObject config) {
        return Boolean.TRUE.equals(config.getBoolean(Field.ENABLE_RBS))
                && Boolean.TRUE.equals(object.getBoolean(Field.HASBOOKING))
                && (object.getJsonArray(Field.BOOKINGS).size() > 0);
    }

    /**
     * Sends bookings to RBS to save them
     * @param object the event
     * @param user the user
     * @return true if the bookings are correctly saved
     */
    public static Future<JsonArray> saveBookings(JsonObject object, UserInfos user, EventBus eb) {
        Promise<JsonArray> promise = Promise.promise();
        JsonObject action = new JsonObject()
                .put(Field.ACTION, RbsEventBusActions.SAVE_BOOKINGS.method())
                .put(Field.BOOKINGS, object
                        .getJsonArray(Field.BOOKINGS, null))
                .put(Field.userId, user.getUserId());
        eb.request(RbsEventBusActions.rbsAddress, action, messageJsonArrayHandler(handlerJsonArray(promise)));

        return promise.future();
    }

    /**
     * Calcule le diff par id RBS entre l'état existant ({@code oldBookings}, vide en création) et le
     * payload reçu ({@code newBookings}) — fonction PURE, aucun appel RBS. Extraite de
     * {@link #syncBookingsOnUpdate} pour être réutilisée par {@code EventHelper.create()}/
     * {@code update()} au moment de décider si une NOUVELLE réservation (point C, droit de partage
     * granulaire "calendar.booking") doit être bloquée, mise en proposition (B2) ou créée
     * directement — sans toucher aux réservations déjà existantes ({@code toKeep}) ni aux
     * suppressions ({@code idsToDelete}), toujours autorisées indépendamment de ce droit.
     */
    public static JsonObject diffBookings(JsonArray oldBookings, JsonArray newBookings) {
        JsonArray oldB = oldBookings == null ? new JsonArray() : oldBookings;
        JsonArray newB = newBookings == null ? new JsonArray() : newBookings;

        Set<Integer> oldIds = new HashSet<>();
        for (Object o : oldB) {
            Integer id = ((JsonObject) o).getInteger(Field.ID, null);
            if (id != null) {
                oldIds.add(id);
            }
        }

        JsonArray toKeep = new JsonArray();
        JsonArray toCreate = new JsonArray();
        Set<Integer> keptIds = new HashSet<>();
        for (Object o : newB) {
            JsonObject booking = (JsonObject) o;
            Integer id = booking.getInteger(Field.ID, null);
            if (id != null && oldIds.contains(id)) {
                toKeep.add(booking);
                keptIds.add(id);
            } else {
                toCreate.add(booking);
            }
        }

        JsonArray idsToDelete = new JsonArray();
        for (Integer oldId : oldIds) {
            if (!keptIds.contains(oldId)) {
                idsToDelete.add(new JsonObject().put(Field.ID, oldId));
            }
        }

        return new JsonObject()
                .put(Field.TOKEEP, toKeep)
                .put(Field.TOCREATE, toCreate)
                .put(Field.IDSTODELETE, idsToDelete);
    }

    /**
     * Synchronise réellement RBS lors de la modification d'un événement DÉJÀ enregistré.
     * <p>
     * Jusqu'ici, {@code EventHelper.update()} ne touchait jamais RBS (contrairement à
     * {@code create()}/{@code delete()}) : le document Mongo de l'événement pouvait donc afficher
     * une réservation qui ne correspondait à aucune ligne réelle dans {@code rbs.booking}. Le front
     * renvoie systématiquement la liste COMPLÈTE et actuelle des bookings (pas un diff) : chaque
     * entrée déjà existante porte son id RBS réel ({@code SavedBooking.id}), une entrée neuve n'en a
     * pas encore. On calcule donc ici le diff par id entre l'état Mongo avant modification et le
     * payload reçu, pour ne créer QUE les entrées réellement neuves — envoyer tel quel le tableau
     * complet à {@code saveBookingsInRbs} créerait un doublon en base pour chaque réservation déjà
     * existante (le module RBS fait toujours un INSERT, jamais un update-si-id-connu).
     *
     * @param request  la requête HTTP (i18n/host, requis par {@link #saveBookingsInRbs})
     * @param diff     le diff par id RBS précalculé (cf. {@link #diffBookings}) — {@code toCreate}
     *                 peut avoir été vidé par l'appelant (point C, droit "calendar.booking" refusé
     *                 ou réservation partie en proposition B2) sans affecter {@code toKeep}/
     *                 {@code idsToDelete}
     * @param object   le payload de la modification — MUTÉ : {@code bookings}/{@code hasBooking}
     *                 sont réécrits avec l'état réel après synchronisation RBS, pour que
     *                 {@code crudService.update} persiste la vérité plutôt que la simple demande
     *                 du client
     * @return la liste des échecs d'annulation RBS (jamais bloquant, cf. {@link #checkAndDeleteBookingRights})
     */
    public static Future<JsonArray> syncBookingsOnUpdate(HttpServerRequest request, JsonObject diff, JsonObject object,
                                                          UserInfos user, JsonObject config, EventBus eb) {
        JsonArray toKeep = diff.getJsonArray(Field.TOKEEP, new JsonArray());
        JsonArray toCreate = diff.getJsonArray(Field.TOCREATE, new JsonArray());
        JsonArray idsToDelete = diff.getJsonArray(Field.IDSTODELETE, new JsonArray());

        JsonObject creationPayload = object.copy();
        creationPayload.put(Field.BOOKINGS, toCreate);
        creationPayload.put(Field.HASBOOKING, !toCreate.isEmpty());

        return saveBookingsInRbs(request, creationPayload, user, config, eb)
                .compose(v -> {
                    JsonArray created = creationPayload.getJsonArray(Field.BOOKINGS, new JsonArray());
                    JsonArray finalBookings = toKeep.copy();
                    for (Object o : created) {
                        finalBookings.add(o);
                    }
                    object.put(Field.BOOKINGS, finalBookings);
                    object.put(Field.HASBOOKING, !finalBookings.isEmpty());

                    if (idsToDelete.isEmpty()) {
                        return Future.succeededFuture(new JsonArray());
                    }
                    JsonObject deletionEvent = new JsonObject().put(Field.BOOKINGS, idsToDelete);
                    return checkAndDeleteBookingRights(user, deletionEvent, eb)
                            .map(results -> {
                                JsonArray failed = new JsonArray();
                                for (Object o : results) {
                                    JsonObject result = (JsonObject) o;
                                    if (Field.ERROR.equals(result.getString(Field.STATUS))) {
                                        failed.add(result);
                                    }
                                }
                                return failed;
                            });
                });
    }

    public static Future<JsonArray> checkAndDeleteBookingRights(UserInfos user, JsonObject event, EventBus eb) {
        Promise<JsonArray> promise = Promise.promise();
        List<Integer> bookingIds = event
                .getJsonArray(Field.BOOKINGS, new JsonArray())
                .stream()
                .map(booking -> ((JsonObject)booking).getInteger(Field.ID, null))
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());

        JsonObject action = new JsonObject()
                .put(Field.ACTION, RbsEventBusActions.DELETE_BOOKINGS.method())
                .put(Field.BOOKINGS, bookingIds)
                .put(Field.userId, user.getUserId());

        eb.request(RbsEventBusActions.rbsAddress, action, messageJsonArrayHandler((handlerJsonArray(promise))));
        return promise.future();
    }
}
