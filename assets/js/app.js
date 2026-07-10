(function () {
	'use strict';

	const MANIFEST_URL = 'https://codeberg.org/eclipsia/eclipsia-nuvio/raw/branch/main/manifest.json';

	const MANIFEST_FETCH_URL = 'https://codeberg.org/api/v1/repos/eclipsia/eclipsia-nuvio/raw/manifest.json?ref=main';

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
		disabledReason: 'Source offline',
		notes: 'Currently not working',
		types: ['anime']
	}
	];

	let scrapers = [];

	const repoUrl = MANIFEST_URL;
	const repocbUrl = 'https://codeberg.org/eclipsia/eclipsia-nuvio/raw/branch/main/stable/manifest.json';
	const els = {
		copyRepoBtn: document.getElementById('copyRepoBtn'),
		repoCopyText: document.getElementById('repoCopyText'),
		scraperContainer: document.getElementById('scraperCards'),
		filterBar: document.getElementById('filterBar'),
		noResults: document.getElementById('noResults'),
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
		lastUpdated: document.getElementById('lastUpdated'),
		providerSearch: document.getElementById('providerSearch'),
		providerSort: document.getElementById('providerSort')
	};

	let activeFilter = 'all';
	let activeSort = 'default';
	let activeSearch = '';

	function escapeHtml(str) {
		return String(str ?? '').replace(/[&<>"']/g, (c) => ({
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			"'": '&#39;'
		}[c]));
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
			disabledReason: s.enabled ? '' : (s.disabledReason || 'Currently unavailable'),
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

	function renderSkeleton(count = 6) {
		if (!els.scraperContainer) return;
		els.scraperContainer.innerHTML = Array.from({ length: count }).map(() => `
      <article class="provider-row skeleton-row" aria-hidden="true">
        <div class="provider-id">
          <span class="skeleton-block"></span>
          <span class="skeleton-block"></span>
        </div>
        <div class="provider-meta">
          <span class="skeleton-block"></span>
          <span class="skeleton-block"></span>
        </div>
        <div class="skeleton-block"></div>
        <div class="status-cell"><span class="skeleton-block"></span></div>
      </article>
    `).join('');
	}

	async function loadProviders() {
		setSyncStatus('Loading providers from manifest.json…');
		renderSkeleton();

		try {
			const res = await fetch(MANIFEST_FETCH_URL, {
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
		animateRows();
	}

	function getSortedFilteredScrapers() {
		let list = scrapers.slice();

		if (activeSearch) {
			const q = activeSearch.toLowerCase();
			list = list.filter(s =>
				s.name.toLowerCase().includes(q) ||
				s.provider.toLowerCase().includes(q)
			);
		}

		if (activeFilter !== 'all') {
			list = list.filter(s => s.types.includes(activeFilter));
		}

		if (activeSort === 'name-asc') {
			list.sort((a, b) => a.name.localeCompare(b.name));
		} else if (activeSort === 'name-desc') {
			list.sort((a, b) => b.name.localeCompare(a.name));
		} else if (activeSort === 'active-first') {
			list.sort((a, b) => {
				if (a.status === b.status) return 0;
				return a.status === 'enabled' ? -1 : 1;
			});
		}

		return list;
	}

	function renderRows() {
		if (!els.scraperContainer) return;
		const list = getSortedFilteredScrapers();

		if (!list.length) {
			els.scraperContainer.innerHTML = '';
			if (els.noResults) els.noResults.classList.add('visible');
			return;
		}
		if (els.noResults) els.noResults.classList.remove('visible');

		els.scraperContainer.innerHTML = list.map(s => {
			const isDisabled = s.status !== 'enabled';
			const disabledBadge = isDisabled
				? `<span class="disabled-reason">${escapeHtml(s.disabledReason || s.notes || 'Unavailable')}</span>`
				: '';
			return `
      <article class="provider-row ${s.status}" data-types="${s.types.join(',')}">
        <div class="provider-id">
          <span class="provider-name">${escapeHtml(s.name)}</span>
          <span class="provider-provider">${escapeHtml(s.provider)}</span>
          ${disabledBadge}
        </div>
        <div class="provider-meta">
          <div class="row"><span class="k">content</span><span class="v">${escapeHtml(s.content)}</span></div>
          <div class="row"><span class="k">language</span><span class="v">${escapeHtml(s.language)}</span></div>
        </div>
        <div class="provider-notes">${escapeHtml(s.notes)}</div>
        <div class="status-cell">
          <span class="status-pill ${isDisabled ? 'off' : 'on'}">${isDisabled ? 'Disabled' : 'Enabled'}</span>
        </div>
      </article>
    `;
		}).join('');
	}

	function applyFilter(filter) {
		activeFilter = filter;
		if (els.filterBar) {
			els.filterBar.querySelectorAll('.filter-chip').forEach(chip => {
				chip.classList.toggle('active', chip.dataset.filter === filter);
			});
		}
		renderRows();
		animateRows();
	}

	function animateRows() {
		requestAnimationFrame(() => {
			const rows = els.scraperContainer?.querySelectorAll('.provider-row:not(.skeleton-row)') || [];
			rows.forEach((row, i) => {
				row.style.opacity = '0';
				row.style.transform = 'translateY(6px)';
				setTimeout(() => {
					row.style.transition = `opacity 280ms var(--ease-out-expo), transform 280ms var(--ease-out-expo)`;
					row.style.opacity = '1';
					row.style.transform = 'translateY(0)';
				}, i * 40);
			});
		});
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
		const ok = await copyToClipboard(repocbUrl);
		if (ok && els.repoCopyText && els.copyRepoBtn) {
			els.repoCopyText.textContent = '✓ Copied!';
			els.copyRepoBtn.classList.add('copied');
			els.copyRepoBtn.style.transform = 'translateY(2px)';
			els.copyRepoBtn.style.boxShadow = 'var(--shadow-inner)';
			setTimeout(() => {
				els.copyRepoBtn.style.transform = '';
				els.copyRepoBtn.style.boxShadow = '';
			}, 100);
			setTimeout(() => {
				els.repoCopyText.textContent = 'Copy Link';
				els.copyRepoBtn.classList.remove('copied');
			}, 2000);
		}
	}

	function initScrollCta() {
		if (!els.heroSection || !els.fabAdd) return;

		let ticking = false;
		const onScroll = () => {
			if (!ticking) {
				requestAnimationFrame(() => {
					const scrollY = window.scrollY;
					const headerHeight = els.siteHeader ? els.siteHeader.getBoundingClientRect().height : 0;

					let fabPast;
					if (els.btnAddTop && els.btnAddTop.offsetParent !== null) {
						const rect = els.btnAddTop.getBoundingClientRect();
						fabPast = rect.bottom <= headerHeight;
					} else {
						fabPast = scrollY > els.heroSection.offsetTop + els.heroSection.offsetHeight - 80;
					}

					if (els.fabAdd) els.fabAdd.classList.toggle('visible', fabPast);
					if (els.fabTop) els.fabTop.classList.toggle('visible', scrollY > 400);

					ticking = false;
				});
				ticking = true;
			}
		};
		window.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', onScroll, { passive: true });
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
		setState(true);
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
				target.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
				'https://codeberg.org/api/v1/repos/eclipsia/eclipsia-nuvio/commits?path=manifest.json&limit=1&sha=main', {
				headers: { Accept: 'application/json' },
				referrerPolicy: 'no-referrer'
			}
			);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const commits = await res.json();
			const dateStr = commits?.[0]?.commit?.author?.date || commits?.[0]?.created;
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

	function initScrollReveal() {
		const groupSelectors = ['#scraperCards', '.method-pick-grid', '.platform-pick-grid'];

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

		const targets = document.querySelectorAll('.reveal');
		if (!targets.length) return;

		if ('IntersectionObserver' in window) {
			const observer = new IntersectionObserver((entries) => {
				entries.forEach(entry => {
					if (entry.isIntersecting) {
						entry.target.classList.add('in-view');
						observer.unobserve(entry.target);
					}
				});
			}, { threshold: 0.08, rootMargin: '0px 0px -60px 0px' });

			targets.forEach(el => observer.observe(el));
		} else {
			targets.forEach(el => el.classList.add('in-view'));
		}
	}

	function initFabTop() {
		if (!els.fabTop) return;
		els.fabTop.addEventListener('click', () => {
			window.scrollTo({ top: 0, behavior: 'smooth' });
		});
	}

	function initDesktopScrollFx() {
		if (!els.siteHeader) return;
		const isDesktop = () => window.matchMedia('(min-width: 761px)').matches;

		let ticking = false;
		const onScroll = () => {
			if (ticking) return;
			ticking = true;
			requestAnimationFrame(() => {
				if (isDesktop()) {
					els.siteHeader.classList.toggle('scrolled', window.scrollY > 4);
					if (els.filterBar) {
						const top = els.filterBar.getBoundingClientRect().top;
						const headerH = els.siteHeader.getBoundingClientRect().height;
						els.filterBar.classList.toggle('is-stuck', top <= headerH + 1);
					}
				} else {
					els.siteHeader.classList.remove('scrolled');
					if (els.filterBar) els.filterBar.classList.remove('is-stuck');
				}
				ticking = false;
			});
		};

		window.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', onScroll, { passive: true });
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
			let filterTimeout;
			els.filterBar.querySelectorAll('.filter-chip').forEach(chip => {
				chip.addEventListener('click', () => {
					clearTimeout(filterTimeout);
					filterTimeout = setTimeout(() => applyFilter(chip.dataset.filter), 30);
				});
			});
		}

		if (els.providerSearch) {
			let searchTimeout;
			els.providerSearch.addEventListener('input', () => {
				clearTimeout(searchTimeout);
				searchTimeout = setTimeout(() => {
					activeSearch = els.providerSearch.value.trim();
					renderRows();
					animateRows();
				}, 120);
			});
		}

		if (els.providerSort) {
			els.providerSort.addEventListener('change', () => {
				activeSort = els.providerSort.value;
				renderRows();
				animateRows();
			});
		}

		initScrollCta();
		initFabTop();
		initDesktopScrollFx();
		initProvidersToggle();
		initCollapsibleTriggers();
		initMobileNav();
		initScrollReveal();

		document.querySelectorAll('a[href^="#"]').forEach(a => {
			a.addEventListener('click', function (e) {
				const id = this.getAttribute('href').substring(1);
				const target = document.getElementById(id);
				if (target) {
					e.preventDefault();
					const offset = els.siteHeader ? els.siteHeader.offsetHeight : 80;
					window.scrollTo({
						top: target.offsetTop - offset,
						behavior: 'smooth'
					});
				}
			});
		});
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
	else init();
})();