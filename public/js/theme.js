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
  const NOTIFICATION_CHECK_INTERVAL_MS = 5 * 60 * 1000;
  const NOTIFICATION_MAX_ITEMS = 30;
  const AUTO_DELIVERY_NOTIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
  const NOTIFICATION_FEED_KEY = 'site_notifications_feed_v1';
  const NOTIFICATION_SENT_KEY = 'site_notifications_sent_v1';
  const NOTIFICATION_UNREAD_KEY = 'site_notifications_unread_v1';
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

  function toIsoDate(value) {
    if (!(value instanceof Date)) return '';
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function parseDateOnly(value) {
    const raw = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const [year, month, day] = raw.split('-').map(Number);
    const parsed = new Date(year, month - 1, day, 0, 0, 0, 0);
    if (
      parsed.getFullYear() !== year ||
      parsed.getMonth() !== (month - 1) ||
      parsed.getDate() !== day
    ) {
      return null;
    }
    return parsed;
  }

  function startOfDay(date) {
    const value = date instanceof Date ? date : new Date();
    return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
  }

  function addDays(date, days) {
    const base = startOfDay(date);
    base.setDate(base.getDate() + Number(days || 0));
    return base;
  }

  function getWeekRangeMondayToSunday(referenceDate) {
    const now = startOfDay(referenceDate);
    const weekDay = now.getDay(); // 0 dom, 1 seg
    const daysFromMonday = weekDay === 0 ? 6 : weekDay - 1;
    const monday = addDays(now, -daysFromMonday);
    const sunday = addDays(monday, 6);
    return { monday, sunday };
  }

  function formatDateBr(value) {
    const date = value instanceof Date ? value : parseDateOnly(value);
    if (!date) return '--/--/----';
    return date.toLocaleDateString('pt-BR');
  }

  function formatDateTimeBr(value) {
    const ts = parseTimestamp(value);
    if (!Number.isFinite(ts)) return '--/--/---- --:--';
    return new Date(ts).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short'
    });
  }

  function normalizeNotificationFichas(rawList) {
    const list = Array.isArray(rawList) ? rawList : [];
    return list.map(item => ({
      id: Number(item && item.id),
      cliente: normalizeString(item && item.cliente, 'Cliente não informado'),
      numeroVenda: normalizeString(item && (item.numero_venda || item.numeroVenda), ''),
      dataEntrega: normalizeString(item && (item.data_entrega || item.dataEntrega), ''),
      status: normalizeString(item && item.status, ''),
      evento: normalizeString(item && item.evento, 'nao'),
      autoEntregueEm: normalizeString(item && (item.auto_entregue_em || item.autoEntregueEm), '')
    })).filter(item => Number.isFinite(item.id));
  }

  function isPendente(ficha) {
    return normalizeString(ficha && ficha.status, '').toLowerCase() !== 'entregue';
  }

  function compareByEntregaDate(a, b) {
    const dateA = parseDateOnly(a && a.dataEntrega);
    const dateB = parseDateOnly(b && b.dataEntrega);
    const tsA = dateA ? dateA.getTime() : Number.MAX_SAFE_INTEGER;
    const tsB = dateB ? dateB.getTime() : Number.MAX_SAFE_INTEGER;
    return tsA - tsB;
  }

  function isNotificationExpired(item, nowTs = Date.now()) {
    const kind = normalizeString(item && item.kind, '').toLowerCase();
    if (kind !== 'auto_delivery') return false;

    const expiresAtTs = parseTimestamp(item && item.expiresAt);
    if (Number.isFinite(expiresAtTs)) {
      return expiresAtTs <= nowTs;
    }

    const createdAtTs = parseTimestamp(item && item.createdAt);
    if (!Number.isFinite(createdAtTs)) return false;
    return (createdAtTs + AUTO_DELIVERY_NOTIFICATION_TTL_MS) <= nowTs;
  }

  function pruneNotificationFeed(items) {
    const list = Array.isArray(items) ? items : [];
    const nowTs = Date.now();
    return list.filter(item => !isNotificationExpired(item, nowTs));
  }

  function readNotificationFeed() {
    try {
      const raw = localStorage.getItem(NOTIFICATION_FEED_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [];
      const pruned = pruneNotificationFeed(list).slice(0, NOTIFICATION_MAX_ITEMS);
      if (pruned.length !== list.length) {
        localStorage.setItem(NOTIFICATION_FEED_KEY, JSON.stringify(pruned));
      }
      return pruned;
    } catch (_) {
      return [];
    }
  }

  function writeNotificationFeed(items) {
    try {
      const list = Array.isArray(items) ? items.slice(0, NOTIFICATION_MAX_ITEMS) : [];
      localStorage.setItem(NOTIFICATION_FEED_KEY, JSON.stringify(list));
    } catch (_) {
      // ignore
    }
  }

  function readNotificationSentMap() {
    try {
      const raw = localStorage.getItem(NOTIFICATION_SENT_KEY);
      if (!raw) return { weekly: {}, deadline: {}, autoDelivery: {} };
      const parsed = JSON.parse(raw);
      const weekly = parsed && typeof parsed.weekly === 'object' ? parsed.weekly : {};
      const deadline = parsed && typeof parsed.deadline === 'object' ? parsed.deadline : {};
      const autoDelivery = parsed && typeof parsed.autoDelivery === 'object' ? parsed.autoDelivery : {};
      return { weekly, deadline, autoDelivery };
    } catch (_) {
      return { weekly: {}, deadline: {}, autoDelivery: {} };
    }
  }

  function writeNotificationSentMap(map) {
    try {
      const payload = map && typeof map === 'object'
        ? map
        : { weekly: {}, deadline: {}, autoDelivery: {} };
      localStorage.setItem(NOTIFICATION_SENT_KEY, JSON.stringify({
        weekly: payload.weekly || {},
        deadline: payload.deadline || {},
        autoDelivery: payload.autoDelivery || {}
      }));
    } catch (_) {
      // ignore
    }
  }

  function readNotificationUnread() {
    try {
      const value = Number(localStorage.getItem(NOTIFICATION_UNREAD_KEY));
      return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    } catch (_) {
      return 0;
    }
  }

  function writeNotificationUnread(count) {
    try {
      const safeCount = Math.max(0, Number(count) || 0);
      localStorage.setItem(NOTIFICATION_UNREAD_KEY, String(safeCount));
    } catch (_) {
      // ignore
    }
  }

  function buildWeeklyReminder(now, fichas, sentMap) {
    const today = startOfDay(now);
    if (today.getDay() !== 1) return null; // segunda-feira

    const { monday, sunday } = getWeekRangeMondayToSunday(today);
    const weekKey = toIsoDate(monday);
    if (sentMap.weekly && sentMap.weekly[weekKey]) return null;

    const pendentesDaSemana = fichas
      .filter(isPendente)
      .filter(ficha => {
        const entrega = parseDateOnly(ficha.dataEntrega);
        if (!entrega) return false;
        return entrega >= monday && entrega <= sunday;
      })
      .sort(compareByEntregaDate);

    if (pendentesDaSemana.length === 0) return null;

    const topLines = pendentesDaSemana.map(ficha => {
      const eventoTag = ficha.evento === 'sim' ? ' [Evento]' : '';
      return `#${ficha.id} - ${ficha.cliente} (${formatDateBr(ficha.dataEntrega)})${eventoTag}`;
    });

    return {
      id: `weekly-${weekKey}`,
      kind: 'weekly',
      title: 'Resumo semanal de pedidos',
      message: `${pendentesDaSemana.length} pedido(s) pendente(s) para esta semana.`,
      details: topLines,
      count: pendentesDaSemana.length,
      weekLabel: `${formatDateBr(monday)} até ${formatDateBr(sunday)}`,
      createdAt: new Date().toISOString(),
      sentKey: weekKey
    };
  }

  function buildDeadlineAlerts(now, fichas, sentMap) {
    const tomorrow = addDays(now, 1);
    const tomorrowKey = toIsoDate(tomorrow);
    const deadlineMap = sentMap && sentMap.deadline ? sentMap.deadline : {};

    return fichas
      .filter(isPendente)
      .filter(ficha => toIsoDate(parseDateOnly(ficha.dataEntrega)) === tomorrowKey)
      .sort(compareByEntregaDate)
      .map(ficha => {
        const key = `${ficha.id}:${tomorrowKey}`;
        if (deadlineMap[key]) return null;
        const eventoTag = ficha.evento === 'sim' ? ' [Evento]' : '';
        const vendaText = ficha.numeroVenda ? ` | Venda ${ficha.numeroVenda}` : '';
        return {
          id: `deadline-${key}`,
          kind: 'deadline',
          title: 'Prazo final: falta 1 dia',
          message: `Ficha #${ficha.id} (${ficha.cliente}) entrega amanhã.${eventoTag}${vendaText}`,
          details: [`Entrega: ${formatDateBr(ficha.dataEntrega)}`],
          cliente: ficha.cliente,
          fichaId: ficha.id,
          isEvento: ficha.evento === 'sim',
          dueDateLabel: formatDateBr(ficha.dataEntrega),
          createdAt: new Date().toISOString(),
          sentKey: key
        };
      })
      .filter(Boolean);
  }

  function buildAutoDeliveryAlerts(now, fichas, sentMap) {
    const nowTs = now instanceof Date ? now.getTime() : Date.now();
    const minTs = nowTs - AUTO_DELIVERY_NOTIFICATION_TTL_MS;
    const autoDeliveryMap = sentMap && sentMap.autoDelivery ? sentMap.autoDelivery : {};

    return fichas
      .map(ficha => {
        const deliveredTs = parseTimestamp(ficha && ficha.autoEntregueEm);
        if (!Number.isFinite(deliveredTs)) return null;
        if (deliveredTs < minTs || deliveredTs > nowTs) return null;

        const key = `${ficha.id}:${deliveredTs}`;
        if (autoDeliveryMap[key]) return null;

        const cliente = normalizeString(ficha && ficha.cliente, 'Cliente não informado');
        return {
          id: `auto-delivery-${ficha.id}-${deliveredTs}`,
          kind: 'auto_delivery',
          title: 'Auto-entrega aplicada',
          message: `Ficha de ${cliente} foi entregue automaticamente.`,
          cliente,
          fichaId: ficha.id,
          autoDeliveredAtLabel: formatDateTimeBr(deliveredTs),
          createdAt: new Date(deliveredTs).toISOString(),
          expiresAt: new Date(deliveredTs + AUTO_DELIVERY_NOTIFICATION_TTL_MS).toISOString(),
          sentKey: key
        };
      })
      .filter(Boolean)
      .sort((a, b) => parseTimestamp(b.createdAt) - parseTimestamp(a.createdAt));
  }

  function requestBrowserNotificationPermission() {
    if (!('Notification' in window)) return Promise.resolve('unsupported');
    if (Notification.permission === 'granted') return Promise.resolve('granted');
    if (Notification.permission === 'denied') return Promise.resolve('denied');
    return Notification.requestPermission();
  }

  function sendBrowserNotification(item) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    try {
      new Notification(item.title, {
        body: item.message,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: item.id
      });
    } catch (_) {
      // ignore
    }
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
        <div class="site-notification-wrapper">
          <button type="button" class="site-notification-btn" aria-label="Notificações do sistema" aria-expanded="false">
            <i class="fas fa-bell" aria-hidden="true"></i>
            <span class="site-notification-badge" hidden>0</span>
          </button>
          <div class="site-notification-panel" role="dialog" aria-label="Notificações do sistema" hidden>
            <div class="site-notification-panel-header">
              <strong>Notificações do Sistema</strong>
              <button type="button" class="site-notification-activate-btn">Ativar no navegador</button>
            </div>
            <div class="site-notification-permission" aria-live="polite"></div>
            <div class="site-notification-empty">Sem notificações no momento.</div>
            <div class="site-notification-list"></div>
          </div>
        </div>
        <div class="site-info-wrapper">
          <button type="button" class="site-info-btn" aria-label="Informações de conexão" aria-expanded="false">
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
    setupNotificationCenter(toolbar);
    hydrateToolbarData(toolbar);
    processSystemNotifications(toolbar);
    window.setInterval(() => {
      processSystemNotifications(toolbar);
    }, NOTIFICATION_CHECK_INTERVAL_MS);

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

  function extractLegacyDeadlineData(item) {
    const messageRaw = normalizeString(item && item.message, '');
    const titleRaw = normalizeString(item && item.title, '');
    const details = Array.isArray(item && item.details) ? item.details : [];
    const idRaw = normalizeString(item && item.id, '');

    const patterns = [
      /Ficha\s*#?(\d+)\s*\(([^)]+)\)\s*entrega\s*amanh[ãa]/i,
      /Ficha\s*de:\s*(.+?)\s*\(#?(\d+)\)\s*[ée]\s*para\s*amanh[ãa]/i
    ];

    let clienteFromMessage = '';
    let fichaIdFromMessage = NaN;
    for (const pattern of patterns) {
      const match = messageRaw.match(pattern);
      if (!match) continue;
      if (pattern === patterns[0]) {
        fichaIdFromMessage = Number(match[1]);
        clienteFromMessage = normalizeString(match[2], '');
      } else {
        clienteFromMessage = normalizeString(match[1], '');
        fichaIdFromMessage = Number(match[2]);
      }
      break;
    }

    let dueFromDetail = '';
    for (const line of details) {
      const parsedLine = normalizeString(line, '');
      const dueMatch = parsedLine.match(/Entrega:\s*(.+)$/i);
      if (dueMatch) {
        dueFromDetail = normalizeString(dueMatch[1], '');
        break;
      }
    }

    if (!dueFromDetail) {
      const idMatch = idRaw.match(/^deadline-(\d+):(\d{4}-\d{2}-\d{2})$/i);
      if (idMatch) {
        if (!Number.isFinite(fichaIdFromMessage)) {
          fichaIdFromMessage = Number(idMatch[1]);
        }
        dueFromDetail = formatDateBr(idMatch[2]);
      }
    }

    return {
      cliente: normalizeString(clienteFromMessage, normalizeString(titleRaw, '')),
      fichaId: Number.isFinite(fichaIdFromMessage) ? fichaIdFromMessage : null,
      dueDateLabel: dueFromDetail,
      isEvento: /\[Evento\]/i.test(messageRaw) || /evento/i.test(messageRaw)
    };
  }

  function buildNotificationItemHtml(item) {
    const kind = normalizeString(item && item.kind, 'info').toLowerCase();
    const meta = (() => {
      if (kind === 'weekly') {
        return { label: 'Update semanal', icon: 'fa-calendar-week', className: 'weekly' };
      }
      if (kind === 'deadline') {
        return { label: 'Prazo', icon: 'fa-hourglass-half', className: 'deadline' };
      }
      if (kind === 'auto_delivery') {
        return { label: 'Auto-entrega', icon: 'fa-check-circle', className: 'auto-delivery' };
      }
      return { label: 'Sistema', icon: 'fa-bell', className: 'info' };
    })();

    const createdAt = parseTimestamp(item && item.createdAt);
    const createdLabel = Number.isFinite(createdAt)
      ? new Date(createdAt).toLocaleString('pt-BR')
      : 'agora';
    const tituloRaw = normalizeString(item && item.title, 'Notificação');
    const mensagemRaw = normalizeString(item && item.message, '');
    const itemId = normalizeString(item && item.id, '');
    const titulo = escapeHtml(tituloRaw);
    const mensagem = escapeHtml(mensagemRaw);

    let bodyHtml = `<p class="site-notification-headline">${mensagem}</p>`;

    if (kind === 'deadline') {
      const legacy = extractLegacyDeadlineData(item);
      const clienteSafe = normalizeString(
        item && item.cliente,
        normalizeString(legacy.cliente, 'Cliente não informado')
      );
      const fichaIdValue = Number(item && item.fichaId);
      const fichaId = Number.isFinite(fichaIdValue) ? fichaIdValue : legacy.fichaId;
      const dueDateSafe = normalizeString(
        item && item.dueDateLabel,
        normalizeString(legacy.dueDateLabel, '--/--/----')
      );
      const isEvento = Boolean(item && item.isEvento) || Boolean(legacy.isEvento);
      const cliente = escapeHtml(clienteSafe);
      const dueDateLabel = escapeHtml(dueDateSafe);
      const eventoHtml = isEvento
        ? `<span class="site-notification-pill site-notification-pill--event"><i class="fas fa-star" aria-hidden="true"></i> Evento</span>`
        : '';

      bodyHtml = `
        <p class="site-notification-headline">
          Ficha de: <strong>${cliente}</strong>${Number.isFinite(fichaId) ? ` <span class="site-notification-inline-id">(#${fichaId})</span>` : ''} é para amanhã!
          ${eventoHtml}
        </p>
        <div class="site-notification-row">
          <span class="site-notification-row-label">Entrega:</span>
          <span class="site-notification-row-value">${dueDateLabel}</span>
        </div>
      `;
    } else if (kind === 'weekly') {
      const count = Number(item && item.count);
      const weekLabel = escapeHtml(normalizeString(item && item.weekLabel, ''));
      const details = Array.isArray(item && item.details) ? item.details : [];
      const listHtml = details.length > 0
        ? `<ul class="site-notification-list-compact">${details.slice(0, 8).map(line => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
        : '';

      bodyHtml = `
        <p class="site-notification-headline">
          ${Number.isFinite(count) ? `${count} pedido(s) para esta semana.` : mensagem}
        </p>
        ${weekLabel ? `<div class="site-notification-row"><span class="site-notification-row-label">Período:</span><span class="site-notification-row-value">${weekLabel}</span></div>` : ''}
        ${listHtml}
      `;
    } else if (kind === 'auto_delivery') {
      const clienteSafe = normalizeString(item && item.cliente, 'Cliente não informado');
      const fichaIdValue = Number(item && item.fichaId);
      const deliveredAt = escapeHtml(normalizeString(item && item.autoDeliveredAtLabel, formatDateTimeBr(item && item.createdAt)));
      const cliente = escapeHtml(clienteSafe);

      bodyHtml = `
        <p class="site-notification-headline">
          Ficha de <strong>${cliente}</strong>${Number.isFinite(fichaIdValue) ? ` <span class="site-notification-inline-id">(#${fichaIdValue})</span>` : ''} foi entregue automaticamente.
        </p>
        <div class="site-notification-row">
          <span class="site-notification-row-label">Concluída em:</span>
          <span class="site-notification-row-value">${deliveredAt}</span>
        </div>
      `;
    }

    return `
      <article class="site-notification-item site-notification-item--${meta.className}">
        <header class="site-notification-item-header">
          <div class="site-notification-item-title-wrap">
            <span class="site-notification-kind-badge">
              <i class="fas ${meta.icon}" aria-hidden="true"></i>
              ${escapeHtml(meta.label)}
            </span>
            <strong>${titulo}</strong>
          </div>
          <div class="site-notification-item-meta">
            <time>${escapeHtml(createdLabel)}</time>
            <button
              type="button"
              class="site-notification-dismiss-btn"
              data-action="dismiss-notification"
              data-id="${escapeHtml(itemId)}"
              aria-label="Marcar notificação como lida"
            >
              <i class="fas fa-check" aria-hidden="true"></i>
              Lida
            </button>
          </div>
        </header>
        <div class="site-notification-content">
          ${bodyHtml}
        </div>
      </article>
    `;
  }

  function updateNotificationBadge(toolbar, unread) {
    const badge = toolbar.querySelector('.site-notification-badge');
    if (!badge) return;
    const count = Math.max(0, Number(unread) || 0);
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.hidden = count <= 0;
  }

  function renderNotificationPanel(toolbar) {
    const panel = (toolbar && toolbar.__notificationPanel) || toolbar.querySelector('.site-notification-panel');
    if (!panel) return;

    const listEl = panel.querySelector('.site-notification-list');
    const emptyEl = panel.querySelector('.site-notification-empty');
    const permissionEl = panel.querySelector('.site-notification-permission');
    if (!listEl || !emptyEl || !permissionEl) return;

    const feed = readNotificationFeed();
    const unread = readNotificationUnread();
    updateNotificationBadge(toolbar, unread);

    if (feed.length === 0) {
      listEl.innerHTML = '';
      emptyEl.hidden = false;
    } else {
      listEl.innerHTML = feed.map(buildNotificationItemHtml).join('');
      emptyEl.hidden = true;
    }

    const permission = ('Notification' in window) ? Notification.permission : 'unsupported';
    if (permission === 'granted') {
      permissionEl.textContent = 'Notificações do navegador ativas.';
    } else if (permission === 'denied') {
      permissionEl.textContent = 'Notificações bloqueadas no navegador.';
    } else if (permission === 'unsupported') {
      permissionEl.textContent = 'Seu navegador não suporta notificações.';
    } else {
      permissionEl.textContent = 'Ative para receber alertas do sistema no navegador.';
    }
  }

  function setupNotificationCenter(toolbar) {
    const wrapper = toolbar.querySelector('.site-notification-wrapper');
    const button = toolbar.querySelector('.site-notification-btn');
    const panel = toolbar.querySelector('.site-notification-panel');
    const activateBtn = toolbar.querySelector('.site-notification-activate-btn');
    if (!wrapper || !button || !panel || !activateBtn) return;

    // Renderiza o painel fora do header para evitar conflitos de stacking context.
    if (panel.parentElement !== document.body) {
      document.body.appendChild(panel);
    }
    toolbar.__notificationPanel = panel;

    const positionPanel = () => {
      if (panel.hidden) return;
      const rect = button.getBoundingClientRect();
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      const panelWidth = Math.min(520, Math.max(280, viewportWidth - 24));
      const margin = 12;
      const left = Math.max(
        margin,
        Math.min(rect.right - panelWidth, viewportWidth - panelWidth - margin)
      );
      const top = rect.bottom + 8;

      panel.style.width = `${panelWidth}px`;
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    };

    const setOpen = (open) => {
      wrapper.classList.toggle('is-open', open);
      button.setAttribute('aria-expanded', String(open));
      panel.hidden = !open;
      if (open) {
        positionPanel();
        writeNotificationUnread(0);
        renderNotificationPanel(toolbar);
      }
    };

    setOpen(false);
    renderNotificationPanel(toolbar);

    button.addEventListener('click', event => {
      event.stopPropagation();
      const currentlyOpen = wrapper.classList.contains('is-open');
      setOpen(!currentlyOpen);
    });

    activateBtn.addEventListener('click', async () => {
      const result = await requestBrowserNotificationPermission();
      if (result === 'granted' && typeof window.mostrarSucesso === 'function') {
        window.mostrarSucesso('Notificações do navegador ativadas.');
      } else if (result === 'denied' && typeof window.mostrarAviso === 'function') {
        window.mostrarAviso('Notificações bloqueadas. Libere nas configurações do navegador.');
      }
      renderNotificationPanel(toolbar);
      positionPanel();
    });

    panel.addEventListener('click', event => {
      const dismissButton = event.target.closest('button[data-action="dismiss-notification"]');
      if (!dismissButton) return;

      const itemId = normalizeString(dismissButton.dataset.id, '');
      if (!itemId) return;

      const currentFeed = readNotificationFeed();
      const nextFeed = currentFeed.filter(item => String(item && item.id) !== itemId);
      if (nextFeed.length === currentFeed.length) return;

      writeNotificationFeed(nextFeed);
      renderNotificationPanel(toolbar);
    });

    document.addEventListener('click', event => {
      if (!wrapper.contains(event.target) && !panel.contains(event.target)) {
        setOpen(false);
      }
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    });

    window.addEventListener('resize', positionPanel);
    window.addEventListener('scroll', positionPanel, true);
  }

  async function processSystemNotifications(toolbar) {
    let fichas = [];
    try {
      fichas = normalizeNotificationFichas(
        await fetchJsonWithTimeout(`${API_BASE_URL}/fichas`, 8000)
      );
    } catch (_) {
      return;
    }

    const now = new Date();
    const sentMap = readNotificationSentMap();
    const pendingNewItems = [];

    const weekly = buildWeeklyReminder(now, fichas, sentMap);
    if (weekly) {
      pendingNewItems.push(weekly);
      sentMap.weekly[weekly.sentKey] = now.toISOString();
    }

    const deadlineItems = buildDeadlineAlerts(now, fichas, sentMap);
    deadlineItems.forEach(item => {
      pendingNewItems.push(item);
      sentMap.deadline[item.sentKey] = now.toISOString();
    });

    const autoDeliveryItems = buildAutoDeliveryAlerts(now, fichas, sentMap);
    autoDeliveryItems.forEach(item => {
      pendingNewItems.push(item);
      sentMap.autoDelivery[item.sentKey] = now.toISOString();
    });

    const currentFeed = readNotificationFeed();
    if (pendingNewItems.length === 0) {
      renderNotificationPanel(toolbar);
      return;
    }

    const existingIds = new Set(currentFeed.map(item => String(item && item.id)));
    const newItems = pendingNewItems.filter(item => !existingIds.has(String(item.id)));
    if (newItems.length === 0) {
      writeNotificationSentMap(sentMap);
      renderNotificationPanel(toolbar);
      return;
    }

    const nextFeed = [...newItems, ...currentFeed].slice(0, NOTIFICATION_MAX_ITEMS);
    writeNotificationFeed(nextFeed);
    writeNotificationUnread(readNotificationUnread() + newItems.length);
    writeNotificationSentMap(sentMap);

    newItems.forEach(sendBrowserNotification);
    renderNotificationPanel(toolbar);
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

