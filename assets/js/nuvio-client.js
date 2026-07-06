(function (global) {
    'use strict';

    const SUPABASE_URL = 'https://api.nuvio.tv';
    const SUPABASE_KEY = 'sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN';

    function parseErrorMessage(json, fallback) {
        if (!json) return fallback;
        return json.error_description || json.msg || json.message || json.error || fallback;
    }

    class NuvioClient {
        constructor(opts) {
            opts = opts || {};
            this._getToken = opts.getToken || (() => null);

            this.auth = this._authApi();
            this.profiles = this._profilesApi();
            this.addons = this._addonsApi();
            this.plugins = this._pluginsApi();
            this.library = this._libraryApi();
            this.watchProgress = this._watchProgressApi();
            this.watchHistory = this._watchHistoryApi();
            this.settings = this._settingsApi();
            this.homeCatalog = this._homeCatalogApi();
            this.collections = this._collectionsApi();
            this.avatars = this._avatarsApi();
            this.system = this._systemApi();
        }

        async _request(path, { method = 'GET', body, auth = false, extraHeaders } = {}) {
            const headers = Object.assign(
                { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
                extraHeaders || {}
            );
            if (auth) {
                const token = await this._getToken();
                if (!token) throw new Error('Not signed in.');
                headers.Authorization = `Bearer ${token}`;
            }
            const res = await fetch(`${SUPABASE_URL}${path}`, {
                method,
                headers,
                body: body !== undefined ? JSON.stringify(body) : undefined,
                referrerPolicy: 'no-referrer'
            });
            let json = null;
            if (res.status !== 204) {
                try { json = await res.json(); } catch { json = null; }
            }
            if (!res.ok) throw new Error(parseErrorMessage(json, `Request failed (${res.status})`));
            return json;
        }

        _rpc(name, body, { auth = true } = {}) {
            return this._request(`/rest/v1/rpc/${name}`, { method: 'POST', body: body || {}, auth });
        }

        _table(name, query, { auth = true } = {}) {
            return this._request(`/rest/v1/${name}?${query}`, { auth });
        }

        _authApi() {
            const self = this;
            return {
                signUp: (email, password) =>
                    self._request('/auth/v1/signup', { method: 'POST', body: { email, password } }),

                signIn: (email, password) =>
                    self._request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }),

                refresh: (refresh_token) =>
                    self._request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token } }),

                signOut: () => self._request('/auth/v1/logout', { method: 'POST', auth: true }),

                getUser: () => self._request('/auth/v1/user', { auth: true })
            };
        }

        _profilesApi() {
            const self = this;
            return {
                list: () => self._rpc('sync_pull_profiles', {}),

                push: (profiles, clientMaxProfiles = 6) =>
                    self._rpc('sync_push_profiles', {
                        p_client_max_profiles: clientMaxProfiles,
                        p_profiles: profiles
                    }),

                deleteData: (profileId) =>
                    self._rpc('sync_delete_profile_data', { p_profile_id: profileId })
            };
        }

        _addonsApi() {
            const self = this;
            return {
                list: (profileId) =>
                    self._table('addons', `select=*&profile_id=eq.${encodeURIComponent(profileId)}&order=sort_order`),

                push: (profileId, addons) =>
                    self._rpc('sync_push_addons', { p_profile_id: profileId, p_addons: addons })
            };
        }

        _pluginsApi() {
            const self = this;
            return {
                list: (profileId) =>
                    self._table('plugins', `select=*&profile_id=eq.${encodeURIComponent(profileId)}&order=sort_order`),

                push: (profileId, plugins) =>
                    self._rpc('sync_push_plugins', { p_profile_id: profileId, p_plugins: plugins })
            };
        }

        _libraryApi() {
            const self = this;
            return {
                pull: (profileId, { limit = 500, offset = 0 } = {}) =>
                    self._rpc('sync_pull_library', { p_profile_id: profileId, p_limit: limit, p_offset: offset }),
                push: (profileId, items) =>
                    self._rpc('sync_push_library', { p_profile_id: profileId, p_items: items })
            };
        }

        _watchProgressApi() {
            const self = this;
            return {
                pull: (profileId, { sinceLastWatched = null, limit = 200 } = {}) =>
                    self._rpc('sync_pull_watch_progress', {
                        p_profile_id: profileId,
                        p_since_last_watched: sinceLastWatched,
                        p_limit: limit
                    }),

                pullDelta: (profileId, sinceEventId = 0, limit = 1000) =>
                    self._rpc('sync_pull_watch_progress_delta', {
                        p_profile_id: profileId,
                        p_since_event_id: sinceEventId,
                        p_limit: limit
                    }),

                getDeltaCursor: (profileId) =>
                    self._rpc('sync_get_watch_progress_delta_cursor', { p_profile_id: profileId }),

                push: (profileId, entries) =>
                    self._rpc('sync_push_watch_progress', { p_profile_id: profileId, p_entries: entries }),

                remove: (profileId, keys) => {
                    const body = { p_profile_id: profileId };
                    if (Array.isArray(keys)) body.p_keys = keys;
                    else body.p_progress_key = keys;
                    return self._rpc('sync_delete_watch_progress', body);
                }
            };
        }

        _watchHistoryApi() {
            const self = this;
            return {
                pull: (profileId, { page = 1, pageSize = 500 } = {}) =>
                    self._rpc('sync_pull_watched_items', { p_profile_id: profileId, p_page: page, p_page_size: pageSize }),

                pullDelta: (profileId, sinceEventId = 0, limit = 1000) =>
                    self._rpc('sync_pull_watched_items_delta', {
                        p_profile_id: profileId,
                        p_since_event_id: sinceEventId,
                        p_limit: limit
                    }),

                getDeltaCursor: (profileId) =>
                    self._rpc('sync_get_watched_items_delta_cursor', { p_profile_id: profileId }),

                push: (profileId, items) =>
                    self._rpc('sync_push_watched_items', { p_profile_id: profileId, p_items: items }),

                remove: (profileId, keys) =>
                    self._rpc('sync_delete_watched_items', { p_profile_id: profileId, p_keys: keys })
            };
        }

        _settingsApi() {
            const self = this;
            return {
                get: (profileId, platform = 'tv') =>
                    self._rpc('sync_pull_profile_settings_blob', { p_profile_id: profileId, p_platform: platform }),

                update: (profileId, settingsJson, platform = 'tv') =>
                    self._rpc('sync_push_profile_settings_blob', {
                        p_profile_id: profileId,
                        p_platform: platform,
                        p_settings_json: settingsJson
                    })
            };
        }

        _homeCatalogApi() {
            const self = this;
            return {
                get: (profileId, platform = 'tv') =>
                    self._rpc('sync_pull_home_catalog_settings', { p_profile_id: profileId, p_platform: platform }),

                update: (profileId, settingsJson, platform = 'tv') =>
                    self._rpc('sync_push_home_catalog_settings', {
                        p_profile_id: profileId,
                        p_platform: platform,
                        p_settings_json: settingsJson
                    })
            };
        }

        _collectionsApi() {
            const self = this;
            return {
                get: (profileId) => self._rpc('sync_pull_collections', { p_profile_id: profileId }),

                update: (profileId, collectionsJson) =>
                    self._rpc('sync_push_collections', { p_profile_id: profileId, p_collections_json: collectionsJson })
            };
        }

        _avatarsApi() {
            const self = this;
            return {
                list: () => self._rpc('get_avatar_catalog', {}, { auth: false })
            };
        }

        _systemApi() {
            const self = this;
            return {
                syncOverview: () => self._rpc('get_sync_overview', {}),
                healthCheck: () => self._request('/functions/v1/health-check', { auth: false }),
                healthPing: () => self._rpc('health_ping', {}, { auth: false })
            };
        }
    }

    global.NuvioClient = NuvioClient;
})(typeof window !== 'undefined' ? window : globalThis);
