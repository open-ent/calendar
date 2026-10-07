/*
 * Copyright © Région Nord Pas de Calais-Picardie,  Département 91, Région Aquitaine-Limousin-Poitou-Charentes, 2016.
 *
 * This file is part of OPEN ENT NG. OPEN ENT NG is a versatile ENT Project based on the JVM and ENT Core Project.
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation (version 3 of the License).
 *
 * For the sake of explanation, any module that communicate over native
 * Web protocols, such as HTTP, with OPEN ENT NG is outside the scope of this
 * license and could be license under its own terms. This is merely considered
 * normal use of OPEN ENT NG, and does not fall under the heading of "covered work".
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 */

package net.atos.entng.calendar.controllers;

import fr.wseduc.bus.BusAddress;
import fr.wseduc.rs.*;
import fr.wseduc.security.ActionType;
import fr.wseduc.security.SecuredAction;
import fr.wseduc.webutils.Either;
import fr.wseduc.webutils.I18n;
import fr.wseduc.webutils.http.Renders;
import fr.wseduc.webutils.request.RequestUtils;
import io.vertx.core.Future;
import io.vertx.core.Handler;
import io.vertx.core.Promise;
import io.vertx.core.Vertx;
import io.vertx.core.eventbus.EventBus;
import io.vertx.core.eventbus.Message;
import io.vertx.core.http.HttpServerRequest;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import net.atos.entng.calendar.core.constants.Actions;
import net.atos.entng.calendar.core.constants.Field;
import net.atos.entng.calendar.core.constants.Rights;
import net.atos.entng.calendar.core.enums.ErrorEnum;
import net.atos.entng.calendar.core.enums.ExternalICalEventBusActions;
import net.atos.entng.calendar.helpers.CalendarHelper;
import net.atos.entng.calendar.helpers.EventBusHelper;
import net.atos.entng.calendar.helpers.PlatformHelper;
import net.atos.entng.calendar.models.CalendarModel;
import net.atos.entng.calendar.security.AdminOfCalendarStructure;
import net.atos.entng.calendar.security.ShareEventConf;
import net.atos.entng.calendar.models.User;
import net.atos.entng.calendar.services.CalendarService;
import net.atos.entng.calendar.services.EventServiceMongo;
import net.atos.entng.calendar.services.ServiceFactory;
import net.atos.entng.calendar.services.UserService;
import net.atos.entng.calendar.services.impl.EventServiceMongoImpl;
import net.atos.entng.calendar.utils.DateUtils;
import org.entcore.common.events.EventHelper;
import org.entcore.common.events.EventStore;
import org.entcore.common.events.EventStoreFactory;
import org.entcore.common.http.filter.ResourceFilter;
import org.entcore.common.http.filter.SuperAdminFilter;
import org.entcore.common.http.filter.Trace;
import org.entcore.common.mongodb.MongoDbConf;
import org.entcore.common.mongodb.MongoDbControllerHelper;
import org.entcore.common.neo4j.Neo4j;
import org.entcore.common.service.VisibilityFilter;
import org.entcore.common.user.UserInfos;
import org.entcore.common.user.UserUtils;
import org.vertx.java.core.http.RouteMatcher;

import java.util.*;
import java.util.stream.Collectors;

import static org.entcore.common.http.response.DefaultResponseHandler.arrayResponseHandler;
import static org.entcore.common.neo4j.Neo4jResult.validResultsHandler;
import static org.entcore.common.neo4j.Neo4jResult.validUniqueResultHandler;

public class CalendarController extends MongoDbControllerHelper {
    static final String RESOURCE_NAME = "agenda";
    // Used for module "statistics"
    private final EventHelper eventHelper;
    private final CalendarService calendarService;

    private final CalendarHelper calendarHelper;
    private final PlatformHelper platformHelper;
    private final EventServiceMongo eventServiceMongo;
    private final UserService userService;
    private final Neo4j neo4j = Neo4j.getInstance();

    /** IHM par défaut : "react" (nouvelle) ou "angular" (ancienne), pilotée par la conf `frontend-ui`
     *  (bloc du module dans ent-core.yaml, alimentée par FRONTEND_UI_DEFAULT).
     *  Défaut "react" : la migration React (CCTP 51C) a la parité (agenda jour/semaine/mois,
     *  calendriers + événements CRUD, partage calendrier + événement).
     *  NB : launcher-next conserve la clé `frontend-ui` (bloc `config:` stocké verbatim) ; le fallback
     *  Java "react" ne s'applique que si la conf est absente. Override par `?ui=react|angular`. */
    private String frontendUi = "react";

    @Override
    public void init(Vertx vertx, JsonObject config, RouteMatcher rm,
                     Map<String, fr.wseduc.webutils.security.SecuredAction> securedActions) {
        super.init(vertx, config, rm, securedActions);
        this.frontendUi = "angular".equals(config.getString("frontend-ui", "react")) ? "angular" : "react";
    }

