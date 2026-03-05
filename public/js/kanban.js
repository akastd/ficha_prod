/**
 * Quadro Kanban de Produção
 */
(function () {
  'use strict';

  const COLUMN_DEFINITIONS = [
    { key: 'pendente', label: 'Pendente' },
    { key: 'exportando', label: 'Exportando/Preparando Arte' },
    { key: 'fila_impressao', label: 'Na Fila de Impressão/Imprimindo' },
    { key: 'sublimando', label: 'Sublimando/Na Estamparia' },
    { key: 'na_costura', label: 'Na Costura/Em Revisão' }
  ];
  const PERSONALIZACAO_LABELS = Object.freeze({
    sem_personalizacao: 'Sem Personalização',
    sublimacao: 'Sublimação',
    serigrafia: 'Serigrafia',
    bordado: 'Bordado',
    dtf: 'DTF Têxtil',
    transfer: 'Transfer',
    sublimacao_serigrafia: 'Sublimação e Serigrafia',
    serigrafia_dtf: 'Serigrafia e DTF',
    serigrafia_bordado: 'Serigrafia e Bordado'
  });

  const VALID_STATUS = new Set(COLUMN_DEFINITIONS.map(col => col.key));
  const NAME_EXCEPTIONS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
  const UPPERCASE_WORD_PATTERN = /^[A-ZÀ-Ý]{1,4}$/;
  const STORAGE_FILTER_KEY = 'kanban_filters_v1';
  const PREVIEW_READY_MESSAGE = 'ficha-preview-ready';
  const TAB_RETURN_REFRESH_MIN_AWAY_MS = 30000;
  const TAB_RETURN_REFRESH_COOLDOWN_MS = 15000;

  const state = {
    fichas: [],
    isLoading: false,
    filters: {
      cliente: '',
      onlyCurrentWeek: false
    },
    drag: {
      fichaId: null,
      sourceStatus: null,
      previewStatus: null,
      previewEl: null
    },
    pendingPersistById: Object.create(null),
    pendingDeliverById: Object.create(null),
    pendingSortByStatus: Object.create(null),
    lastMovedFichaId: null,
    lastHiddenAt: Date.now(),
    lastAutoRefreshAt: 0
  };

  const ui = {
    viewModal: null,
    viewOverlay: null,
    viewFrame: null,
    viewFichaId: null,
    viewCloseBtn: null,
    viewLoading: null,
    viewLoadingTimeout: null,
    viewCurrentFichaId: null,
    previewTooltip: null,
    previewTooltipImg: null
  };

  document.addEventListener('DOMContentLoaded', () => {
    initKanban().catch(error => {
      console.error('Erro ao inicializar quadro Kanban:', error);
      if (typeof window.mostrarErro === 'function') {
        window.mostrarErro('Erro ao carregar quadro Kanban');
      }
    });
  });

  async function initKanban() {
    const ok = await db.init();
    if (!ok) {
      throw new Error('Falha de conexão com API');
    }

    state.filters = loadFilters();

    initEventListeners();
    hydrateFilterControls();
    await carregarFichas();
    renderKanban();
  }

  function initEventListeners() {
    const filterCliente = document.getElementById('filterClienteKanban');
    const btnAtualizar = document.getElementById('btnAtualizarKanban');
    const badgeFiltroSemanaAtual = document.getElementById('badgeFiltroSemanaAtualKanban');
    const kanbanBoard = document.getElementById('kanbanBoard');
    ui.viewModal = document.getElementById('kanbanViewModal');
    ui.viewOverlay = ui.viewModal ? ui.viewModal.querySelector('.kanban-view-modal-overlay') : null;
    ui.viewFrame = document.getElementById('kanbanViewFrame');
    ui.viewFichaId = document.getElementById('kanbanViewFichaId');
    ui.viewCloseBtn = document.getElementById('btnCloseKanbanViewModal');
    ui.viewLoading = document.getElementById('kanbanViewLoading');

    if (filterCliente) {
      filterCliente.addEventListener('input', debounce(event => {
        state.filters.cliente = event.target.value || '';
        saveFilters();
        renderKanban();
      }, 180));
    }

    if (btnAtualizar) {
      btnAtualizar.addEventListener('click', async () => {
        await carregarFichas();
        renderKanban();
        if (typeof window.mostrarInfo === 'function') {
          window.mostrarInfo('Quadro atualizado');
        }
      });
    }

    if (badgeFiltroSemanaAtual) {
      badgeFiltroSemanaAtual.addEventListener('click', () => {
        state.filters.onlyCurrentWeek = !state.filters.onlyCurrentWeek;
        saveFilters();
        syncCurrentWeekFilterButton();
        renderKanban();
      });
    }

    if (kanbanBoard) {
      kanbanBoard.addEventListener('click', handleBoardClick);
      kanbanBoard.addEventListener('mouseover', handleBoardMouseOver);
      kanbanBoard.addEventListener('mousemove', handleBoardMouseMove);
      kanbanBoard.addEventListener('mouseout', handleBoardMouseOut);
      kanbanBoard.addEventListener('dragstart', handleDragStart);
      kanbanBoard.addEventListener('dragend', handleDragEnd);
    }

    if (ui.viewCloseBtn) {
      ui.viewCloseBtn.addEventListener('click', closeViewModal);
    }

    if (ui.viewOverlay) {
      ui.viewOverlay.addEventListener('click', closeViewModal);
    }

    if (ui.viewFrame) {
      ui.viewFrame.addEventListener('error', handleViewFrameError);
    }

    window.addEventListener('message', handleViewFrameMessage);

    document.addEventListener('keydown', handleGlobalKeydown);
    document.addEventListener('visibilitychange', handleVisibilityRefreshTrigger);
    window.addEventListener('focus', handleWindowFocusRefresh);

    document.querySelectorAll('.kanban-column').forEach(column => {
      column.addEventListener('dragenter', handleDragEnterColumn);
      column.addEventListener('dragover', handleDragOverColumn);
      column.addEventListener('dragleave', handleDragLeaveColumn);
      column.addEventListener('drop', handleDropColumn);
    });
  }

  function handleVisibilityRefreshTrigger() {
    if (document.visibilityState === 'hidden') {
      state.lastHiddenAt = Date.now();
      return;
    }

    const awayMs = Date.now() - Number(state.lastHiddenAt || 0);
    if (awayMs < TAB_RETURN_REFRESH_MIN_AWAY_MS) return;

    refreshBoardFromReturn().catch(error => {
      console.error('Erro ao autoatualizar Kanban ao voltar para a aba:', error);
    });
  }

  function handleWindowFocusRefresh() {
    if (document.visibilityState === 'hidden') return;

    const awayMs = Date.now() - Number(state.lastHiddenAt || 0);
    if (awayMs < TAB_RETURN_REFRESH_MIN_AWAY_MS) return;

    refreshBoardFromReturn().catch(error => {
      console.error('Erro ao autoatualizar Kanban ao recuperar foco:', error);
    });
  }

  async function refreshBoardFromReturn() {
    if (state.isLoading) return;

    const now = Date.now();
    if (now - Number(state.lastAutoRefreshAt || 0) < TAB_RETURN_REFRESH_COOLDOWN_MS) return;

    state.lastAutoRefreshAt = now;
    await carregarFichas();
    renderKanban();

    if (typeof window.mostrarInfo === 'function') {
      window.mostrarInfo('Quadro atualizado automaticamente');
    }
  }

  async function carregarFichas() {
    state.isLoading = true;
    renderKanban();

    try {
      const fichas = await db.listarFichas();
      state.fichas = (Array.isArray(fichas) ? fichas : []).map(normalizeFichaKanbanStatus);
    } finally {
      state.isLoading = false;
    }
  }

  function normalizeFichaKanbanStatus(ficha) {
    return {
      ...ficha,
      kanban_status: normalizeBoardStatus(ficha?.kanban_status),
      kanban_ordem: normalizeBoardOrder(ficha?.kanban_ordem)
    };
  }

  function renderKanban() {
    if (state.isLoading) {
      COLUMN_DEFINITIONS.forEach(column => {
        renderLoadingColumn(column.key);
        updateColumnCounter(column.key, 0);
      });
      updateTotalCounterLoading();
      return;
    }

    const fichasFiltradas = getFichasFiltradas();
    const fichasSemRepeticao = dedupeByNumeroVenda(fichasFiltradas);
    const agrupadas = groupByColumn(fichasSemRepeticao);

    COLUMN_DEFINITIONS.forEach(column => {
      const cards = sortColumnFichasForDisplay(column.key, agrupadas[column.key] || []);
      renderColumn(column.key, cards);
      updateColumnCounter(column.key, cards.length);
    });

    updateTotalCounter(fichasSemRepeticao.length);
    animateMovedCardIfNeeded();
  }

  function renderLoadingColumn(statusKey) {
    const listEl = document.getElementById(`kanban-list-${statusKey}`);
    if (!listEl) return;

    listEl.innerHTML = `
      <div class="kanban-card kanban-card-skeleton">
        <div class="skeleton-line skeleton-title"></div>
        <div class="skeleton-row">
          <div class="skeleton-line skeleton-short"></div>
          <div class="skeleton-pill"></div>
        </div>
        <div class="skeleton-line skeleton-medium"></div>
      </div>
      <div class="kanban-card kanban-card-skeleton">
        <div class="skeleton-line skeleton-title"></div>
        <div class="skeleton-row">
          <div class="skeleton-line skeleton-short"></div>
          <div class="skeleton-pill"></div>
        </div>
        <div class="skeleton-line skeleton-medium"></div>
      </div>
    `;
  }

  function getFichasFiltradas() {
    const clienteTerm = normalizeText(state.filters.cliente);
    const onlyCurrentWeek = Boolean(state.filters.onlyCurrentWeek);

    return state.fichas
      .filter(ficha => {
        const statusFicha = String(ficha.status || '').toLowerCase();
        if (statusFicha === 'entregue') return false;

        const cliente = normalizeText(ficha.cliente);
        if (clienteTerm && !cliente.includes(clienteTerm)) return false;
        if (onlyCurrentWeek && !isEntregaNaSemanaAtualAteSexta(ficha?.data_entrega)) return false;
        return true;
      });
  }

  function sortColumnFichasForDisplay(statusKey, fichas) {
    return [...fichas].sort((a, b) => compareFichasWithinColumn(a, b));
  }

  function compareFichasWithinColumn(a, b) {
    const orderA = normalizeBoardOrder(a?.kanban_ordem);
    const orderB = normalizeBoardOrder(b?.kanban_ordem);

    if (orderA !== null && orderB !== null && orderA !== orderB) {
      return orderA - orderB;
    }

    if (orderA !== null && orderB === null) return -1;
    if (orderA === null && orderB !== null) return 1;

    const byDate = compareByDatePreference(a, b);
    if (byDate !== 0) return byDate;

    return Number(a?.id || 0) - Number(b?.id || 0);
  }

  function compareByDatePreference(a, b, sortMode = null) {
    const mode = sortMode === 'data_asc' || sortMode === 'data_desc'
      ? sortMode
      : 'manual';
    const dataA = getSortTimestamp(a);
    const dataB = getSortTimestamp(b);

    if (mode === 'data_asc') {
      return dataB - dataA || Number(b?.id || 0) - Number(a?.id || 0);
    }

    if (mode === 'data_desc') {
      return dataA - dataB || Number(a?.id || 0) - Number(b?.id || 0);
    }

    return dataB - dataA || Number(b?.id || 0) - Number(a?.id || 0);
  }

  function groupByColumn(fichas) {
    const grouped = {};
    COLUMN_DEFINITIONS.forEach(column => {
      grouped[column.key] = [];
    });

    fichas.forEach(ficha => {
      const status = getBoardStatus(ficha);
      if (!grouped[status]) grouped[status] = [];
      grouped[status].push(ficha);
    });

    return grouped;
  }

  function dedupeByNumeroVenda(fichas) {
    const semNumeroVenda = [];
    const byNumeroVenda = new Map();

    fichas.forEach(ficha => {
      const numeroVenda = normalizeNumeroVenda(ficha?.numero_venda);
      if (!numeroVenda) {
        semNumeroVenda.push(ficha);
        return;
      }

      const atual = byNumeroVenda.get(numeroVenda);
      if (!atual) {
        byNumeroVenda.set(numeroVenda, ficha);
        return;
      }

      if (isFichaMaisRecente(ficha, atual)) {
        byNumeroVenda.set(numeroVenda, ficha);
      }
    });

    return [...semNumeroVenda, ...Array.from(byNumeroVenda.values())];
  }

  function isFichaMaisRecente(candidata, referencia) {
    const timeCandidata = getRecencyTimestamp(candidata);
    const timeReferencia = getRecencyTimestamp(referencia);
    if (timeCandidata !== timeReferencia) return timeCandidata > timeReferencia;
    return Number(candidata?.id) > Number(referencia?.id);
  }

  function getRecencyTimestamp(ficha) {
    const tsKanban = Date.parse(String(ficha?.kanban_status_updated_at || ''));
    if (!Number.isNaN(tsKanban)) return tsKanban;

    const tsAtualizacao = Date.parse(String(ficha?.data_atualizacao || ''));
    if (!Number.isNaN(tsAtualizacao)) return tsAtualizacao;

    const tsCriacao = Date.parse(String(ficha?.data_criacao || ''));
    if (!Number.isNaN(tsCriacao)) return tsCriacao;

    return 0;
  }

  function renderColumn(statusKey, fichas) {
    const listEl = document.getElementById(`kanban-list-${statusKey}`);
    if (!listEl) return;

    if (!fichas.length) {
      listEl.innerHTML = '<div class="kanban-empty">Nenhuma ficha nesta etapa</div>';
      return;
    }

    listEl.innerHTML = fichas.map(ficha => {
      const fichaId = Number(ficha.id);
      const isSaving = Boolean(state.pendingPersistById[String(fichaId)]);
      const isDelivering = Boolean(state.pendingDeliverById[String(fichaId)]);
      const isBusy = isSaving || isDelivering;
      const cardStatus = getBoardStatus(ficha);
      const cliente = escapeHtml(formatDisplayName(ficha.cliente || 'Cliente não informado'));
      const numeroPedido = escapeHtml(String(ficha.numero_venda || '-'));
      const personalizacao = getPersonalizacaoLabel(ficha.arte);
      const personalizacaoHtml = personalizacao
        ? `<span class="kanban-card-personalizacao">${escapeHtml(personalizacao)}</span>`
        : '';
      const entregaInfo = getEntregaInfo(ficha, cardStatus);
      const showDeliverButton = statusKey === 'na_costura';
      const isEvento = isEventoFicha(ficha);
      const eventoPrefix = isEvento
        ? '<i class="fas fa-star kanban-card-event-star" title="Pedido de evento" aria-hidden="true"></i>'
        : '';
      const urgencyClass = entregaInfo.urgencia !== 'default' ? `urgency-${entregaInfo.urgencia}` : '';
      const cardClass = ['kanban-card', isBusy ? 'is-saving' : ''].filter(Boolean).join(' ');
      const bodyClass = ['kanban-card-body', urgencyClass].filter(Boolean).join(' ');
      const thumbnailSrc = getFichaThumbnailSrc(ficha);
      const thumbnailAttr = thumbnailSrc ? ` data-thumb-src="${escapeHtml(thumbnailSrc)}"` : '';
      const deliverButton = showDeliverButton
        ? `<button type="button" class="kanban-btn-deliver-icon" data-action="deliver" data-id="${fichaId}" title="Marcar como entregue" aria-label="Marcar ficha #${fichaId} como entregue" ${isBusy ? 'disabled' : ''}>
             <i class="fas fa-check"></i>
           </button>`
        : '';

      return `
        <article class="${cardClass}" draggable="${isBusy ? 'false' : 'true'}" data-ficha-id="${fichaId}" data-status="${cardStatus}">
          <h3 class="kanban-card-cliente">${eventoPrefix}${cliente}</h3>
          <div class="kanban-card-header">
            <span class="kanban-card-pedido">
              <i class="fas fa-hashtag"></i>
              <span>${numeroPedido}</span>
              ${personalizacaoHtml}
            </span>
            <span class="kanban-card-tools">
              ${deliverButton}
              <button type="button" class="kanban-btn-view-icon" data-action="view" data-id="${fichaId}" aria-label="Visualizar ficha #${fichaId}"${thumbnailAttr}>
                <i class="fas fa-eye"></i>
              </button>
            </span>
          </div>
          <div class="${bodyClass}">
            <div class="kanban-card-meta">
              <i class="fas fa-calendar-day"></i>
              <span>${escapeHtml(entregaInfo.texto)}</span>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  function updateColumnCounter(statusKey, total) {
    const countEl = document.querySelector(`.kanban-column-count[data-count-for="${statusKey}"]`);
    if (!countEl) return;
    countEl.textContent = String(total);

    const sortButton = document.querySelector(`.kanban-sort-date-btn[data-status="${statusKey}"]`);
    if (sortButton) {
      const isBusy = Boolean(state.pendingSortByStatus[statusKey]);
      sortButton.disabled = isBusy;
      sortButton.classList.toggle('is-busy', isBusy);
      sortButton.title = isBusy ? 'Organizando por data...' : 'Organizar por data';
    }
  }

  function updateTotalCounter(total) {
    const totalEl = document.getElementById('kanbanTotalCount');
    if (!totalEl) return;
    totalEl.textContent = `${total} ${total === 1 ? 'ficha' : 'fichas'}`;
  }

  function updateTotalCounterLoading() {
    const totalEl = document.getElementById('kanbanTotalCount');
    if (!totalEl) return;
    totalEl.textContent = 'Carregando...';
  }

  async function handleBoardClick(event) {
    hidePreviewTooltip();

    const sortButton = event.target.closest('button[data-action="sort-date"]');
    if (sortButton) {
      const status = String(sortButton.dataset.status || '').trim().toLowerCase();
      if (!VALID_STATUS.has(status)) return;
      await handleSortColumnByDate(status);
      return;
    }

    const deliverButton = event.target.closest('button[data-action="deliver"]');
    if (deliverButton) {
      const id = Number(deliverButton.dataset.id);
      if (!id) return;
      await handleDeliverClick(id);
      return;
    }

    const viewButton = event.target.closest('button[data-action="view"]');
    if (!viewButton) return;

    const id = Number(viewButton.dataset.id);
    if (!id) return;

    openViewModal(id);
  }

  function handleBoardMouseOver(event) {
    const viewButton = event.target.closest('button[data-action="view"]');
    if (!viewButton) return;

    const thumbSrc = String(viewButton.dataset.thumbSrc || '').trim();
    if (!thumbSrc) return;

    showPreviewTooltip(thumbSrc);
    positionPreviewTooltip(event.clientX, event.clientY);
  }

  function handleBoardMouseMove(event) {
    if (!ui.previewTooltip || ui.previewTooltip.hidden) return;
    positionPreviewTooltip(event.clientX, event.clientY);
  }

  function handleBoardMouseOut(event) {
    const viewButton = event.target.closest('button[data-action="view"]');
    if (!viewButton) return;

    const nextTarget = event.relatedTarget;
    if (nextTarget && viewButton.contains(nextTarget)) return;

    hidePreviewTooltip();
  }

  function ensurePreviewTooltip() {
    if (ui.previewTooltip && ui.previewTooltipImg) return;

    const tooltip = document.createElement('div');
    tooltip.className = 'kanban-image-tooltip';
    tooltip.hidden = true;

    const img = document.createElement('img');
    img.alt = 'Preview da ficha';
    img.loading = 'lazy';
    img.decoding = 'async';

    tooltip.appendChild(img);
    document.body.appendChild(tooltip);

    ui.previewTooltip = tooltip;
    ui.previewTooltipImg = img;
  }

  function showPreviewTooltip(src) {
    ensurePreviewTooltip();
    if (!ui.previewTooltip || !ui.previewTooltipImg) return;

    if (ui.previewTooltipImg.getAttribute('src') !== src) {
      ui.previewTooltipImg.setAttribute('src', src);
    }
    ui.previewTooltip.hidden = false;
  }

  function hidePreviewTooltip() {
    if (!ui.previewTooltip) return;
    ui.previewTooltip.hidden = true;
  }

  function positionPreviewTooltip(clientX, clientY) {
    if (!ui.previewTooltip || ui.previewTooltip.hidden) return;

    const offset = 14;
    const margin = 8;
    const rect = ui.previewTooltip.getBoundingClientRect();
    let left = clientX + offset;
    let top = clientY + offset;

    if (left + rect.width > window.innerWidth - margin) {
      left = clientX - rect.width - offset;
    }
    if (top + rect.height > window.innerHeight - margin) {
      top = clientY - rect.height - offset;
    }

    if (left < margin) left = margin;
    if (top < margin) top = margin;

    ui.previewTooltip.style.left = `${Math.round(left)}px`;
    ui.previewTooltip.style.top = `${Math.round(top)}px`;
  }

  async function handleDeliverClick(fichaId) {
    const key = String(fichaId);
    if (state.pendingDeliverById[key]) return;

    const ficha = findFichaById(fichaId);
    if (!ficha) return;

    state.pendingDeliverById[key] = true;
    renderKanban();

    try {
      await db.marcarComoEntregue(fichaId);
      ficha.status = 'entregue';

      if (typeof window.mostrarInfo === 'function') {
        window.mostrarInfo(`Ficha #${fichaId} marcada como entregue`);
      }
    } catch (error) {
      console.error('Erro ao marcar ficha como entregue pelo Kanban:', error);
      if (typeof window.mostrarErro === 'function') {
        window.mostrarErro(`Não foi possível entregar a ficha #${fichaId}`);
      }
    } finally {
      delete state.pendingDeliverById[key];
      renderKanban();
    }
  }

  async function handleSortColumnByDate(statusKey) {
    if (!VALID_STATUS.has(statusKey)) return;
    if (state.pendingSortByStatus[statusKey]) return;

    const orderedIds = getColumnOrderByDate(statusKey);
    if (!orderedIds.length) return;

    const beforeOrder = getColumnOrderFromState(statusKey);
    if (arraysEqual(beforeOrder, orderedIds)) {
      if (typeof window.mostrarInfo === 'function') {
        window.mostrarInfo('A coluna já está organizada por data');
      }
      return;
    }

    state.pendingSortByStatus[statusKey] = true;
    renderKanban();

    try {
      applyColumnOrder(statusKey, orderedIds);
      renderKanban();
      await db.atualizarKanbanOrdem(statusKey, orderedIds);

      if (typeof window.mostrarInfo === 'function') {
        window.mostrarInfo('Coluna organizada por data');
      }
    } catch (error) {
      console.error('Erro ao ordenar coluna por data:', error);
      if (typeof window.mostrarErro === 'function') {
        window.mostrarErro('Não foi possível organizar a coluna por data');
      }
    } finally {
      delete state.pendingSortByStatus[statusKey];
      renderKanban();
    }
  }

  function handleGlobalKeydown(event) {
    if (event.key !== 'Escape') return;
    if (!ui.viewModal || ui.viewModal.hidden) return;
    closeViewModal();
  }

  function handleViewFrameError() {
    if (!ui.viewModal || ui.viewModal.hidden) return;
    setViewModalLoading('error');
  }

  function handleViewFrameMessage(event) {
    if (!ui.viewFrame || event.source !== ui.viewFrame.contentWindow) return;

    const data = event.data;
    if (!data || data.type !== PREVIEW_READY_MESSAGE) return;
    if (!ui.viewModal || ui.viewModal.hidden) return;

    const payloadId = data.fichaId != null ? String(data.fichaId) : '';
    if (payloadId && ui.viewCurrentFichaId && payloadId !== ui.viewCurrentFichaId) return;

    setViewModalLoading(false);
  }

  function setViewModalLoading(mode) {
    if (!ui.viewModal) return;

    if (ui.viewLoadingTimeout) {
      clearTimeout(ui.viewLoadingTimeout);
      ui.viewLoadingTimeout = null;
    }

    const isError = mode === 'error';
    const isLoading = mode === true || isError;

    ui.viewModal.classList.toggle('is-loading', isLoading);
    ui.viewModal.classList.toggle('has-error', isError);

    if (ui.viewLoading) {
      ui.viewLoading.style.display = isLoading ? 'flex' : 'none';
      const textEl = ui.viewLoading.querySelector('span');
      const iconEl = ui.viewLoading.querySelector('i');

      if (isError) {
        if (textEl) textEl.textContent = 'Falha ao carregar a visualização.';
        if (iconEl) iconEl.className = 'fas fa-exclamation-triangle';
      } else {
        if (textEl) textEl.textContent = 'Carregando preview...';
        if (iconEl) iconEl.className = 'fas fa-spinner fa-spin';
      }
    }

    if (mode === true) {
      ui.viewLoadingTimeout = setTimeout(() => {
        if (!ui.viewModal || ui.viewModal.hidden) return;
        setViewModalLoading('error');
      }, 15000);
    }
  }

  function openViewModal(fichaId) {
    if (!ui.viewModal || !ui.viewFrame) return;

    ui.viewCurrentFichaId = String(fichaId);
    if (ui.viewFichaId) ui.viewFichaId.textContent = `#${fichaId}`;
    setViewModalLoading(true);
    ui.viewFrame.src = `/ficha?visualizar=${fichaId}`;

    ui.viewModal.hidden = false;
    ui.viewModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('kanban-modal-open');
  }

  function closeViewModal() {
    if (!ui.viewModal) return;

    ui.viewCurrentFichaId = null;
    setViewModalLoading(false);
    ui.viewModal.hidden = true;
    ui.viewModal.setAttribute('aria-hidden', 'true');
    if (ui.viewFrame) ui.viewFrame.src = 'about:blank';
    document.body.classList.remove('kanban-modal-open');
  }

  function handleDragStart(event) {
    const card = event.target.closest('.kanban-card');
    if (!card || !event.dataTransfer) return;

    const fichaId = Number(card.dataset.fichaId);
    if (!fichaId) return;
    if (state.pendingPersistById[String(fichaId)] || state.pendingDeliverById[String(fichaId)]) {
      event.preventDefault();
      return;
    }

    state.drag.fichaId = fichaId;
    state.drag.sourceStatus = String(card.dataset.status || '');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(fichaId));

    card.classList.add('is-dragging');
    document.body.classList.add('kanban-dragging');
  }

  function handleDragEnd(event) {
    const card = event.target.closest('.kanban-card');
    if (card) card.classList.remove('is-dragging');

    clearDropHighlights();
    clearDropPreview();
    state.drag.fichaId = null;
    state.drag.sourceStatus = null;
    document.body.classList.remove('kanban-dragging');
  }

  function handleDragEnterColumn(event) {
    if (!state.drag.fichaId) return;
    event.preventDefault();
    const column = event.currentTarget;
    if (column) {
      column.classList.add('is-drop-target');
      updateDropPreview(column, event.clientY);
    }
  }

  function handleDragOverColumn(event) {
    if (!state.drag.fichaId) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    const column = event.currentTarget;
    if (column) {
      column.classList.add('is-drop-target');
      updateDropPreview(column, event.clientY);
    }
  }

  function handleDragLeaveColumn(event) {
    const column = event.currentTarget;
    if (!column) return;
    if (event.relatedTarget && column.contains(event.relatedTarget)) return;
    column.classList.remove('is-drop-target');
    if (state.drag.previewStatus === column.dataset.status) {
      clearDropPreview();
    }
  }

  async function handleDropColumn(event) {
    event.preventDefault();
    const column = event.currentTarget;
    if (!column) return;

    const targetStatus = column.dataset.status;
    if (!VALID_STATUS.has(targetStatus)) return;

    const draggedId = Number(state.drag.fichaId || (event.dataTransfer ? event.dataTransfer.getData('text/plain') : 0));
    if (!draggedId) return;

    const ficha = findFichaById(draggedId);
    if (!ficha) return;

    const currentStatus = getBoardStatus(ficha);
    const sourceStatus = VALID_STATUS.has(state.drag.sourceStatus) ? state.drag.sourceStatus : currentStatus;
    const sourceListEl = getColumnListElement(sourceStatus);
    const targetListEl = getColumnListElement(targetStatus);
    const targetIndex = getDropIndexFromPointer(targetListEl, event.clientY, draggedId);

    const sourceVisibleIds = getVisibleColumnIds(sourceListEl, draggedId);
    const targetVisibleIds = getVisibleColumnIds(targetListEl, draggedId);
    const safeTargetIndex = clamp(targetIndex, 0, targetVisibleIds.length);
    targetVisibleIds.splice(safeTargetIndex, 0, draggedId);

    const sameColumn = sourceStatus === targetStatus;
    const snapshot = captureKanbanSnapshot();

    let sourceFinalOrder = [];
    let targetFinalOrder = [];

    clearDropHighlights();
    clearDropPreview();
    if (state.pendingPersistById[String(draggedId)] || state.pendingDeliverById[String(draggedId)]) return;

    state.pendingPersistById[String(draggedId)] = true;

    try {
      if (sameColumn) {
        const beforeOrder = getColumnOrderFromState(sourceStatus);
        sourceFinalOrder = composeColumnOrder(sourceStatus, targetVisibleIds);

        if (arraysEqual(beforeOrder, sourceFinalOrder)) return;

        applyColumnOrder(sourceStatus, sourceFinalOrder);
        state.lastMovedFichaId = draggedId;
        renderKanban();

        await db.atualizarKanbanOrdem(sourceStatus, sourceFinalOrder);
      } else {
        setBoardStatus(draggedId, targetStatus);

        sourceFinalOrder = composeColumnOrder(sourceStatus, sourceVisibleIds);
        targetFinalOrder = composeColumnOrder(targetStatus, targetVisibleIds);

        applyColumnOrder(sourceStatus, sourceFinalOrder);
        applyColumnOrder(targetStatus, targetFinalOrder);

        state.lastMovedFichaId = draggedId;
        renderKanban();

        const response = await db.atualizarKanbanStatus(draggedId, targetStatus);
        const persistedStatus = normalizeBoardStatus(response?.kanbanStatus || targetStatus);
        setBoardStatus(draggedId, persistedStatus);

        const persistPromises = [];
        if (sourceFinalOrder.length) {
          persistPromises.push(db.atualizarKanbanOrdem(sourceStatus, sourceFinalOrder));
        }
        if (targetFinalOrder.length) {
          persistPromises.push(db.atualizarKanbanOrdem(persistedStatus, targetFinalOrder));
        }
        if (persistPromises.length) {
          await Promise.all(persistPromises);
        }

      }
    } catch (error) {
      console.error('Erro ao persistir status do kanban:', error);
      restoreKanbanSnapshot(snapshot);
      state.lastMovedFichaId = draggedId;

      if (typeof window.mostrarErro === 'function') {
        window.mostrarErro(`Não foi possível atualizar a ordem da ficha #${draggedId}`);
      }
    } finally {
      delete state.pendingPersistById[String(draggedId)];
      renderKanban();
    }
  }

  function findFichaById(fichaId) {
    return state.fichas.find(ficha => Number(ficha.id) === Number(fichaId)) || null;
  }

  function setBoardStatus(fichaId, status) {
    if (!VALID_STATUS.has(status)) return;
    const ficha = findFichaById(fichaId);
    if (!ficha) return;
    ficha.kanban_status = status;
  }

  function setBoardOrder(fichaId, order) {
    const ficha = findFichaById(fichaId);
    if (!ficha) return;
    ficha.kanban_ordem = normalizeBoardOrder(order);
  }

  function getBoardStatus(ficha) {
    return normalizeBoardStatus(ficha?.kanban_status);
  }

  function getColumnListElement(statusKey) {
    return document.getElementById(`kanban-list-${statusKey}`);
  }

  function getVisibleColumnIds(listEl, excludeId = null) {
    if (!listEl) return [];

    return Array.from(listEl.querySelectorAll('.kanban-card[data-ficha-id]'))
      .map(card => Number(card.dataset.fichaId))
      .filter(id => Number.isInteger(id) && id > 0 && Number(id) !== Number(excludeId));
  }

  function ensureDropPreviewElement() {
    if (state.drag.previewEl && state.drag.previewEl.nodeType === 1) {
      return state.drag.previewEl;
    }

    const el = document.createElement('div');
    el.className = 'kanban-drop-indicator';
    el.setAttribute('aria-hidden', 'true');
    state.drag.previewEl = el;
    return el;
  }

  function updateDropPreview(column, pointerY) {
    if (!column || !state.drag.fichaId) return;

    const status = String(column.dataset.status || '');
    const listEl = getColumnListElement(status);
    if (!listEl) return;

    const indicator = ensureDropPreviewElement();
    const draggedId = Number(state.drag.fichaId);
    const cards = Array.from(listEl.querySelectorAll('.kanban-card[data-ficha-id]'))
      .filter(card => Number(card.dataset.fichaId) !== draggedId);

    if (indicator.parentElement !== listEl) {
      clearDropPreview();
      listEl.appendChild(indicator);
    }

    let inserted = false;
    for (let index = 0; index < cards.length; index++) {
      const rect = cards[index].getBoundingClientRect();
      if (pointerY < rect.top + rect.height / 2) {
        listEl.insertBefore(indicator, cards[index]);
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      listEl.appendChild(indicator);
    }

    state.drag.previewStatus = status;
    column.classList.add('has-drop-preview');
  }

  function clearDropPreview() {
    const indicator = state.drag.previewEl;
    if (indicator && indicator.parentElement) {
      indicator.parentElement.removeChild(indicator);
    }
    state.drag.previewStatus = null;
    document.querySelectorAll('.kanban-column.has-drop-preview').forEach(col => {
      col.classList.remove('has-drop-preview');
    });
  }

  function getDropIndexFromPointer(listEl, pointerY, draggedId) {
    if (!listEl) return 0;

    const cards = Array.from(listEl.querySelectorAll('.kanban-card[data-ficha-id]'))
      .filter(card => Number(card.dataset.fichaId) !== Number(draggedId));

    for (let index = 0; index < cards.length; index++) {
      const rect = cards[index].getBoundingClientRect();
      if (pointerY < rect.top + rect.height / 2) {
        return index;
      }
    }

    return cards.length;
  }

  function getColumnOrderFromState(statusKey) {
    return state.fichas
      .filter(ficha => getBoardStatus(ficha) === statusKey && String(ficha.status || '').toLowerCase() !== 'entregue')
      .sort(compareFichasWithinColumn)
      .map(ficha => Number(ficha.id))
      .filter(id => Number.isInteger(id) && id > 0);
  }

  function getColumnOrderByDate(statusKey) {
    return state.fichas
      .filter(ficha => getBoardStatus(ficha) === statusKey && String(ficha.status || '').toLowerCase() !== 'entregue')
      .sort((a, b) => {
        const eventoA = isEventoFicha(a);
        const eventoB = isEventoFicha(b);
        if (eventoA !== eventoB) return eventoA ? -1 : 1;

        const tsA = getSortTimestamp(a);
        const tsB = getSortTimestamp(b);
        const hasA = tsA > 0;
        const hasB = tsB > 0;

        if (hasA && hasB && tsA !== tsB) return tsA - tsB;
        if (hasA && !hasB) return -1;
        if (!hasA && hasB) return 1;

        const orderA = normalizeBoardOrder(a?.kanban_ordem);
        const orderB = normalizeBoardOrder(b?.kanban_ordem);
        if (orderA !== null && orderB !== null && orderA !== orderB) return orderA - orderB;

        return Number(a?.id || 0) - Number(b?.id || 0);
      })
      .map(ficha => Number(ficha.id))
      .filter(id => Number.isInteger(id) && id > 0);
  }

  function composeColumnOrder(statusKey, prioritizedIds = []) {
    const currentIds = getColumnOrderFromState(statusKey);
    if (!currentIds.length) return [];

    const validSet = new Set(currentIds);
    const used = new Set();
    const finalOrder = [];

    prioritizedIds.forEach(rawId => {
      const id = Number(rawId);
      if (!Number.isInteger(id) || id <= 0) return;
      if (!validSet.has(id) || used.has(id)) return;
      used.add(id);
      finalOrder.push(id);
    });

    currentIds.forEach(id => {
      if (used.has(id)) return;
      used.add(id);
      finalOrder.push(id);
    });

    return finalOrder;
  }

  function applyColumnOrder(statusKey, orderedIds) {
    const validIds = composeColumnOrder(statusKey, orderedIds);
    validIds.forEach((id, index) => {
      setBoardOrder(id, index + 1);
    });
    return validIds;
  }

  function captureKanbanSnapshot() {
    return state.fichas.map(ficha => ({
      id: Number(ficha.id),
      kanban_status: getBoardStatus(ficha),
      kanban_ordem: normalizeBoardOrder(ficha.kanban_ordem)
    }));
  }

  function restoreKanbanSnapshot(snapshot) {
    if (!Array.isArray(snapshot) || !snapshot.length) return;

    const byId = new Map(snapshot.map(item => [Number(item.id), item]));
    state.fichas.forEach(ficha => {
      const saved = byId.get(Number(ficha.id));
      if (!saved) return;
      ficha.kanban_status = normalizeBoardStatus(saved.kanban_status);
      ficha.kanban_ordem = normalizeBoardOrder(saved.kanban_ordem);
    });
  }

  function normalizeBoardStatus(status) {
    const normalized = typeof status === 'string' ? status.trim().toLowerCase() : '';
    return VALID_STATUS.has(normalized) ? normalized : 'pendente';
  }

  function normalizeBoardOrder(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    if (!Number.isInteger(parsed) || parsed <= 0) return null;
    return parsed;
  }

  function clearDropHighlights() {
    document.querySelectorAll('.kanban-column.is-drop-target').forEach(col => {
      col.classList.remove('is-drop-target');
    });
    document.querySelectorAll('.kanban-column.has-drop-preview').forEach(col => {
      col.classList.remove('has-drop-preview');
    });
  }

  function animateMovedCardIfNeeded() {
    if (!state.lastMovedFichaId) return;
    const selector = `.kanban-card[data-ficha-id="${state.lastMovedFichaId}"]`;
    const card = document.querySelector(selector);
    if (!card) {
      state.lastMovedFichaId = null;
      return;
    }

    card.classList.add('drop-animate');
    setTimeout(() => {
      card.classList.remove('drop-animate');
    }, 280);
    state.lastMovedFichaId = null;
  }

  function arraysEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (Number(a[i]) !== Number(b[i])) return false;
    }
    return true;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function loadFilters() {
    try {
      const raw = localStorage.getItem(STORAGE_FILTER_KEY);
      if (!raw) return { cliente: '', onlyCurrentWeek: false };

      const parsed = JSON.parse(raw);
      return {
        cliente: typeof parsed.cliente === 'string' ? parsed.cliente : '',
        onlyCurrentWeek: parsed.onlyCurrentWeek === true
      };
    } catch (_) {
      return { cliente: '', onlyCurrentWeek: false };
    }
  }

  function saveFilters() {
    localStorage.setItem(STORAGE_FILTER_KEY, JSON.stringify(state.filters));
  }

  function hydrateFilterControls() {
    const filterCliente = document.getElementById('filterClienteKanban');

    if (filterCliente) filterCliente.value = state.filters.cliente;
    syncCurrentWeekFilterButton();
  }

  function syncCurrentWeekFilterButton() {
    const badge = document.getElementById('badgeFiltroSemanaAtualKanban');
    if (!badge) return;

    const isActive = Boolean(state.filters.onlyCurrentWeek);
    badge.classList.toggle('is-active', isActive);
    badge.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  }

  function isEntregaNaSemanaAtualAteSexta(rawDate) {
    const entrega = parseIsoDate(rawDate);
    if (!entrega) return false;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayOfWeek = today.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    const monday = new Date(today);
    monday.setDate(today.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);

    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    friday.setHours(23, 59, 59, 999);

    return entrega.getTime() >= monday.getTime() && entrega.getTime() <= friday.getTime();
  }

  function getEntregaInfo(ficha, statusKey) {
    const rawDate = String(ficha?.data_entrega || '').trim();
    if (!rawDate) {
      return { texto: 'Entrega -', urgencia: 'default' };
    }

    const texto = `Entrega ${formatDateShort(rawDate)}`;
    if (statusKey === 'na_costura') {
      return { texto, urgencia: 'default' };
    }

    const diasRestantes = getRemainingDays(rawDate);
    if (diasRestantes === null) {
      return { texto, urgencia: 'default' };
    }

    if (diasRestantes <= 1) {
      return { texto, urgencia: 'danger' };
    }

    if (diasRestantes <= 7) {
      return { texto, urgencia: 'warning' };
    }

    return { texto, urgencia: 'default' };
  }

  function getRemainingDays(dateString) {
    const parsed = parseIsoDate(dateString);
    if (!parsed) return null;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffMs = parsed.getTime() - today.getTime();
    return Math.ceil(diffMs / 86400000);
  }

  function parseIsoDate(value) {
    const [yearStr, monthStr, dayStr] = String(value || '').split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return new Date(year, month - 1, day);
  }

  function formatDateShort(dateString) {
    if (!dateString) return '-';
    const [year, month, day] = String(dateString).split('-');
    if (!year || !month || !day) return '-';
    return `${day}/${month}/${year.slice(-2)}`;
  }

  function getSortTimestamp(ficha) {
    const dateValue = ficha.data_entrega || ficha.data_inicio || '';
    const time = Date.parse(dateValue || '');
    if (Number.isNaN(time)) return 0;
    return time;
  }

  function formatDisplayName(value) {
    if (typeof value !== 'string') return '';
    const text = value.trim().replace(/\s+/g, ' ');
    if (!text) return '';
    const originalWords = text.split(' ');
    const preserveUppercaseIndexes = new Set();
    if (originalWords.length > 1) {
      if (UPPERCASE_WORD_PATTERN.test(originalWords[0])) preserveUppercaseIndexes.add(0);
      const lastIndex = originalWords.length - 1;
      if (UPPERCASE_WORD_PATTERN.test(originalWords[lastIndex])) preserveUppercaseIndexes.add(lastIndex);
    }

    return text
      .toLowerCase()
      .split(' ')
      .map((word, index) => {
        if (preserveUppercaseIndexes.has(index)) return word.toUpperCase();
        return word
          .split(/([-/])/)
          .map(part => {
            if (!part || part === '-' || part === '/') return part;
            if (index > 0 && NAME_EXCEPTIONS.has(part)) return part;
            return part.charAt(0).toUpperCase() + part.slice(1);
          })
          .join('');
      })
      .join(' ');
  }

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

  function normalizeText(value) {
    if (window.appUtils && typeof window.appUtils.normalizeText === 'function') {
      return window.appUtils.normalizeText(value);
    }
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function normalizeNumeroVenda(value) {
    return String(value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  function getPersonalizacaoLabel(value) {
    const normalized = normalizeText(value)
      .replace(/[\s/-]+/g, '_')
      .replace(/_e_/g, '_');

    if (!normalized) return '';
    if (PERSONALIZACAO_LABELS[normalized]) return PERSONALIZACAO_LABELS[normalized];

    return normalized
      .split('_')
      .filter(Boolean)
      .map(part => (part === 'dtf' ? 'DTF' : formatDisplayName(part)))
      .join(' ');
  }

  function isEventoFicha(ficha) {
    const value = ficha?.evento;
    if (value === true || value === 1) return true;

    const normalized = String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

    return normalized === 'sim' || normalized === 'true' || normalized === '1';
  }

  function getFichaThumbnailSrc(ficha) {
    if (!ficha || typeof ficha !== 'object') return '';

    const directList = Array.isArray(ficha.imagens) ? ficha.imagens : [];
    const fromDirect = getFirstImageSrcFromArray(directList);
    if (fromDirect) return fromDirect;

    const imagensDataRaw = ficha.imagens_data ?? ficha.imagensData;
    const parsedList = parseImagesValue(imagensDataRaw);
    const fromParsed = getFirstImageSrcFromArray(parsedList);
    if (fromParsed) return fromParsed;

    const single = String(ficha.imagem_data ?? ficha.imagemData ?? '').trim();
    return single || '';
  }

  function parseImagesValue(value) {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return [];

    const text = value.trim();
    if (!text) return [];

    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function getFirstImageSrcFromArray(items) {
    if (!Array.isArray(items) || items.length === 0) return '';

    for (let i = 0; i < items.length; i += 1) {
      const current = items[i];
      if (typeof current === 'string') {
        const srcFromString = current.trim();
        if (srcFromString) return srcFromString;
        continue;
      }

      if (current && typeof current === 'object') {
        const src = String(current.src || '').trim();
        if (src) return src;
      }
    }

    return '';
  }

  function debounce(fn, delay) {
    if (window.appUtils && typeof window.appUtils.debounce === 'function') {
      return window.appUtils.debounce(fn, delay);
    }
    let timeout = null;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), delay);
    };
  }
})();


