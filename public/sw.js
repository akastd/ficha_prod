const CACHE_VERSION = 'app-shell-v9';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;
const API_CACHE = `api-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

const PRECACHE_URLS = [
  '/',
  '/dashboard',
  '/ficha',
  '/clientes',
  '/kanban',
  '/relatorios',
  '/relatorios-cliente',
  '/index.html',
  '/ficha.html',
  '/dashboard.html',
  '/clientes.html',
  '/kanban.html',
  '/relatorios.html',
  '/relatorios_cliente.html',
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/favicon.ico',
  '/robots.txt',
  '/css/style.css',
  '/css/rich-text-editor.css',
  '/css/relatorios.css',
  '/css/kanban.css',
  '/css/images.css',
  '/css/drag-drop.css',
  '/css/design-tokens.css',
  '/css/tokens/colors.css',
  '/css/tokens/typography.css',
  '/css/tokens/spacing.css',
  '/css/tokens/radius.css',
  '/css/tokens/shadows.css',
  '/css/tokens/z-index.css',
  '/css/home.css',
  '/css/dashboard.css',
  '/css/cloudinary-styles.css',
  '/js/toast.js',
  '/js/utils/common.js',
  '/js/utils/toast.js',
  '/js/theme.js',
  '/js/rich-text-editor.js',
  '/js/relatorios/main.js',
  '/js/relatorios/actions.js',
  '/js/relatorios/render.js',
  '/js/relatorios/state.js',
  '/js/relatorios/utils.js',
  '/js/kanban/main.js',
  '/js/kanban/actions.js',
  '/js/kanban/dragdrop.js',
  '/js/kanban/modal.js',
  '/js/kanban/render.js',
  '/js/kanban/state.js',
  '/js/kanban/utils.js',
  '/js/dashboard/main.js',
  '/js/dashboard/actions.js',
  '/js/dashboard/render.js',
  '/js/dashboard/state.js',
  '/js/dashboard/utils.js',
  '/js/clientes/main.js',
  '/js/clientes/actions.js',
  '/js/clientes/render.js',
  '/js/clientes/state.js',
  '/js/clientes/utils.js',
  '/js/home/main.js',
  '/js/home/actions.js',
  '/js/home/render.js',
  '/js/home/state.js',
  '/js/home/utils.js',
  '/js/ficha/main.js',
  '/js/ficha/actions.js',
  '/js/ficha/public-api.js',
  '/js/ficha/render.js',
  '/js/ficha/state.js',
  '/js/ficha/utils.js',
  '/js/relatorios.js',
  '/js/main.js',
  '/js/kanban.js',
  '/js/integration.js',
  '/js/image-handler-cloudinary.js',
  '/js/dashboard.js',
  '/js/home.js',
  '/js/cloudinary-upload.js',
  '/js/clientes.js',
  '/js/api-client.js',
  '/data/catalogo.json',
  '/data/templates/camiseta_ml_gv.json',
  '/data/templates/camiseta_ml_gr.json',
  '/data/templates/camiseta_ml_gp.json',
  '/data/templates/camiseta_mc_gv.json',
  '/data/templates/camiseta_mc_gr.json',
  '/data/templates/camiseta_mc_gp.json',
  '/data/templates/camisa_masc_ml.json',
  '/data/templates/camisa_masc_mc.json',
  '/data/templates/camisa_fem_ml.json',
  '/data/templates/camisa_fem_mc.json',
  '/data/templates/baby_ml_gv.json',
  '/data/templates/baby_ml_gr.json',
  '/data/templates/baby_ml_gp.json',
  '/data/templates/baby_mc_gv.json',
  '/data/templates/baby_mc_gr.json',
  '/data/templates/baby_mc_gp.json',
  '/img/template/camiseta_ml_gv.svg',
  '/img/template/camiseta_ml_gr.svg',
  '/img/template/camiseta_ml_gp.svg',
  '/img/template/camiseta_mc_gv.svg',
  '/img/template/camiseta_mc_gr.svg',
  '/img/template/camiseta_mc_gp.svg',
  '/img/template/camisa_masc_ml.svg',
  '/img/template/camisa_masc_mc.svg',
  '/img/template/camisa_fem_ml.svg',
  '/img/template/camisa_fem_mc.svg',
  '/img/template/baby_ml_gv.svg',
  '/img/template/baby_ml_gr.svg',
  '/img/template/baby_ml_gp.svg',
  '/img/template/baby_mc_gv.svg',
  '/img/template/baby_mc_gr.svg',
  '/img/template/baby_mc_gp.svg',
  '/img/cursor-grab.svg',
  '/img/cursor-grabbing.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys
        .filter(key => ![STATIC_CACHE, RUNTIME_CACHE, API_CACHE].includes(key))
        .map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isNavigationRequest(request) {
  return request.mode === 'navigate';
}

function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

function isStaticAssetRequest(url) {
  return url.pathname.startsWith('/css/')
    || url.pathname.startsWith('/js/')
    || url.pathname.startsWith('/img/')
    || url.pathname.startsWith('/data/')
    || url.pathname === '/favicon.ico'
    || url.pathname === '/manifest.webmanifest';
}

function isCriticalAssetRequest(url) {
  return url.pathname.startsWith('/css/')
    || url.pathname.startsWith('/js/')
    || url.pathname.startsWith('/data/')
    || url.pathname === '/manifest.webmanifest';
}

async function networkFirst(request, cacheName, fallbackResponse) {
  const cache = await caches.open(cacheName);

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (_) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return fallbackResponse;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then(response => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    return cached;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) return networkResponse;

  if (request.destination === 'document') {
    return caches.match(OFFLINE_URL);
  }

  return new Response('', { status: 503, statusText: 'Offline' });
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!isSameOrigin(url)) return;

  if (isNavigationRequest(request)) {
    event.respondWith(
      networkFirst(
        request,
        RUNTIME_CACHE,
        caches.match(OFFLINE_URL)
      )
    );
    return;
  }

  if (isApiRequest(url)) {
    event.respondWith(
      networkFirst(
        request,
        API_CACHE,
        new Response(
          JSON.stringify({
            error: 'Sem conexao com o servidor',
            offline: true
          }),
          {
            status: 503,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
          }
        )
      )
    );
    return;
  }

  if (isStaticAssetRequest(url)) {
    if (isCriticalAssetRequest(url)) {
      event.respondWith(
        networkFirst(
          request,
          RUNTIME_CACHE,
          new Response('', { status: 503, statusText: 'Offline' })
        )
      );
      return;
    }

    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
  }
});
