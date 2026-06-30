package org.entcore.common.user;

import io.vertx.core.Future;
import io.vertx.core.http.HttpServerRequest;
import org.entcore.common.user.dto.UserPreferenceDto;

public interface PreferenceHelper {

    Future<UserPreferenceDto> updatePreferences(UserPreferenceDto preference, HttpServerRequest request);

    Future<UserPreferenceDto> getPreferences(HttpServerRequest request);

    Future<UserPreferenceDto> getPreferences(String userId);

}
