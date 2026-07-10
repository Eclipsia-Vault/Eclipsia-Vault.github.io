(function () {
	'use strict';

	function isMobile() {
		return window.matchMedia('(max-width: 760px)').matches;
	}

	function initTabbar() {
		var tabbar = document.getElementById('mobileTabbar');
		if (!tabbar) return;

		var path = location.pathname.replace(/index\.html$/, '');
		var items = Array.prototype.slice.call(tabbar.querySelectorAll('.tabbar-item'));

		items.forEach(function (item) {
			var href = item.getAttribute('href') || '';
			var resolved = new URL(href, location.href).pathname.replace(/index\.html$/, '');
			var isMatch = resolved === path;
			item.classList.toggle('active', isMatch);
			if (isMatch) item.setAttribute('aria-current', 'page');
			else item.removeAttribute('aria-current');
		});
	}

	function initHaptic() {
		var selector = '.btn, .neu-card, .resource-row, .profile-row, .tabbar-item, .filter-chip, .styled-button';
		document.addEventListener('touchstart', function (e) {
			var el = e.target.closest ? e.target.closest(selector) : null;
			if (!el) return;
			el.classList.add('tap-bounce-active');
			if (navigator.vibrate) {
				try { navigator.vibrate(8); } catch (err) { /* ignore */ }
			}
			setTimeout(function () {
				el.classList.remove('tap-bounce-active');
			}, 140);
		}, { passive: true });
	}

	function initSwipeBack() {
		var startX = 0, startY = 0, tracking = false;

		document.addEventListener('touchstart', function (e) {
			var t = e.touches[0];
			tracking = isMobile() && t.clientX < 24 && history.length > 1;
			if (tracking) {
				startX = t.clientX;
				startY = t.clientY;
			}
		}, { passive: true });

		document.addEventListener('touchend', function (e) {
			if (!tracking) return;
			tracking = false;
			var t = e.changedTouches[0];
			var dx = t.clientX - startX;
			var dy = t.clientY - startY;
			if (dx > 80 && Math.abs(dy) < 50) history.back();
		}, { passive: true });
	}

	function initPullToRefresh() {
		var indicator = document.createElement('div');
		indicator.className = 'ptr-indicator';
		indicator.innerHTML = '<span class="ptr-spinner"></span>';
		document.body.appendChild(indicator);

		var startY = 0, pulling = false, dist = 0;

		document.addEventListener('touchstart', function (e) {
			pulling = isMobile() && window.scrollY <= 0;
			if (pulling) startY = e.touches[0].clientY;
			dist = 0;
		}, { passive: true });

		document.addEventListener('touchmove', function (e) {
			if (!pulling) return;
			dist = e.touches[0].clientY - startY;
			if (dist > 0 && window.scrollY <= 0) {
				var clamped = Math.min(dist * 0.5, 70);
				indicator.style.transform = 'translate(-50%, ' + (clamped - 60) + 'px)';
				indicator.classList.toggle('ready', dist > 90);
			}
		}, { passive: true });

		document.addEventListener('touchend', function () {
			if (!pulling) return;
			pulling = false;
			if (dist > 90) {
				indicator.classList.add('loading');
				indicator.style.transform = 'translate(-50%, 6px)';
				setTimeout(function () { location.reload(); }, 400);
			} else {
				indicator.style.transform = '';
				indicator.classList.remove('ready');
			}
			dist = 0;
		}, { passive: true });
	}

	function init() {
		initTabbar();
		initHaptic();
		initSwipeBack();
		initPullToRefresh();
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
	else init();
})();