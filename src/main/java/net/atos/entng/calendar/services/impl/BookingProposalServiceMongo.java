package net.atos.entng.calendar.services.impl;

import fr.wseduc.mongodb.MongoDb;
import fr.wseduc.mongodb.MongoQueryBuilder;
import fr.wseduc.mongodb.MongoUpdateBuilder;
import io.vertx.core.Future;
import io.vertx.core.Promise;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import io.vertx.core.logging.Logger;
import io.vertx.core.logging.LoggerFactory;
import net.atos.entng.calendar.core.constants.Field;
import net.atos.entng.calendar.core.enums.BookingProposalStatus;
import net.atos.entng.calendar.services.BookingProposalService;
import org.bson.conversions.Bson;

import java.text.SimpleDateFormat;
import java.util.TimeZone;
import java.util.UUID;

import static com.mongodb.client.model.Filters.eq;
import static org.entcore.common.mongodb.MongoDbResult.validResultHandler;
import static org.entcore.common.mongodb.MongoDbResult.validResultsHandler;

public class BookingProposalServiceMongo implements BookingProposalService {

    private final MongoDb mongo;
    private final String collection;
    protected static final Logger log = LoggerFactory.getLogger(BookingProposalServiceMongo.class);

    public BookingProposalServiceMongo(String collection, MongoDb mongo) {
        this.mongo = mongo;
        this.collection = collection;
    }

    private String nowIso() {
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
        sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
        return sdf.format(new java.util.Date());
    }

    @Override
    public Future<JsonObject> create(String calendarId, String eventId, JsonObject proposedBy, JsonObject owner, JsonArray bookingPayload) {
        Promise<JsonObject> promise = Promise.promise();

        JsonObject body = new JsonObject()
                .put(Field._ID, UUID.randomUUID().toString())
                .put(Field.CALENDARID, calendarId)
                .put(Field.EVENTID_CAMEL, eventId)
                .put(Field.PROPOSEDBY, proposedBy)
                .put(Field.OWNER, owner)
                .put(Field.BOOKINGPAYLOAD, bookingPayload)
                .put(Field.STATUS, BookingProposalStatus.PENDING.getValue())
                .put(Field.CREATED, nowIso())
                .put(Field.MODIFIED, nowIso());

        mongo.insert(this.collection, body, validResultHandler(event -> {
            if (event.isLeft()) {
                String message = String.format("[Calendar@%s::create] An error has occurred while creating a booking proposal: %s",
                        this.getClass().getSimpleName(), event.left().getValue());
                log.error(message, event.left().getValue());
                promise.fail(event.left().getValue());
            } else {
                promise.complete(body);
            }
        }));

        return promise.future();
    }

    @Override
    public Future<JsonObject> retrieve(String id) {
        Promise<JsonObject> promise = Promise.promise();

        final Bson query = eq(Field._ID, id);
        mongo.findOne(this.collection, MongoQueryBuilder.build(query), validResultHandler(event -> {
            if (event.isLeft()) {
                String message = String.format("[Calendar@%s::retrieve] An error has occurred while retrieving a booking proposal: %s",
                        this.getClass().getSimpleName(), event.left().getValue());
                log.error(message, event.left().getValue());
                promise.fail(event.left().getValue());
            } else {
                promise.complete(event.right().getValue());
            }
        }));

        return promise.future();
    }

    @Override
    public Future<JsonArray> listByEvent(String eventId) {
        Promise<JsonArray> promise = Promise.promise();

        final Bson query = eq(Field.EVENTID_CAMEL, eventId);
        JsonObject sort = new JsonObject().put(Field.CREATED, -1);
        mongo.find(this.collection, MongoQueryBuilder.build(query), sort, new JsonObject(), validResultsHandler(event -> {
            if (event.isLeft()) {
                String message = String.format("[Calendar@%s::listByEvent] An error has occurred while listing booking proposals: %s",
                        this.getClass().getSimpleName(), event.left().getValue());
                log.error(message, event.left().getValue());
                promise.fail(event.left().getValue());
            } else {
                promise.complete(event.right().getValue());
            }
        }));

        return promise.future();
    }

    @Override
    public Future<Void> updateStatus(String id, String status, String refusalReason) {
        Promise<Void> promise = Promise.promise();

        final Bson query = eq(Field._ID, id);
        MongoUpdateBuilder modifier = new MongoUpdateBuilder()
                .set(Field.STATUS, status)
                .set(Field.MODIFIED, nowIso());
        if (refusalReason != null) {
            modifier.set(Field.REFUSALREASON, refusalReason);
        }

        mongo.update(this.collection, MongoQueryBuilder.build(query), modifier.build(), validResultHandler(event -> {
            if (event.isLeft()) {
                String message = String.format("[Calendar@%s::updateStatus] An error has occurred while updating a booking proposal: %s",
                        this.getClass().getSimpleName(), event.left().getValue());
                log.error(message, event.left().getValue());
                promise.fail(event.left().getValue());
            } else {
                promise.complete();
            }
        }));

        return promise.future();
    }
}