    public CalendarController(String collection, ServiceFactory serviceFactory, EventBus eb, JsonObject config) {
        super(collection);
        this.calendarService = serviceFactory.calendarService();
        final EventStore eventStore = EventStoreFactory.getFactory().getEventStore(Calendar.class.getSimpleName());
        this.eventHelper = new org.entcore.common.events.EventHelper(eventStore);
        this.calendarHelper = new CalendarHelper(collection, serviceFactory, eb, config);
        this.platformHelper = new PlatformHelper(serviceFactory);
        this.eventServiceMongo = new EventServiceMongoImpl(Field.CALENDAREVENT, eb, serviceFactory);
        this.userService = serviceFactory.userService();
    }

    @Get("/config")
    @SecuredAction(value = "", type = ActionType.RESOURCE)
    @ResourceFilter(SuperAdminFilter.class)
    public void getConfig(final HttpServerRequest request) {
        renderJson(request, config);
    }

    @Get("")
    @SecuredAction("calendar.view")
    public void view(HttpServerRequest request) {
        String host = getHost(request);
        String lang = I18n.acceptLanguage(request);
        // Choix de l'IHM (CCTP 51C — migration React) : défaut piloté par la conf `frontend-ui`
        // (react|angular, défaut angular), override par requête `?ui=react|angular`.
        // calendar.html = IHM AngularJS existante (défaut) ; calendar-react.html = nouvelle IHM React.
        final String uiParam = request.getParam("ui");
        final String ui = ("react".equals(uiParam) || "angular".equals(uiParam)) ? uiParam : frontendUi;
        final String view = "react".equals(ui) ? "calendar-react.html" : "calendar.html";
        UserUtils.getUserInfos(eb, request, user -> {
            if (user != null) {
                final JsonObject context = new JsonObject();
                context.put(Field.ENABLERBS, config.getBoolean(Field.ENABLE_RBS, false));
                context.put(Field.ENABLEZIMBRA, config.getBoolean(Field.ENABLE_ZIMBRA, false));
                context.put(Field.ENABLEREMINDER, config.getBoolean(Field.ENABLEREMINDER, false));
                calendarService.getDefaultCalendar(user)
                        .onSuccess(calendar -> {
                            if (calendar.isEmpty() || calendar.fieldNames().isEmpty()) {
                                calendarService.createDefaultCalendar(user, host, lang)
                                        .onSuccess(res -> renderView(request, context, view, null))
                                        .onFailure(err -> renderError(request));
                            } else {
                                renderView(request, context, view, null);
                            }
                            // Create event "access to application Calendar" and store it, for module "statistics"
                            eventHelper.onAccess(request);
                        })
                        .onFailure(err -> renderError(request));
            }
        });
    }

    /**
     * Retour utilisateur (chantier "vue consolidée EDT+RBS") : le titre générique "Agenda
     * d'établissement" est identique pour tous — sans le nom de l'établissement affiché dans
     * l'intitulé lui-même, impossible de distinguer visuellement SON PROPRE établissement d'un
     * établissement partagé par quelqu'un d'un AUTRE établissement (cas cross-établissement du
     * point B2). Reproduit ici le corps de {@code ControllerHelper#list(HttpServerRequest)}
     * (mêmes VisibilityFilter/crudService) en insérant une résolution Neo4j du nom
     * d'établissement (structureName) pour chaque agenda de type "structure" avant le rendu —
     * en un seul aller-retour Neo4j (ids distincts), jamais bloquant pour la liste elle-même en
     * cas d'échec (meilleur effort, comme le reste des enrichissements de ce module).
     */
    @Get("/calendars")
    @SecuredAction("calendar.view")
    public void listCalendars(final HttpServerRequest request) {
        UserUtils.getUserInfos(eb, request, user -> {
            String filter = request.params().get("filter");
            VisibilityFilter v = VisibilityFilter.ALL;
            if (filter != null) {
                try {
                    v = VisibilityFilter.valueOf(filter.toUpperCase());
                } catch (IllegalArgumentException | NullPointerException e) {
                    v = VisibilityFilter.ALL;
                }
            }
            crudService.list(v, user, addNormalizedRights((Either<String, JsonArray> either) -> {
                if (either.isRight()) {
                    enrichStructureNames(either.right().getValue())
                            .onComplete(ar -> arrayResponseHandler(request).handle(either));
                } else {
                    arrayResponseHandler(request).handle(either);
                }
            }));
        });
    }

