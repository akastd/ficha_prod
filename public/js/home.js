(function () {
  'use strict';

  const REFRESH_INTERVAL_MS = 2 * 60 * 1000;
  const PREVIEW_READY_MESSAGE = 'ficha-preview-ready';
  const PREVIEW_TIMEOUT_MS = 15000;

  let intervalId = null;
  let previewModal = null;
  let previewIframe = null;
  let previewFichaId = null;
  let previewTimeoutId = null;
  let previewLoading = null;
  let previewTitle = null;
  let previewPrintBtn = null;

  function escapeHtml(value) {
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

  function setStats(stats) {
    setText('hubStatTotalFichas', String(stats?.totalFichas ?? 0));
    setText('hubStatPendentes', String(stats?.pendentes ?? 0));
    setText('hubStatClientes', String(stats?.totalClientes ?? 0));
    setText('hubStatItens', String(stats?.totalItens ?? 0));
  }

  function mapSystemLabel(key) {
    if (key === 'turso') return 'Turso';
    if (key === 'cloudinary') return 'Cloudinary';
    if (key === 'vercel') return 'Vercel';
    if (key === 'github') return 'GitHub';
    return key;
  }

  function mapSystemClass(status) {
    if (status === 'ok') return 'is-ok';
    if (status === 'error') return 'is-error';
    return 'is-warning';
  }

  function renderSystemStatus(payload) {
    const container = document.getElementById('hubSystemStatus');
    if (!container) return;

    const systems = payload?.systems && typeof payload.systems === 'object'
      ? payload.systems
      : {};

    const keys = ['turso', 'cloudinary', 'vercel', 'github'];
    container.innerHTML = keys.map(key => {
      const system = systems[key] || {};
      const label = mapSystemLabel(key);
      const status = mapSystemClass(system.status);
      const message = escapeHtml(system.message || 'Sem informação');
      return `<span class="home-status-chip ${status}" title="${message}">${label}: ${message}</span>`;
    }).join('');
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
        <a class="home-upcoming-item" href="ficha.html?visualizar=${id}" data-id="${id}">
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
    previewIframe.src = `ficha.html?visualizar=${fichaId}`;
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
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function loadHubData() {
    setText('hubLastUpdate', 'Atualizando...');

    const [statsRes, systemsRes, pendentesRes] = await Promise.allSettled([
      fetchJson('/api/estatisticas'),
      fetchJson('/api/system-status'),
      fetchJson('/api/fichas?status=pendente')
    ]);

    if (statsRes.status === 'fulfilled') {
      setStats(statsRes.value);
    }

    if (systemsRes.status === 'fulfilled') {
      renderSystemStatus(systemsRes.value);
    } else {
      renderSystemStatus({});
    }

    if (pendentesRes.status === 'fulfilled') {
      renderUpcoming(pendentesRes.value);
    } else {
      renderUpcoming([]);
    }

    const nowText = new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
    setText('hubLastUpdate', `Atualizado às ${nowText}`);
  }

  function init() {
    initPreviewModal();
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

    loadHubData().catch(() => {
      setText('hubLastUpdate', 'Falha ao carregar');
      renderSystemStatus({});
      renderUpcoming([]);
    });

    if (intervalId) window.clearInterval(intervalId);
    intervalId = window.setInterval(() => {
      loadHubData().catch(() => {});
    }, REFRESH_INTERVAL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
