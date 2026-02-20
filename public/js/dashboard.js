/**
 * Dashboard de Fichas Técnicas
 */

(function () {
  'use strict';

  let fichasCache = [];
  let fichasFiltradas = [];
  let fichaParaDeletar = null;
  let modalVisualizacao = null;
  let iframeVisualizacao = null;
  let tituloModalVisualizacao = null;
  let botaoImprimirModal = null;
  let botaoDuplicarModal = null;
  let loadingModalVisualizacao = null;
  let timeoutLoadingModal = null;
  let fichaVisualizadaId = null;
  let duplicandoFichaModal = false;
  let modalImagem = null;
  let imagemModalPreview = null;
  let tituloModalImagem = null;
  let botaoVerFichaModalImagem = null;
  let botaoVisualizarOrigemModalImagem = null;
  const PREVIEW_READY_MESSAGE = 'ficha-preview-ready';
  let paginaAtual = 1;
  const itensPorPagina = 10;
  let carregamentoEstatisticasAtivo = 0;
  const IDS_ESTATISTICAS = ['statTotalFichas', 'statPendentes', 'statClientes', 'statEsteMes'];

  document.addEventListener('DOMContentLoaded', async () => {
    await initDashboard();
  });

  async function initDashboard() {
    try {
      await db.init();
      criarPaginacao();
      initEventListeners(); // CORREÇÃO: Inicializar listeners ANTES de carregar dados
      await carregarFichas();
      await atualizarEstatisticas();
      verificarParametrosURL();
    } catch (error) {
      console.error('Erro ao inicializar dashboard:', error);
      mostrarErro('Erro ao carregar dados do servidor');
    }
  }

  function initEventListeners() {
    initModalVisualizacao();
    initModalImagem();
    // CORREÇÃO: Garantir que pelo menos um botão de filtro esteja ativo
    const statusFilterBtns = document.querySelectorAll('.status-filter .btn');
    
    // Ativar o botão "Todos" por padrão se nenhum estiver ativo
    const btnAtivo = document.querySelector('.status-filter .btn.active');
    if (!btnAtivo && statusFilterBtns.length > 0) {
      statusFilterBtns[0].classList.add('active');
    }

    statusFilterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        statusFilterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        aplicarFiltros();
      });
    });

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', debounce(aplicarFiltros, 300));
    }

    const filterDataInicio = document.getElementById('filterDataInicio');
    const filterDataFim = document.getElementById('filterDataFim');
    if (filterDataInicio) filterDataInicio.addEventListener('change', aplicarFiltros);
    if (filterDataFim) filterDataFim.addEventListener('change', aplicarFiltros);

    const btnLimparFiltros = document.getElementById('btnLimparFiltros');
    if (btnLimparFiltros) {
      btnLimparFiltros.addEventListener('click', limparFiltros);
    }

    const btnExportarBackup = document.getElementById('btnExportarBackup');
    if (btnExportarBackup) {
      btnExportarBackup.addEventListener('click', exportarBackup);
    }

    const btnImportarBackup = document.getElementById('btnImportarBackup');
    if (btnImportarBackup) {
      btnImportarBackup.addEventListener('click', () => {
        const importInput = document.getElementById('importFileInput');
        if (importInput) importInput.click();
      });
    }

    const importFileInput = document.getElementById('importFileInput');
    if (importFileInput) {
      importFileInput.addEventListener('change', importarBackup);
    }

    const btnCancelarDelete = document.getElementById('btnCancelarDelete');
    const btnConfirmarDelete = document.getElementById('btnConfirmarDelete');
    if (btnCancelarDelete) btnCancelarDelete.addEventListener('click', fecharModalDelete);
    if (btnConfirmarDelete) btnConfirmarDelete.addEventListener('click', confirmarDelete);

    const modalOverlay = document.querySelector('#deleteModal .modal-overlay');
    if (modalOverlay) {
      modalOverlay.addEventListener('click', fecharModalDelete);
    }
  }

  function verificarParametrosURL() {
    const params = new URLSearchParams(window.location.search);
    const clienteFiltro = params.get('cliente');

    if (clienteFiltro) {
      const searchInput = document.getElementById('searchInput');
      if (searchInput) {
        searchInput.value = clienteFiltro;
        aplicarFiltros();
      }
    }
  }

  // Paginação

  function criarPaginacao() {
    const container = document.getElementById('pagination');
    if (!container) return;

    container.innerHTML = '';

    const btnPrev = document.createElement('button');
    btnPrev.id = 'btnPrevPage';
    btnPrev.className = 'btn btn-secondary';
    btnPrev.innerHTML = '<i class="fas fa-chevron-left"></i> Anterior';
    btnPrev.addEventListener('click', () => mudarPagina(-1));

    const pageInfo = document.createElement('span');
    pageInfo.id = 'pageInfo';
    pageInfo.className = 'page-info';

    const btnNext = document.createElement('button');
    btnNext.id = 'btnNextPage';
    btnNext.className = 'btn btn-secondary';
    btnNext.innerHTML = 'Próxima <i class="fas fa-chevron-right"></i>';
    btnNext.addEventListener('click', () => mudarPagina(1));

    container.appendChild(btnPrev);
    container.appendChild(pageInfo);
    container.appendChild(btnNext);
  }

  function mudarPagina(direcao) {
    const totalPaginas = Math.ceil(fichasFiltradas.length / itensPorPagina);
    const novaPagina = paginaAtual + direcao;

    if (novaPagina >= 1 && novaPagina <= totalPaginas) {
      paginaAtual = novaPagina;
      renderizarPagina();
    }
  }

  function atualizarPaginacao() {
    const totalPaginas = Math.ceil(fichasFiltradas.length / itensPorPagina) || 1;
    const container = document.getElementById('pagination');
    const pageInfo = document.getElementById('pageInfo');
    const btnPrev = document.getElementById('btnPrevPage');
    const btnNext = document.getElementById('btnNextPage');

    if (!container) return;

    if (totalPaginas <= 1) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'flex';
    if (pageInfo) {
      pageInfo.textContent = `Página ${paginaAtual} de ${totalPaginas}`;
    }
    if (btnPrev) {
      btnPrev.style.display = paginaAtual === 1 ? 'none' : 'inline-flex';
    }
    if (btnNext) {
      btnNext.style.display = paginaAtual === totalPaginas ? 'none' : 'inline-flex';
    }
  }

  function renderizarPagina() {
    const startIdx = (paginaAtual - 1) * itensPorPagina;
    const endIdx = startIdx + itensPorPagina;
    const fichasPagina = fichasFiltradas.slice(startIdx, endIdx);

    renderizarFichas(fichasPagina);
    atualizarPaginacao();
  }

  // Fichas

  async function carregarFichas() {
    renderizarLoadingFichas();
    try {
      fichasCache = await db.listarFichas();
      fichasFiltradas = [...fichasCache];
      paginaAtual = 1;
      renderizarPagina();
    } catch (error) {
      console.error('Erro ao carregar fichas:', error);
      mostrarErro('Erro ao carregar fichas');
      const container = document.getElementById('fichasContainer');
      if (container) container.innerHTML = '';
    }
  }

  function renderizarLoadingFichas() {
    const container = document.getElementById('fichasContainer');
    const emptyState = document.getElementById('emptyState');
    const resultadosCount = document.getElementById('resultadosCount');
    const pagination = document.getElementById('pagination');
    if (!container) return;

    if (emptyState) emptyState.style.display = 'none';
    if (pagination) pagination.style.display = 'none';
    if (resultadosCount) resultadosCount.textContent = 'Carregando...';

    const quantidade = Math.max(3, Math.min(itensPorPagina, 5));
    container.innerHTML = Array.from({ length: quantidade }, () => criarCardFichaSkeleton()).join('');
  }

  function criarCardFichaSkeleton() {
    return `
      <div class="ficha-item ficha-item-skeleton" aria-hidden="true">
        <div class="ficha-thumb ficha-thumb-skeleton"></div>
        <div class="ficha-main">
          <div class="ficha-header">
            <span class="dashboard-skeleton-line dashboard-skeleton-title"></span>
            <span class="dashboard-skeleton-pill"></span>
          </div>
          <div class="ficha-details ficha-details-skeleton">
            <div class="dashboard-skeleton-line dashboard-skeleton-short"></div>
            <div class="dashboard-skeleton-line dashboard-skeleton-medium"></div>
            <div class="dashboard-skeleton-line dashboard-skeleton-short"></div>
          </div>
        </div>
        <div class="ficha-actions ficha-actions-skeleton">
          <span class="dashboard-skeleton-btn"></span>
          <span class="dashboard-skeleton-btn"></span>
          <span class="dashboard-skeleton-btn"></span>
        </div>
      </div>
    `;
  }

  function renderizarFichas(fichas) {
    const container = document.getElementById('fichasContainer');
    const emptyState = document.getElementById('emptyState');
    const resultadosCount = document.getElementById('resultadosCount');

    if (!container) return;

    const totalFiltrado = fichasFiltradas.length;
    if (resultadosCount) {
      resultadosCount.textContent = `${totalFiltrado} ${totalFiltrado === 1 ? 'resultado' : 'resultados'}`;
    }

    if (!fichas || fichas.length === 0) {
      container.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    container.innerHTML = fichas.map(ficha => criarCardFicha(ficha)).join('');

    container.querySelectorAll('.btn-visualizar').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        const id = parseInt(btn.dataset.id);
        visualizarFicha(id);
      });
    });

    container.querySelectorAll('.ficha-cliente-link').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        const id = parseInt(link.dataset.id);
        if (!Number.isNaN(id)) visualizarFicha(id);
      });
    });

    container.querySelectorAll('.ficha-thumb.has-image').forEach(thumb => {
      thumb.setAttribute('role', 'button');
      thumb.setAttribute('tabindex', '0');
      thumb.addEventListener('click', () => {
        const src = thumb.querySelector('img')?.getAttribute('src') || '';
        const botaoVisualizar = obterBotaoVisualizarDaThumb(thumb);
        const cliente = thumb.dataset.cliente || 'Cliente';
        if (src) abrirModalImagem(src, cliente, botaoVisualizar);
      });
      thumb.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        const src = thumb.querySelector('img')?.getAttribute('src') || '';
        const botaoVisualizar = obterBotaoVisualizarDaThumb(thumb);
        const cliente = thumb.dataset.cliente || 'Cliente';
        if (src) abrirModalImagem(src, cliente, botaoVisualizar);
      });
    });

    container.querySelectorAll('.btn-editar').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        editarFicha(id);
      });
    });

    container.querySelectorAll('.btn-entregar').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id);
        await marcarComoEntregue(id);
      });
    });

    container.querySelectorAll('.btn-desmarcar-entrega').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id);
        await desmarcarComoEntregue(id);
      });
    });

    container.querySelectorAll('.btn-deletar').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        abrirModalDelete(id);
      });
    });
  }

  function criarCardFicha(ficha) {
    const dataInicio = ficha.data_inicio ? formatarData(ficha.data_inicio) : '-';
    const dataEntrega = ficha.data_entrega ? formatarData(ficha.data_entrega) : '-';
    const totalItens = calcularTotalItens(ficha.produtos || []);
    const isEvento = ficha.evento === 'sim';
    const isPendente = ficha.status === 'pendente';
    const miniaturaSrc = obterMiniaturaFicha(ficha);
    const clienteFormatado = capitalizeFirstLetter(ficha.cliente);
    const vendedorFormatado = capitalizeFirstLetter(ficha.vendedor);

    return `
    <div class="ficha-item ${isPendente ? '' : 'ficha-entregue'}">
      <div class="ficha-thumb ${miniaturaSrc ? 'has-image' : 'no-image'}"
        ${miniaturaSrc ? `data-id="${ficha.id}" data-cliente="${escapeHtmlAttr(clienteFormatado || 'Cliente')}"` : ''}>
        ${miniaturaSrc
        ? `<img src="${miniaturaSrc}" alt="Miniatura da ficha de ${clienteFormatado || 'cliente'}" loading="lazy">`
        : '<i class="fas fa-image" aria-hidden="true"></i>'}
      </div>
      <div class="ficha-main">
        <div class="ficha-header">
          <a class="ficha-cliente ficha-cliente-link" href="index.html?visualizar=${ficha.id}" data-id="${ficha.id}" title="Visualizar ficha">
            ${clienteFormatado || 'Cliente não informado'}
          </a>
          ${ficha.numero_venda ? `<span class="ficha-numero">#${ficha.numero_venda}</span>` : ''}
          ${isEvento ? '<span class="ficha-evento-badge"><i class="fas fa-star"></i> Evento</span>' : ''}
          ${!isPendente ? '<span class="ficha-status-badge entregue"><i class="fas fa-check"></i> Entregue</span>' : ''}
        </div>

        <div class="ficha-details">
          ${ficha.vendedor ? `
            <div class="ficha-detail">
              <i class="fas fa-user"></i>
              <span>${vendedorFormatado}</span>
            </div>
          ` : ''}

          <div class="ficha-detail">
            <i class="fas fa-calendar"></i>
            <span>Início: ${dataInicio}</span>
          </div>

          <div class="ficha-detail">
            <i class="fas fa-calendar-check"></i>
            <span>Entrega: ${dataEntrega}</span>
          </div>

          <div class="ficha-detail">
            <i class="fas fa-boxes"></i>
            <span>${totalItens} ${totalItens === 1 ? 'item' : 'itens'}</span>
          </div>
        </div>
      </div>

      <div class="ficha-actions">
        ${isPendente ? `
          <button class="btn btn-success btn-entregar" data-id="${ficha.id}" title="Marcar como Entregue">
            <i class="fas fa-check-circle"></i>
          </button>
        ` : `
          <button class="btn btn-warning btn-desmarcar-entrega" data-id="${ficha.id}" title="Desmarcar como Entregue">
            <i class="fas fa-undo"></i>
          </button>
        `}
        <button class="btn btn-primary btn-visualizar" data-id="${ficha.id}" title="Visualizar">
          <i class="fas fa-eye"></i>
        </button>
        <button class="btn btn-secondary btn-editar" data-id="${ficha.id}" title="Editar">
          <i class="fas fa-edit"></i>
        </button>
        <button class="btn btn-danger btn-deletar" data-id="${ficha.id}" title="Excluir">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
  `;
  }

  // Filtros

  function aplicarFiltros() {
    const searchInput = document.getElementById('searchInput');
    const filterDataInicio = document.getElementById('filterDataInicio');
    const filterDataFim = document.getElementById('filterDataFim');

    const searchTerm = searchInput ? normalizarTextoBusca(searchInput.value) : '';
    const dataInicio = filterDataInicio ? filterDataInicio.value : '';
    const dataFim = filterDataFim ? filterDataFim.value : '';
    
    // CORREÇÃO: Verificar se o elemento existe antes de acessar .id
    const btnAtivo = document.querySelector('.status-filter .btn.active');
    const filtroStatusAtivo = btnAtivo ? btnAtivo.id : 'btnFiltroTodos';

    fichasFiltradas = fichasCache.filter(ficha => {
      // Filtro de busca por texto
      if (searchTerm) {
        const cliente = normalizarTextoBusca(ficha.cliente);
        const numeroVenda = normalizarTextoBusca(ficha.numero_venda);
        const vendedor = normalizarTextoBusca(ficha.vendedor);

        if (!cliente.includes(searchTerm) &&
          !numeroVenda.includes(searchTerm) &&
          !vendedor.includes(searchTerm)) {
          return false;
        }
      }

      // Filtro de data inicial
      if (dataInicio && ficha.data_inicio) {
        if (ficha.data_inicio < dataInicio) return false;
      }

      // Filtro de data final
      if (dataFim && ficha.data_inicio) {
        if (ficha.data_inicio > dataFim) return false;
      }

      // Filtro de status
      switch (filtroStatusAtivo) {
        case 'btnFiltroTodos':
          return true;
        case 'btnFiltroPendentes':
          return ficha.status === 'pendente';
        case 'btnFiltroEntregues':
          return ficha.status !== 'pendente';
        case 'btnFiltroEvento':
          return ficha.evento === 'sim';
        default:
          return true;
      }
    });

    paginaAtual = 1;
    renderizarPagina();
  }

  function limparFiltros() {
    const searchInput = document.getElementById('searchInput');
    const filterDataInicio = document.getElementById('filterDataInicio');
    const filterDataFim = document.getElementById('filterDataFim');
    const statusFilterBtns = document.querySelectorAll('.status-filter .btn');

    if (searchInput) searchInput.value = '';
    if (filterDataInicio) filterDataInicio.value = '';
    if (filterDataFim) filterDataFim.value = '';

    // Resetar filtro de status para "Todos"
    statusFilterBtns.forEach(btn => btn.classList.remove('active'));
    const btnTodos = document.getElementById('btnFiltroTodos');
    if (btnTodos) btnTodos.classList.add('active');

    window.history.replaceState({}, '', window.location.pathname);

    fichasFiltradas = [...fichasCache];
    paginaAtual = 1;
    renderizarPagina();
  }

  // Estatísticas

  function aplicarLoadingEstatisticas(ativo) {
    IDS_ESTATISTICAS.forEach(id => {
      const elemento = document.getElementById(id);
      if (!elemento) return;
      elemento.classList.toggle('stat-value-skeleton', ativo);
      elemento.setAttribute('aria-busy', ativo ? 'true' : 'false');
    });
  }

  function iniciarLoadingEstatisticas() {
    carregamentoEstatisticasAtivo += 1;
    aplicarLoadingEstatisticas(true);
  }

  function finalizarLoadingEstatisticas() {
    carregamentoEstatisticasAtivo = Math.max(0, carregamentoEstatisticasAtivo - 1);
    if (carregamentoEstatisticasAtivo === 0) {
      aplicarLoadingEstatisticas(false);
    }
  }

  async function atualizarEstatisticas() {
    iniciarLoadingEstatisticas();
    try {
      const stats = await db.buscarEstatisticas();

      const statTotalFichas = document.getElementById('statTotalFichas');
      const statPendentes = document.getElementById('statPendentes');
      const statClientes = document.getElementById('statClientes');
      const statEsteMes = document.getElementById('statEsteMes');

      if (statTotalFichas) statTotalFichas.textContent = stats.totalFichas || 0;
      if (statPendentes) statPendentes.textContent = stats.pendentes || 0;
      if (statClientes) statClientes.textContent = stats.totalClientes || 0;
      if (statEsteMes) statEsteMes.textContent = stats.esteMes || 0;
    } catch (error) {
      console.error('Erro ao atualizar estatísticas:', error);
    } finally {
      finalizarLoadingEstatisticas();
    }
  }

  // Ações

  function visualizarFicha(id) {
    abrirModalVisualizacao(id);
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
            <button type="button" class="preview-modal-duplicate" title="Duplicar ficha">
              <i class="fas fa-copy"></i>
              <span>Duplicar ficha</span>
            </button>
            <span class="preview-modal-actions-spacer" aria-hidden="true"></span>
            <button type="button" class="preview-modal-print" title="Imprimir ficha">
              <i class="fas fa-print"></i>
              <span>Imprimir ficha</span>
            </button>
            <button type="button" class="preview-modal-close" title="Fechar">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>
        <div class="preview-modal-body">
          <div class="preview-modal-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <span>Carregando Ficha...</span>
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
    botaoDuplicarModal = modal.querySelector('.preview-modal-duplicate');
    loadingModalVisualizacao = modal.querySelector('.preview-modal-loading');

    const overlay = modal.querySelector('.preview-modal-overlay');
    const btnClose = modal.querySelector('.preview-modal-close');
    overlay?.addEventListener('click', fecharModalVisualizacao);
    btnClose?.addEventListener('click', fecharModalVisualizacao);
    botaoImprimirModal?.addEventListener('click', imprimirFichaModal);
    botaoDuplicarModal?.addEventListener('click', duplicarFichaModal);
    iframeVisualizacao?.addEventListener('load', () => {});
    iframeVisualizacao?.addEventListener('error', () => setLoadingPreview('error'));
    window.addEventListener('message', onPreviewFrameMessage);

    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;

      if (modalImagem && modalImagem.style.display !== 'none') {
        fecharModalImagem();
        return;
      }

      if (modalVisualizacao && modalVisualizacao.style.display !== 'none') {
        fecharModalVisualizacao();
      }
    });
  }

  function initModalImagem() {
    if (modalImagem) return;

    const modal = document.createElement('div');
    modal.className = 'image-preview-modal';
    modal.style.display = 'none';
    modal.innerHTML = `
      <div class="image-preview-overlay"></div>
      <div class="image-preview-content">
        <div class="image-preview-header">
          <strong class="image-preview-title">Cliente</strong>
        </div>
        <div class="image-preview-body">
          <img class="image-preview-img" alt="Imagem ampliada da ficha">
        </div>
        <div class="image-preview-footer">
          <button type="button" class="image-preview-open-ficha" title="Ver ficha">
            <i class="fas fa-eye"></i>
            <span>Ver ficha</span>
          </button>
        </div>
        <button type="button" class="image-preview-close" title="Fechar">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `;

    document.body.appendChild(modal);

    modalImagem = modal;
    imagemModalPreview = modal.querySelector('.image-preview-img');
    tituloModalImagem = modal.querySelector('.image-preview-title');
    botaoVerFichaModalImagem = modal.querySelector('.image-preview-open-ficha');

    modal.querySelector('.image-preview-overlay')?.addEventListener('click', fecharModalImagem);
    modal.querySelector('.image-preview-close')?.addEventListener('click', fecharModalImagem);
    botaoVerFichaModalImagem?.addEventListener('click', () => {
      if (!botaoVisualizarOrigemModalImagem) return;
      const botaoVisualizar = botaoVisualizarOrigemModalImagem;
      fecharModalImagem();
      botaoVisualizar.click();
    });
  }

  function abrirModalImagem(src, cliente = 'Cliente', botaoVisualizar = null) {
    if (!modalImagem || !imagemModalPreview) initModalImagem();
    if (!modalImagem || !imagemModalPreview || !src) return;

    botaoVisualizarOrigemModalImagem = botaoVisualizar || null;
    if (tituloModalImagem) tituloModalImagem.textContent = cliente || 'Cliente';
    if (botaoVerFichaModalImagem) botaoVerFichaModalImagem.disabled = !botaoVisualizarOrigemModalImagem;
    imagemModalPreview.setAttribute('src', src);
    modalImagem.style.display = 'flex';
    document.body.classList.add('image-preview-open');
  }

  function fecharModalImagem() {
    if (!modalImagem || !imagemModalPreview) return;

    modalImagem.style.display = 'none';
    botaoVisualizarOrigemModalImagem = null;
    imagemModalPreview.setAttribute('src', '');
    document.body.classList.remove('image-preview-open');
  }

  function abrirModalVisualizacao(id) {
    if (!modalVisualizacao || !iframeVisualizacao) initModalVisualizacao();
    if (!modalVisualizacao || !iframeVisualizacao) return;

    fichaVisualizadaId = id;
    duplicandoFichaModal = false;
    setLoadingPreview(true);
    iframeVisualizacao.src = `index.html?visualizar=${id}`;
    if (tituloModalVisualizacao) tituloModalVisualizacao.textContent = `#${id}`;
    modalVisualizacao.style.display = 'flex';
    document.body.classList.add('preview-modal-open');
  }

  function fecharModalVisualizacao() {
    if (!modalVisualizacao || !iframeVisualizacao) return;
    modalVisualizacao.style.display = 'none';
    iframeVisualizacao.src = 'about:blank';
    fichaVisualizadaId = null;
    duplicandoFichaModal = false;
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
    if (botaoImprimirModal) botaoImprimirModal.disabled = isLoading || duplicandoFichaModal;
    if (botaoDuplicarModal) botaoDuplicarModal.disabled = isLoading || duplicandoFichaModal;

    if (loadingModalVisualizacao) {
      loadingModalVisualizacao.style.display = isLoading ? 'flex' : 'none';
      const texto = loadingModalVisualizacao.querySelector('span');
      const icone = loadingModalVisualizacao.querySelector('i');

      if (isError) {
        if (texto) texto.textContent = 'Falha ao carregar a visualização.';
        if (icone) {
          icone.className = 'fas fa-exclamation-triangle';
        }
      } else {
        if (texto) texto.textContent = 'Carregando preview...';
        if (icone) {
          icone.className = 'fas fa-spinner fa-spin';
        }
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

  function mapearFichaBancoParaEnvio(fichaBanco) {
    if (!fichaBanco || typeof fichaBanco !== 'object') return null;

    const mapa = {
      data_inicio: 'dataInicio',
      numero_venda: 'numeroVenda',
      data_entrega: 'dataEntrega',
      cor_material: 'corMaterial',
      acabamento_manga: 'acabamentoManga',
      largura_manga: 'larguraManga',
      cor_acabamento_manga: 'corAcabamentoManga',
      cor_gola: 'corGola',
      acabamento_gola: 'acabamentoGola',
      largura_gola: 'larguraGola',
      cor_peitilho_interno: 'corPeitilhoInterno',
      cor_peitilho_externo: 'corPeitilhoExterno',
      cor_pe_de_gola_interno: 'corPeDeGolaInterno',
      cor_pe_de_gola_externo: 'corPeDeGolaExterno',
      abertura_lateral: 'aberturaLateral',
      cor_abertura_lateral: 'corAberturaLateral',
      reforco_gola: 'reforcoGola',
      cor_reforco: 'corReforco',
      cor_botao: 'corBotao',
      filete_local: 'fileteLocal',
      filete_cor: 'fileteCor',
      faixa_local: 'faixaLocal',
      faixa_cor: 'faixaCor',
      cor_sublimacao: 'corSublimacao',
      observacoes_html: 'observacoesHtml',
      observacoes_plain_text: 'observacoesPlainText',
      imagens_data: 'imagensData',
      imagem_data: 'imagemData'
    };

    const dados = {};
    Object.entries(fichaBanco).forEach(([chave, valor]) => {
      const chaveDestino = mapa[chave] || chave;
      dados[chaveDestino] = valor;
    });

    if (typeof dados.produtos === 'string') {
      try {
        dados.produtos = JSON.parse(dados.produtos);
      } catch {
        dados.produtos = [];
      }
    }

    return dados;
  }

  async function duplicarFichaModal() {
    if (duplicandoFichaModal) return;
    if (!fichaVisualizadaId || Number.isNaN(Number(fichaVisualizadaId))) {
      mostrarErro('Não foi possível identificar a ficha para duplicar');
      return;
    }

    duplicandoFichaModal = true;
    setLoadingPreview(false);

    try {
      let dadosDuplicados = null;
      const win = iframeVisualizacao?.contentWindow;

      if (win && typeof win.coletarFicha === 'function') {
        dadosDuplicados = win.coletarFicha();
      }

      if (!dadosDuplicados) {
        const fichaBanco = await db.buscarFicha(fichaVisualizadaId);
        dadosDuplicados = mapearFichaBancoParaEnvio(fichaBanco);
      }

      if (!dadosDuplicados) throw new Error('Dados da ficha indisponíveis');

      delete dadosDuplicados.id;
      if (dadosDuplicados.numeroVenda) {
        dadosDuplicados.numeroVenda = `${dadosDuplicados.numeroVenda}-COPIA`;
      }

      const novoId = await db.salvarFicha(dadosDuplicados);
      await carregarFichas();
      aplicarFiltros();
      await atualizarEstatisticas();
      window.location.href = `index.html?editar=${novoId}`;
    } catch (error) {
      console.error('Erro ao duplicar ficha pelo modal:', error);
      mostrarErro('Erro ao duplicar ficha');
    } finally {
      duplicandoFichaModal = false;
      if (modalVisualizacao && modalVisualizacao.style.display !== 'none') {
        const estaCarregando = modalVisualizacao.classList.contains('is-loading');
        setLoadingPreview(estaCarregando);
      }
    }
  }

  function editarFicha(id) {
    window.location.href = `index.html?editar=${id}`;
  }

  async function marcarComoEntregue(id) {
    const confirmar = confirm('Deseja marcar este pedido como entregue?');
    if (!confirmar) return;

    try {
      await db.marcarComoEntregue(id);
      await carregarFichas();
      aplicarFiltros();
      await atualizarEstatisticas();
      mostrarSucesso('Pedido marcado como entregue!');
    } catch (error) {
      console.error('Erro ao marcar como entregue:', error);
      mostrarErro('Erro ao marcar pedido como entregue');
    }
  }

  function abrirModalDelete(id) {
    fichaParaDeletar = id;
    const modal = document.getElementById('deleteModal');
    if (modal) modal.style.display = 'flex';
  }

  function fecharModalDelete() {
    fichaParaDeletar = null;
    const modal = document.getElementById('deleteModal');
    if (modal) modal.style.display = 'none';
  }

  async function confirmarDelete() {
    if (!fichaParaDeletar) return;

    try {
      await db.deletarFicha(fichaParaDeletar);
      await carregarFichas();
      aplicarFiltros();
      await atualizarEstatisticas();
      fecharModalDelete();
      mostrarSucesso('Ficha excluída com sucesso!');
    } catch (error) {
      console.error('Erro ao deletar ficha:', error);
      mostrarErro('Erro ao excluir ficha');
    }
  }

  async function desmarcarComoEntregue(id) {
    const confirmar = confirm('Deseja desmarcar este pedido como entregue?');
    if (!confirmar) return;

    try {
      await db.marcarComoPendente(id);
      await carregarFichas();
      aplicarFiltros();
      await atualizarEstatisticas();
      mostrarSucesso('Pedido desmarcado como entregue!');
    } catch (error) {
      console.error('Erro ao desmarcar como entregue:', error);
      mostrarErro('Erro ao desmarcar pedido como entregue');
    }
  }

  // Backup

  async function exportarBackup() {
    try {
      const backup = await db.exportarBackup();

      const dataStr = JSON.stringify(backup, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-fichas-${new Date().toISOString().split('T')[0]}.json`;
      a.click();

      URL.revokeObjectURL(url);

      mostrarSucesso('Backup exportado com sucesso!');
    } catch (error) {
      console.error('Erro ao exportar backup:', error);
      mostrarErro('Erro ao exportar backup');
    }
  }

  async function importarBackup(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const texto = await file.text();
      const dados = JSON.parse(texto);

      if (!dados.fichas || !Array.isArray(dados.fichas)) {
        throw new Error('Formato de backup inválido');
      }

      const confirmar = confirm(
        `Deseja importar ${dados.fichas.length} ficha(s)? ` +
        `Isso não apagará suas fichas existentes.`
      );

      if (!confirmar) return;

      await db.importarBackup(dados);
      await carregarFichas();
      await atualizarEstatisticas();

      mostrarSucesso(`${dados.fichas.length} ficha(s) importada(s) com sucesso!`);

    } catch (error) {
      console.error('Erro ao importar backup:', error);
      mostrarErro('Erro ao importar backup. Verifique o arquivo.');
    }

    event.target.value = '';
  }

  // Utilitários

  function formatarData(dataStr) {
    if (!dataStr) return '-';

    try {
      const [ano, mes, dia] = dataStr.split('-');
      return `${dia}/${mes}/${ano}`;
    } catch {
      return dataStr;
    }
  }

  function normalizarTextoBusca(valor) {
    return String(valor || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function capitalizeFirstLetter(value) {
    if (typeof value !== 'string') return '';
    const texto = value.trim().replace(/\s+/g, ' ');
    if (!texto) return '';

    return texto
      .toLowerCase()
      .split(' ')
      .map((palavra, index) => {
        return palavra
          .split(/([-/])/)
          .map(parte => {
            if (!parte || parte === '-' || parte === '/') return parte;
            if (index > 0 && ['de', 'da', 'do', 'das', 'dos', 'e'].includes(parte)) return parte;
            return parte.charAt(0).toUpperCase() + parte.slice(1);
          })
          .join('');
      })
      .join(' ');
  }

  function calcularTotalItens(produtos) {
    if (!Array.isArray(produtos)) return 0;

    return produtos.reduce((total, p) => {
      const qtd = parseInt(p.quantidade) || 0;
      return total + qtd;
    }, 0);
  }

  function obterMiniaturaFicha(ficha) {
    const imagens = extrairImagensFicha(ficha);
    if (!Array.isArray(imagens) || imagens.length === 0) return '';

    const primeira = imagens[0];
    if (typeof primeira === 'string') return primeira;
    if (primeira && typeof primeira === 'object') {
      return primeira.src || primeira.url || '';
    }
    return '';
  }

  function extrairImagensFicha(ficha) {
    if (Array.isArray(ficha.imagens) && ficha.imagens.length > 0) {
      return ficha.imagens;
    }

    const imagensData = ficha.imagens_data || ficha.imagensData;
    if (!imagensData) return [];

    if (Array.isArray(imagensData)) {
      return imagensData;
    }

    if (typeof imagensData === 'string') {
      try {
        const parsed = JSON.parse(imagensData);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }

    return [];
  }
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  function mostrarSucesso(mensagem) {
    mostrarToast(mensagem, 'success');
  }

  function mostrarErro(mensagem) {
    mostrarToast(mensagem, 'error');
  }

  function escapeHtmlAttr(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function obterBotaoVisualizarDaThumb(thumb) {
    const card = thumb?.closest('.ficha-item');
    const botao = card?.querySelector('.btn-visualizar');
    if (!botao) return null;

    const id = Number.parseInt(botao.dataset?.id || '', 10);
    return Number.isNaN(id) || id <= 0 ? null : botao;
  }
})();