    /**
     * Résout le nom de chaque établissement distinct présent parmi les agendas de type
     * "structure", pour affichage direct dans l'intitulé côté side-bar (retour utilisateur :
     * le titre générique "Agenda d'établissement" ne permettait pas de distinguer son propre
     * établissement d'un établissement partagé par quelqu'un d'un AUTRE établissement).
     * <p>
     * Une requête PAR établissement distinct (motif {@code s.id = {id}} déjà éprouvé, cf.
     * {@code DefaultGroupService#getInfos}) plutôt qu'un seul {@code WHERE s.id IN {ids}} :
     * cette dernière forme, testée en direct (cypher-shell, HTTP brut) fonctionne bien contre
     * Neo4j lui-même, mais renvoie systématiquement un résultat vide en passant par le client
     * {@code Neo4j.execute(...)} de ce socle — anomalie non résolue (possible souci de
     * sérialisation du paramètre liste par ce client précis), contournée ici plutôt
     * qu'approfondie plus avant (nombre d'établissements distincts par utilisateur toujours
     * très faible en pratique, un aller-retour par id reste négligeable).
     */
    private Future<Void> enrichStructureNames(JsonArray calendars) {
        Set<String> structureIds = new HashSet<>();
        for (Object o : calendars) {
            JsonObject calendar = (JsonObject) o;
            String structureId = calendar.getString(Field.STRUCTUREID);
            if (Field.TYPE_STRUCTURE.equals(calendar.getString(Field.type)) && structureId != null) {
                structureIds.add(structureId);
            }
        }
        if (structureIds.isEmpty()) {
            return Future.succeededFuture();
        }
        String query = "MATCH (s:Structure {id:{id}}) RETURN s.name as name";
        List<Future<Void>> lookups = new ArrayList<>();
        for (String structureId : structureIds) {
            Promise<Void> lookup = Promise.promise();
            lookups.add(lookup.future());
            JsonObject params = new JsonObject().put("id", structureId);
            neo4j.execute(query, params, validUniqueResultHandler(res -> {
                if (res.isRight() && res.right().getValue() != null) {
                    String name = res.right().getValue().getString("name");
                    if (name != null) {
                        for (Object o : calendars) {
                            JsonObject calendar = (JsonObject) o;
                            if (structureId.equals(calendar.getString(Field.STRUCTUREID))) {
                                calendar.put("structureName", name);
                            }
                        }
                    }
                }
                lookup.complete();
            }));
        }
        return Future.join(lookups).map((Void) null);
    }

    @Get("/calendars/:id")
    @SecuredAction(Rights.GET)
    @Trace(Actions.GET_CALENDAR)
    public void getCalendar(HttpServerRequest request) {
        UserUtils.getUserInfos(eb, request, user -> {
            if (user == null) {
                unauthorized(request);
                return;
            }
            final String id = request.params().get(Field.ID);
            if (id == null || id.trim().isEmpty()) {
                badRequest(request);
                return;
            }
            calendarService.list(Collections.singletonList(id), true, user.getUserId())
                    .onSuccess(result -> {
                        if (result != null && result.size() == 0) {
                            String message = String.format("[Calendar@%s::getCalendar] An error has occured :" +
                                    " could not retrieve calendar", this.getClass().getSimpleName());
                            log.error(message);
                            renderError(request);
                        } else {
                            Renders.renderJson(request, new JsonObject().put(Field.CALENDAR, result));
                        }
                    })
                    .onFailure(error -> {
                        String message = String.format("[Calendar@%s::getCalendar] An error has occured" +
                                " when getting calendar: %s", this.getClass().getSimpleName(), error.getMessage());
                        log.error(message, error.getMessage());
                        renderError(request);
                    });
        });
    }

    @Post("/calendars")
    @SecuredAction("calendar.create")
    @Trace(Actions.CREATE_CALENDAR)
    public void createCalendar(final HttpServerRequest request) {
        RequestUtils.bodyToJson(request, pathPrefix + "calendar", object -> {
            super.create(request, r -> {
                if (r.succeeded()) {
                    eventHelper.onCreateResource(request, RESOURCE_NAME);
                }
            });
        });
    }

    /**
     * Création d'un agenda d'établissement. Droit workflow dédié « calendar.structure » (par défaut
     * aux chefs d'établissement, attribuable aux admins locaux via la console). Le corps porte
     * type="structure" + structureId ; le partage aux membres de la structure se fait via l'endpoint
     * de partage existant (PUT /calendar/share/json/:id), réutilisable par n'importe quelle IHM.
     */
    @Post("/calendars/structure")
    @SecuredAction("calendar.structure")
    @Trace(Actions.CREATE_CALENDAR)
    public void createStructureCalendar(final HttpServerRequest request) {
        RequestUtils.bodyToJson(request, pathPrefix + "calendar", object -> {
            super.create(request, r -> {
                if (r.succeeded()) {
                    eventHelper.onCreateResource(request, RESOURCE_NAME);
                }
            });
        });
    }

