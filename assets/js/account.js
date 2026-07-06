(function () {
    'use strict';

    // NuvioClient must be loaded before this file (see index.html script order).
    if (!window.NuvioClient) return;

    // Manifest variants for the "Add Eclipsia" quick-add menu.
    // All three point to the same default manifest for now — update the
    // english/main URLs once those variants are published.
    const MANIFESTS = {
        stable: {
            label: 'Stable',
            url: 'https://raw.githubusercontent.com/Eclipsia-Vault/eclipsia-nuvio/refs/heads/main/stable/manifest.json'
        },
        english: {
            label: 'English',
            url: 'https://raw.githubusercontent.com/Eclipsia-Vault/eclipsia-nuvio/refs/heads/main/stable/manifest.json'
        },
        main: {
            label: 'Main',
            url: 'https://raw.githubusercontent.com/Eclipsia-Vault/eclipsia-nuvio/refs/heads/main/stable/manifest.json'
        }
    };
    const DEFAULT_MANIFEST_KEY = 'stable';
    const PLUGIN_NAME = 'Eclipsia';
    const SESSION_KEY = 'eclipsia_nuvio_session';
    const TOKEN_REFRESH_SKEW_MS = 30 * 1000;

    // =========================================================================================
    // Session storage (tab-scoped; never persisted to localStorage)
    // =========================================================================================

    function saveSession(session) {
        try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch {}
    }
    function loadSession() {
        try {
            const raw = sessionStorage.getItem(SESSION_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    }
    function clearSession() {
        try { sessionStorage.removeItem(SESSION_KEY); } catch {}
    }

    function sessionFromAuthResponse(json) {
        if (!json || !json.access_token) return null;
        return {
            access_token: json.access_token,
            refresh_token: json.refresh_token,
            expires_at: Date.now() + (Number(json.expires_in) || 3600) * 1000,
            user: json.user ? { id: json.user.id, email: json.user.email } : null
        };
    }

    async function ensureFreshToken() {
        let session = loadSession();
        if (!session || !session.access_token) return null;
        if (Date.now() < session.expires_at - TOKEN_REFRESH_SKEW_MS) return session.access_token;
        if (!session.refresh_token) { clearSession(); return null; }
        try {
            const json = await client.auth.refresh(session.refresh_token);
            const next = sessionFromAuthResponse(json);
            if (!next) { clearSession(); return null; }
            if (!next.user) next.user = session.user;
            saveSession(next);
            return next.access_token;
        } catch {
            clearSession();
            return null;
        }
    }

    const client = new window.NuvioClient({ getToken: ensureFreshToken });

    // =========================================================================================
    // Small DOM helpers
    // =========================================================================================

    const $ = (id) => document.getElementById(id);

    function setStatus(el, text, state) {
        if (!el) return;
        el.textContent = text || '';
        el.classList.remove('ok', 'error', 'pending');
        if (state) el.classList.add(state);
    }

    function setBusy(btn, busy, busyLabel, idleLabel) {
        if (!btn) return;
        btn.disabled = busy;
        if (busy && busyLabel) btn.textContent = busyLabel;
        if (!busy && idleLabel) btn.textContent = idleLabel;
    }

    function el(tag, attrs, children) {
        const node = document.createElement(tag);
        Object.entries(attrs || {}).forEach(([k, v]) => {
            if (k === 'class') node.className = v;
            else if (k === 'text') node.textContent = v;
            else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
            else node.setAttribute(k, v);
        });
        (children || []).forEach((c) => node.appendChild(c));
        return node;
    }

    /** Replace a container's content with a single "Loading…"-style status paragraph. No HTML strings involved. */
    function setLoading(container, text) {
        if (!container) return;
        container.replaceChildren(el('p', { class: 'sync-status pending', text }));
    }

    function fmtDate(ms) {
        if (!ms) return '—';
        try { return new Date(Number(ms)).toLocaleString(); } catch { return String(ms); }
    }

    function fmtDuration(ms) {
        if (!ms && ms !== 0) return '—';
        const total = Math.round(ms / 1000);
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        return h ? `${h}h ${m}m` : `${m}m ${s}s`;
    }

    // =========================================================================================
    // Core auth elements
    // =========================================================================================

    const els = {
        signedOut: $('authSignedOut'),
        signedIn: $('authSignedIn'),
        tabs: $('authTabs'),
        form: $('authForm'),
        email: $('authEmail'),
        password: $('authPassword'),
        submitBtn: $('authSubmitBtn'),
        authStatus: $('authStatus'),
        whoami: $('authWhoami'),
        profileSelect: $('profileSelect'),
        signOutBtn: $('signOutBtn'),
        panelNav: $('panelNav'),
        panelNavSelect: $('panelNavSelect'),
        panels: $('panels')
    };

    if (!els.form || !els.signedIn || !els.signedOut) return;

    let authMode = 'signin';
    let currentProfiles = [];
    let currentProfileId = 1;
    let avatarCatalog = null; // lazy-loaded cache

    // =========================================================================================
    // Auth flow
    // =========================================================================================

    function setAuthMode(mode) {
        authMode = mode;
        if (els.tabs) {
            els.tabs.querySelectorAll('.filter-chip').forEach((chip) => {
                chip.classList.toggle('active', chip.dataset.authTab === mode);
            });
        }
        if (els.submitBtn) els.submitBtn.textContent = mode === 'signup' ? 'Create Account' : 'Sign In';
        if (els.password) els.password.setAttribute('autocomplete', mode === 'signup' ? 'new-password' : 'current-password');
        setStatus(els.authStatus, '', '');
    }

    function showSignedOut() {
        els.signedOut.style.display = '';
        els.signedIn.style.display = 'none';
    }

    function showSignedIn(user) {
        els.signedOut.style.display = 'none';
        els.signedIn.style.display = '';
        setStatus(els.whoami, user && user.email ? `Signed in as ${user.email}` : 'Signed in', '');
        setStatus(els.authStatus, '', '');
    }

    function populateProfiles(profiles) {
        currentProfiles = (profiles && profiles.length)
            ? profiles.slice().sort((a, b) => a.profile_index - b.profile_index)
            : [1, 2, 3, 4, 5, 6].map((i) => ({ profile_index: i, name: `Profile ${i}` }));
        if (!els.profileSelect) return;
        els.profileSelect.replaceChildren();
        currentProfiles.forEach((p) => {
            const opt = document.createElement('option');
            opt.value = String(p.profile_index);
            opt.textContent = p.name ? `${p.name} (Profile ${p.profile_index})` : `Profile ${p.profile_index}`;
            els.profileSelect.appendChild(opt);
        });
        currentProfileId = currentProfiles[0] ? currentProfiles[0].profile_index : 1;
        els.profileSelect.value = String(currentProfileId);
    }

    async function afterAuthenticated(session) {
        saveSession(session);
        showSignedIn(session.user);
        try {
            const profiles = await client.profiles.list();
            populateProfiles(profiles);
        } catch {
            populateProfiles([]);
        }
        activatePanel(getActivePanelName() || 'plugins');
    }

    async function handleAuthSubmit(e) {
        e.preventDefault();
        const email = (els.email.value || '').trim();
        const password = els.password.value || '';
        if (!email || !password) {
            setStatus(els.authStatus, 'Enter your email and password.', 'error');
            return;
        }
        const isSignUp = authMode === 'signup';
        setBusy(els.submitBtn, true, isSignUp ? 'Creating account…' : 'Signing in…');
        try {
            const json = isSignUp ? await client.auth.signUp(email, password) : await client.auth.signIn(email, password);
            const session = sessionFromAuthResponse(json);
            if (session) {
                await afterAuthenticated(session);
            } else {
                setStatus(els.authStatus, 'Account created. Check your email to confirm it, then sign in.', 'ok');
                setAuthMode('signin');
            }
        } catch (err) {
            setStatus(els.authStatus, err.message || 'Something went wrong. Please try again.', 'error');
        } finally {
            setBusy(els.submitBtn, false, null, authMode === 'signup' ? 'Create Account' : 'Sign In');
        }
    }

    async function handleSignOut() {
        const token = await ensureFreshToken();
        if (token) { try { await client.auth.signOut(); } catch {} }
        clearSession();
        if (els.form) els.form.reset();
        setAuthMode('signin');
        showSignedOut();
    }

    async function initFromStoredSession() {
        const session = loadSession();
        if (!session) { showSignedOut(); return; }
        const token = await ensureFreshToken();
        if (!token) { showSignedOut(); return; }
        try {
            const user = await client.auth.getUser();
            const current = loadSession() || session;
            current.user = { id: user.id, email: user.email };
            saveSession(current);
            showSignedIn(current.user);
            try {
                const profiles = await client.profiles.list();
                populateProfiles(profiles);
            } catch { populateProfiles([]); }
            activatePanel(getActivePanelName() || 'plugins');
        } catch {
            clearSession();
            showSignedOut();
        }
    }

    // =========================================================================================
    // Panel navigation
    // =========================================================================================

    function getActivePanelName() {
        const btn = els.panelNav && els.panelNav.querySelector('.filter-chip.active');
        return btn ? btn.dataset.panel : null;
    }

    function activatePanel(name) {
        if (!els.panelNav || !els.panels) return;
        els.panelNav.querySelectorAll('.filter-chip').forEach((chip) => {
            chip.classList.toggle('active', chip.dataset.panel === name);
        });
        if (els.panelNavSelect && els.panelNavSelect.value !== name) {
            els.panelNavSelect.value = name;
        }
        els.panels.querySelectorAll('.panel').forEach((p) => {
            p.style.display = p.dataset.panel === name ? '' : 'none';
        });
        const loader = panelLoaders[name];
        if (loader) loader();
    }

    function wirePanelNav() {
        if (!els.panelNav) return;
        els.panelNav.querySelectorAll('.filter-chip').forEach((chip) => {
            chip.addEventListener('click', () => activatePanel(chip.dataset.panel));
        });
        if (els.panelNavSelect) {
            els.panelNavSelect.addEventListener('change', () => activatePanel(els.panelNavSelect.value));
        }
    }

    if (els.profileSelect) {
        els.profileSelect.addEventListener('change', () => {
            currentProfileId = parseInt(els.profileSelect.value, 10) || 1;
            const active = getActivePanelName();
            if (active) activatePanel(active);
        });
    }

    // =========================================================================================
    // Generic helper: normalize a URL for de-dupe comparisons
    // =========================================================================================

    function normalizeUrl(u) {
        return String(u || '').trim().replace(/\/+$/, '').toLowerCase();
    }

    // =========================================================================================
    // Panel: Plugins (includes the original "Add Eclipsia" quick action)
    // =========================================================================================

    const pluginsPanel = (function () {
        const status = $('pluginsStatus');
        const list = $('pluginsList');
        const quickAddBtn = $('quickAddEclipsiaBtn');
        const manifestSelect = $('quickAddManifestSelect');

        function renderRow(p, onToggle, onRemove) {
            const row = el('div', { class: 'resource-row' }, [
                el('div', { class: 'resource-main' }, [
                    el('span', { class: 'resource-name', text: p.name || p.url }),
                    el('span', { class: 'resource-url', text: p.url })
                ]),
                el('div', { class: 'resource-actions' }, [
                    el('label', { class: 'resource-toggle' }, [
                        el('input', {
                            type: 'checkbox',
                            ...(p.enabled !== false ? { checked: 'checked' } : {}),
                            onchange: (e) => onToggle(e.target.checked)
                        }),
                        el('span', { text: 'Enabled' })
                    ]),
                    el('button', { class: 'link-btn danger', type: 'button', text: 'Remove', onclick: onRemove })
                ])
            ]);
            return row;
        }

        async function load() {
            if (!list) return;
            setLoading(list, 'Loading plugins…');
            try {
                const plugins = await client.plugins.list(currentProfileId);
                renderList(plugins);
            } catch (err) {
                list.replaceChildren();
                setStatus(status, err.message || 'Could not load plugins.', 'error');
            }
        }

        function toPushable(plugins) {
            return plugins.map((p) => ({
                url: p.url,
                name: p.name || undefined,
                enabled: p.enabled !== false,
                sort_order: Number(p.sort_order) || 0,
                repo_type: p.repo_type || undefined
            }));
        }

        async function persist(plugins, statusMsg) {
            await client.plugins.push(currentProfileId, toPushable(plugins));
            setStatus(status, statusMsg || 'Saved.', 'ok');
            await load();
        }

        function renderList(plugins) {
            list.replaceChildren();
            if (!plugins.length) {
                list.appendChild(el('p', { class: 'empty-hint', text: 'No plugins yet for this profile.' }));
                return;
            }
            plugins.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).forEach((p) => {
                list.appendChild(renderRow(
                    p,
                    async (enabled) => {
                        const next = plugins.map((x) => (x.id === p.id ? { ...x, enabled } : x));
                        try { await persist(next, 'Updated.'); } catch (err) { setStatus(status, err.message, 'error'); }
                    },
                    async () => {
                        const next = plugins.filter((x) => x.id !== p.id);
                        try { await persist(next, 'Removed.'); } catch (err) { setStatus(status, err.message, 'error'); }
                    }
                ));
            });
        }

        function selectedManifestKey() {
            const key = manifestSelect ? manifestSelect.value : DEFAULT_MANIFEST_KEY;
            return MANIFESTS[key] ? key : DEFAULT_MANIFEST_KEY;
        }

        async function quickAddEclipsia() {
            const manifestKey = selectedManifestKey();
            const variant = MANIFESTS[manifestKey];
            const manifestUrl = variant.url;
            const pluginName = manifestKey === DEFAULT_MANIFEST_KEY ? PLUGIN_NAME : `${PLUGIN_NAME} (${variant.label})`;
            setBusy(quickAddBtn, true, `Checking your plugins…`);
            setStatus(status, '', 'pending');
            try {
                const existing = await client.plugins.list(currentProfileId);
                const already = existing.some((p) => normalizeUrl(p.url) === normalizeUrl(manifestUrl));
                if (already) {
                    setStatus(status, `Eclipsia (${variant.label}) is already in this profile\u2019s plugin list.`, 'ok');
                    return;
                }
                const maxSort = existing.reduce((m, p) => Math.max(m, Number(p.sort_order) || 0), -1);
                const next = toPushable(existing).concat([{
                    url: manifestUrl, name: pluginName, enabled: true, sort_order: maxSort + 1, repo_type: 'remote'
                }]);
                await client.plugins.push(currentProfileId, next);
                setStatus(status, `Added! Eclipsia (${variant.label}) is now in your Nuvio plugins for this profile.`, 'ok');
                await load();
            } catch (err) {
                setStatus(status, err.message || 'Could not update your plugins.', 'error');
            } finally {
                setBusy(quickAddBtn, false, null, 'Add Eclipsia to This Profile');
            }
        }

        if (quickAddBtn) quickAddBtn.addEventListener('click', quickAddEclipsia);

        return { load };
    })();

    // =========================================================================================
    // Panel: Addons (same shape as plugins, no repo_type)
    // =========================================================================================

    const addonsPanel = (function () {
        const status = $('addonsStatus');
        const list = $('addonsList');
        const addBtn = $('addAddonBtn');

        function toPushable(addons) {
            return addons.map((a) => ({
                url: a.url,
                name: a.name || undefined,
                enabled: a.enabled !== false,
                sort_order: Number(a.sort_order) || 0
            }));
        }

        async function persist(addons, msg) {
            await client.addons.push(currentProfileId, toPushable(addons));
            setStatus(status, msg || 'Saved.', 'ok');
            await load();
        }

        function renderRow(a, onToggle, onRemove) {
            return el('div', { class: 'resource-row' }, [
                el('div', { class: 'resource-main' }, [
                    el('span', { class: 'resource-name', text: a.name || a.url }),
                    el('span', { class: 'resource-url', text: a.url })
                ]),
                el('div', { class: 'resource-actions' }, [
                    el('label', { class: 'resource-toggle' }, [
                        el('input', { type: 'checkbox', ...(a.enabled !== false ? { checked: 'checked' } : {}), onchange: (e) => onToggle(e.target.checked) }),
                        el('span', { text: 'Enabled' })
                    ]),
                    el('button', { class: 'link-btn danger', type: 'button', text: 'Remove', onclick: onRemove })
                ])
            ]);
        }

        async function load() {
            if (!list) return;
            setLoading(list, 'Loading addons…');
            try {
                const addons = await client.addons.list(currentProfileId);
                list.replaceChildren();
                if (!addons.length) {
                    list.appendChild(el('p', { class: 'empty-hint', text: 'No addons yet for this profile.' }));
                    return;
                }
                addons.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).forEach((a) => {
                    list.appendChild(renderRow(
                        a,
                        async (enabled) => {
                            const next = addons.map((x) => (x.id === a.id ? { ...x, enabled } : x));
                            try { await persist(next, 'Updated.'); } catch (err) { setStatus(status, err.message, 'error'); }
                        },
                        async () => {
                            const next = addons.filter((x) => x.id !== a.id);
                            try { await persist(next, 'Removed.'); } catch (err) { setStatus(status, err.message, 'error'); }
                        }
                    ));
                });
            } catch (err) {
                list.replaceChildren();
                setStatus(status, err.message || 'Could not load addons.', 'error');
            }
        }

        async function addCustom() {
            const url = prompt('Addon manifest URL:');
            if (!url) return;
            const name = prompt('Display name (optional):', '') || undefined;
            setStatus(status, '', 'pending');
            try {
                const existing = await client.addons.list(currentProfileId);
                const maxSort = existing.reduce((m, a) => Math.max(m, Number(a.sort_order) || 0), -1);
                const next = toPushable(existing).concat([{ url, name, enabled: true, sort_order: maxSort + 1 }]);
                await persist(next, 'Addon added.');
            } catch (err) {
                setStatus(status, err.message, 'error');
            }
        }

        if (addBtn) addBtn.addEventListener('click', addCustom);
        return { load };
    })();

    // =========================================================================================
    // Panel: Library
    // =========================================================================================

    const libraryPanel = (function () {
        const status = $('libraryStatus');
        const list = $('libraryList');

        function renderRow(item, onRemove) {
            return el('div', { class: 'resource-row' }, [
                el('div', { class: 'resource-main' }, [
                    el('span', { class: 'resource-name', text: item.name || item.content_id }),
                    el('span', { class: 'resource-url', text: `${item.content_type} · ${item.release_info || ''} · added ${fmtDate(item.added_at)}` })
                ]),
                el('div', { class: 'resource-actions' }, [
                    el('button', { class: 'link-btn danger', type: 'button', text: 'Remove', onclick: onRemove })
                ])
            ]);
        }

        async function load() {
            if (!list) return;
            setLoading(list, 'Loading library…');
            try {
                const items = await client.library.pull(currentProfileId, { limit: 500, offset: 0 });
                list.replaceChildren();
                if (!items.length) {
                    list.appendChild(el('p', { class: 'empty-hint', text: 'Nothing saved to this profile\u2019s library.' }));
                    return;
                }
                items.forEach((item) => {
                    list.appendChild(renderRow(item, async () => {
                        setStatus(status, '', 'pending');
                        try {
                            const remaining = items.filter((x) => x.content_id !== item.content_id).map((x) => ({
                                content_id: x.content_id,
                                content_type: x.content_type,
                                name: x.name,
                                poster: x.poster,
                                poster_shape: x.poster_shape,
                                background: x.background,
                                description: x.description,
                                release_info: x.release_info,
                                imdb_rating: x.imdb_rating,
                                genres: x.genres,
                                addon_base_url: x.addon_base_url,
                                added_at: x.added_at
                            }));
                            await client.library.push(currentProfileId, remaining);
                            setStatus(status, 'Removed from library.', 'ok');
                            await load();
                        } catch (err) {
                            setStatus(status, err.message, 'error');
                        }
                    }));
                });
            } catch (err) {
                list.replaceChildren();
                setStatus(status, err.message || 'Could not load library.', 'error');
            }
        }

        return { load };
    })();

    // =========================================================================================
    // Panel: Watch Progress (read + delete; push is device/player driven, not exposed here)
    // =========================================================================================

    const progressPanel = (function () {
        const status = $('progressStatus');
        const list = $('progressList');

        function renderRow(p, onRemove) {
            const label = p.season ? `${p.content_id} · S${p.season}E${p.episode}` : p.content_id;
            const pct = p.duration ? Math.round((p.position / p.duration) * 100) : 0;
            return el('div', { class: 'resource-row' }, [
                el('div', { class: 'resource-main' }, [
                    el('span', { class: 'resource-name', text: label }),
                    el('span', { class: 'resource-url', text: `${pct}% watched · ${fmtDuration(p.position)} / ${fmtDuration(p.duration)} · last watched ${fmtDate(p.last_watched)}` })
                ]),
                el('div', { class: 'resource-actions' }, [
                    el('button', { class: 'link-btn danger', type: 'button', text: 'Delete', onclick: onRemove })
                ])
            ]);
        }

        async function load() {
            if (!list) return;
            setLoading(list, 'Loading watch progress…');
            try {
                const items = await client.watchProgress.pull(currentProfileId, { limit: 200 });
                list.replaceChildren();
                if (!items.length) {
                    list.appendChild(el('p', { class: 'empty-hint', text: 'No watch progress recorded for this profile.' }));
                    return;
                }
                items.forEach((p) => {
                    list.appendChild(renderRow(p, async () => {
                        setStatus(status, '', 'pending');
                        try {
                            await client.watchProgress.remove(currentProfileId, p.progress_key);
                            setStatus(status, 'Deleted.', 'ok');
                            await load();
                        } catch (err) {
                            setStatus(status, err.message, 'error');
                        }
                    }));
                });
            } catch (err) {
                list.replaceChildren();
                setStatus(status, err.message || 'Could not load watch progress.', 'error');
            }
        }

        return { load };
    })();

    // =========================================================================================
    // Panel: Watch History
    // =========================================================================================

    const historyPanel = (function () {
        const status = $('historyStatus');
        const list = $('historyList');

        function renderRow(item, onRemove) {
            const label = item.season ? `${item.title || item.content_id} · S${item.season}E${item.episode}` : (item.title || item.content_id);
            return el('div', { class: 'resource-row' }, [
                el('div', { class: 'resource-main' }, [
                    el('span', { class: 'resource-name', text: label }),
                    el('span', { class: 'resource-url', text: `${item.content_type} · watched ${fmtDate(item.watched_at)}` })
                ]),
                el('div', { class: 'resource-actions' }, [
                    el('button', { class: 'link-btn danger', type: 'button', text: 'Delete', onclick: onRemove })
                ])
            ]);
        }

        async function load() {
            if (!list) return;
            setLoading(list, 'Loading watch history…');
            try {
                const items = await client.watchHistory.pull(currentProfileId, { page: 1, pageSize: 500 });
                list.replaceChildren();
                if (!items.length) {
                    list.appendChild(el('p', { class: 'empty-hint', text: 'No watch history for this profile.' }));
                    return;
                }
                items.forEach((item) => {
                    list.appendChild(renderRow(item, async () => {
                        setStatus(status, '', 'pending');
                        try {
                            const key = { content_id: item.content_id };
                            if (item.season) { key.season = item.season; key.episode = item.episode; }
                            await client.watchHistory.remove(currentProfileId, [key]);
                            setStatus(status, 'Deleted.', 'ok');
                            await load();
                        } catch (err) {
                            setStatus(status, err.message, 'error');
                        }
                    }));
                });
            } catch (err) {
                list.replaceChildren();
                setStatus(status, err.message || 'Could not load watch history.', 'error');
            }
        }

        return { load };
    })();

    // =========================================================================================
    // Generic JSON-blob panel factory — used for Settings, Home Catalog, Collections
    // =========================================================================================

    function makeJsonBlobPanel({ statusId, textareaId, saveBtnId, reloadBtnId, get, update, unwrap, defaultValue }) {
        const status = $(statusId);
        const textarea = $(textareaId);
        const saveBtn = $(saveBtnId);
        const reloadBtn = $(reloadBtnId);

        async function load() {
            if (!textarea) return;
            setStatus(status, '', 'pending');
            textarea.value = 'Loading…';
            try {
                const rows = await get(currentProfileId);
                const value = unwrap(rows);
                textarea.value = JSON.stringify(value !== undefined ? value : defaultValue, null, 2);
                setStatus(status, '', '');
            } catch (err) {
                textarea.value = JSON.stringify(defaultValue, null, 2);
                setStatus(status, err.message || 'Could not load.', 'error');
            }
        }

        async function save() {
            let parsed;
            try {
                parsed = JSON.parse(textarea.value);
            } catch {
                setStatus(status, 'That\u2019s not valid JSON — fix the syntax and try again.', 'error');
                return;
            }
            setBusy(saveBtn, true, 'Saving…');
            setStatus(status, '', 'pending');
            try {
                await update(currentProfileId, parsed);
                setStatus(status, 'Saved.', 'ok');
            } catch (err) {
                setStatus(status, err.message || 'Could not save.', 'error');
            } finally {
                setBusy(saveBtn, false, null, 'Save');
            }
        }

        if (saveBtn) saveBtn.addEventListener('click', save);
        if (reloadBtn) reloadBtn.addEventListener('click', load);
        return { load };
    }

    const settingsPanel = makeJsonBlobPanel({
        statusId: 'settingsStatus',
        textareaId: 'settingsJson',
        saveBtnId: 'settingsSaveBtn',
        reloadBtnId: 'settingsReloadBtn',
        get: (profileId) => client.settings.get(profileId, 'tv'),
        update: (profileId, json) => client.settings.update(profileId, json, 'tv'),
        unwrap: (rows) => (rows && rows[0] ? rows[0].settings_json : undefined),
        defaultValue: { theme: 'dark', player_quality: 'auto', subtitle_language: 'en', auto_play_next: true }
    });

    const homeCatalogPanel = makeJsonBlobPanel({
        statusId: 'homeCatalogStatus',
        textareaId: 'homeCatalogJson',
        saveBtnId: 'homeCatalogSaveBtn',
        reloadBtnId: 'homeCatalogReloadBtn',
        get: (profileId) => client.homeCatalog.get(profileId, 'tv'),
        update: (profileId, json) => client.homeCatalog.update(profileId, json, 'tv'),
        unwrap: (rows) => (rows && rows[0] ? rows[0].settings_json : undefined),
        defaultValue: { rows: [], hidden_catalogs: [] }
    });

    const collectionsPanel = makeJsonBlobPanel({
        statusId: 'collectionsStatus',
        textareaId: 'collectionsJson',
        saveBtnId: 'collectionsSaveBtn',
        reloadBtnId: 'collectionsReloadBtn',
        get: (profileId) => client.collections.get(profileId),
        update: (profileId, json) => client.collections.update(profileId, json),
        unwrap: (rows) => (rows && rows[0] ? rows[0].collections_json : undefined),
        defaultValue: []
    });

    // =========================================================================================
    // Panel: Profile management (rename/recolor/avatar, create, delete)
    // =========================================================================================

    const profileManagerPanel = (function () {
        const status = $('profileManagerStatus');
        const list = $('profileManagerList');
        const addBtn = $('addProfileBtn');

        async function ensureAvatarCatalog() {
            if (avatarCatalog) return avatarCatalog;
            try { avatarCatalog = await client.avatars.list(); } catch { avatarCatalog = []; }
            return avatarCatalog;
        }

        function toPushable(list) {
            return list.map((p) => ({
                profile_index: p.profile_index,
                name: p.name,
                avatar_color_hex: p.avatar_color_hex,
                uses_primary_addons: !!p.uses_primary_addons,
                uses_primary_plugins: !!p.uses_primary_plugins,
                avatar_id: p.avatar_id || undefined,
                avatar_url: p.avatar_url ?? undefined
            }));
        }

        function renderRow(p, avatars, onSave, onDelete) {
            const nameInput = el('input', { class: 'form-input', type: 'text', value: p.name || `Profile ${p.profile_index}` });
            const colorInput = el('input', { class: 'form-input', type: 'color', value: p.avatar_color_hex || '#8aa07a' });
            const avatarSelect = el('select', { class: 'form-input' });
            avatarSelect.appendChild(el('option', { value: '', text: '— no catalog avatar —' }));
            (avatars || []).forEach((a) => {
                const opt = el('option', { value: a.id, text: a.display_name });
                if (a.id === p.avatar_id) opt.setAttribute('selected', 'selected');
                avatarSelect.appendChild(opt);
            });
            const sharePluginsInput = el('input', { type: 'checkbox', ...(p.uses_primary_plugins ? { checked: 'checked' } : {}) });
            const shareAddonsInput = el('input', { type: 'checkbox', ...(p.uses_primary_addons ? { checked: 'checked' } : {}) });

            const saveBtn = el('button', { class: 'btn btn-primary', type: 'button', text: 'Save' });
            saveBtn.addEventListener('click', () => onSave({
                ...p,
                name: nameInput.value.trim() || `Profile ${p.profile_index}`,
                avatar_color_hex: colorInput.value,
                avatar_id: avatarSelect.value || null,
                uses_primary_plugins: sharePluginsInput.checked,
                uses_primary_addons: shareAddonsInput.checked
            }));

            const deleteBtn = el('button', { class: 'link-btn danger', type: 'button', text: 'Delete profile & all its data' });
            deleteBtn.addEventListener('click', () => onDelete(p));

            return el('div', { class: 'profile-row' }, [
                el('div', { class: 'profile-row-index', text: `#${p.profile_index}` }),
                el('div', { class: 'profile-row-fields' }, [
                    el('div', { class: 'form-field' }, [el('label', { class: 'form-label', text: 'Name' }), nameInput]),
                    el('div', { class: 'form-field' }, [el('label', { class: 'form-label', text: 'Color' }), colorInput]),
                    el('div', { class: 'form-field' }, [el('label', { class: 'form-label', text: 'Avatar' }), avatarSelect]),
                    el('label', { class: 'resource-toggle' }, [sharePluginsInput, el('span', { text: 'Share plugins with profile 1' })]),
                    el('label', { class: 'resource-toggle' }, [shareAddonsInput, el('span', { text: 'Share addons with profile 1' })])
                ]),
                el('div', { class: 'profile-row-actions' }, [saveBtn, deleteBtn])
            ]);
        }

        async function load() {
            if (!list) return;
            setLoading(list, 'Loading profiles…');
            try {
                const [profiles, avatars] = await Promise.all([client.profiles.list(), ensureAvatarCatalog()]);
                const full = profiles && profiles.length ? profiles : [];
                list.replaceChildren();
                if (!full.length) {
                    list.appendChild(el('p', { class: 'empty-hint', text: 'No profiles yet — add one below.' }));
                } else {
                    full.slice().sort((a, b) => a.profile_index - b.profile_index).forEach((p) => {
                        list.appendChild(renderRow(p, avatars, async (updated) => {
                            setStatus(status, '', 'pending');
                            try {
                                const others = full.filter((x) => x.profile_index !== p.profile_index);
                                await client.profiles.push(toPushable(others.concat([updated])), 6);
                                setStatus(status, 'Profile updated.', 'ok');
                                const refreshed = await client.profiles.list();
                                populateProfiles(refreshed);
                                await load();
                            } catch (err) {
                                setStatus(status, err.message, 'error');
                            }
                        }, async (target) => {
                            if (!confirm(`Delete profile "${target.name}" and ALL of its data (addons, plugins, library, progress, history, collections)? This cannot be undone.`)) return;
                            setStatus(status, '', 'pending');
                            try {
                                await client.profiles.deleteData(target.profile_index);
                                setStatus(status, 'Profile deleted.', 'ok');
                                const refreshed = await client.profiles.list();
                                populateProfiles(refreshed);
                                await load();
                            } catch (err) {
                                setStatus(status, err.message, 'error');
                            }
                        }));
                    });
                }
            } catch (err) {
                list.replaceChildren();
                setStatus(status, err.message || 'Could not load profiles.', 'error');
            }
        }

        async function addProfile() {
            const existing = await client.profiles.list().catch(() => []);
            const usedIndices = new Set(existing.map((p) => p.profile_index));
            let nextIndex = null;
            for (let i = 1; i <= 6; i++) { if (!usedIndices.has(i)) { nextIndex = i; break; } }
            if (!nextIndex) {
                setStatus(status, 'All 6 profile slots are in use.', 'error');
                return;
            }
            const name = prompt('New profile name:', `Profile ${nextIndex}`);
            if (!name) return;
            setStatus(status, '', 'pending');
            try {
                const next = existing.concat([{
                    profile_index: nextIndex,
                    name,
                    avatar_color_hex: '#8aa07a',
                    uses_primary_addons: false,
                    uses_primary_plugins: false
                }]);
                await client.profiles.push(toPushable(next), 6);
                setStatus(status, 'Profile created.', 'ok');
                const refreshed = await client.profiles.list();
                populateProfiles(refreshed);
                await load();
            } catch (err) {
                setStatus(status, err.message, 'error');
            }
        }

        if (addBtn) addBtn.addEventListener('click', addProfile);
        return { load };
    })();

    // =========================================================================================
    // Panel: Dashboard — sync overview + API health
    // =========================================================================================

    const dashboardPanel = (function () {
        const status = $('dashboardStatus');
        const overviewEl = $('dashboardOverview');
        const healthEl = $('dashboardHealth');

        function renderOverview(overview) {
            overviewEl.replaceChildren();
            const profileIds = Object.keys(overview.profiles || {}).sort((a, b) => Number(a) - Number(b));
            if (!profileIds.length) {
                overviewEl.appendChild(el('p', { class: 'empty-hint', text: 'No profiles to summarize yet.' }));
                return;
            }
            const table = el('table', { class: 'overview-table' });
            const head = el('tr', {}, [
                el('th', { text: 'Profile' }),
                el('th', { text: 'Addons' }),
                el('th', { text: 'Plugins' }),
                el('th', { text: 'Library' }),
                el('th', { text: 'Progress' }),
                el('th', { text: 'Watched' })
            ]);
            table.appendChild(head);
            profileIds.forEach((pid) => {
                const info = overview.profiles[pid] || {};
                table.appendChild(el('tr', {}, [
                    el('td', { text: `${info.name || 'Profile'} (${pid})` }),
                    el('td', { text: String((overview.addons || {})[pid] || 0) }),
                    el('td', { text: String((overview.plugins || {})[pid] || 0) }),
                    el('td', { text: String((overview.library_items || {})[pid] || 0) }),
                    el('td', { text: String((overview.watch_progress || {})[pid] || 0) }),
                    el('td', { text: String((overview.watched_items || {})[pid] || 0) })
                ]));
            });
            overviewEl.appendChild(table);
        }

        async function load() {
            setStatus(status, '', 'pending');
            setLoading(overviewEl, 'Loading sync overview…');
            healthEl.replaceChildren();
            try {
                const overview = await client.system.syncOverview();
                renderOverview(overview);
                setStatus(status, '', '');
            } catch (err) {
                overviewEl.replaceChildren();
                setStatus(status, err.message || 'Could not load sync overview.', 'error');
            }
            try {
                const health = await client.system.healthCheck();
                const badgeClass = health.status === 'healthy' ? 'ok' : (health.status === 'down' ? 'error' : 'pending');
                healthEl.appendChild(el('p', { class: `sync-status ${badgeClass}`, text: `API status: ${health.status} (db: ${health.database}, ${health.latency_ms}ms)` }));
            } catch {
                healthEl.appendChild(el('p', { class: 'sync-status error', text: 'Could not reach health check endpoint.' }));
            }
        }

        return { load };
    })();

    // =========================================================================================
    // Panel registry
    // =========================================================================================

    const panelLoaders = {
        plugins: pluginsPanel.load,
        addons: addonsPanel.load,
        library: libraryPanel.load,
        progress: progressPanel.load,
        history: historyPanel.load,
        settings: settingsPanel.load,
        homeCatalog: homeCatalogPanel.load,
        collections: collectionsPanel.load,
        profileManager: profileManagerPanel.load,
        dashboard: dashboardPanel.load
    };

    // =========================================================================================
    // Init
    // =========================================================================================

    function init() {
        setAuthMode('signin');
        if (els.tabs) {
            els.tabs.querySelectorAll('.filter-chip').forEach((chip) => {
                chip.addEventListener('click', () => setAuthMode(chip.dataset.authTab));
            });
        }
        els.form.addEventListener('submit', handleAuthSubmit);
        if (els.signOutBtn) els.signOutBtn.addEventListener('click', handleSignOut);
        wirePanelNav();
        initFromStoredSession();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
