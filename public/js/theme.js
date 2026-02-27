/**
 * Tema global (light/dark) + barra de saudacao no header.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'site_theme_preference';
  const STATUS_CACHE_KEY = 'site_system_status_snapshot';
  const STATUS_CACHE_TTL_MS = 5 * 60 * 1000;
  const STATUS_REFRESH_INTERVAL_MS = 60 * 1000;
  const GREETING_MESSAGE_ROTATION_INTERVAL_MS = 15 * 1000;
  const FIXED_LOCATION = Object.freeze({
    latitude: -20.9317,
    longitude: -54.9614,
    city: 'Sidrol\u00E2ndia'
  });
  const DEFAULT_GREETING_STATUS_MESSAGES = [
    'Fichas atualizadas {{updatedText}}.'
  ];
  const DEFAULT_GREETING_STATUS_MESSAGES_BY_PERIOD = Object.freeze({
    morning: [
      'Fichas atualizadas {{updatedText}}.',
      'Bora tomar um café e tentar acordar!',
      'Que hoje nosso dia seja abeçoado.'
    ],
    afternoon: [
      'Fichas atualizadas {{updatedText}}.',
      'Pelo menos já tá de tarde.',
      'Por que o tempo passa mais devagar em {{city}}?'
    ],
    night: [
      'Fichas atualizadas {{updatedText}}.',
      'Tá trabalhando ainda? Vá descansar!',
      'Boa noite, espero que essa horas extras valham a pena!'
    ]
  });

  const API_BASE_URL = detectApiBaseURL();

  function detectApiBaseURL() {
    const hostname = window.location.hostname;

    if (hostname.includes('render.com') || hostname.includes('railway.app') || hostname.includes('onrender.com')) {
      return `${window.location.origin}/api`;
    }

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:3000/api';
    }

    return `${window.location.origin}/api`;
  }

  function normalizeTheme(value) {
    return value === 'dark' ? 'dark' : 'light';
  }

  function getSavedTheme() {
    try {
      return normalizeTheme(localStorage.getItem(STORAGE_KEY));
    } catch (_) {
      return 'light';
    }
  }

  function getGreeting(now) {
    const hour = now.getHours();
    if (hour >= 5 && hour < 12) return 'Bom dia!';
    if (hour >= 12 && hour < 18) return 'Boa tarde!';
    return 'Boa noite!';
  }

  function formatGreetingDate(now) {
    const formatted = now.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    return `Hoje \u00E9 ${formatted}.`;
  }

  function parseTimestamp(value) {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : NaN;
    }

    const raw = String(value || '').trim();
    if (!raw) return NaN;

    let parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;

    parsed = Date.parse(raw.replace(' ', 'T'));
    if (Number.isFinite(parsed)) return parsed;

    parsed = Date.parse(`${raw.replace(' ', 'T')}Z`);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function formatMinutesAgo(value) {
    const ts = parseTimestamp(value);
    if (!Number.isFinite(ts)) return 'h\u00E1 0 minutos';

    const minutes = Math.max(0, Math.floor((Date.now() - ts) / 60000));
    if (minutes < 60) {
      return minutes === 1 ? 'h\u00E1 1 minuto' : `h\u00E1 ${minutes} minutos`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      const remainingMinutes = minutes % 60;
      const hoursText = hours === 1 ? '1 hora' : `${hours} horas`;
      const minutesText = remainingMinutes === 1 ? '1 minuto' : `${remainingMinutes} minutos`;
      return `h\u00E1 ${hoursText} e ${minutesText}`;
    }

    const days = Math.floor(hours / 24);
    if (days < 7) {
      return days === 1 ? 'h\u00E1 1 dia' : `h\u00E1 ${days} dias`;
    }

    const weeks = Math.floor(days / 7);
    if (weeks < 5) {
      return weeks === 1 ? 'h\u00E1 1 semana' : `h\u00E1 ${weeks} semanas`;
    }

    const months = Math.floor(days / 30);
    if (months < 12) {
      return months === 1 ? 'h\u00E1 1 m\u00EAs' : `h\u00E1 ${months} meses`;
    }

    const years = Math.floor(days / 365);
    return years === 1 ? 'h\u00E1 1 ano' : `h\u00E1 ${years} anos`;
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeString(value, fallback = '') {
    const text = String(value == null ? '' : value).trim();
    return text || fallback;
  }

  function normalizeStatus(value) {
    return value === 'ok' || value === 'error' || value === 'warning' ? value : 'warning';
  }

  function normalizeSystemEntry(value, fallbackMessage) {
    const data = value && typeof value === 'object' ? value : {};

    return {
      status: normalizeStatus(data.status),
      message: normalizeString(data.message, fallbackMessage),
      url: normalizeString(data.url, ''),
      sha: normalizeString(data.sha, '')
    };
  }

  function buildDefaultSnapshot() {
    const now = Date.now();

    return {
      fetchedAt: now,
      lastFichaCreatedAt: now,
      weather: {
        city: FIXED_LOCATION.city,
        temperatureText: '--\u00B0C',
        icon: '\u{1F324}\uFE0F'
      },
      systems: {
        turso: normalizeSystemEntry(null, 'N\u00E3o verificado'),
        cloudinary: normalizeSystemEntry(null, 'N\u00E3o verificado'),
        vercel: normalizeSystemEntry(null, 'N\u00E3o verificado'),
        github: normalizeSystemEntry(null, 'N\u00E3o verificado')
      }
    };
  }

  function normalizeSnapshot(raw) {
    const fallback = buildDefaultSnapshot();
    const data = raw && typeof raw === 'object' ? raw : {};

    const fetchedAt = parseTimestamp(data.fetchedAt);
    const lastFichaCreatedAt = parseTimestamp(data.lastFichaCreatedAt);

    const weatherRaw = data.weather && typeof data.weather === 'object' ? data.weather : {};
    const systemsRaw = data.systems && typeof data.systems === 'object' ? data.systems : {};

    return {
      fetchedAt: Number.isFinite(fetchedAt) ? fetchedAt : fallback.fetchedAt,
      lastFichaCreatedAt: Number.isFinite(lastFichaCreatedAt) ? lastFichaCreatedAt : fallback.lastFichaCreatedAt,
      weather: {
        city: normalizeString(weatherRaw.city, fallback.weather.city),
        temperatureText: normalizeString(weatherRaw.temperatureText, fallback.weather.temperatureText),
        icon: normalizeString(weatherRaw.icon, fallback.weather.icon)
      },
      systems: {
        turso: normalizeSystemEntry(systemsRaw.turso, fallback.systems.turso.message),
        cloudinary: normalizeSystemEntry(systemsRaw.cloudinary, fallback.systems.cloudinary.message),
        vercel: normalizeSystemEntry(systemsRaw.vercel, fallback.systems.vercel.message),
        github: normalizeSystemEntry(systemsRaw.github, fallback.systems.github.message)
      }
    };
  }

  function readStatusCache() {
    try {
      const raw = localStorage.getItem(STATUS_CACHE_KEY);
      if (!raw) return null;
      return normalizeSnapshot(JSON.parse(raw));
    } catch (_) {
      return null;
    }
  }

  function writeStatusCache(snapshot) {
    try {
      localStorage.setItem(STATUS_CACHE_KEY, JSON.stringify(snapshot));
    } catch (_) {
      // ignore
    }
  }

  function isSnapshotStale(snapshot) {
    const fetchedAt = Number(snapshot && snapshot.fetchedAt);
    if (!Number.isFinite(fetchedAt)) return true;
    return (Date.now() - fetchedAt) > STATUS_CACHE_TTL_MS;
  }

  function fetchJsonWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

    return fetch(url, { signal: controller.signal })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
      })
      .finally(() => {
        window.clearTimeout(timeout);
      });
  }

  async function fetchStatusSnapshotFromApi() {
    const response = await fetchJsonWithTimeout(`${API_BASE_URL}/system-status`, 7000);

    return normalizeSnapshot({
      fetchedAt: response && response.generatedAt ? response.generatedAt : Date.now(),
      lastFichaCreatedAt: response && response.lastFichaCreatedAt ? response.lastFichaCreatedAt : Date.now(),
      weather: response && response.weather ? response.weather : null,
      systems: response && response.systems ? response.systems : null
    });
  }

  function isWeatherFallback(weather) {
    const temp = normalizeString(weather && weather.temperatureText, '');
    return !temp || temp === '--\u00B0C';
  }

  function weatherIconFromCode(code) {
    const numericCode = Number(code);
    if (!Number.isFinite(numericCode)) return '\u{1F324}\uFE0F';
    if (numericCode === 0) return '\u2600\uFE0F';
    if (numericCode === 1 || numericCode === 2) return '\u{1F324}\uFE0F';
    if (numericCode === 3) return '\u2601\uFE0F';
    if (numericCode === 45 || numericCode === 48) return '\u{1F32B}\uFE0F';
    if (numericCode >= 51 && numericCode <= 67) return '\u{1F326}\uFE0F';
    if (numericCode >= 71 && numericCode <= 77) return '\u2744\uFE0F';
    if (numericCode >= 80 && numericCode <= 82) return '\u{1F327}\uFE0F';
    if (numericCode >= 95) return '\u26C8\uFE0F';
    return '\u{1F324}\uFE0F';
  }

  function toTemperatureText(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '--\u00B0C';
    return `${Math.round(n)}\u00B0C`;
  }

  async function fetchWeatherByCoordinates(latitude, longitude, city) {
    const weather = await fetchJsonWithTimeout(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`,
      5000
    );

    const current = weather && weather.current ? weather.current : {};
    return {
      city: normalizeString(city, FIXED_LOCATION.city),
      temperatureText: toTemperatureText(current.temperature_2m),
      icon: weatherIconFromCode(current.weather_code)
    };
  }

  async function fetchFixedLocationWeather() {
    try {
      return await fetchWeatherByCoordinates(
        FIXED_LOCATION.latitude,
        FIXED_LOCATION.longitude,
        FIXED_LOCATION.city
      );
    } catch (_) {
      return null;
    }
  }

  async function enrichWeatherWithFixedLocation(snapshot) {
    if (!snapshot) return snapshot;

    try {
      const fixedWeather = await fetchFixedLocationWeather();
      if (!fixedWeather && !isWeatherFallback(snapshot.weather)) {
        return normalizeSnapshot({
          ...snapshot,
          weather: {
            ...snapshot.weather,
            city: FIXED_LOCATION.city
          }
        });
      }
      if (!fixedWeather) return snapshot;

      return normalizeSnapshot({
        ...snapshot,
        weather: {
          ...snapshot.weather,
          ...fixedWeather,
          city: FIXED_LOCATION.city
        }
      });
    } catch (_) {
      return snapshot;
    }
  }

  function getGreetingPeriod(now) {
    const hour = now.getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    return 'night';
  }

  function getConfiguredGreetingMessages(period) {
    const selectedPeriod = period || getGreetingPeriod(new Date());
    const externalGlobalMessages = Array.isArray(window.SITE_GREETING_STATUS_MESSAGES)
      ? window.SITE_GREETING_STATUS_MESSAGES
      : [];

    const externalByPeriodRaw = window.SITE_GREETING_STATUS_MESSAGES_BY_PERIOD;
    const externalByPeriod = externalByPeriodRaw && typeof externalByPeriodRaw === 'object'
      ? externalByPeriodRaw
      : {};
    const externalPeriodMessages = Array.isArray(externalByPeriod[selectedPeriod])
      ? externalByPeriod[selectedPeriod]
      : [];

    const baseGlobal = externalGlobalMessages.length > 0
      ? externalGlobalMessages
      : DEFAULT_GREETING_STATUS_MESSAGES;
    const basePeriod = Array.isArray(DEFAULT_GREETING_STATUS_MESSAGES_BY_PERIOD[selectedPeriod])
      ? DEFAULT_GREETING_STATUS_MESSAGES_BY_PERIOD[selectedPeriod]
      : [];

    const merged = [
      ...baseGlobal,
      ...basePeriod,
      ...externalPeriodMessages
    ];

    const normalizedUnique = Array.from(new Set(
      merged
        .map(item => normalizeString(item, ''))
        .filter(Boolean)
    ));

    return normalizedUnique.length > 0
      ? normalizedUnique
      : ['Fichas atualizadas {{updatedText}}.'];
  }

  let greetingStatusMessages = getConfiguredGreetingMessages(getGreetingPeriod(new Date()));
  let currentGreetingStatusTemplate = '';

  function pickRandomGreetingStatusTemplate(now, avoidCurrent) {
    const period = getGreetingPeriod(now || new Date());
    greetingStatusMessages = getConfiguredGreetingMessages(period);

    if (!Array.isArray(greetingStatusMessages) || greetingStatusMessages.length === 0) {
      greetingStatusMessages = ['Fichas atualizadas {{updatedText}}.'];
    }

    if (greetingStatusMessages.length === 1) {
      currentGreetingStatusTemplate = greetingStatusMessages[0];
      return currentGreetingStatusTemplate;
    }

    const candidates = avoidCurrent
      ? greetingStatusMessages.filter(item => item !== currentGreetingStatusTemplate)
      : greetingStatusMessages;

    const pool = candidates.length > 0 ? candidates : greetingStatusMessages;
    const index = Math.floor(Math.random() * pool.length);
    currentGreetingStatusTemplate = pool[index];
    return currentGreetingStatusTemplate;
  }

  function getCurrentGreetingStatusTemplate(now) {
    const currentPeriod = getGreetingPeriod(now || new Date());
    const periodMessages = getConfiguredGreetingMessages(currentPeriod);

    greetingStatusMessages = periodMessages;

    if (!currentGreetingStatusTemplate || !periodMessages.includes(currentGreetingStatusTemplate)) {
      return pickRandomGreetingStatusTemplate(now || new Date(), false);
    }

    return currentGreetingStatusTemplate;
  }

  function formatGreetingLine(snapshot) {
    const now = new Date();
    const weather = snapshot && snapshot.weather ? snapshot.weather : {};

    const icon = normalizeString(weather.icon, '\u{1F324}\uFE0F');
    const temperatureText = normalizeString(weather.temperatureText, '--\u00B0C');
    const city = normalizeString(weather.city, FIXED_LOCATION.city);
    const updatedText = formatMinutesAgo(snapshot && snapshot.lastFichaCreatedAt);
    const statusMessage = formatGreetingStatusMessage(
      getCurrentGreetingStatusTemplate(now),
      { updatedText, city, temperatureText }
    );

    return `${getGreeting(now)} ${formatGreetingDate(now)} ${icon} ${temperatureText} em ${city} | ${statusMessage}`;
  }

  function formatGreetingStatusMessage(template, context) {
    const safeTemplate = normalizeString(template, 'Fichas atualizadas {{updatedText}}.');
    const updatedText = normalizeString(context && context.updatedText, 'h\u00E1 0 minutos');
    const city = normalizeString(context && context.city, FIXED_LOCATION.city);
    const temperatureText = normalizeString(context && context.temperatureText, '--\u00B0C');

    return safeTemplate
      .replace(/\{\{\s*updatedText\s*\}\}/g, updatedText)
      .replace(/\{\{\s*city\s*\}\}/g, city)
      .replace(/\{\{\s*temperatureText\s*\}\}/g, temperatureText);
  }

  function rotateGreetingStatusMessage() {
    pickRandomGreetingStatusTemplate(new Date(), true);
  }

  function getStatusBadge(status) {
    if (status === 'ok') return { label: 'OK', className: 'ok' };
    if (status === 'error') return { label: 'Erro', className: 'error' };
    return { label: 'Aviso', className: 'warning' };
  }

  function buildTooltipHtml(snapshot) {
    const systems = snapshot && snapshot.systems ? snapshot.systems : {};
    const rows = [
      { key: 'turso', label: 'Banco de Dados' },
      { key: 'cloudinary', label: 'Cloudinary' },
      { key: 'vercel', label: 'Vercel.app' },
      { key: 'github', label: 'GitHub Status' }
    ];

    const rowsHtml = rows.map(row => {
      const entry = normalizeSystemEntry(systems[row.key], 'N\u00E3o dispon\u00EDvel');
      const badge = getStatusBadge(entry.status);

      let message = entry.message;
      if (row.key === 'github' && entry.sha) {
        const shortSha = entry.sha.slice(0, 7);
        if (!message.includes(shortSha)) {
          message = `${message} (${shortSha})`;
        }
      }

      const linkHtml = entry.url
        ? `<a href="${escapeHtml(entry.url)}" target="_blank" rel="noopener noreferrer" class="site-info-link">abrir</a>`
        : '';

      return `
        <div class="site-info-row">
          <span class="site-info-row-label">${escapeHtml(row.label)}</span>
          <span class="site-info-row-value">
            <span class="site-info-pill site-info-pill--${badge.className}">${badge.label}</span>
            <span class="site-info-row-text">${escapeHtml(message)}</span>
            ${linkHtml}
          </span>
        </div>
      `;
    }).join('');

    return `
      <div class="site-info-title">Conectividade</div>
      ${rowsHtml}
    `;
  }

  function renderGreeting(toolbar, snapshot) {
    const line = toolbar.querySelector('.site-theme-greeting-line');
    if (!line) return;

    const text = formatGreetingLine(snapshot);
    line.textContent = text;
  }

  function renderTooltip(toolbar, snapshot) {
    const tooltip = toolbar.querySelector('.site-info-tooltip');
    if (!tooltip) return;

    tooltip.innerHTML = buildTooltipHtml(snapshot);
  }

  function setupInfoTooltip(toolbar) {
    const wrapper = toolbar.querySelector('.site-info-wrapper');
    const button = toolbar.querySelector('.site-info-btn');
    const tooltip = toolbar.querySelector('.site-info-tooltip');

    if (!wrapper || !button || !tooltip) return;

    const setOpen = (open) => {
      wrapper.classList.toggle('is-open', open);
      button.setAttribute('aria-expanded', String(open));
      tooltip.hidden = !open;
    };

    setOpen(false);

    button.addEventListener('click', event => {
      event.stopPropagation();
      const currentlyOpen = wrapper.classList.contains('is-open');
      setOpen(!currentlyOpen);
    });

    document.addEventListener('click', event => {
      if (!wrapper.contains(event.target)) {
        setOpen(false);
      }
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    });
  }

  function setSwitchLabel(input, theme) {
    const wrapper = input.closest('.site-theme-switch');
    if (!wrapper) return;

    const label = wrapper.querySelector('.site-theme-switch-label');
    if (!label) return;

    label.textContent = theme === 'dark' ? 'Dark' : 'Light';
  }

  function applyTheme(theme, persist) {
    const normalized = normalizeTheme(theme);
    document.documentElement.setAttribute('data-theme', normalized);

    if (document.body) {
      document.body.classList.toggle('theme-dark', normalized === 'dark');
      document.body.classList.toggle('theme-light', normalized === 'light');
    }

    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, normalized);
      } catch (_) {
        // ignore
      }
    }

    document.querySelectorAll('.site-theme-switch input[type="checkbox"]').forEach(input => {
      input.checked = normalized === 'dark';
      setSwitchLabel(input, normalized);
    });
  }

  function hydrateToolbarData(toolbar) {
    let snapshot = readStatusCache() || buildDefaultSnapshot();

    renderGreeting(toolbar, snapshot);
    renderTooltip(toolbar, snapshot);

    const refreshSnapshot = async (force) => {
      const previousSnapshot = snapshot;

      try {
        snapshot = await fetchStatusSnapshotFromApi();
      } catch (_) {
        if (force && isSnapshotStale(snapshot)) {
          snapshot = buildDefaultSnapshot();
        }
      }

      snapshot = await enrichWeatherWithFixedLocation(snapshot);

      if (
        isWeatherFallback(snapshot.weather) &&
        previousSnapshot &&
        !isWeatherFallback(previousSnapshot.weather)
      ) {
        snapshot = normalizeSnapshot({
          ...snapshot,
          weather: previousSnapshot.weather
        });
      }

      writeStatusCache(snapshot);

      renderGreeting(toolbar, snapshot);
      renderTooltip(toolbar, snapshot);
    };

    refreshSnapshot(true);
    window.setInterval(() => {
      rotateGreetingStatusMessage();
      renderGreeting(toolbar, snapshot);
    }, GREETING_MESSAGE_ROTATION_INTERVAL_MS);
    window.setInterval(() => {
      refreshSnapshot(false);
    }, STATUS_REFRESH_INTERVAL_MS);
  }

  function createThemeToolbar() {
    const toolbar = document.createElement('div');
    toolbar.className = 'site-theme-toolbar';
    toolbar.innerHTML = `
      <div class="site-theme-greeting">
        <span class="site-theme-greeting-line" aria-live="polite">Carregando...</span>
      </div>
      <div class="site-theme-toolbar-actions">
        <div class="site-info-wrapper">
          <button type="button" class="site-info-btn" aria-label="Informacoes de conexao" aria-expanded="false">
            <i class="fas fa-circle-info" aria-hidden="true"></i>
          </button>
          <div class="site-info-tooltip" role="tooltip" hidden></div>
        </div>
        <label class="site-theme-switch" title="Alternar tema">
          <span class="site-theme-switch-label">Light</span>
          <input type="checkbox" role="switch" aria-label="Ativar modo dark">
          <span class="site-theme-switch-track" aria-hidden="true">
            <span class="site-theme-switch-thumb"></span>
          </span>
        </label>
      </div>
    `;

    const input = toolbar.querySelector('input[type="checkbox"]');
    if (input) {
      input.addEventListener('change', () => {
        applyTheme(input.checked ? 'dark' : 'light', true);
      });
    }

    setupInfoTooltip(toolbar);
    hydrateToolbarData(toolbar);

    return toolbar;
  }

  function injectToolbarIntoHeaders() {
    document.querySelectorAll('header > .header-content').forEach(headerContent => {
      const header = headerContent.parentElement;
      if (!header) return;
      if (header.querySelector(':scope > .site-theme-toolbar')) return;
      header.insertBefore(createThemeToolbar(), headerContent);
    });
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // sem bloqueio de UI se o registro falhar
      });
    });
  }

  const initialTheme = normalizeTheme(
    document.documentElement.getAttribute('data-theme') || getSavedTheme()
  );
  applyTheme(initialTheme, false);

  document.addEventListener('DOMContentLoaded', () => {
    injectToolbarIntoHeaders();
    applyTheme(getSavedTheme(), false);
    registerServiceWorker();
  });

  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY) return;
    applyTheme(getSavedTheme(), false);
  });
})();

