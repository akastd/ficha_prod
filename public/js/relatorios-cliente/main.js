import { fetchClientReport, fetchClients } from './api.js';
import { buildPeriodoLabel, exportExcel, exportPdf, setExportBusy } from './export.js';
import { renderDetailEmpty, renderDetailError, renderDetailLoading, renderDetailReport, renderSidebar } from './render.js';
import { buildCacheKey, CLIENT_LIMIT, HISTORY_LIMIT, state } from './state.js';
import { debounce, getQuickRange, isValidRange } from './utils.js';

const PREVIEW_READY_MESSAGE = 'ficha-preview-ready';

let modalVisualizacao = null;
let iframeVisualizacao = null;
let tituloModalVisualizacao = null;
let botaoImprimirModal = null;
let loadingModalVisualizacao = null;
let timeoutLoadingModal = null;

function toast(message, type = 'info') {
  if (window.toast && typeof window.toast.show === 'function') {
    window.toast.show({ message, type });
    return;
  }
  if (typeof window.mostrarToast === 'function') {
    window.mostrarToast(message, type);
  }
}

function setButtonBusy(button, busy, busyLabel = 'Carregando...') {
  if (!button) return;
  if (!button.dataset.defaultHtml) button.dataset.defaultHtml = button.innerHTML;
  button.disabled = busy;
  button.innerHTML = busy
    ? `<i class="fas fa-spinner fa-spin"></i><span>${busyLabel}</span>`
    : button.dataset.defaultHtml;
}

function syncUrl() {
  const url = new URL(window.location.href);
  if (state.selectedClientId) url.searchParams.set('clienteId', String(state.selectedClientId));
  else url.searchParams.delete('clienteId');
  if (state.dataInicio && state.dataFim) {
    url.searchParams.set('dataInicio', state.dataInicio);
    url.searchParams.set('dataFim', state.dataFim);
  } else {
    url.searchParams.delete('dataInicio');
    url.searchParams.delete('dataFim');
  }
  if (state.selectedQuickRange) url.searchParams.set('atalho', state.selectedQuickRange);
  window.history.replaceState({}, '', url.toString());
}

function hydrateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const clienteId = Number.parseInt(String(params.get('clienteId') || ''), 10);
  if (Number.isInteger(clienteId) && clienteId > 0) state.selectedClientId = clienteId;

  const dataInicio = String(params.get('dataInicio') || '').trim();
  const dataFim = String(params.get('dataFim') || '').trim();
  if (dataInicio && dataFim && isValidRange(dataInicio, dataFim)) {
    state.dataInicio = dataInicio;
    state.dataFim = dataFim;
  } else {
    const range = getQuickRange('30d');
    state.dataInicio = range.dataInicio;
    state.dataFim = range.dataFim;
  }

  const atalho = String(params.get('atalho') || '').trim();
  state.selectedQuickRange = atalho || '30d';
}

async function loadClients({ reset = false } = {}) {
  try {
    if (state.clientsLoading) return;
    state.clientsLoading = true;
    if (reset) {
      state.clientsOffset = 0;
      state.clients = [];
      state.clientsHasMore = false;
    }
    renderSidebar({
      clients: state.clients,
      loading: state.clientsLoading,
      hasMore: state.clientsHasMore,
      selectedClientId: state.selectedClientId
    });
    setButtonBusy(document.getElementById('btnLoadMoreClientes'), true, 'Carregando');

    const response = await fetchClients({
      query: state.clientQuery,
      limit: CLIENT_LIMIT,
      offset: state.clientsOffset
    });

    const items = Array.isArray(response.items) ? response.items : [];
    state.clients = reset ? items : [...state.clients, ...items];
    state.clientsOffset = Number(response.offset || 0) + items.length;
    state.clientsHasMore = Boolean(response.hasMore);

    renderSidebar({
      clients: state.clients,
      loading: false,
      hasMore: state.clientsHasMore,
      selectedClientId: state.selectedClientId
    });
  } catch (error) {
    state.clientsLoading = false;
    renderSidebar({
      clients: state.clients,
      loading: false,
      hasMore: false,
      selectedClientId: state.selectedClientId
    });
    setButtonBusy(document.getElementById('btnLoadMoreClientes'), false);
    toast('Erro ao carregar clientes', 'error');
    return;
  }
  state.clientsLoading = false;
  setButtonBusy(document.getElementById('btnLoadMoreClientes'), false);
}

async function loadDetail({ historyOffset = 0 } = {}) {
  if (!state.selectedClientId) {
    state.detail = null;
    renderDetailEmpty();
    return;
  }

  state.detailLoading = true;
  state.historyOffset = historyOffset;
  renderDetailLoading();

  const cacheKey = buildCacheKey(
    state.selectedClientId,
    state.dataInicio,
    state.dataFim,
    state.historyOffset,
    HISTORY_LIMIT
  );

  try {
    let detail = state.cache.get(cacheKey);
    if (!detail) {
      detail = await fetchClientReport({
        clientId: state.selectedClientId,
        dataInicio: state.dataInicio,
        dataFim: state.dataFim,
        fichasLimit: HISTORY_LIMIT,
        fichasOffset: state.historyOffset
      });
      state.cache.set(cacheKey, detail);
    }

    state.detail = detail;
    state.detailLoading = false;

    renderDetailReport({
      detail,
      dataInicio: state.dataInicio,
      dataFim: state.dataFim,
      selectedQuickRange: state.selectedQuickRange,
      showAllProducts: Boolean(state.detail.__showAllProducts)
    });
    bindDetailEvents();
    syncUrl();
  } catch (error) {
    state.detailLoading = false;
    renderDetailError('Falha ao carregar relatório do cliente');
  }
}

