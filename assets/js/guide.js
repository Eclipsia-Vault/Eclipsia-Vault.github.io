(function () {
  'use strict';

  const NUVIO_AUTH_URL = 'https://api.nuvio.tv';
  const NUVIO_AUTH_KEY = 'sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN';
  const NUVIO_SESSION_KEY = 'eclipsia_nuvio_session';

  function nuvioSaveSession(session) {
    try {
      sessionStorage.setItem(NUVIO_SESSION_KEY, JSON.stringify(session));
    } catch {
    }
  }

  function nuvioParseError(json, fallback) {
    if (!json) return fallback;
    return json.error_description || json.msg || json.message || json.error || fallback;
  }

  function nuvioSessionFromAuthResponse(json) {
    if (!json || !json.access_token) return null;
    return {
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: Date.now() + (Number(json.expires_in) || 3600) * 1000,
      user: json.user ? { id: json.user.id, email: json.user.email } : null
    };
  }

  const NUVIO_MANIFEST_URL = 'https://raw.githubusercontent.com/Eclipsia-Vault/eclipsia-nuvio/refs/heads/main/manifest.json';
  const NUVIO_PLUGIN_NAME = 'Eclipsia';
  const NUVIO_TOKEN_REFRESH_SKEW_MS = 30 * 1000;

  function nuvioLoadSession() {
    try {
      const raw = sessionStorage.getItem(NUVIO_SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function nuvioClearSession() {
    try {
      sessionStorage.removeItem(NUVIO_SESSION_KEY);
    } catch {
    }
  }

  async function nuvioApiFetch(path, { method = 'GET', body, token } = {}) {
    const headers = Object.assign(
      { apikey: NUVIO_AUTH_KEY, 'Content-Type': 'application/json' },
      token ? { Authorization: `Bearer ${token}` } : {}
    );
    const res = await fetch(`${NUVIO_AUTH_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      referrerPolicy: 'no-referrer'
    });
    let json = null;
    if (res.status !== 204) {
      try {
        json = await res.json();
      } catch {
        json = null;
      }
    }
    if (!res.ok) throw new Error(nuvioParseError(json, `Request failed (${res.status})`));
    return json;
  }

  async function nuvioRefreshSession(session) {
    const json = await nuvioApiFetch('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: session.refresh_token }
    });
    const next = nuvioSessionFromAuthResponse(json);
    if (next && !next.user) next.user = session.user;
    return next;
  }

  async function nuvioEnsureFreshToken() {
    const session = nuvioLoadSession();
    if (!session || !session.access_token) return null;
    if (Date.now() < session.expires_at - NUVIO_TOKEN_REFRESH_SKEW_MS) return session.access_token;
    if (!session.refresh_token) {
      nuvioClearSession();
      return null;
    }
    try {
      const next = await nuvioRefreshSession(session);
      if (!next) {
        nuvioClearSession();
        return null;
      }
      nuvioSaveSession(next);
      return next.access_token;
    } catch {
      nuvioClearSession();
      return null;
    }
  }

  async function nuvioListProfiles(token) {
    const json = await nuvioApiFetch('/rest/v1/rpc/sync_pull_profiles', { method: 'POST', token, body: {} });
    return Array.isArray(json) ? json : [];
  }

  async function nuvioListPlugins(token, profileId) {
    const json = await nuvioApiFetch(
      `/rest/v1/plugins?select=*&profile_id=eq.${encodeURIComponent(profileId)}&order=sort_order`,
      { token }
    );
    return Array.isArray(json) ? json : [];
  }

  async function nuvioPushPlugins(token, profileId, plugins) {
    await nuvioApiFetch('/rest/v1/rpc/sync_push_plugins', {
      method: 'POST',
      token,
      body: { p_profile_id: profileId, p_plugins: plugins }
    });
  }

  function nuvioNormalizeUrl(u) {
    return String(u || '').trim().replace(/\/+$/, '').toLowerCase();
  }

  function accountStep() {
    const html = `
      <p>Create your Nuvio account now, right here — it takes a moment, and it'll already be set up the first time you open the app. You can skip this and do it later from inside Nuvio instead, if you'd rather.</p>
      <div id="guideAuthSignedOut">
        <div class="filter-bar auth-tabs" id="guideAuthTabs" role="group" aria-label="Choose sign in or create account">
          <button class="filter-chip active" data-guide-auth-tab="signup" type="button">Create Account</button>
          <button class="filter-chip" data-guide-auth-tab="signin" type="button">Already have one? Sign In</button>
        </div>
        <form class="account-form" id="guideAuthForm" novalidate>
          <div class="form-field">
            <label class="form-label" for="guideAuthEmail">Email</label>
            <input class="form-input" type="email" id="guideAuthEmail" name="email" placeholder="you@example.com" autocomplete="email" required>
          </div>
          <div class="form-field">
            <label class="form-label" for="guideAuthPassword">Password</label>
            <input class="form-input" type="password" id="guideAuthPassword" name="password" placeholder="••••••••" autocomplete="new-password" minlength="6" required>
          </div>
          <button class="btn btn-primary" type="submit" id="guideAuthSubmitBtn">Create Account</button>
        </form>
        <p class="sync-status" id="guideAuthStatus"></p>
      </div>
      <div id="guideAuthSignedIn" style="display:none;">
        <div class="account-user-row">
          <span class="who" id="guideAuthWhoami"></span>
          <button class="link-btn" id="guideSignOutBtn" type="button">Sign out</button>
        </div>
        <div class="form-field" style="margin-bottom: 1.25rem;">
          <label class="form-label" for="guideProfileSelect">Profile</label>
          <select class="form-input" id="guideProfileSelect"></select>
        </div>
        <div class="action-buttons">
          <button class="btn btn-primary" id="guideAddPluginBtn" type="button">Add Eclipsia to This Profile</button>
        </div>
        <p class="sync-status" id="guidePluginStatus"></p>
      </div>
      <div class="guide-note">This talks directly to Nuvio's own account server — nothing is stored on this site.<br><strong>After adding Eclipsia, click Next ></strong></div>
    `;
    return { title: 'Create your Nuvio account', html, wire: wireAccountStep };
  }

  function tmdbApiStep() {
    const html = `
      <p>A free TMDB API key is required for reliable results. Getting a free API key takes about a minute.</p>
      <div class="guide-steps">
        <div class="guide-step">
          <span class="num">1</span>
          <span class="txt">Create a free account at <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">themoviedb.org</a>.</span>
        </div>
        <div class="guide-step">
          <span class="num">2</span>
          <span class="txt">Once logged in, go to <div class="path-row"><span class="seg">Settings</span><span class="sep">→</span><span class="seg">API</span></div>then click <code>Create</code> under "Request an API Key".</span>
        </div>
        <div class="guide-step">
          <span class="num">3</span>
          <span class="txt">Choose <code>Developer</code>, accept the terms, and fill in the short application form. For personal use, "Application Name" and "Application URL" can be anything (e.g. <code>https://nuvio.tv</code></span>
        </div>
        <div class="guide-step">
          <span class="num">4</span>
          <span class="txt">Once approved (usually instant), copy the <strong>API Key (v3 auth)</strong> value from your new API settings page.</span>
        </div>
        <div class="guide-step">
          <span class="num">5</span>
          <span class="txt">Open Nuvio, then log-in using your <strong>Nuvio account's email and password</strong> from the previous step. Now Click the profile picture in bottom right corner<div class="path-row"><span class="seg">Settings</span><span class="sep">→</span><span class="seg">Scroll Down to <strong>Integrations</strong></span><span class="sep">→</span><span class="seg">TMDB Enrichment</span></div>Paste and save.</span>
        </div>
      </div>
      <div class="warning-banner">
        <span class="mark">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L14.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 17h.01"/></svg>
        </span>
        <div class="banner-body">
          <p><strong>Don't share this key with anyone</strong> — not in screenshots, public chats, or code you post publicly. Treat it like a password: anyone who has it can make requests against your TMDB account.</p>
        </div>
      </div>
    `;
    return step('Add your TMDB API key', html);
  }

  function wireAccountStep(body) {
    if (!body) return;
    const signedOutSection = body.querySelector('#guideAuthSignedOut');
    const signedInSection = body.querySelector('#guideAuthSignedIn');
    const tabs = body.querySelector('#guideAuthTabs');
    const form = body.querySelector('#guideAuthForm');
    const emailEl = body.querySelector('#guideAuthEmail');
    const passwordEl = body.querySelector('#guideAuthPassword');
    const submitBtn = body.querySelector('#guideAuthSubmitBtn');
    const authStatus = body.querySelector('#guideAuthStatus');
    const whoami = body.querySelector('#guideAuthWhoami');
    const profileSelect = body.querySelector('#guideProfileSelect');
    const addPluginBtn = body.querySelector('#guideAddPluginBtn');
    const pluginStatus = body.querySelector('#guidePluginStatus');
    const signOutBtn = body.querySelector('#guideSignOutBtn');
    if (!form || !tabs || !signedOutSection || !signedInSection) return;

    let mode = 'signup';

    function setStatus(el, text, state) {
      if (!el) return;
      el.textContent = text || '';
      el.classList.remove('ok', 'error', 'pending');
      if (state) el.classList.add(state);
    }

    function setMode(next) {
      mode = next;
      tabs.querySelectorAll('.filter-chip').forEach((chip) => {
        chip.classList.toggle('active', chip.dataset.guideAuthTab === next);
      });
      submitBtn.textContent = next === 'signin' ? 'Sign In' : 'Create Account';
      passwordEl.setAttribute('autocomplete', next === 'signin' ? 'current-password' : 'new-password');
      setStatus(authStatus, '', '');
    }

    function showSignedOut() {
      signedOutSection.style.display = '';
      signedInSection.style.display = 'none';
      setStatus(pluginStatus, '', '');
    }

    function showSignedIn(user) {
      signedOutSection.style.display = 'none';
      signedInSection.style.display = '';
      setStatus(whoami, user && user.email ? `Signed in as ${user.email}` : 'Signed in', '');
      setStatus(authStatus, '', '');
    }

    function populateProfiles(profiles) {
      if (!profileSelect) return;
      profileSelect.innerHTML = '';
      const list = (profiles && profiles.length)
        ? profiles.slice().sort((a, b) => a.profile_index - b.profile_index)
        : [1, 2, 3, 4, 5, 6].map((i) => ({ profile_index: i, name: `Profile ${i}` }));
      list.forEach((p) => {
        const opt = document.createElement('option');
        opt.value = String(p.profile_index);
        opt.textContent = p.name ? `${p.name} (Profile ${p.profile_index})` : `Profile ${p.profile_index}`;
        profileSelect.appendChild(opt);
      });
    }

    async function afterAuthenticated(session) {
      nuvioSaveSession(session);
      showSignedIn(session.user);
      setStatus(pluginStatus, '', '');
      if (profileSelect) profileSelect.innerHTML = '<option>Loading profiles…</option>';
      try {
        const profiles = await nuvioListProfiles(session.access_token);
        populateProfiles(profiles);
      } catch {
        populateProfiles([]);
      }
    }

    tabs.querySelectorAll('.filter-chip').forEach((chip) => {
      chip.addEventListener('click', () => setMode(chip.dataset.guideAuthTab));
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = (emailEl.value || '').trim();
      const password = passwordEl.value || '';
      if (!email || !password) {
        setStatus(authStatus, 'Enter your email and password.', 'error');
        return;
      }
      const isSignUp = mode === 'signup';
      submitBtn.disabled = true;
      submitBtn.textContent = isSignUp ? 'Creating account…' : 'Signing in…';
      setStatus(authStatus, '', 'pending');
      try {
        const path = isSignUp ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password';
        const json = await nuvioApiFetch(path, { method: 'POST', body: { email, password } });
        const session = nuvioSessionFromAuthResponse(json);
        if (session) {
          form.reset();
          await afterAuthenticated(session);
        } else {
          setStatus(authStatus, 'Account created. Check your email to confirm it, then sign in above.', 'ok');
          setMode('signin');
        }
      } catch (err) {
        setStatus(authStatus, err.message || 'Something went wrong. Please try again.', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = mode === 'signin' ? 'Sign In' : 'Create Account';
      }
    });

    if (signOutBtn) {
      signOutBtn.addEventListener('click', async () => {
        const token = await nuvioEnsureFreshToken();
        if (token) {
          try {
            await nuvioApiFetch('/auth/v1/logout', { method: 'POST', token });
          } catch {
          }
        }
        nuvioClearSession();
        form.reset();
        setMode('signin');
        showSignedOut();
      });
    }

    if (addPluginBtn) {
      addPluginBtn.addEventListener('click', async () => {
        const token = await nuvioEnsureFreshToken();
        if (!token) {
          setStatus(pluginStatus, 'Your session expired — please sign in again.', 'error');
          showSignedOut();
          return;
        }
        const profileId = parseInt(profileSelect.value, 10) || 1;
        addPluginBtn.disabled = true;
        addPluginBtn.textContent = 'Checking your plugins…';
        setStatus(pluginStatus, '', 'pending');
        try {
          const existing = await nuvioListPlugins(token, profileId);
          const alreadyAdded = existing.some((p) => nuvioNormalizeUrl(p.url) === nuvioNormalizeUrl(NUVIO_MANIFEST_URL));
          if (alreadyAdded) {
            setStatus(pluginStatus, 'Eclipsia is already in this profile\u2019s plugin list.', 'ok');
            return;
          }
          const maxSortOrder = existing.reduce((max, p) => Math.max(max, Number(p.sort_order) || 0), -1);
          const nextPlugins = existing
            .map((p) => ({
              url: p.url,
              name: p.name || undefined,
              enabled: p.enabled !== false,
              sort_order: Number(p.sort_order) || 0,
              repo_type: p.repo_type || undefined
            }))
            .concat([{
              url: NUVIO_MANIFEST_URL,
              name: NUVIO_PLUGIN_NAME,
              enabled: true,
              sort_order: maxSortOrder + 1,
              repo_type: 'remote'
            }]);
          addPluginBtn.textContent = 'Adding Eclipsia…';
          await nuvioPushPlugins(token, profileId, nextPlugins);
          setStatus(pluginStatus, 'Added! Eclipsia is now in your Nuvio plugins for this profile.', 'ok');
        } catch (err) {
          setStatus(pluginStatus, err.message || 'Could not update your plugins. Please try again.', 'error');
        } finally {
          addPluginBtn.disabled = false;
          addPluginBtn.textContent = 'Add Eclipsia to This Profile';
        }
      });
    }

    setMode('signup');
    (async () => {
      const stored = nuvioLoadSession();
      if (!stored) {
        showSignedOut();
        return;
      }
      const token = await nuvioEnsureFreshToken();
      if (!token) {
        showSignedOut();
        return;
      }
      showSignedIn(stored.user);
      if (profileSelect) profileSelect.innerHTML = '<option>Loading profiles…</option>';
      try {
        const profiles = await nuvioListProfiles(token);
        populateProfiles(profiles);
      } catch {
        populateProfiles([]);
      }
    })();
  }
  
  const ICONS = {
    androidMobile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="20" rx="2"/><line x1="11" y1="18" x2="13" y2="18"/></svg>',
    androidTv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
    ios: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>',
    webos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg>',
    tizen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="15" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/></svg>'
  };

  const step = (title, html) => ({ title, html });
  const finalOpenStep = (html) => ({ title: "You're all set — start using Nuvio!", html, isFinalOpen: true });

  const PLATFORMS = {
    'android-mobile': {
      label: 'Android Mobile',
      sub: 'Phone & tablet',
      icon: ICONS.androidMobile,
      intro: 'Sideloading the APK gets you the full version of Nuvio, with every feature. It takes about 2 minutes.',
      methods: [
        {
          id: 'sideload',
          label: 'Install Nuvio',
          tag: 'Recommended',
          desc: 'The full version, with every feature. Takes about 2 minutes.',
          steps: [
            step('Download the APK', `Open <a href="https://github.com/NuvioMedia/NuvioMobile/releases/latest" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Nuvio's latest Android release on GitHub</a> and download the APK file to your phone, or just tap the button below to grab it directly.<div style="max-width:240px; margin-top:0.85rem;"><a class="platform-btn platform-btn-primary" href="https://github.com/NuvioMedia/NuvioMobile/releases/latest/download/androidApp-full-release.apk" download="androidApp-full-release.apk" aria-label="Download Nuvio APK from GitHub" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg><span class="label"><span class="small">Download from</span><span class="big">GitHub</span></span></a></div>`),
            step('Allow installs from this source', `Go to <div class="path-row"><span class="seg">Settings</span><span class="sep">→</span><span class="seg">Apps</span><span class="sep">→</span><span class="seg">Install Unknown Apps</span></div>Pick your browser or file manager (whichever you'll open the APK with), then turn on <code>Allow from this source</code>.`),
            step('Install the app', `Open the file you downloaded and tap <code>Install</code>.`),
            finalOpenStep(`You may be asked to grant storage permission and to allow Nuvio to install unknown apps — that second one lets Nuvio update itself later. Allow both.`)
          ]
        }
      ],
      troubleshooting: [
        { q: '"Blocked by Play Protect" warning', a: `This happens because Nuvio isn't distributed through the Play Store. Tap <code>More details</code>, then <code>Install anyway</code>.` },
        { q: '"App not installed" error', a: `Make sure you have enough free storage, and double-check you downloaded the <strong>mobile</strong> APK, not the Android TV one.` }
      ]
    },

    'android-tv': {
      label: 'Android TV',
      sub: 'TV & set-top box',
      icon: ICONS.androidTv,
      intro: 'Sideload Nuvio using whichever method is easiest on your setup — both get you the full feature set.',
      methods: [
        {
          id: 'downloader',
          label: 'Downloader app code',
          tag: 'Recommended',
          desc: 'The easiest sideload method — type in a short code and it installs itself.',
          steps: [
            step('Turn on developer options', `Go to <div class="path-row"><span class="seg">Settings</span><span class="sep">→</span><span class="seg">System</span><span class="sep">→</span><span class="seg">About</span></div>Scroll to <code>Android TV OS build</code> and click it on your remote 7 times, until it says "You are now a developer!"`),
            step('Allow unknown apps for Downloader', `Back in Settings, go to <div class="path-row"><span class="seg">Apps</span><span class="sep">→</span><span class="seg">Security & Restrictions</span><span class="sep">→</span><span class="seg">Unknown sources</span></div>Find <strong>Downloader</strong> in the list and switch it on. (Install Downloader from the Play Store first if you don't have it.)`),
            step('Enter the install code', `Open the Downloader app, tap <code>Allow</code> so it can save files, then select the URL/Search box on the Home tab and type this code exactly:<div class="repo-url-box" style="margin-top:0.6rem;"><div class="repo-url-field"><div class="repo-url-value">4728718</div></div></div>`),
            step('Install', `Downloader will fetch the Nuvio APK automatically. When prompted, tap <code>Install</code>, and once it finishes, choose <code>Done</code> — not <code>Open</code>.`),
            step('Clean up', `Back in Downloader, hit <code>Delete</code> twice to remove the setup file and free up space.`)
          ]
        },
        {
          id: 'sendfiles',
          label: 'Send from your phone',
          desc: 'No developer tricks needed on the TV side beyond enabling unknown sources.',
          steps: [
            step('Download the TV APK on your phone', `In your phone's browser, open <a href="https://github.com/NuvioMedia/NuvioTV/releases/latest" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Nuvio TV's latest release on GitHub</a> and download the <strong>Universal Release</strong> APK.`),
            step('Install "Send files to TV"', `Install the app <strong>Send files to TV</strong> from the Play Store on both your phone and your TV. On the TV, also enable unknown sources for it — same steps as the Downloader method: <div class="path-row"><span class="seg">Settings</span><span class="sep">→</span><span class="seg">Apps</span><span class="sep">→</span><span class="seg">Security & Restrictions</span><span class="sep">→</span><span class="seg">Unknown sources</span></div>`),
            step('Send the file', `Make sure your phone and TV are on the same Wi-Fi network. Open the app on your TV and choose <code>Receive</code>. On your phone, open the app, choose <code>Send</code>, find the Nuvio APK you downloaded, and pick your TV.`),
            step('Install on the TV', `Select the received file on your TV and tap <code>Install</code>.`)
          ]
        }
      ],
      finalStep: step('Open Nuvio', `On first launch you may be asked to grant storage permission and allow Nuvio to install unknown apps — that's just so Nuvio can update itself later. Allow both.`),
      troubleshooting: [
        { q: '"Blocked by Play Protect" warning', a: `This happens because Nuvio isn't distributed through the Play Store. Tap <code>More details</code>, then <code>Install anyway</code>.` },
        { q: '"App not installed" error', a: `Make sure you have enough free storage, and double-check you downloaded the <strong>Android TV</strong> APK, not the mobile one.` }
      ]
    },

    ios: {
      label: 'iOS',
      sub: 'iPhone & iPad',
      icon: ICONS.ios,
      intro: `Apple's TestFlight only allows 10,000 testers, and that's normally full — so sideloading with Sideloadly or AltStore is the reliable way in. Both need a computer the first time.`,
      note: `Please don't message the Nuvio developers asking when TestFlight slots will open — it's genuinely not in their control.`,
      methods: [
        {
          id: 'sideloadly',
          label: 'Sideloadly',
          tag: 'Recommended',
          desc: 'A Mac or Windows PC, used once to sign the app.',
          steps: [
            step('Install Sideloadly', `Download and install <a href="https://sideloadly.io" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Sideloadly</a> on your Mac or PC. <span class="guide-note" style="display:block;margin-top:0.5rem;">Windows users: install iTunes and iCloud directly from apple.com — not the Microsoft Store versions.</span>`),
            step('Connect your iPhone', `Plug your phone into your computer with a USB cable. Unlock it and tap <code>Trust This Computer</code> if it asks.`),
            step('Load the IPA file', `Download the <a href="https://github.com/luqmanfadlli/NuvioMobile-iOS/releases/download/0.2.13/Nuvio-v0.2.13-Full.ipa" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Nuvio iOS .ipa file</a>, then drag it into the Sideloadly window (or click the IPA icon to browse for it).`),
            step('Enter your Apple ID and start', `Type your Apple ID email into the box, then click <code>Start</code>. When it asks for your Apple ID password, enter it — Sideloadly needs it to request a signing certificate from Apple.`),
            step('Trust the developer profile', `Once Sideloadly says "Done" and Nuvio appears on your home screen, don't open it yet. Go to <div class="path-row"><span class="seg">Settings</span><span class="sep">→</span><span class="seg">General</span><span class="sep">→</span><span class="seg">VPN & Device Management</span></div>Tap your Apple ID under "Developer App" and choose <code>Trust</code>.`),
            step('Enable Developer Mode', `Needed on iOS 16 and newer, and only once. Go to <div class="path-row"><span class="seg">Settings</span><span class="sep">→</span><span class="seg">Privacy & Security</span><span class="sep">→</span><span class="seg">Developer Mode</span></div>Toggle it on and let your phone restart.`)
          ]
        },
        {
          id: 'altstore',
          label: 'AltStore',
          desc: 'A Mac or Windows PC the first time, then reinstalls happen from your phone.',
          steps: [
            step('Install AltServer', `Download and install <a href="https://altstore.io" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">AltServer</a> on your Mac or PC. <span class="guide-note" style="display:block;margin-top:0.5rem;">Windows users: install iTunes and iCloud directly from apple.com — not the Microsoft Store versions.</span>`),
            step('Connect and trust', `Plug in your iPhone with a USB cable. Unlock it and tap <code>Trust This Computer</code> when asked.`),
            step('Install AltStore to your phone', `Launch AltServer, then click its icon in your menu bar (Mac) or system tray (Windows). Choose <code>Install AltStore</code> and select your iPhone. Enter your Apple ID and password when asked — this signs the app.`),
            step('Trust the developer profile', `Open <div class="path-row"><span class="seg">Settings</span><span class="sep">→</span><span class="seg">General</span><span class="sep">→</span><span class="seg">VPN & Device Management</span></div>Under "Developer App", tap your Apple ID email and choose <code>Trust</code>.`),
            step('Enable Developer Mode', `Needed on iOS 16 and newer, and only once. Go to <div class="path-row"><span class="seg">Settings</span><span class="sep">→</span><span class="seg">Privacy & Security</span><span class="sep">→</span><span class="seg">Developer Mode</span></div>Toggle it on — your phone will restart to apply it.`),
            step('Sideload the IPA', `On your iPhone, use Safari to download the <a href="https://github.com/luqmanfadlli/NuvioMobile-iOS/releases/download/0.2.13/Nuvio-v0.2.13-Full.ipa" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Nuvio iOS .ipa file</a>. Open the new AltStore app, go to <code>My Apps</code>, tap the <code>+</code> icon, and select the file you downloaded.`)
          ]
        }
      ],
      troubleshooting: []
    },

    webos: {
      label: 'webOS',
      sub: 'LG Smart TVs',
      icon: ICONS.webos,
      external: 'https://nuvio.wiki/installation/webos'
    },

    tizen: {
      label: 'Tizen',
      sub: 'Samsung Smart TVs',
      icon: ICONS.tizen,
      external: 'https://nuvio.wiki/installation/tizen'
    }
  };

  const PLATFORM_ORDER = ['android-mobile', 'android-tv', 'ios', 'webos', 'tizen'];
  const state = { platformId: null, methodId: null, stepIndex: 0 };
  function initMobileNav() {
    const navToggle = document.getElementById('navToggle');
    const mobileNav = document.getElementById('mobileNav');
    if (!navToggle || !mobileNav) return;

    const setOpen = (open) => {
      navToggle.setAttribute('aria-expanded', String(open));
      mobileNav.classList.toggle('open', open);
    };

    navToggle.addEventListener('click', () => {
      setOpen(navToggle.getAttribute('aria-expanded') !== 'true');
    });

    mobileNav.querySelectorAll('.mobile-nav-link').forEach((link) => {
      link.addEventListener('click', () => setOpen(false));
    });

    document.addEventListener('click', (e) => {
      if (navToggle.getAttribute('aria-expanded') !== 'true') return;
      if (mobileNav.contains(e.target) || navToggle.contains(e.target)) return;
      setOpen(false);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setOpen(false);
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 600) setOpen(false);
    });
  }

  initMobileNav();

  const root = document.getElementById('wizardRoot');
  if (!root) return;

  function currentPlatform() { return state.platformId ? PLATFORMS[state.platformId] : null; }
  function currentMethod() {
    const p = currentPlatform();
    if (!p || !p.methods) return null;
    return p.methods.find((m) => m.id === state.methodId) || null;
  }
  function currentSteps() {
    const m = currentMethod();
    const p = currentPlatform();
    if (!m) return [];

    if (p.finalStep) {
      return m.steps.concat([accountStep(), p.finalStep]);
    }

    const last = m.steps[m.steps.length - 1];
    if (last && last.isFinalOpen) {
      return m.steps.slice(0, -1).concat([accountStep(), tmdbApiStep(), last]);
    }

    return m.steps;
  }

  function goPlatformPicker() {
    state.platformId = null;
    state.methodId = null;
    state.stepIndex = 0;
    render();
    scrollToTop();
  }

  function hasSingleMethod(p) {
    return !!(p && !p.external && p.methods && p.methods.length === 1);
  }

  function pickPlatform(id) {
    state.platformId = id;
    const p = PLATFORMS[id];
    state.methodId = hasSingleMethod(p) ? p.methods[0].id : null;
    state.stepIndex = 0;
    render();
    scrollToTop();
  }

  function pickMethod(id) {
    state.methodId = id;
    state.stepIndex = 0;
    render();
    scrollToTop();
  }

  function backToMethods() {
    const p = currentPlatform();
    if (hasSingleMethod(p)) {
      goPlatformPicker();
      return;
    }
    state.methodId = null;
    state.stepIndex = 0;
    render();
    scrollToTop();
  }

  function nextStep() {
    const steps = currentSteps();
    if (state.stepIndex < steps.length - 1) {
      state.stepIndex += 1;
      render();
      scrollToTop();
    }
  }

  function prevStep() {
    if (state.stepIndex > 0) {
      state.stepIndex -= 1;
      render();
      scrollToTop();
    } else {
      backToMethods();
    }
  }

  function scrollToTop() {
    root.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function renderPlatformPicker() {
    const cards = PLATFORM_ORDER.map((id) => {
      const p = PLATFORMS[id];
      return `
        <button class="platform-pick-card" type="button" data-platform="${id}">
          <span class="ppc-icon">${p.icon}</span>
          <span class="ppc-label">${p.label}</span>
          <span class="ppc-sub">${p.sub}</span>
        </button>`;
    }).join('');

    const wrap = el(`
      <div class="wizard-stage">
        <div class="step-label">Step 1 — Choose your device</div>
        <div class="platform-pick-grid">${cards}</div>
      </div>
    `);

    wrap.querySelectorAll('[data-platform]').forEach((btn) => {
      btn.addEventListener('click', () => pickPlatform(btn.dataset.platform));
    });
    return wrap;
  }

  function renderExternal(p) {
    const wrap = el(`
      <div class="wizard-stage">
        <button class="wizard-back" type="button" data-back>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Choose a different device
        </button>
        <div class="step-label">${p.label}</div>
        <div class="warning-banner banner-neutral">
          <span class="mark">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
          </span>
          <div class="banner-body">
            <p>The in-page wizard for <strong>${p.label}</strong> (${p.sub}) is still being written. The full step-by-step install guide is ready on the Nuvio Wiki.</p>
            <a class="banner-cta" href="${p.external}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
              Open the ${p.label} guide
            </a>
          </div>
        </div>
      </div>
    `);
    wrap.querySelector('[data-back]').addEventListener('click', goPlatformPicker);
    return wrap;
  }

  function renderMethodPicker(p) {
    const cards = p.methods.map((m) => `
      <button class="method-pick-card" type="button" data-method="${m.id}">
        <span class="mpc-head">
          <span class="mpc-label">${m.label}</span>
          ${m.tag ? `<span class="mpc-tag">${m.tag}</span>` : ''}
        </span>
        <span class="mpc-desc">${m.desc}</span>
      </button>
    `).join('');

    const wrap = el(`
      <div class="wizard-stage">
        <button class="wizard-back" type="button" data-back>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Choose a different device
        </button>
        <div class="step-label">Step 2 — Choose how to install on ${p.label}</div>
        ${p.intro ? `<p class="hero-description" style="margin-bottom:1.25rem; font-size:0.95rem;">${p.intro}</p>` : ''}
        ${p.note ? `
        <div class="warning-banner">
          <span class="mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L14.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 17h.01"/></svg></span>
          <div class="banner-body"><p>${p.note}</p></div>
        </div>` : ''}
        <div class="method-pick-grid">${cards}</div>
      </div>
    `);

    wrap.querySelector('[data-back]').addEventListener('click', goPlatformPicker);
    wrap.querySelectorAll('[data-method]').forEach((btn) => {
      btn.addEventListener('click', () => pickMethod(btn.dataset.method));
    });
    return wrap;
  }

  function renderWizardStep(p, m) {
    const steps = currentSteps();
    const total = steps.length;
    const idx = state.stepIndex;
    const s = steps[idx];
    const isLast = idx === total - 1;
    const singleMethod = hasSingleMethod(p);
    const installStep = steps.find((st) => st.title === 'Install the app');
    const showTroubleshooting = !!(p.troubleshooting && p.troubleshooting.length && (installStep ? s === installStep : isLast));

    const dots = steps.map((_, i) => `<span class="wizard-dot ${i === idx ? 'active' : ''} ${i < idx ? 'done' : ''}"></span>`).join('');

    const wrap = el(`
      <div class="wizard-stage">
        <button class="wizard-back" type="button" data-back-methods>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          ${singleMethod ? 'Choose a different device' : `${p.label} — change method`}
        </button>

        <div class="wizard-progress">
          <div class="wizard-dots">${dots}</div>
          <span class="wizard-count">Step ${idx + 1} of ${total}</span>
        </div>

        <div class="wizard-card">
          <div class="wizard-card-eyebrow">${p.label} · ${m.label}</div>
          <h3 class="wizard-card-title">${s.title}</h3>
          <div class="wizard-card-body">${s.html}</div>
        </div>

        <div class="wizard-nav">
          <button class="btn" type="button" data-prev>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            Back
          </button>
          ${isLast
            ? `<a class="btn" href="https://t.me/eclipsia_nuvio" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                 Join Telegram
               </a>`
            : `<button class="btn btn-primary" type="button" data-next>
                 Next
                 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
               </button>`}
        </div>

        ${showTroubleshooting ? `
        <details class="manual-toggle" style="margin-top:1.5rem;">
          <summary>
            <span class="summary-label">
              <svg class="summary-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              Something not working?
            </span>
            <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </summary>
          <div class="manual-toggle-body">
            <div class="guide-steps">
              ${p.troubleshooting.map((t) => `
                <div class="guide-step">
                  <span class="num">?</span>
                  <span class="txt"><strong>${t.q}</strong><br>${t.a}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </details>` : ''}
      </div>
    `);

    wrap.querySelector('[data-back-methods]').addEventListener('click', backToMethods);
    wrap.querySelector('[data-prev]').addEventListener('click', prevStep);
    const nextBtn = wrap.querySelector('[data-next]');
    if (nextBtn) nextBtn.addEventListener('click', nextStep);
    if (typeof s.wire === 'function') s.wire(wrap.querySelector('.wizard-card-body'));
    return wrap;
  }

  const FOOTNOTE_DEFAULT_HTML = `Already have Nuvio installed? <a href="../#install">Jump straight to adding plugins</a>.`;
  const FOOTNOTE_FINAL_HTML = `Want to know more? The <a href="https://nuvio.wiki/" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">Nuvio Wiki</a> has the full documentation — credit to <strong>nuvio.wiki</strong> for putting this guide together.`;

  function updateFootnote(showFinal) {
    const el = document.getElementById('guideFootnoteText');
    if (!el) return;
    el.innerHTML = showFinal ? FOOTNOTE_FINAL_HTML : FOOTNOTE_DEFAULT_HTML;
  }

  function render() {
    root.innerHTML = '';
    let node;
    let onLastStep = false;
    if (!state.platformId) {
      node = renderPlatformPicker();
    } else {
      const p = currentPlatform();
      if (p.external) {
        node = renderExternal(p);
      } else if (!state.methodId) {
        node = renderMethodPicker(p);
      } else {
        const steps = currentSteps();
        onLastStep = steps.length > 0 && state.stepIndex === steps.length - 1;
        node = renderWizardStep(p, currentMethod());
      }
    }
    root.appendChild(node);
    updateFootnote(onLastStep);
  }

  render();
})();