    /**
     * Création d'un agenda de groupe. Droit workflow dédié « calendar.group » (par défaut chefs +
     * admins + enseignants). Le corps porte type="group" + groupId ; le partage au groupe se fait
     * via l'endpoint de partage existant, réutilisable par n'importe quelle IHM.
     */
    @Post("/calendars/group")
    @SecuredAction("calendar.group")
    @Trace(Actions.CREATE_CALENDAR)
    public void createGroupCalendar(final HttpServerRequest request) {
        RequestUtils.bodyToJson(request, pathPrefix + "calendar", object -> {
            super.create(request, r -> {
                if (r.succeeded()) {
                    eventHelper.onCreateResource(request, RESOURCE_NAME);
                }
            });
        });
    }

    @Put("/:id")
    @SecuredAction(value = "calendar.manager", type = ActionType.RESOURCE)
    @Trace(Actions.UPDATE_CALENDAR)
    public void updateCalendar(final HttpServerRequest request) {
        RequestUtils.bodyToJson(request, pathPrefix + "calendar", new Handler<JsonObject>() {
            @Override
            public void handle(JsonObject event) {
                update(request);
            }
        });
    }

    /**
     * Point C (chantier "vue consolidée EDT+RBS") : droit de partage granulaire "associer une
     * réservation RBS (salle/matériel mobile) à un événement" — distinct du droit de contribution
     * général. Le socle ENT n'accepte que 5 rôles de partage figés (read/contrib/manager/publish/
     * comment, cf. {@code org.entcore.common.share.ShareRoles}) : impossible d'ajouter un rôle
     * personnalisé "booking" au panneau de partage générique. Stocké donc en dehors de ce
     * mécanisme, comme un champ dédié {@code bookingRights} sur le document du calendrier (liste de
     * {@code {userId}}/{@code {groupId}}), réservé au propriétaire/gestionnaire de l'agenda — le
     * corps REMPLACE la liste complète (même patron que {@code shareCalendarSubmit}, pas un ajout
     * incrémental). Lu par {@code EventHelper#resolveCalendarRights} pour le blocage/proposition
     * d'une NOUVELLE réservation par un collaborateur non-propriétaire (cf. point B2).
     */
    /**
     * Point C (suite) : liste les COLLABORATEURS individuels actuellement partagés sur cet agenda
     * (extraits de {@code shared}, noms résolus via {@code userService.fetchUser}) avec leur droit
     * de réservation actuel — alimente la case à cocher dédiée du panneau de partage (le composant
     * générique `share-panel` du socle ne permet pas d'exposer ce champ personnalisé). Les groupes
     * partagés (pas de nom individuel à résoudre simplement) ne sont pas listés ici — hors scope
     * MVP, le droit de réservation via un GROUPE reste accordable par id brut sur l'endpoint PUT.
     */
    @Get("/:id/booking-rights")
    @ApiDoc("Liste les collaborateurs partagés sur cet agenda avec leur droit de réservation actuel.")
    @SecuredAction(value = "calendar.manager", type = ActionType.RESOURCE)
    public void getBookingRights(final HttpServerRequest request) {
        String calendarId = request.params().get("id");
        UserUtils.getAuthenticatedUserInfos(eb, request).onSuccess(user -> {
            calendarService.list(Collections.singletonList(calendarId)).onSuccess(res -> {
                if (res == null || res.isEmpty()) {
                    renderJson(request, new JsonArray());
                    return;
                }
                JsonObject calendar = (JsonObject) res.getValue(0);
                JsonArray shared = calendar.getJsonArray(Field.shared, new JsonArray());
                JsonArray bookingRights = calendar.getJsonArray(Field.BOOKINGRIGHTS, new JsonArray());
                Set<String> grantedUserIds = bookingRights.stream()
                        .map(o -> (JsonObject) o)
                        .map(o -> o.getString(Field.USERID))
                        .filter(Objects::nonNull)
                        .collect(Collectors.toSet());
                List<String> sharedUserIds = shared.stream()
                        .map(o -> (JsonObject) o)
                        .map(o -> o.getString(Field.USERID))
                        .filter(Objects::nonNull)
                        .distinct()
                        .collect(Collectors.toList());
                if (sharedUserIds.isEmpty()) {
                    renderJson(request, new JsonArray());
                    return;
                }
                userService.fetchUser(sharedUserIds, user, false).onSuccess(users -> {
                    JsonArray result = new JsonArray();
                    users.forEach(u -> result.add(new JsonObject()
                            .put(Field.USERID, u.id())
                            .put(Field.DISPLAYNAME, u.displayName())
                            .put(Field.HASBOOKINGRIGHT, grantedUserIds.contains(u.id()))));
                    renderJson(request, result);
                }).onFailure(err -> renderError(request));
            }).onFailure(err -> renderError(request));
        });
    }