function bindSidebarEvents() {
  const searchInput = document.getElementById('clienteSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(async e => {
      state.clientQuery = String(e.target?.value || '').trim();
      await loadClients({ reset: true });
    }, 300));
  }

  document.getElementById('btnLoadMoreClientes')?.addEventListener('click', async e => {
    if (!state.clientsHasMore) return;
    setButtonBusy(e.currentTarget, true, 'Carregando');
    await loadClients({ reset: false });
  });

  document.getElementById('clienteList')?.addEventListener('click', async e => {
    const btn = e.target.closest('.cliente-list-item[data-client-id]');
    if (!btn) return;
    const clientId = Number.parseInt(String(btn.dataset.clientId || ''), 10);
    if (!Number.isInteger(clientId) || clientId <= 0) return;
    state.selectedClientId = clientId;
    state.historyOffset = 0;
    state.detail = null;
    renderSidebar({
      clients: state.clients,
      loading: false,
      hasMore: state.clientsHasMore,
      selectedClientId: state.selectedClientId
    });
    await loadDetail({ historyOffset: 0 });
  });
}

function bindDetailEvents() {
  document.getElementById('btnAplicarPeriodoCliente')?.addEventListener('click', async e => {
    const inicio = String(document.getElementById('periodoDataInicio')?.value || '').trim();
    const fim = String(document.getElementById('periodoDataFim')?.value || '').trim();
    if (!isValidRange(inicio, fim)) {
      toast('Data inicial deve ser menor ou igual à data final', 'error');
      return;
    }

    setButtonBusy(e.currentTarget, true, 'Aplicando');
    state.dataInicio = inicio;
    state.dataFim = fim;
    state.selectedQuickRange = '';
    state.historyOffset = 0;
    await loadDetail({ historyOffset: 0 });
  });

  document.querySelectorAll('[data-quick-range]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = String(btn.dataset.quickRange || '').trim();
      const range = getQuickRange(key);
      state.dataInicio = range.dataInicio;
      state.dataFim = range.dataFim;
      state.selectedQuickRange = key;
      state.historyOffset = 0;
      await loadDetail({ historyOffset: 0 });
    });
  });

  document.getElementById('btnHistoricoPrev')?.addEventListener('click', async () => {
    const nextOffset = Math.max(0, state.historyOffset - HISTORY_LIMIT);
    await loadDetail({ historyOffset: nextOffset });
  });

  document.getElementById('btnHistoricoNext')?.addEventListener('click', async () => {
    const nextOffset = state.historyOffset + HISTORY_LIMIT;
    await loadDetail({ historyOffset: nextOffset });
  });

  document.getElementById('btnToggleProdutos')?.addEventListener('click', () => {
    if (!state.detail) return;
    state.detail.__showAllProducts = !state.detail.__showAllProducts;
    renderDetailReport({
      detail: state.detail,
      dataInicio: state.dataInicio,
      dataFim: state.dataFim,
      selectedQuickRange: state.selectedQuickRange,
      showAllProducts: Boolean(state.detail.__showAllProducts)
    });
    bindDetailEvents();
  });

  document.querySelectorAll('.btn-historico-open[data-open-preview]').forEach(btn => {
    btn.addEventListener('click', () => {
      const fichaId = Number.parseInt(String(btn.dataset.openPreview || ''), 10);
      if (!Number.isInteger(fichaId) || fichaId <= 0) return;
      abrirModalVisualizacao(fichaId);
    });
  });

  document.getElementById('btnExportPdfCliente')?.addEventListener('click', async () => {
    if (!state.detail) return;
    try {
      setExportBusy(true);
      await exportPdf(state.detail, buildPeriodoLabel(state.dataInicio, state.dataFim));
      toast('PDF gerado com sucesso', 'success');
    } catch (error) {
      toast(`Falha ao gerar PDF: ${error.message}`, 'error');
    } finally {
      setExportBusy(false);
    }
  });

  document.getElementById('btnExportExcelCliente')?.addEventListener('click', async () => {
    if (!state.detail) return;
    try {
      setExportBusy(true);
      await exportExcel(state.detail, buildPeriodoLabel(state.dataInicio, state.dataFim));
      toast('Excel gerado com sucesso', 'success');
    } catch (error) {
      toast(`Falha ao gerar Excel: ${error.message}`, 'error');
    } finally {
      setExportBusy(false);
    }
  });
}

