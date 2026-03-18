(function () {
  'use strict';

  const REFRESH_INTERVAL_MS = 2 * 60 * 1000;
  const PREVIEW_READY_MESSAGE = 'ficha-preview-ready';
  const PREVIEW_TIMEOUT_MS = 15000;
  const TREND_RANGE_DAYS = 'days';
  const TREND_RANGE_WEEKS = 'weeks';
  const TREND_RANGE_MONTHS = 'months';
  const FICHA_FALLBACK_STORAGE_KEY = 'fichas_nao_salvas_fallback_v1';
  const FALLBACK_LIST_LIMIT = 8;

  let previewModal = null;
  let previewIframe = null;
  let previewFichaId = null;
  let previewTimeoutId = null;
  let previewLoading = null;
  let previewTitle = null;
  let previewPrintBtn = null;
  let trendRange = TREND_RANGE_DAYS;
  let trendSource = [];
  const numberFormatter = new Intl.NumberFormat('pt-BR');
  const kpiAnimationFrames = new Map();

  function escapeHtml(value) {
    if (window.appUtils && typeof window.appUtils.escapeHtml === 'function') {
      return window.appUtils.escapeHtml(value);
    }
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDateBr(value) {
    if (!value) return '--/--/----';
    const [year, month, day] = String(value).split('-');
    if (!year || !month || !day) return '--/--/----';
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
  }

  function parseDateOnly(value) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return null;
    const [year, month, day] = String(value).split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function getDueInfo(value) {
    const date = parseDateOnly(value);
    if (!date) return { label: 'Sem data', isLate: false };

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.floor((date.getTime() - today.getTime()) / 86400000);

    if (diffDays === 0) return { label: 'Hoje', isLate: false };
    if (diffDays === 1) return { label: 'Amanhã', isLate: false };
    if (diffDays < 0) return { label: `Atrasado ${Math.abs(diffDays)}d`, isLate: true };
    return { label: `Em ${diffDays}d`, isLate: false };
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
  }

  function formatDateTimeBr(value) {
    if (!value) return '--';
    const date = parseDateTime(value);
    if (!date) return '--';
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function parseNumberLike(value) {
    const digits = String(value ?? '').replace(/[^\d-]/g, '');
    const parsed = Number(digits);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function animateKpiValue(id, targetValue) {
    const el = document.getElementById(id);
    if (!el) return;

    const next = Math.max(0, Math.round(Number(targetValue) || 0));
    const current = parseNumberLike(el.dataset.value ?? el.textContent);
    if (current === next) {
      el.textContent = numberFormatter.format(next);
      el.dataset.value = String(next);
      return;
    }

    const previousFrame = kpiAnimationFrames.get(id);
    if (previousFrame) window.cancelAnimationFrame(previousFrame);

    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = numberFormatter.format(next);
      el.dataset.value = String(next);
      return;
    }

    const duration = 650;
    const startTime = performance.now();

    const tick = (now) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(current + ((next - current) * eased));
      el.textContent = numberFormatter.format(value);
      el.dataset.value = String(value);

      if (progress < 1) {
        const raf = window.requestAnimationFrame(tick);
        kpiAnimationFrames.set(id, raf);
      } else {
        kpiAnimationFrames.delete(id);
        el.textContent = numberFormatter.format(next);
        el.dataset.value = String(next);
      }
    };

    const raf = window.requestAnimationFrame(tick);
    kpiAnimationFrames.set(id, raf);
  }

  function setStats(stats) {
    animateKpiValue('hubStatTotalFichas', stats?.totalFichas ?? 0);
    animateKpiValue('hubStatPendentes', stats?.pendentes ?? 0);
    animateKpiValue('hubStatClientes', stats?.totalClientes ?? 0);
    animateKpiValue('hubStatEntregues', stats?.entregues ?? 0);
  }

  function parseDateTime(value) {
    if (!value) return null;
    const raw = String(value).trim();
    if (!raw) return null;

    // Datas com timezone explícito (ex: Z, +00:00) devem respeitar o fuso original.
    if (/([zZ]|[+\-]\d{2}:?\d{2})$/.test(raw)) {
      const parsedWithTimezone = new Date(raw);
      return Number.isNaN(parsedWithTimezone.getTime()) ? null : parsedWithTimezone;
    }

    const simpleDateMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (simpleDateMatch) {
      const year = Number(simpleDateMatch[1]);
      const month = Number(simpleDateMatch[2]);
      const day = Number(simpleDateMatch[3]);
      return new Date(year, month - 1, day);
    }

    const dateTimeMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (dateTimeMatch) {
      const year = Number(dateTimeMatch[1]);
      const month = Number(dateTimeMatch[2]);
      const day = Number(dateTimeMatch[3]);
      const hour = Number(dateTimeMatch[4]);
      const minute = Number(dateTimeMatch[5]);
      const second = Number(dateTimeMatch[6] || 0);
      return new Date(year, month - 1, day, hour, minute, second);
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function startOfWeek(date) {
    const base = startOfDay(date);
    const day = base.getDay();
    const diff = (day + 6) % 7;
    base.setDate(base.getDate() - diff);
    return base;
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function addMonths(date, months) {
    return new Date(date.getFullYear(), date.getMonth() + months, 1);
  }

  function dateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function monthKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  function labelForDay(date) {
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  function labelForWeek(date) {
    return `Sem ${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
  }

  function labelForMonth(date) {
    return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
  }

  function normalizeCreatedDate(ficha) {
    return parseDateTime(ficha?.data_criacao || ficha?.data_inicio || ficha?.data_atualizacao);
  }

  function buildTrendSeries(fichas, range) {
    const points = [];
    const items = Array.isArray(fichas) ? fichas : [];
    const now = new Date();
    const today = startOfDay(now);

    if (range === TREND_RANGE_WEEKS) {
      const weekStarts = [];
      const currentWeek = startOfWeek(today);
      for (let i = 6; i >= 0; i -= 1) {
        weekStarts.push(addDays(currentWeek, -7 * i));
      }

      const buckets = new Map();
      weekStarts.forEach(start => buckets.set(dateKey(start), 0));

      items.forEach(ficha => {
        const rawDate = normalizeCreatedDate(ficha);
        if (!rawDate) return;
        const week = startOfWeek(rawDate);
        const key = dateKey(week);
        if (!buckets.has(key)) return;
        buckets.set(key, (buckets.get(key) || 0) + 1);
      });

      weekStarts.forEach(start => {
        const key = dateKey(start);
        points.push({
          label: labelForWeek(start),
          value: buckets.get(key) || 0
        });
      });

      return {
        points,
        summaryLabel: 'últimas semanas'
      };
    }

    if (range === TREND_RANGE_MONTHS) {
      const monthStarts = [];
      const currentMonth = startOfMonth(today);
      for (let i = 6; i >= 0; i -= 1) {
        monthStarts.push(addMonths(currentMonth, -i));
      }

      const buckets = new Map();
      monthStarts.forEach(start => buckets.set(monthKey(start), 0));

      items.forEach(ficha => {
        const rawDate = normalizeCreatedDate(ficha);
        if (!rawDate) return;
        const key = monthKey(startOfMonth(rawDate));
        if (!buckets.has(key)) return;
        buckets.set(key, (buckets.get(key) || 0) + 1);
      });

      monthStarts.forEach(start => {
        const key = monthKey(start);
        points.push({
          label: labelForMonth(start),
          value: buckets.get(key) || 0
        });
      });

      return {
        points,
        summaryLabel: 'últimos meses'
      };
    }

    const dayStarts = [];
    for (let i = 6; i >= 0; i -= 1) {
      dayStarts.push(addDays(today, -i));
    }

    const buckets = new Map();
    dayStarts.forEach(start => buckets.set(dateKey(start), 0));

    items.forEach(ficha => {
      const rawDate = normalizeCreatedDate(ficha);
      if (!rawDate) return;
      const key = dateKey(startOfDay(rawDate));
      if (!buckets.has(key)) return;
      buckets.set(key, (buckets.get(key) || 0) + 1);
    });

    dayStarts.forEach(start => {
      const key = dateKey(start);
      points.push({
        label: labelForDay(start),
        value: buckets.get(key) || 0
      });
    });

    return {
      points,
      summaryLabel: 'últimos 7 dias'
    };
  }

  function renderTrendChart(range) {
    const chartEl = document.getElementById('hubTrendChart');
    const summaryEl = document.getElementById('hubTrendSummary');
    if (!chartEl || !summaryEl) return;

    const series = buildTrendSeries(trendSource, range);
    const points = series.points;
    if (points.length === 0) {
      chartEl.innerHTML = '<p class="home-empty">Sem dados para o período.</p>';
      summaryEl.textContent = '--';
      return;
    }

    const width = 640;
    const height = 190;
    const top = 12;
    const right = 12;
    const bottom = 32;
    const left = 28;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const maxValue = Math.max(1, ...points.map(point => point.value));
    const stepX = points.length > 1 ? plotWidth / (points.length - 1) : plotWidth;

    const toY = (value) => top + plotHeight - (value / maxValue) * plotHeight;
    const toX = (index) => left + (index * stepX);

    const path = points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${toX(index).toFixed(2)} ${toY(point.value).toFixed(2)}`)
      .join(' ');

    const guides = [0, 0.33, 0.66, 1]
      .map(ratio => {
        const y = top + plotHeight - (ratio * plotHeight);
        return `<line class="home-trend-grid" x1="${left}" y1="${y.toFixed(2)}" x2="${(width - right).toFixed(2)}" y2="${y.toFixed(2)}"></line>`;
      })
      .join('');

    const pointsSvg = points
      .map((point, index) => {
        const x = toX(index).toFixed(2);
        const y = toY(point.value).toFixed(2);
        return `<circle class="home-trend-point" cx="${x}" cy="${y}" r="3.5" data-label="${escapeHtml(point.label)}" data-value="${point.value}"></circle>`;
      })
      .join('');

    const labelsSvg = points
      .map((point, index) => {
        const x = toX(index).toFixed(2);
        return `<text class="home-trend-label" x="${x}" y="${height - 10}" text-anchor="middle">${escapeHtml(point.label)}</text>`;
      })
      .join('');

    chartEl.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Gráfico de fichas criadas">
        ${guides}
        <line class="home-trend-axis" x1="${left}" y1="${(top + plotHeight).toFixed(2)}" x2="${(width - right).toFixed(2)}" y2="${(top + plotHeight).toFixed(2)}"></line>
        <path class="home-trend-line" d="${path}"></path>
        ${pointsSvg}
        ${labelsSvg}
      </svg>
      <div class="home-trend-tooltip" id="hubTrendTooltip"></div>
    `;

    bindTrendTooltip(chartEl);

    const total = points.reduce((sum, point) => sum + point.value, 0);
    const media = total / points.length;
    summaryEl.textContent = `Total (${series.summaryLabel}): ${total} fichas • Média: ${media.toFixed(1).replace('.', ',')} por período`;
  }

  function bindTrendTooltip(chartEl) {
    if (!chartEl) return;
    const svg = chartEl.querySelector('svg');
    const tooltip = chartEl.querySelector('#hubTrendTooltip');
    if (!svg || !tooltip) return;

    const hideTooltip = () => {
      tooltip.classList.remove('is-visible');
    };

    const showTooltip = (event) => {
      const target = event.target instanceof Element
        ? event.target.closest('.home-trend-point')
        : null;
      if (!target) {
        hideTooltip();
        return;
      }

      const label = target.getAttribute('data-label') || '--';
      const value = target.getAttribute('data-value') || '0';
      tooltip.textContent = `${label}: ${value} ficha(s)`;
      tooltip.classList.add('is-visible');

      const chartRect = chartEl.getBoundingClientRect();
      const pointRect = target.getBoundingClientRect();
      const x = pointRect.left + (pointRect.width / 2) - chartRect.left;
      const y = pointRect.top - chartRect.top;
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
    };

    svg.addEventListener('mousemove', showTooltip);
    svg.addEventListener('mouseleave', hideTooltip);
  }

  function updateTrendRange(nextRange) {
    trendRange = [TREND_RANGE_DAYS, TREND_RANGE_WEEKS, TREND_RANGE_MONTHS].includes(nextRange)
      ? nextRange
      : TREND_RANGE_DAYS;

    const buttons = document.querySelectorAll('#hubTrendFilters .home-trend-filter');
    buttons.forEach(button => {
      const isActive = button.getAttribute('data-range') === trendRange;
      button.classList.toggle('is-active', isActive);
    });

    renderTrendChart(trendRange);
  }

  function initTrendFilters() {
    const filterWrap = document.getElementById('hubTrendFilters');
    if (!filterWrap) return;
    filterWrap.addEventListener('click', (event) => {
      const target = event.target instanceof Element
        ? event.target.closest('.home-trend-filter[data-range]')
        : null;
      if (!target) return;
      updateTrendRange(target.getAttribute('data-range') || TREND_RANGE_DAYS);
    });
  }

  function setFallbackCount(total) {
    const badge = document.getElementById('hubFallbackCount');
    if (!badge) return;
    badge.textContent = String(Math.max(0, Number(total) || 0));
  }

  function initFolderTabs() {
    const wrap = document.getElementById('hubFolderTabs');
    if (!wrap) return;

    wrap.addEventListener('click', (event) => {
      const tab = event.target instanceof Element
        ? event.target.closest('.folder-tab[data-target]')
        : null;
      if (!tab) return;

      const target = String(tab.getAttribute('data-target') || '');
      const tabs = wrap.querySelectorAll('.folder-tab[data-target]');
      tabs.forEach((item) => {
        const id = String(item.getAttribute('data-target') || '');
        const panelId = id === 'upcoming' ? 'hubPanelUpcoming' : 'hubPanelFallback';
        const panel = document.getElementById(panelId);
        const ativo = id === target;

        item.classList.toggle('is-active', ativo);
        item.setAttribute('aria-selected', ativo ? 'true' : 'false');
        if (panel) {
          panel.classList.toggle('is-open', ativo);
        }
      });
    });
  }

  function renderUpcoming(fichas) {
    const container = document.getElementById('hubUpcomingList');
    if (!container) return;

    const lista = Array.isArray(fichas) ? fichas : [];
    if (lista.length === 0) {
      container.innerHTML = '<p class="home-empty">Nenhuma ficha pendente no momento.</p>';
      return;
    }

    const ordenadas = lista
      .filter(item => item && Number.isInteger(Number(item.id)))
      .sort((a, b) => {
        const dateA = parseDateOnly(a.data_entrega);
        const dateB = parseDateOnly(b.data_entrega);
        const timeA = dateA ? dateA.getTime() : Number.MAX_SAFE_INTEGER;
        const timeB = dateB ? dateB.getTime() : Number.MAX_SAFE_INTEGER;
        if (timeA !== timeB) return timeA - timeB;
        return Number(a.id) - Number(b.id);
      })
      .slice(0, 8);

    container.innerHTML = ordenadas.map(ficha => {
      const id = Number(ficha.id);
      const cliente = escapeHtml(String(ficha.cliente || 'Cliente não informado').trim());
      const entrega = escapeHtml(formatDateBr(ficha.data_entrega));
      const dueInfo = getDueInfo(ficha.data_entrega);
      const dueClass = dueInfo.isLate ? ' home-pill-danger' : '';
      const due = escapeHtml(dueInfo.label);
      const evento = String(ficha.evento || '').toLowerCase() === 'sim'
        ? '<span class="home-pill home-pill-event">Evento</span>'
        : '';

      return `
        <a class="home-upcoming-item" href="/ficha?visualizar=${id}" data-id="${id}" data-skip-nav-intercept="true">
          <div class="home-upcoming-main">
            <strong>${cliente}</strong>
            <span class="home-upcoming-sub">Ficha #${id} • Entrega: ${entrega}</span>
          </div>
          <div class="home-upcoming-meta">
            <span class="home-pill${dueClass}">${due}</span>
            ${evento}
          </div>
        </a>
      `;
    }).join('');
  }

  function lerFichasFallbackLocal() {
    try {
      const raw = localStorage.getItem(FICHA_FALLBACK_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(item => item && typeof item === 'object');
    } catch {
      return [];
    }
  }

  function salvarFichasFallbackLocal(lista) {
    try {
      localStorage.setItem(FICHA_FALLBACK_STORAGE_KEY, JSON.stringify(Array.isArray(lista) ? lista : []));
    } catch { }
  }

  function baixarFallbackJson(item) {
    if (!item || !item.ficha || typeof item.ficha !== 'object') return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const clienteBase = String(item.cliente || item.ficha.cliente || 'sem_cliente')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'sem_cliente';
    const numeroVenda = String(item.numeroVenda || item.ficha.numeroVenda || '').trim();
    const vendaBase = numeroVenda
      ? numeroVenda.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
      : '';

    const partes = ['ficha_local_pendente', clienteBase];
    if (vendaBase) partes.push(vendaBase);
    partes.push(stamp);

    const payload = {
      ...item.ficha,
      fallbackLocalId: item.localId || null,
      fallbackDataFalha: item.dataFalha || null
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8'
    });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `${partes.join('_')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  }

  function renderFallbacks() {
    const container = document.getElementById('hubFallbackList');
    if (!container) return;

    const listaCompleta = lerFichasFallbackLocal()
      .sort((a, b) => String(b?.dataFalha || '').localeCompare(String(a?.dataFalha || '')))
    ;
    setFallbackCount(listaCompleta.length);

    const lista = listaCompleta
      .slice(0, FALLBACK_LIST_LIMIT);

    if (lista.length === 0) {
      container.innerHTML = '<p class="home-empty">Nenhum rascunho local pendente.</p>';
      return;
    }

    container.innerHTML = lista.map(item => {
      const localId = escapeHtml(String(item.localId || ''));
      const cliente = escapeHtml(String(item.cliente || item?.ficha?.cliente || 'Cliente não informado').trim());
      const numeroVenda = escapeHtml(String(item.numeroVenda || item?.ficha?.numeroVenda || '').trim());
      const dataFalha = escapeHtml(formatDateTimeBr(item.dataFalha));
      const erro = escapeHtml(String(item.erro || 'Falha ao salvar no banco'));
      const vendaLinha = numeroVenda ? ` • Venda ${numeroVenda}` : '';
      return `
        <article class="home-fallback-item" data-id="${localId}">
          <div class="home-fallback-main">
            <strong>${cliente}</strong>
            <span class="home-upcoming-sub">Falhou em ${dataFalha}${vendaLinha}</span>
            <span class="home-fallback-error">${erro}</span>
          </div>
          <div class="home-fallback-actions">
            <button type="button" class="btn btn-primary" data-action="abrir" data-id="${localId}">
              <i class="fas fa-pen"></i>
              <span>Recuperar</span>
            </button>
            <button type="button" class="btn btn-secondary" data-action="baixar" data-id="${localId}">
              <i class="fas fa-download"></i>
              <span>JSON</span>
            </button>
            <button type="button" class="btn btn-danger" data-action="remover" data-id="${localId}">
              <i class="fas fa-trash"></i>
              <span>Excluir</span>
            </button>
          </div>
        </article>
      `;
    }).join('');
  }

  function onFallbackListClick(event) {
    const button = event.target instanceof Element
      ? event.target.closest('[data-action][data-id]')
      : null;
    if (!button) return;

    const action = String(button.getAttribute('data-action') || '');
    const id = String(button.getAttribute('data-id') || '');
    if (!id) return;

    const lista = lerFichasFallbackLocal();
    const item = lista.find(registro => String(registro?.localId || '') === id);
    if (!item) {
      renderFallbacks();
      return;
    }

    if (action === 'abrir') {
      window.location.href = `/ficha?fallbackLocal=${encodeURIComponent(id)}`;
      return;
    }

    if (action === 'baixar') {
      baixarFallbackJson(item);
      return;
    }

    if (action === 'remover') {
      const atualizada = lista.filter(registro => String(registro?.localId || '') !== id);
      salvarFichasFallbackLocal(atualizada);
      renderFallbacks();
    }
  }

  function initPreviewModal() {
    if (previewModal) return;

    const modal = document.createElement('div');
    modal.className = 'home-preview-modal';
    modal.style.display = 'none';
    modal.innerHTML = `
      <div class="home-preview-modal-overlay"></div>
      <div class="home-preview-modal-content">
        <div class="home-preview-modal-header">
          <div class="home-preview-modal-title-wrap">
            <strong class="home-preview-modal-title">Pré-visualização de Impressão</strong>
            <span class="home-preview-modal-subtitle">Ficha <span class="home-preview-modal-ficha-id">#-</span></span>
          </div>
          <div class="home-preview-modal-actions">
            <button type="button" class="home-preview-modal-print" title="Imprimir ficha">
              <i class="fas fa-print"></i>
              <span>Imprimir ficha</span>
            </button>
            <button type="button" class="home-preview-modal-close" title="Fechar">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>
        <div class="home-preview-modal-body">
          <div class="home-preview-modal-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <span>Carregando preview...</span>
          </div>
          <iframe class="home-preview-modal-iframe" title="Visualização da ficha" loading="lazy"></iframe>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    previewModal = modal;
    previewIframe = modal.querySelector('.home-preview-modal-iframe');
    previewLoading = modal.querySelector('.home-preview-modal-loading');
    previewTitle = modal.querySelector('.home-preview-modal-ficha-id');
    previewPrintBtn = modal.querySelector('.home-preview-modal-print');

    modal.querySelector('.home-preview-modal-overlay')?.addEventListener('click', closePreviewModal);
    modal.querySelector('.home-preview-modal-close')?.addEventListener('click', closePreviewModal);
    previewPrintBtn?.addEventListener('click', printPreviewModal);
    previewIframe?.addEventListener('error', () => setPreviewLoading('error'));
  }

  function openPreviewModal(fichaId) {
    if (!Number.isInteger(fichaId) || fichaId <= 0) return;
    if (!previewModal || !previewIframe) initPreviewModal();
    if (!previewModal || !previewIframe) return;

    previewFichaId = fichaId;
    if (previewTitle) previewTitle.textContent = `#${fichaId}`;
    setPreviewLoading(true);
    previewIframe.src = `/ficha?visualizar=${fichaId}`;
    previewModal.style.display = 'flex';
    document.body.classList.add('home-preview-modal-open');
  }

  function closePreviewModal() {
    if (!previewModal || !previewIframe) return;
    previewModal.style.display = 'none';
    previewIframe.src = 'about:blank';
    previewFichaId = null;
    setPreviewLoading(false);
    document.body.classList.remove('home-preview-modal-open');
  }

  function onPreviewFrameMessage(event) {
    if (!previewIframe || event.source !== previewIframe.contentWindow) return;
    const data = event.data;
    if (!data || data.type !== PREVIEW_READY_MESSAGE) return;
    if (!previewModal || previewModal.style.display === 'none') return;
    if (previewFichaId !== null && Number(data.fichaId) && Number(data.fichaId) !== previewFichaId) return;
    setPreviewLoading(false);
  }

  function setPreviewLoading(mode) {
    if (!previewModal) return;
    if (previewTimeoutId) {
      window.clearTimeout(previewTimeoutId);
      previewTimeoutId = null;
    }

    const isError = mode === 'error';
    const isLoading = mode === true || isError;

    previewModal.classList.toggle('is-loading', isLoading);
    previewModal.classList.toggle('has-error', isError);
    if (previewPrintBtn) previewPrintBtn.disabled = isLoading;

    if (previewLoading) {
      previewLoading.style.display = isLoading ? 'flex' : 'none';
      const textEl = previewLoading.querySelector('span');
      const iconEl = previewLoading.querySelector('i');

      if (isError) {
        if (textEl) textEl.textContent = 'Falha ao carregar a visualização.';
        if (iconEl) iconEl.className = 'fas fa-exclamation-triangle';
      } else {
        if (textEl) textEl.textContent = 'Carregando preview...';
        if (iconEl) iconEl.className = 'fas fa-spinner fa-spin';
      }
    }

    if (mode === true) {
      previewTimeoutId = window.setTimeout(() => {
        setPreviewLoading('error');
      }, PREVIEW_TIMEOUT_MS);
    }
  }

  function printPreviewModal() {
    if (!previewIframe || !previewIframe.contentWindow) return;

    try {
      const iframeWindow = previewIframe.contentWindow;
      if (typeof iframeWindow.gerarVersaoImpressao === 'function') {
        iframeWindow.gerarVersaoImpressao(false);
      } else {
        iframeWindow.print();
      }
    } catch {
      try {
        previewIframe.contentWindow.print();
      } catch (_) {}
    }
  }

  function onUpcomingClick(event) {
    const target = event.target instanceof Element
      ? event.target.closest('.home-upcoming-item[data-id]')
      : null;

    if (!target) return;
    event.preventDefault();

    const fichaId = Number(target.dataset.id);
    if (!Number.isInteger(fichaId)) return;
    openPreviewModal(fichaId);
  }

  function onDocumentKeyDown(event) {
    if (event.key !== 'Escape') return;
    if (!previewModal || previewModal.style.display === 'none') return;
    closePreviewModal();
  }

  async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function loadHubData() {
    setText('hubLastUpdate', 'Atualizando...');

    const [statsRes, fichasRes, pendentesRes] = await Promise.allSettled([
      fetchJson('/api/estatisticas'),
      fetchJson('/api/fichas?resumido=1'),
      fetchJson('/api/fichas?status=pendente&resumido=1')
    ]);

    if (statsRes.status === 'fulfilled') {
      setStats(statsRes.value);
    }

    trendSource = fichasRes.status === 'fulfilled' && Array.isArray(fichasRes.value)
      ? fichasRes.value
      : [];
    renderTrendChart(trendRange);

    if (pendentesRes.status === 'fulfilled') {
      renderUpcoming(pendentesRes.value);
    } else {
      renderUpcoming([]);
    }

    renderFallbacks();

    const nowText = new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
    setText('hubLastUpdate', `Atualizado às ${nowText}`);
  }

  function init() {
    initPreviewModal();
    initTrendFilters();
    initFolderTabs();
    updateTrendRange(TREND_RANGE_DAYS);
    window.addEventListener('message', onPreviewFrameMessage);
    document.addEventListener('keydown', onDocumentKeyDown);

    const refreshBtn = document.getElementById('hubRefreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        loadHubData().catch(() => {
          setText('hubLastUpdate', 'Falha ao atualizar');
        });
      });
    }

    const upcomingList = document.getElementById('hubUpcomingList');
    if (upcomingList) {
      upcomingList.addEventListener('click', onUpcomingClick);
    }

    const fallbackList = document.getElementById('hubFallbackList');
    if (fallbackList) {
      fallbackList.addEventListener('click', onFallbackListClick);
    }

    loadHubData().catch(() => {
      setText('hubLastUpdate', 'Falha ao carregar');
      trendSource = [];
      renderTrendChart(trendRange);
      renderUpcoming([]);
      renderFallbacks();
    });

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
