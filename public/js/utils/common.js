(function () {
  'use strict';

  function debounce(fn, wait = 300) {
    let timeoutId = null;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn(...args), wait);
    };
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function formatDateBrIso(value, fallback = '-') {
    const raw = String(value || '').trim();
    if (!raw) return fallback;

    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return `${match[3]}/${match[2]}/${match[1]}`;
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    return parsed.toLocaleDateString('pt-BR');
  }

  const HTML_FILE_TO_ROUTE = Object.freeze({
    'index.html': '/',
    'dashboard.html': '/dashboard',
    'ficha.html': '/ficha',
    'clientes.html': '/clientes',
    'kanban.html': '/kanban',
    'relatorios.html': '/relatorios',
    'relatorios_cliente.html': '/relatorios-cliente'
  });

  const CLEAN_ROUTE_TO_FILE = Object.freeze({
    '/': 'index.html',
    '/index': 'index.html',
    '/dashboard': 'dashboard.html',
    '/ficha': 'ficha.html',
    '/clientes': 'clientes.html',
    '/kanban': 'kanban.html',
    '/relatorios': 'relatorios.html',
    '/relatorios-cliente': 'relatorios_cliente.html',
    '/relatorios_cliente': 'relatorios_cliente.html'
  });

  function normalizePathname(pathname) {
    if (!pathname || pathname === '/') return '/';
    return pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  }

  function resolveCleanPathname(pathname) {
    const normalizedPath = normalizePathname(pathname);
    const fileName = normalizedPath.split('/').pop();
    if (fileName && Object.prototype.hasOwnProperty.call(HTML_FILE_TO_ROUTE, fileName)) {
      return HTML_FILE_TO_ROUTE[fileName];
    }
    return Object.prototype.hasOwnProperty.call(CLEAN_ROUTE_TO_FILE, normalizedPath)
      ? normalizedPath
      : normalizedPath;
  }

  function toCleanPath(rawHref) {
    try {
      const url = new URL(rawHref, window.location.origin);
      if (url.origin !== window.location.origin) return rawHref;

      const cleanPathname = resolveCleanPathname(url.pathname);
      return `${cleanPathname}${url.search}${url.hash}`;
    } catch (_) {
      return rawHref;
    }
  }

  function injectNavigationStyles() {
    if (document.getElementById('app-nav-transition-style')) return;
    const style = document.createElement('style');
    style.id = 'app-nav-transition-style';
    style.textContent = `
      #app-nav-overlay {
        position: fixed;
        inset: 0;
        display: grid;
        place-items: center;
        background: var(--color-bg);
        opacity: 0;
        pointer-events: none;
        transition: opacity 160ms ease;
        z-index: var(--z-index-overlay, 9999);
      }

      html.app-nav-busy #app-nav-overlay {
        opacity: 1;
        pointer-events: auto;
      }

      .app-nav-panel {
        min-width: 180px;
        padding: 14px 16px;
        border-radius: var(--radius-md);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        color: var(--color-text);
        box-shadow: var(--shadow-md);
      }

      .app-nav-label {
        margin: 0 0 8px;
        font-size: 0.9rem;
      }

      .app-nav-progress {
        position: relative;
        height: 4px;
        border-radius: var(--radius-pill, 999px);
        overflow: hidden;
        background: var(--color-border);
      }

      .app-nav-progress::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 42%;
        height: 100%;
        border-radius: inherit;
        background: var(--color-primary);
        animation: app-nav-progress 920ms ease-in-out infinite;
      }

      @keyframes app-nav-progress {
        from { transform: translateX(-115%); }
        to { transform: translateX(245%); }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureNavigationOverlay() {
    let overlay = document.getElementById('app-nav-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'app-nav-overlay';
    overlay.setAttribute('aria-hidden', 'true');

    const panel = document.createElement('div');
    panel.className = 'app-nav-panel';

    const label = document.createElement('p');
    label.className = 'app-nav-label';
    label.textContent = 'Carregando...';

    const progress = document.createElement('div');
    progress.className = 'app-nav-progress';
    progress.setAttribute('aria-hidden', 'true');

    panel.appendChild(label);
    panel.appendChild(progress);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    return overlay;
  }

  function startNavigationTransition() {
    injectNavigationStyles();
    if (document.body) ensureNavigationOverlay();
    document.documentElement.classList.add('app-nav-busy');
  }

  let isNavigating = false;

  function navigateWithTransition(targetHref, options = {}) {
    if (!targetHref || isNavigating) return;

    const cleanTargetHref = toCleanPath(targetHref);
    const cleanCurrentHref = toCleanPath(window.location.href);
    if (cleanTargetHref === cleanCurrentHref) return;

    isNavigating = true;
    startNavigationTransition();

    window.setTimeout(() => {
      if (options.replace) {
        window.location.replace(cleanTargetHref);
        return;
      }
      window.location.assign(cleanTargetHref);
    }, 140);
  }

  function normalizeCurrentHistoryUrl() {
    const cleanCurrentHref = toCleanPath(window.location.href);
    const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (cleanCurrentHref !== currentHref) {
      window.history.replaceState(window.history.state || {}, '', cleanCurrentHref);
    }
  }

  function rewriteInternalHtmlAnchors() {
    const anchors = document.querySelectorAll('a[href]');
    anchors.forEach(anchor => {
      const hrefAttr = anchor.getAttribute('href');
      if (!hrefAttr || hrefAttr.startsWith('#') || hrefAttr.startsWith('javascript:')) return;

      let parsed;
      try {
        parsed = new URL(anchor.href, window.location.href);
      } catch (_) {
        return;
      }

      if (parsed.origin !== window.location.origin) return;
      const cleanHref = toCleanPath(parsed.href);
      if (cleanHref) {
        anchor.setAttribute('href', cleanHref);
      }
    });
  }

  function handleInternalAnchorNavigation(event) {
    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
    ) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) return;

    const anchor = target.closest('a[href]');
    if (!anchor || anchor.hasAttribute('download')) return;

    const targetAttr = String(anchor.getAttribute('target') || '').toLowerCase();
    if (targetAttr && targetAttr !== '_self') return;

    let parsed;
    try {
      parsed = new URL(anchor.href, window.location.href);
    } catch (_) {
      return;
    }

    if (parsed.origin !== window.location.origin || parsed.pathname.startsWith('/api/')) {
      return;
    }

    const cleanHref = toCleanPath(parsed.href);
    const cleanUrl = new URL(cleanHref, window.location.origin);
    const currentPath = normalizePathname(window.location.pathname);
    const targetPath = normalizePathname(cleanUrl.pathname);
    const samePath = currentPath === targetPath;
    const sameSearch = cleanUrl.search === window.location.search;
    const sameHash = cleanUrl.hash === window.location.hash;

    if (samePath && sameSearch && sameHash) {
      return;
    }

    if (samePath && sameSearch && !sameHash && cleanUrl.hash) {
      return;
    }

    event.preventDefault();
    navigateWithTransition(cleanHref);
  }

  function initializeNavigationUx() {
    normalizeCurrentHistoryUrl();
    rewriteInternalHtmlAnchors();
    document.addEventListener('click', handleInternalAnchorNavigation, true);
    window.addEventListener('beforeunload', startNavigationTransition);
    window.addEventListener('pageshow', () => {
      isNavigating = false;
      document.documentElement.classList.remove('app-nav-busy');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeNavigationUx, { once: true });
  } else {
    initializeNavigationUx();
  }

  window.appUtils = Object.freeze({
    debounce,
    escapeHtml,
    normalizeText,
    formatDateBrIso,
    toCleanPath,
    navigate: navigateWithTransition
  });
})();