    @Put("/:id/booking-rights")
    @ApiDoc("Définit la liste des utilisateurs/groupes autorisés à associer une réservation RBS sur cet agenda partagé.")
    @SecuredAction(value = "calendar.manager", type = ActionType.RESOURCE)
    public void updateBookingRights(final HttpServerRequest request) {
        String calendarId = request.params().get("id");
        RequestUtils.bodyToJson(request, body -> {
            JsonArray bookingRights = new JsonArray();
            body.getJsonArray("userIds", new JsonArray()).forEach(userId ->
                    bookingRights.add(new JsonObject().put(Field.USERID, userId)));
            body.getJsonArray("groupIds", new JsonArray()).forEach(groupId ->
                    bookingRights.add(new JsonObject().put(Field.groupId, groupId)));

            calendarService.update(calendarId, new JsonObject().put(Field.BOOKINGRIGHTS, bookingRights))
                    .onSuccess(v -> renderJson(request, bookingRights))
                    .onFailure(err -> renderError(request));
        });
    }

    @Delete("/:id")
    @SecuredAction(value = "calendar.manager", type = ActionType.RESOURCE)
    @Trace(Actions.DELETE_CALENDAR)
    public void deleteCalendar(HttpServerRequest request) {
        String calendarId = request.params().get("id");
        calendarService.isDefaultCalendar(calendarId)
                .onSuccess(res -> {
                    if (Boolean.FALSE.equals(res)) {
                        delete(request);
                    } else {
                        forbidden(request, I18n.getInstance().translate("cannot.delete.default.calendar", getHost(request), I18n.acceptLanguage(request)));
                    }
                })
                .onFailure(err -> renderError(request));
    }

    @Post("/url")
    @SecuredAction(Rights.SYNC)
    @Trace(Actions.IMPORT_EXTERNAL_CALENDAR)
    public void importExternalCalendar(final HttpServerRequest request) {
        UserUtils.getUserInfos(eb, request, user -> {
            if (user == null) {
                unauthorized(request);
                return;
            }
            RequestUtils.bodyToJson(request, pathPrefix + "calendar", body -> {
                platformHelper.checkCalendarPlatform(user, body)
                        .compose(isPlatformAccepted -> {
                            if (isPlatformAccepted) {
                                return createFuture(user, body);
                            } else {
                                return Future.failedFuture("URL not authorized");
                            }
                        })
                        .compose(calendar -> {
                            String host = getHost(request);
                            String i18nLang = I18n.acceptLanguage(request);
                            return calendarHelper.externalCalendarSync(calendar.getString(Field._ID, null),
                                            user, host, i18nLang, ExternalICalEventBusActions.POST.method())
                                    .onFailure(error -> {
                                        calendarService.delete(calendar.getString(Field._ID));
                                        eventServiceMongo.deleteByCalendarId(calendar.getString(Field._ID));
                                    });
                        })
                        .onSuccess(result -> Renders.ok(request))
                        .onFailure(error -> {
                            String errorMessage = error.getMessage();
                            String message = String.format("[Calendar@%s::importExternalCalendar] An error has occurred" +
                                    " during calendar sync: %s", this.getClass().getSimpleName(), errorMessage);
                            log.error(message, errorMessage);
                            if (errorMessage.equals(ErrorEnum.URL_NOT_AUTHORIZED.method())
                                    || errorMessage.equals(ErrorEnum.PLATFORM_ALREADY_EXISTS.method())) {
                                unauthorized(request, errorMessage);
                            } else {
                                renderError(request);

                            }
                        });
            });
        });
    }

    Future<JsonObject> createFuture(UserInfos user, JsonObject body) {
        Promise<JsonObject> promise = Promise.promise();

        crudService.create(body, user, r -> {
            if (r.isLeft()) {
                String message = String.format("[Calendar@%s::createFuture] An error has occurred" +
                        " during calendar creation: %s", this.getClass().getSimpleName(), r.left().getValue());
                log.error(message, r.left().getValue());
                promise.fail(message);
            } else {
                promise.complete(r.right().getValue());
            }
        });

        return promise.future();
    }

    @Put("/:id/url")
    @SecuredAction(Rights.UPDATE)
    @Trace(Actions.SYNC_EXTERNAL_CALENDAR)
    public void syncExternalCalendar(final HttpServerRequest request) {
        String calendarId = request.params().get(Field.ID);
        if (calendarId == null) {
            badRequest(request);
            return;
        }
        UserUtils.getUserInfos(eb, request, user -> {
            if (user == null) {
                unauthorized(request);
                return;
            }
            String host = getHost(request);
            String i18nLang = I18n.acceptLanguage(request);
            calendarHelper.externalCalendarSync(calendarId,
                            user, host, i18nLang, ExternalICalEventBusActions.PUT.method())
                    .onSuccess(result -> {
                        Renders.ok(request);
                    })
                    .onFailure(error -> {
                        String message = String.format("[Calendar@%s::syncExternalCalendar] An error has occurred" +
                                " during calendar sync: %s", this.getClass().getSimpleName(), error.getMessage());
                        log.error(message, error.getMessage());
                        if((error.getMessage() != null ) && error.getMessage().equals("[Calendar@CalendarHelper::prepareCalendarAndEventsForUpdate]:  last update was too recent")) {
                            unauthorized(request, config.getLong(Field.CALENDARSYNCTTL, 3600L).toString());
                        } else {
                            renderError(request);
                        }
                    });
        });

    }

