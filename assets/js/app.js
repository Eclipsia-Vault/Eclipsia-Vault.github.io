(function() {
	'use strict';

	const MANIFEST_URL = 'https://raw.githubusercontent.com/Eclipsia-Vault/eclipsia-nuvio/refs/heads/main/manifest.json';

	const FALLBACK_SCRAPERS = [{
			name: 'Eclipsia',
			provider: 'NoTorrent',
			content: 'Movies & TV Shows',
			language: 'English',
			status: 'enabled',
			notes: 'English only',
			types: ['movies', 'tv']
		},
		{
			name: 'Soryn',
			provider: 'Netmirror',
			content: 'Movies & TV Shows',
			language: 'English, Hindi',
			status: 'enabled',
			notes: 'Requires VPN in some regions',
			types: ['movies', 'tv']
		},
		{
			name: 'Vornix',
			provider: 'Multi Providers (4K)',
			content: 'Movies & TV Shows',
			language: 'English',
			status: 'enabled',
			notes: '4K content only',
			types: ['movies', 'tv']
		},
		{
			name: 'Onyxia',
			provider: 'AniZone',
			content: 'Anime',
			language: 'English, Japanese',
			status: 'enabled',
			notes: 'Subbed & dubbed anime',
			types: ['anime']
		},
		{
			name: 'Novus',
			provider: 'CineFreak',
			content: 'Movies & TV Shows',
			language: 'Bangla, English, Hindi',
			status: 'enabled',
			notes: 'Limited TV show catalog',
			types: ['movies', 'tv']
		},
		{
			name: 'Mavonyx',
			provider: 'MovieBox',
			content: 'Movies, TV & Anime',
			language: 'English, Bangla, Hindi',
			status: 'enabled',
			notes: 'Supports MP4, DASH',
			types: ['movies', 'tv', 'anime']
		},
		{
			name: 'Pynvix',
			provider: 'Multi Providers (1080p)',
			content: 'Movies & TV Shows',
			language: 'Bangla, English, Hindi',
			status: 'enabled',
			notes: '1080p content only',
			types: ['movies', 'tv']
		},
		{
			name: 'Solunix',
			provider: 'Stravo',
			content: 'Movies & TV Shows',
			language: 'English',
			status: 'enabled',
			notes: 'Download friendly',
			types: ['movies', 'tv']
		},
		{
			name: 'Nyxora',
			provider: 'Vidlink',
			content: 'Movies, TV & Anime',
			language: 'English, Bangla, Hindi',
			status: 'enabled',
			notes: 'Requires VPN in some regions',
			types: ['movies', 'tv', 'anime']
		},
		{
			name: 'Karnis',
			provider: 'Castle',
			content: 'Movies & TV Shows',
			language: 'English, Hindi',
			status: 'enabled',
			notes: 'Some titles have mismatched languages',
			types: ['movies', 'tv']
		},
		{
			name: 'Kryxalia',
			provider: 'AniNeko',
			content: 'Anime',
			language: 'English, Japanese',
			status: 'disabled',
			notes: 'Currently not working',
			types: ['anime']
		}
	];

	let scrapers = [];

	const repoUrl = MANIFEST_URL;

	const els = {
		copyRepoBtn: document.getElementById('copyRepoBtn'),
		repoCopyText: document.getElementById('repoCopyText'),
		scraperContainer: document.getElementById('scraperCards'),
		filterBar: document.getElementById('filterBar'),
		noResults: document.getElementById('noResults'),
		headerCta: document.getElementById('headerCta'),
		fabAdd: document.getElementById('fabAdd'),
		fabTop: document.getElementById('fabTop'),
		heroSection: document.getElementById('heroSection'),
		btnAddTop: document.getElementById('btnAddTop'),
		siteHeader: document.querySelector('.site-header'),
		providersToggleBtn: document.getElementById('providersToggleBtn'),
		providersBody: document.getElementById('providersBody'),
		tmdbGuide: document.getElementById('tmdbGuide'),
		manualAddGuide: document.getElementById('manualAddGuide'),
		navToggle: document.getElementById('navToggle'),
		mobileNav: document.getElementById('mobileNav'),
		syncStatus: document.getElementById('syncStatus'),
		statActive: document.getElementById('statActive'),
		statLangs: document.getElementById('statLangs'),
		manifestVersion: document.getElementById('manifestVersion'),
		lastUpdated: document.getElementById('lastUpdated')
	};

	let activeFilter = 'all';

	function escapeHtml(str) {
		return String(str ?? '').replace(/[&<>"']/g, (c) => ({
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			"'": '&#39;'
		} [c]));
	}

	function mapManifestScraper(s) {
		const name = String(s.name || '').replace(/\.\s*$/, '').trim();
		const desc = String(s.description || '');
		const descMatch = desc.match(/Provider:\s*([^|]+)\|\s*(.+)/i);
		const provider = descMatch ? descMatch[1].trim() : desc;
		const language = descMatch ? descMatch[2].trim() : '';

		const typeSet = new Set();
		(s.supportedTypes || []).forEach((t) => {
			if (t === 'movie') typeSet.add('movies');
			if (t === 'tv') typeSet.add('tv');
		});
		if (/anime/i.test(desc) || /anime/i.test(name)) typeSet.add('anime');

		const labelMap = {
			movies: 'Movies',
			tv: 'TV Shows',
			anime: 'Anime'
		};
		const labels = ['movies', 'tv', 'anime'].filter((t) => typeSet.has(t)).map((t) => labelMap[t]);
		const content = labels.length === 3 ?
			`${labels[0]}, ${labels[1]} & ${labels[2]}` :
			labels.join(' & ') || 'Unspecified';

		const formats = (s.formats || []).map((f) => String(f).toUpperCase());
		const notes = formats.length ? `Formats: ${formats.join(', ')}` : '—';

		return {
			name: name || s.id || 'Unnamed',
			provider,
			content,
			language,
			status: s.enabled ? 'enabled' : 'disabled',
			notes,
			types: Array.from(typeSet),
			contentLanguage: Array.isArray(s.contentLanguage) ? s.contentLanguage : []
		};
	}

	function updateStats(list) {
		if (els.statActive) els.statActive.textContent = list.filter((s) => s.status === 'enabled').length;
		if (els.statLangs) {
			const langs = new Set();
			list.forEach((s) => (s.contentLanguage || []).forEach((l) => langs.add(l)));
			els.statLangs.textContent = langs.size || '—';
		}
	}

	function setSyncStatus(text, state) {
		if (!els.syncStatus) return;
		els.syncStatus.textContent = text;
		els.syncStatus.classList.remove('ok', 'error');
		if (state) els.syncStatus.classList.add(state);
	}

	function renderSkeleton(count = 4) {
		if (!els.scraperContainer) return;
		els.scraperContainer.innerHTML = Array.from({ length: count }).map(() => `
      <article class="provider-row skeleton-row" aria-hidden="true">
        <div class="provider-id">
          <span class="skeleton-block" style="width:70%;height:14px;"></span>
          <span class="skeleton-block" style="width:45%;height:11px;"></span>
        </div>
        <div class="provider-meta">
          <span class="skeleton-block" style="width:85%;height:11px;"></span>
          <span class="skeleton-block" style="width:60%;height:11px;"></span>
        </div>
        <div class="skeleton-block" style="width:90%;height:11px;"></div>
        <div class="status-cell"><span class="skeleton-block" style="width:64px;height:20px;"></span></div>
      </article>
    `).join('');
	}

	async function loadProviders() {
		setSyncStatus('Loading providers from manifest.json…');
		renderSkeleton();
		try {
			const res = await fetch(MANIFEST_URL, {
				cache: 'no-store',
				referrerPolicy: 'no-referrer'
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			const list = Array.isArray(data.scrapers) ? data.scrapers.map(mapManifestScraper) : [];
			if (!list.length) throw new Error('Empty manifest');
			scrapers = list;
			if (els.manifestVersion && data.version) els.manifestVersion.textContent = `v${data.version} `;
			setSyncStatus('Live · synced with manifest.json', 'ok');
		} catch (err) {
			scrapers = FALLBACK_SCRAPERS;
			setSyncStatus('Could not reach manifest.json — showing last known list', 'error');
		}
		renderRows();
		updateStats(scrapers);
		applyFilter(activeFilter);
		if (els.scraperContainer) delete els.scraperContainer.dataset.revealTagged;
		initScrollReveal();
	}

	function renderRows() {
		if (!els.scraperContainer) return;
		els.scraperContainer.innerHTML = scrapers.map(s => `
      <article class="provider-row ${s.status}" data-types="${s.types.join(',')}">
        <div class="provider-id">
          <span class="provider-name">${escapeHtml(s.name)}</span>
          <span class="provider-provider">${escapeHtml(s.provider)}</span>
        </div>
        <div class="provider-meta">
          <div class="row"><span class="k">content</span><span class="v">${escapeHtml(s.content)}</span></div>
          <div class="row"><span class="k">language</span><span class="v">${escapeHtml(s.language)}</span></div>
        </div>
        <div class="provider-notes">${escapeHtml(s.notes)}</div>
        <div class="status-cell">
          <span class="status-pill ${s.status === 'enabled' ? 'on' : 'off'}">${s.status === 'enabled' ? 'Enabled' : 'Disabled'}</span>
        </div>
      </article>
    `).join('');
	}

	function applyFilter(filter) {
		activeFilter = filter;
		const rows = els.scraperContainer ? els.scraperContainer.querySelectorAll('.provider-row') : [];
		let visibleCount = 0;
		rows.forEach(row => {
			const types = (row.getAttribute('data-types') || '').split(',');
			const match = filter === 'all' || types.includes(filter);
			row.classList.toggle('filtered-out', !match);
			if (match) visibleCount++;
		});
		if (els.noResults) els.noResults.classList.toggle('visible', visibleCount === 0);
		if (els.filterBar) {
			els.filterBar.querySelectorAll('.filter-chip').forEach(chip => {
				chip.classList.toggle('active', chip.dataset.filter === filter);
			});
		}
	}

	async function copyToClipboard(text) {
		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(text);
				return true;
			}
			throw new Error('fallback');
		} catch {
			const ta = document.createElement('textarea');
			ta.value = text;
			ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
			document.body.appendChild(ta);
			ta.select();
			const ok = document.execCommand('copy');
			ta.remove();
			return ok;
		}
	}

	async function handleCopy(e) {
		e.preventDefault();
		const ok = await copyToClipboard(repoUrl);
		if (ok && els.repoCopyText && els.copyRepoBtn) {
			els.repoCopyText.textContent = '✓ Copied!';
			els.copyRepoBtn.classList.add('copied');
			setTimeout(() => {
				els.repoCopyText.textContent = 'Copy Link';
				els.copyRepoBtn.classList.remove('copied');
			}, 2000);
		}
	}

	function initScrollCta() {
		if (!els.heroSection || (!els.headerCta && !els.fabAdd)) return;
		const onScroll = () => {
			const headerHeight = els.siteHeader ? els.siteHeader.getBoundingClientRect().height : 0;

			let fabPast;
			if (els.btnAddTop && els.btnAddTop.offsetParent !== null) {
				const rect = els.btnAddTop.getBoundingClientRect();
				fabPast = rect.bottom <= headerHeight;
			} else {
				fabPast = window.scrollY > els.heroSection.offsetTop + els.heroSection.offsetHeight - 80;
			}

			const desktopPast = window.scrollY > els.heroSection.offsetTop + els.heroSection.offsetHeight - 80;

			if (els.headerCta) els.headerCta.classList.toggle('visible', desktopPast);
			if (els.fabAdd) els.fabAdd.classList.toggle('visible', fabPast);
		};
		window.addEventListener('scroll', onScroll, {
			passive: true
		});
		window.addEventListener('resize', onScroll, {
			passive: true
		});
		onScroll();
	}

	function initProvidersToggle() {
		if (!els.providersToggleBtn || !els.providersBody) return;
		const label = els.providersToggleBtn.querySelector('span');
		const setState = (expanded) => {
			els.providersToggleBtn.setAttribute('aria-expanded', String(expanded));
			els.providersBody.classList.toggle('expanded', expanded);
			if (label) label.textContent = expanded ? 'Hide Available Providers' : 'Show Available Providers';
		};
		setState(false);
		els.providersToggleBtn.addEventListener('click', () => {
			const expanded = els.providersToggleBtn.getAttribute('aria-expanded') === 'true';
			setState(!expanded);
		});
	}
  
	function initCollapsibleTriggers() {
		document.querySelectorAll('[data-opens]').forEach((trigger) => {
			const target = document.getElementById(trigger.getAttribute('data-opens'));
			if (!target) return;
			trigger.addEventListener('click', (e) => {
				e.preventDefault();
				target.open = true;
				trigger.setAttribute('aria-expanded', 'true');
				target.scrollIntoView({
					behavior: 'smooth',
					block: 'start'
				});
			});
			target.addEventListener('toggle', () => {
				trigger.setAttribute('aria-expanded', String(target.open));
			});
		});
	}

	async function loadLastUpdated() {
		if (!els.lastUpdated) return;
		try {
			const res = await fetch(
				'https://api.github.com/repos/Eclipsia-Vault/eclipsia-nuvio/commits?path=manifest.json&per_page=1', {
					headers: {
						Accept: 'application/vnd.github+json'
					},
					referrerPolicy: 'no-referrer'
				}
			);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const commits = await res.json();
			const dateStr = commits?.[0]?.commit?.author?.date;
			if (!dateStr) throw new Error('No commit date');
			const formatted = new Intl.DateTimeFormat('en-US', {
				month: 'short',
				year: 'numeric'
			}).format(new Date(dateStr));
			els.lastUpdated.textContent = `updated ${formatted}`;
		} catch (err) {
			els.lastUpdated.textContent = 'update date unavailable';
		}
	}

	function initMobileNav() {
		if (!els.navToggle || !els.mobileNav) return;

		const setOpen = (open) => {
			els.navToggle.setAttribute('aria-expanded', String(open));
			els.mobileNav.classList.toggle('open', open);
		};

		els.navToggle.addEventListener('click', () => {
			setOpen(els.navToggle.getAttribute('aria-expanded') !== 'true');
		});

		els.mobileNav.querySelectorAll('.mobile-nav-link').forEach((link) => {
			link.addEventListener('click', () => setOpen(false));
		});

		document.addEventListener('click', (e) => {
			if (els.navToggle.getAttribute('aria-expanded') !== 'true') return;
			if (els.mobileNav.contains(e.target) || els.navToggle.contains(e.target)) return;
			setOpen(false);
		});

		document.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') setOpen(false);
		});

		window.addEventListener('resize', () => {
			if (window.innerWidth > 600) setOpen(false);
		});
	}

	function autoTagRevealGroups() {
		const groupSelectors = [
			'#scraperCards',
			'.method-pick-grid',
			'.platform-pick-grid'
		];
		groupSelectors.forEach(sel => {
			document.querySelectorAll(sel).forEach(group => {
				if (group.dataset.revealTagged) return;
				group.dataset.revealTagged = 'true';
				group.classList.add('reveal-group');
				Array.from(group.children).forEach((child, i) => {
					child.classList.add('reveal');
					child.style.setProperty('--reveal-i', i);
				});
			});
		});
	}

	function initScrollReveal() {
		autoTagRevealGroups();
		const targets = document.querySelectorAll('.reveal');
		if (!targets.length) return;
		if (!('IntersectionObserver' in window)) {
			targets.forEach(el => el.classList.add('in-view'));
			return;
		}
		const observer = new IntersectionObserver((entries) => {
			entries.forEach(entry => {
				if (entry.isIntersecting) {
					entry.target.classList.add('in-view');
					observer.unobserve(entry.target);
				}
			});
		}, {
			threshold: 0.12,
			rootMargin: '0px 0px -40px 0px'
		});
		targets.forEach(el => observer.observe(el));
	}

	function initFabTop() {
		if (!els.fabTop) return;
		const onScroll = () => {
			els.fabTop.classList.toggle('visible', window.scrollY > 400);
		};
		els.fabTop.addEventListener('click', () => {
			window.scrollTo({
				top: 0,
				behavior: 'smooth'
			});
		});
		window.addEventListener('scroll', onScroll, {
			passive: true
		});
		onScroll();
	}

	function init() {
		loadProviders();
		loadLastUpdated();
		if (els.copyRepoBtn) {
			els.copyRepoBtn.addEventListener('click', handleCopy);
			els.copyRepoBtn.addEventListener('keydown', (e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					handleCopy(e);
				}
			});
		}
		if (els.filterBar) {
			els.filterBar.querySelectorAll('.filter-chip').forEach(chip => {
				chip.addEventListener('click', () => applyFilter(chip.dataset.filter));
			});
		}
		initScrollCta();
		initFabTop();
		initProvidersToggle();
		initCollapsibleTriggers();
		initMobileNav();
		initScrollReveal();
		document.querySelectorAll('a[href^="#"]').forEach(a => {
			a.addEventListener('click', function(e) {
				const id = this.getAttribute('href').substring(1);
				const target = document.getElementById(id);
				if (target) {
					e.preventDefault();
					target.scrollIntoView({
						behavior: 'smooth',
						block: 'start'
					});
				}
			});
		});
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
	else init();
})();