function initModalVisualizacao() {
  if (modalVisualizacao) return;

  const modal = document.createElement('div');
  modal.className = 'preview-modal';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="preview-modal-overlay"></div>
    <div class="preview-modal-content">
      <div class="preview-modal-header">
        <div class="preview-modal-title-wrap">
          <strong class="preview-modal-title">Pré-visualização de Impressão</strong>
          <span class="preview-modal-subtitle">Ficha <span class="preview-modal-ficha-id">#-</span></span>
        </div>
        <div class="preview-modal-actions">
          <button type="button" class="preview-modal-print" title="Imprimir ficha">
            <i class="fas fa-print"></i>
            <span>Imprimir</span>
          </button>
          <button type="button" class="preview-modal-close" title="Fechar">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
      <div class="preview-modal-body">
        <div class="preview-modal-loading">
          <i class="fas fa-spinner fa-spin"></i>
          <span>Carregando preview...</span>
        </div>
        <iframe class="preview-modal-iframe" title="Visualização da ficha" loading="lazy"></iframe>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modalVisualizacao = modal;
  iframeVisualizacao = modal.querySelector('.preview-modal-iframe');
  tituloModalVisualizacao = modal.querySelector('.preview-modal-ficha-id');
  botaoImprimirModal = modal.querySelector('.preview-modal-print');
  loadingModalVisualizacao = modal.querySelector('.preview-modal-loading');

  modal.querySelector('.preview-modal-overlay')?.addEventListener('click', fecharModalVisualizacao);
  modal.querySelector('.preview-modal-close')?.addEventListener('click', fecharModalVisualizacao);
  botaoImprimirModal?.addEventListener('click', imprimirFichaModal);
  iframeVisualizacao?.addEventListener('error', () => setLoadingPreview('error'));

  window.addEventListener('message', onPreviewFrameMessage);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!modalVisualizacao || modalVisualizacao.style.display === 'none') return;
    fecharModalVisualizacao();
  });
}

function abrirModalVisualizacao(id) {
  if (!modalVisualizacao || !iframeVisualizacao) initModalVisualizacao();
  if (!modalVisualizacao || !iframeVisualizacao) return;

  setLoadingPreview(true);
  iframeVisualizacao.src = `/ficha?visualizar=${id}`;
  if (tituloModalVisualizacao) tituloModalVisualizacao.textContent = `#${id}`;
  modalVisualizacao.style.display = 'flex';
  document.body.classList.add('preview-modal-open');
}

function fecharModalVisualizacao() {
  if (!modalVisualizacao || !iframeVisualizacao) return;
  modalVisualizacao.style.display = 'none';
  iframeVisualizacao.src = 'about:blank';
  setLoadingPreview(false);
  document.body.classList.remove('preview-modal-open');
}

function onPreviewFrameMessage(event) {
  if (!iframeVisualizacao || event.source !== iframeVisualizacao.contentWindow) return;
  const data = event.data;
  if (!data || data.type !== PREVIEW_READY_MESSAGE) return;
  if (!modalVisualizacao || modalVisualizacao.style.display === 'none') return;
  setLoadingPreview(false);
}

function setLoadingPreview(loading) {
  if (!modalVisualizacao) return;
  if (timeoutLoadingModal) {
    clearTimeout(timeoutLoadingModal);
    timeoutLoadingModal = null;
  }

  const isError = loading === 'error';
  const isLoading = loading === true || isError;

  modalVisualizacao.classList.toggle('is-loading', isLoading);
  modalVisualizacao.classList.toggle('has-error', isError);
  if (botaoImprimirModal) botaoImprimirModal.disabled = isLoading;

  if (loadingModalVisualizacao) {
    loadingModalVisualizacao.style.display = isLoading ? 'flex' : 'none';
    const texto = loadingModalVisualizacao.querySelector('span');
    const icone = loadingModalVisualizacao.querySelector('i');

    if (isError) {
      if (texto) texto.textContent = 'Falha ao carregar a visualização.';
      if (icone) icone.className = 'fas fa-exclamation-triangle';
    } else {
      if (texto) texto.textContent = 'Carregando preview...';
      if (icone) icone.className = 'fas fa-spinner fa-spin';
    }
  }

  if (loading === true) {
    timeoutLoadingModal = setTimeout(() => {
      setLoadingPreview('error');
    }, 15000);
  }
}

function imprimirFichaModal() {
  if (!iframeVisualizacao || !iframeVisualizacao.contentWindow) return;
  try {
    const win = iframeVisualizacao.contentWindow;
    if (typeof win.gerarVersaoImpressao === 'function') {
      win.gerarVersaoImpressao(false);
    } else {
      win.print();
    }
  } catch {
    try {
      iframeVisualizacao.contentWindow.print();
    } catch {}
  }
}

async function init() {
  try {
    initModalVisualizacao();
    if (window.db && typeof window.db.init === 'function') {
      await window.db.init();
    }
    hydrateFromUrl();
    bindSidebarEvents();
    await loadClients({ reset: true });
    if (state.selectedClientId) {
      await loadDetail({ historyOffset: 0 });
    } else {
      renderDetailEmpty();
    }
  } catch (error) {
    toast('Erro ao inicializar relatório de clientes', 'error');
  }
}

document.addEventListener('DOMContentLoaded', init);