    @Get("/:id/url")
    @SecuredAction(Rights.CHECKUPDATE)
    @Trace(Actions.CHECK_EXTERNAL_CALENDAR)
    public void checkSyncExternalCalendar(final HttpServerRequest request) {
        String calendarId = request.params().get(Field.ID);
        if (calendarId == null) {
            badRequest(request);
            return;
        }
        calendarService.checkBooleanField(calendarId, Field.ISUPDATING)
                .onSuccess(result -> {
                    Renders.renderJson(request, new JsonObject().put(Field.ISUPDATING, result));
                })
                .onFailure(err -> {
                    log.error("[Calendar@CalendarController::checkSyncExternalCalendar]: an error has occurred while checking calendar: ",
                            err.getMessage());
                    Renders.renderError(request);
                });
    }

    /**
     * Publie l'agenda d'établissement sur le portail public : ses événements deviennent
     * accessibles sans authentification via le flux ICS anonyme {@code GET /pub/:id/events.ics}.
     * Réservé à un ADML de la structure propriétaire de l'agenda (ou super-admin), cf.
     * {@link AdminOfCalendarStructure}.
     */
    @Put("/:id/portal-publish")
    @ApiDoc("Publish a structure calendar's events as a public ICS feed on the school's public portal.")
    @ResourceFilter(AdminOfCalendarStructure.class)
    @SecuredAction(value = "calendar.manager", type = ActionType.RESOURCE)
    @Trace(Actions.PORTAL_PUBLISH_CALENDAR)
    public void portalPublish(final HttpServerRequest request) {
        final String id = request.params().get(Field.ID);
        UserUtils.getUserInfos(eb, request, user -> {
            if (user == null) {
                unauthorized(request);
                return;
            }
            calendarService.setPortalPublication(id, true, user.getUserId())
                    .onSuccess(res -> Renders.ok(request))
                    .onFailure(err -> renderError(request));
        });
    }

    /** Dépublie l'agenda d'établissement du portail public. Même garde que {@link #portalPublish}. */
    @Delete("/:id/portal-publish")
    @ApiDoc("Unpublish a structure calendar from the public portal.")
    @ResourceFilter(AdminOfCalendarStructure.class)
    @SecuredAction(value = "calendar.manager", type = ActionType.RESOURCE)
    @Trace(Actions.PORTAL_UNPUBLISH_CALENDAR)
    public void portalUnpublish(final HttpServerRequest request) {
        final String id = request.params().get(Field.ID);
        calendarService.setPortalPublication(id, false, null)
                .onSuccess(res -> Renders.ok(request))
                .onFailure(err -> renderError(request));
    }

    @Get("/share/json/:id")
    @ApiDoc("Share calendar by id.")
    @ResourceFilter(ShareEventConf.class)
    @SecuredAction(value = "calendar.manager", type = ActionType.RESOURCE)
    public void shareCalendar(final HttpServerRequest request) {
        shareJson(request, false);

        final MongoDbConf confEvent = MongoDbConf.getInstance();
        confEvent.setCollection(net.atos.entng.calendar.Calendar.CALENDAR_COLLECTION);
        confEvent.setResourceIdLabel("id");
    }

    @Put("/share/json/:id")
    @ApiDoc("Share calendar by id.")
    @SecuredAction(value = "calendar.manager", type = ActionType.RESOURCE)
    @Trace(Actions.SHARE_CALENDAR_SUBMIT)
    public void shareCalendarSubmit(final HttpServerRequest request) {
        UserUtils.getUserInfos(eb, request, user -> {
            if (user != null) {
                final String id = request.params().get("id");
                if (id == null || id.trim().isEmpty()) {
                    badRequest(request);
                    return;
                }

                JsonObject params = new JsonObject();
                params.put("profilUri", "/userbook/annuaire#" + user.getUserId() + "#" + user.getType());
                params.put("username", user.getUsername());
                params.put("calendarUri", "/calendar#/view/" + id);
                params.put("resourceUri", params.getString("calendarUri"));
                JsonObject pushNotif = new JsonObject()
                        .put("title", "push.notif.calendar.share")
                        .put("body", user.getUsername() + " " + I18n.getInstance().translate("calendar.shared.push.notif.body",
                                getHost(request), I18n.acceptLanguage(request)));

                params.put("pushNotif", pushNotif);
                shareJsonSubmit(request, "calendar.share", false, params, "title");
            }
        });
    }

    @Put("/share/remove/:id")
    @ApiDoc("Remove calendar by id.")
    @SecuredAction(value = "calendar.manager", type = ActionType.RESOURCE)
    @Trace(Actions.SHARE_CALENDAR_REMOVE)
    public void removeShareCalendar(final HttpServerRequest request) {
        removeShare(request, false);
    }

