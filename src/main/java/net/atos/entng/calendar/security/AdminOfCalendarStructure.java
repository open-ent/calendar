package net.atos.entng.calendar.security;

import fr.wseduc.mongodb.MongoQueryBuilder;
import fr.wseduc.webutils.http.Binding;
import io.vertx.core.Handler;
import io.vertx.core.http.HttpServerRequest;
import net.atos.entng.calendar.Calendar;
import net.atos.entng.calendar.core.constants.Field;
import org.bson.conversions.Bson;
import org.entcore.common.http.filter.MongoAppFilter;
import org.entcore.common.http.filter.ResourcesProvider;
import org.entcore.common.mongodb.MongoDbConf;
import org.entcore.common.user.DefaultFunctions;
import org.entcore.common.user.UserInfos;

import static com.mongodb.client.model.Filters.and;
import static com.mongodb.client.model.Filters.eq;
import static com.mongodb.client.model.Filters.in;

/**
 * Autorise la publication/dépublication d'un agenda d'établissement sur le portail public
 * uniquement pour un ADML de la structure propriétaire de l'agenda (ou un super-admin) —
 * même logique que {@code net.atos.entng.support.filters.AdminOfTicketsStructure}, adaptée à
 * une collection Mongo (calendar) au lieu de SQL.
 */
public class AdminOfCalendarStructure implements ResourcesProvider {

    @Override
    public void authorize(final HttpServerRequest request, final Binding binding,
                          final UserInfos user, final Handler<Boolean> handler) {
        String id = request.params().get(MongoDbConf.getInstance().getResourceIdLabel());
        if (id == null || id.trim().isEmpty()) {
            handler.handle(false);
            return;
        }

        boolean isSuperAdmin = user.getFunctions() != null && user.getFunctions().containsKey(DefaultFunctions.SUPER_ADMIN);
        UserInfos.Function adminLocal = user.getFunctions() != null ? user.getFunctions().get(DefaultFunctions.ADMIN_LOCAL) : null;

        if (!isSuperAdmin && (adminLocal == null || adminLocal.getScope() == null || adminLocal.getScope().isEmpty())) {
            handler.handle(false);
            return;
        }

        Bson query = and(eq(Field._ID, id), eq(Field.type, Field.TYPE_STRUCTURE));
        if (!isSuperAdmin) {
            query = and(query, in(Field.STRUCTUREID, adminLocal.getScope()));
        }

        MongoAppFilter.executeCountQuery(request, Calendar.CALENDAR_COLLECTION, MongoQueryBuilder.build(query), 1, handler);
    }
}