    @Put("/share/resource/:id")
    @ApiDoc("Share calendar by id.")
    @ResourceFilter(ShareEventConf.class)
    @SecuredAction(value = "calendar.manager", type = ActionType.RESOURCE)
    @Trace(Actions.SHARE_CALENDAR)
    public void shareResource(final HttpServerRequest request) {
        UserUtils.getUserInfos(eb, request, user -> {
            if (user != null) {
                final String id = request.params().get("id");
                if (id == null || id.trim().isEmpty()) {
                    badRequest(request, "invalid.id");
                    return;
                }
                request.pause();
                calendarService.hasExternalCalendarId(Collections.singletonList(id))
                        .onSuccess(isExternal -> {
                            if(Boolean.FALSE.equals(isExternal)) {
                                calendarService.isDefaultCalendar(id)
                                        .onSuccess(res -> {
                                            request.resume();
                                            if (Boolean.FALSE.equals(res)) {
                                                JsonObject params = new JsonObject();
                                                params.put(Field.PROFILURI, "/userbook/annuaire#" + user.getUserId() + "#" + user.getType());
                                                params.put(Field.USERNAME, user.getUsername());
                                                params.put(Field.CALENDARURI, "/calendar#/view/" + id);
                                                params.put(Field.RESOURCEURI, params.getString(Field.CALENDARURI));

                                                JsonObject pushNotif = new JsonObject()
                                                        .put(Field.TITLE, "push.notif.calendar.share")
                                                        .put(Field.BODY, user.getUsername() + " " + I18n.getInstance().translate("calendar.shared.push.notif.body",
                                                                getHost(request), I18n.acceptLanguage(request)));

                                                params.put(Field.PUSHNOTIF, pushNotif);
                                                shareResource(request, "calendar.share", false, params, Field.TITLE);

                                            } else {
                                                unauthorized(request);
                                            }
                                        })
                                        .onFailure(err -> {
                                            request.resume();
                                            renderError(request);
                                        });
                            } else {
                                unauthorized(request);
                            }
                        })
                        .onFailure(err -> {
                            renderError(request);
                        });
            } else {
                unauthorized(request);
            }
        });
    }

    private void proceedOnShare(HttpServerRequest request, UserInfos user) {
        if (user != null) {
            final String id = request.params().get("id");
            if (id == null || id.trim().isEmpty()) {
                badRequest(request, "invalid.id");
                return;
            }

            JsonObject params = new JsonObject();
            params.put("profilUri", "/userbook/annuaire#" + user.getUserId() + "#" + user.getType());
            params.put("username", user.getUsername());
            params.put("calendarUri", "/calendar#/view/" + id);
            params.put("resourceUri", params.getString("calendarUri"));

            JsonObject pushNotif = new JsonObject()
                    .put("title", "push.notif.calendar.share")
                    .put("body", user.getUsername() + " " + I18n.getInstance().translate("calendar.shared.push.notif.body",
                            getHost(request), I18n.acceptLanguage(request)));

            params.put("pushNotif", pushNotif);

            shareResource(request, "calendar.share", false, params, "title");
        }
    }

    @BusAddress("net.atos.entng.calendar")
    public void calendarEventBusHandler(Message<JsonObject> message) {
        String action = message.body().getString(Field.ACTION, "");
        switch (action) {
            case "zimbra-platform-ics":
                //with logs
                JsonObject data = message.body().getJsonObject(Field.RESULT);
                String ical = data.getString(Field.ICS, "");
                String userId = data.getString(Field.USERID, "");
                String platform = data.getString(Field.PLATFORM, "");

                UserUtils.getUserInfos(eb, userId, user -> {
                    if (user == null) {
                        String errMessage = String.format("[Calendar@%s::calendarEventBusHandler]: get-platform-ics : error during ical retrieval: " +
                                "could not find user", this.getClass().getSimpleName());
                        EventBusHelper.eventBusError(errMessage, ErrorEnum.ZIMBRA_NO_USER.method(), message);
                    }

                    JsonObject params = new JsonObject();
                    String local = null;
                    try {
                        String systemDomainLanguage = (String) ((LinkedHashMap<?, ?>) user.getAttribute(Field.PREFERENCES)).get(Field.LANGUAGE);
                        String systemDomain = systemDomainLanguage != null ? new JsonObject(systemDomainLanguage).getString(Field.DEFAULT_DOMAIN, null) : null;
                        local = systemDomain != null ? systemDomain : "fr";
                    } catch (Exception ignored) {
                        String errMessage = String.format("[Calendar@%s::calendarEventBusHandler]: case 'zimbra-platform-ics': " +
                                        "an error has occurred while getting system language: %s",
                                this.getClass().getSimpleName(), ignored.getMessage());
                        log.error(errMessage);
                        EventBusHelper.eventBusError(errMessage, ErrorEnum.NO_LOCAL_LANGUAGE.method(), message);
                        local = "fr";
                    }
                    JsonObject requestInfo = new JsonObject().put(Field.DOMAIN, Field.DEFAULT_DOMAIN).put(Field.ACCEPTLANGUAGE, local);

                    calendarService.getPlatformCalendar(user, platform)
                            .compose(calendar -> {
                                params.put(Field.CALENDAR, calendar);
                                CalendarModel calendarInfo = new CalendarModel(calendar);
                                boolean isUpdate = (calendarInfo.updated() != null);
                                return isUpdate ? eventServiceMongo.importIcal(calendarInfo.id(), ical, user, requestInfo,
                                        Field.CALENDAREVENT, ExternalICalEventBusActions.SYNC.method(), calendarInfo.updated())
                                        : eventServiceMongo.importIcal(calendarInfo.id(), ical, user, requestInfo,
                                        Field.CALENDAREVENT);
                            })
                            .compose(object -> calendarHelper.updateExternalCalendar(params, params.getJsonObject(Field.CALENDAR, new JsonObject()), false))
                            .onSuccess(result -> message.reply(new JsonObject().put(Field.STATUS, Field.OK).put(Field.RESULT, new JsonObject()
                                    .put(Field.MESSAGE, ErrorEnum.ICAL_EVENTS_CREATED.method()))))
                            .onFailure(err -> {
                                String errMessage = String.format("[Calendar@%s::calendarEventBusHandler]: case 'zimbra-platform-ics': " +
                                                "an error has occurred while creating external calendar events: %s",
                                        this.getClass().getSimpleName(), err.getMessage());
                                log.error(errMessage);
                                EventBusHelper.eventBusError(errMessage, ErrorEnum.CALENDAR_ICAL_EVENT_CREATION_ERROR.method(), message);
                            });
                });
                break;
            case "create-event-from-booking": {
                // Symétrique du pont RbsHelper (calendar -> RBS à la création d'un événement avec
                // "réserver une ressource") : ici RBS notifie calendar qu'une réservation vient
                // d'être validée, pour qu'elle apparaisse dans l'agenda d'établissement. Dégradation
                // silencieuse si la structure n'a pas d'agenda de type "structure" — l'événement
                // n'est simplement pas créé, la réservation RBS elle-même n'est jamais affectée
                // (RBS ne dépend pas de la réponse : eb.send, pas eb.request).
                JsonObject body = message.body();
                String structureId = body.getString("structureId");
                String bookingUserId = body.getString(Field.USERID);

                UserUtils.getUserInfos(eb, bookingUserId, bookingUser -> {
                    if (bookingUser == null) {
                        log.error("[Calendar@CalendarController::calendarEventBusHandler]: case " +
                                "'create-event-from-booking': unknown user " + bookingUserId);
                        return;
                    }
                    calendarService.findStructureCalendar(structureId)
                            .onSuccess(structureCalendar -> {
                                // Format produit par RBS (Postgres to_char "DD/MM/YY HH24:MI", cf.
                                // BookingServiceSqlImpl.DATE_FORMAT), pas un ISO standard.
                                Date startDate = DateUtils.parseDate(body.getString("startDate"), "dd/MM/yy HH:mm");
                                Date endDate = DateUtils.parseDate(body.getString("endDate"), "dd/MM/yy HH:mm");
                                if (startDate == null || endDate == null) {
                                    log.error("[Calendar@CalendarController::calendarEventBusHandler]: case " +
                                            "'create-event-from-booking': invalid dates");
                                    return;
                                }
                                JsonObject event = new JsonObject()
                                        .put(Field.TITLE, body.getString("title"))
                                        .put(Field.STARTMOMENT, DateUtils.dateToString(startDate))
                                        .put(Field.ENDMOMENT, DateUtils.dateToString(endDate))
                                        .put(Field.ALLDAY_LC, false)
                                        .put(Field.isRecurrent, false);
                                eventServiceMongo.create(structureCalendar.getString(Field._ID), event, bookingUser, createEvent -> {
                                    if (createEvent.isLeft()) {
                                        log.error("[Calendar@CalendarController::calendarEventBusHandler]: case " +
                                                "'create-event-from-booking': failed to create event: " + createEvent.left().getValue());
                                    }
                                });
                            })
                            .onFailure(err -> log.info("[Calendar@CalendarController::calendarEventBusHandler]: case " +
                                    "'create-event-from-booking': no structure calendar for structure " + structureId +
                                    " (booking not mirrored, this is not an error)"));
                });
                break;
            }
            default:
                String errMessage = String.format("[Calendar@%s::calendarEventBusHandler]: " +
                                "no action defined",
                        this.getClass().getSimpleName());
                log.error(errMessage);
                message.reply(errMessage);
                break;
        }
    }

}
