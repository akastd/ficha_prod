/**
 * Gestão de Clientes
 */

(function() {
  'use strict';

  let clientesCache = [];
  let clientesFiltrados = [];
  let paginaAtual = 1;
  const itensPorPagina = 15;
  let ordenacaoAtual = 'nome_asc';
  let clienteParaDeletar = null;
  let exclusaoClienteEmAndamento = false;
  let captchaDeleteCliente = '';
  let ultimoToastCaptchaInvalidoCliente = 0;

  document.addEventListener('DOMContentLoaded', async () => {
    await initClientes();
  });

  async function initClientes() {
    try {
      await db.init();
      await carregarClientes();
      initEventListeners();
    } catch (error) {
      mostrarToast('Erro ao conectar com o servidor', 'error');
    }
  }

  function initEventListeners() {
    const searchInput = document.getElementById('searchCliente');
    searchInput.addEventListener('input', debounce(aplicarFiltros, 300));

    const ordenarSelect = document.getElementById('ordenarPor');
    ordenarSelect.addEventListener('change', (e) => {
      ordenacaoAtual = e.target.value;
      aplicarFiltros();
    });

    document.getElementById('btnLimparFiltros').addEventListener('click', limparFiltros);
    document.getElementById('btnPrevPage').addEventListener('click', () => mudarPagina(-1));
    document.getElementById('btnNextPage').addEventListener('click', () => mudarPagina(1));

    document.getElementById('editForm').addEventListener('submit', salvarEdicao);
    document.getElementById('btnCancelarEdit').addEventListener('click', fecharModalEdit);
    document.querySelector('#editModal .modal-overlay').addEventListener('click', fecharModalEdit);

    document.getElementById('btnCancelarDelete').addEventListener('click', fecharModalDelete);
    document.getElementById('btnConfirmarDelete').addEventListener('click', confirmarDelete);
    const deleteCaptchaInput = document.getElementById('deleteCaptchaInputCliente');
    if (deleteCaptchaInput) {
      deleteCaptchaInput.addEventListener('input', atualizarEstadoConfirmarDeleteCliente);
    }
    document.querySelector('#deleteModal .modal-overlay').addEventListener('click', fecharModalDelete);
  }

  async function carregarClientes() {
    renderizarLoadingEstatisticas();
    renderizarLoadingClientes();

    try {
      const response = await fetch(db.baseURL + '/clientes/lista');

      if (!response.ok) {
        throw new Error('Erro ao carregar clientes');
      }

      clientesCache = await response.json();
      atualizarEstatisticas();
      aplicarFiltros();

    } catch (error) {
      clientesCache = [];
      atualizarEstatisticas();
      aplicarFiltros();
      mostrarToast('Erro ao carregar clientes', 'error');
    }
  }

  function renderizarLoadingEstatisticas() {
    [
      'statTotalClientes',
      'statTotalFichas',
      'statNovosClientes',
      'statMediaFichas'
    ].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = '';
      el.classList.add('stat-value-skeleton');
    });
  }

  function renderizarLoadingClientes() {
    const container = document.getElementById('clientesContainer');
    const emptyState = document.getElementById('emptyState');
    const resultadosCount = document.getElementById('resultadosCount');
    const paginacao = document.getElementById('paginacao');
    if (!container) return;

    if (emptyState) emptyState.style.display = 'none';
    if (paginacao) paginacao.style.display = 'none';
    if (resultadosCount) resultadosCount.textContent = 'Carregando...';

    const quantidade = Math.max(4, Math.min(itensPorPagina, 6));
    container.innerHTML = Array.from({ length: quantidade }, () => criarCardClienteSkeleton()).join('');
  }

  function criarCardClienteSkeleton() {
    return `
      <div class="ficha-item ficha-item-skeleton" aria-hidden="true">
        <div class="ficha-main">
          <div class="ficha-header">
            <span class="dashboard-skeleton-line dashboard-skeleton-title"></span>
            <span class="dashboard-skeleton-pill"></span>
          </div>
          <div class="ficha-details ficha-details-skeleton">
            <span class="dashboard-skeleton-line dashboard-skeleton-short"></span>
            <span class="dashboard-skeleton-line dashboard-skeleton-medium"></span>
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

  function atualizarEstatisticas() {
    const totalClientes = clientesCache.length;
    const totalFichas = clientesCache.reduce((sum, c) => sum + (c.total_pedidos || 0), 0);
    const mediaFichas = totalClientes > 0 ? (totalFichas / totalClientes).toFixed(1) : 0;

    const now = new Date();
    const mesAtual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const novosEsteMes = clientesCache.filter(c => 
      c.primeiro_pedido && c.primeiro_pedido.startsWith(mesAtual)
    ).length;

    setStatValue('statTotalClientes', totalClientes);
    setStatValue('statTotalFichas', totalFichas);
    setStatValue('statNovosClientes', novosEsteMes);
    setStatValue('statMediaFichas', mediaFichas);
  }

  function setStatValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('stat-value-skeleton');
    el.textContent = value;
  }

  function aplicarFiltros() {
    const termoBusca = document.getElementById('searchCliente').value.toLowerCase().trim();

    clientesFiltrados = clientesCache.filter(cliente => {
      if (termoBusca && !cliente.nome.toLowerCase().includes(termoBusca)) {
        return false;
      }
      return true;
    });

    ordenarClientes();
    paginaAtual = 1;
    renderizarClientes();
    atualizarPaginacao();
  }

  function ordenarClientes() {
    const [campo, direcao] = ordenacaoAtual.includes('_') 
      ? ordenacaoAtual.split('_') 
      : [ordenacaoAtual, 'asc'];

    const multiplicador = direcao === 'desc' ? -1 : 1;

    clientesFiltrados.sort((a, b) => {
      let valorA, valorB;

      switch (campo) {
        case 'nome':
          valorA = (a.nome || '').toLowerCase();
          valorB = (b.nome || '').toLowerCase();
          return multiplicador * valorA.localeCompare(valorB, 'pt-BR');

        case 'fichas':
        case 'pedidos':
          valorA = a.total_pedidos || 0;
          valorB = b.total_pedidos || 0;
          return multiplicador * (valorA - valorB);

        case 'recente':
          valorA = a.ultimo_pedido || '';
          valorB = b.ultimo_pedido || '';
          return -1 * valorA.localeCompare(valorB);

        case 'antigo':
          valorA = a.primeiro_pedido || '';
          valorB = b.primeiro_pedido || '';
          return valorA.localeCompare(valorB);

        default:
          return 0;
      }
    });
  }

  function renderizarClientes() {
    const container = document.getElementById('clientesContainer');
    const emptyState = document.getElementById('emptyState');
    const resultadosCount = document.getElementById('resultadosCount');

    resultadosCount.textContent = `${clientesFiltrados.length} ${clientesFiltrados.length === 1 ? 'resultado' : 'resultados'}`;

    if (clientesFiltrados.length === 0) {
      container.innerHTML = '';
      emptyState.style.display = 'block';
      document.getElementById('paginacao').style.display = 'none';
      return;
    }

    emptyState.style.display = 'none';

    const inicio = (paginaAtual - 1) * itensPorPagina;
    const fim = inicio + itensPorPagina;
    const clientesPagina = clientesFiltrados.slice(inicio, fim);

    container.innerHTML = clientesPagina.map(cliente => criarCardCliente(cliente)).join('');

    container.querySelectorAll('.btn-editar').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        abrirModalEdit(id);
      });
    });

    container.querySelectorAll('.btn-fichas').forEach(btn => {
      btn.addEventListener('click', () => {
        const nome = btn.dataset.nome;
        verFichasCliente(nome);
      });
    });

    container.querySelectorAll('.btn-deletar').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        const nome = btn.dataset.nome;
        abrirModalDelete(id, nome);
      });
    });

    document.getElementById('paginacao').style.display = clientesFiltrados.length > itensPorPagina ? 'flex' : 'none';
  }

  function criarCardCliente(cliente) {
    const primeiroPedido = formatarData(cliente.primeiro_pedido);
    const ultimoPedido = formatarData(cliente.ultimo_pedido);
    const totalFichas = cliente.total_pedidos || 0;

    return `
      <div class="ficha-item">
        <div class="ficha-main">
          <div class="ficha-header">
            <span class="ficha-cliente">${escapeHtml(cliente.nome)}</span>
            <span class="ficha-numero">${totalFichas} ${totalFichas === 1 ? 'ficha' : 'fichas'}</span>
          </div>

          <div class="ficha-details">
            <div class="ficha-detail">
              <i class="fas fa-calendar-plus"></i>
              <span>Primeira ficha: ${primeiroPedido}</span>
            </div>

            <div class="ficha-detail">
              <i class="fas fa-calendar-check"></i>
              <span>Última ficha: ${ultimoPedido}</span>
            </div>
          </div>
        </div>

        <div class="ficha-actions">
          <button class="btn btn-primary btn-editar" data-id="${cliente.id}" title="Editar">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn btn-secondary btn-fichas" data-nome="${escapeHtml(cliente.nome)}" title="Ver Fichas">
            <i class="fas fa-file-alt"></i>
          </button>
          <button class="btn btn-danger btn-deletar" data-id="${cliente.id}" data-nome="${escapeHtml(cliente.nome)}" title="Excluir">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  }

  function atualizarPaginacao() {
    const totalPaginas = Math.ceil(clientesFiltrados.length / itensPorPagina) || 1;

    document.getElementById('pageInfo').textContent = `Página ${paginaAtual} de ${totalPaginas}`;
    document.getElementById('btnPrevPage').disabled = paginaAtual <= 1;
    document.getElementById('btnNextPage').disabled = paginaAtual >= totalPaginas;
  }

  function mudarPagina(delta) {
    const totalPaginas = Math.ceil(clientesFiltrados.length / itensPorPagina) || 1;
    paginaAtual = Math.max(1, Math.min(totalPaginas, paginaAtual + delta));
    renderizarClientes();
    atualizarPaginacao();
  }

  function limparFiltros() {
    document.getElementById('searchCliente').value = '';
    document.getElementById('ordenarPor').value = 'nome_asc';
    ordenacaoAtual = 'nome_asc';
    aplicarFiltros();
  }

  // Modal Editar

  function abrirModalEdit(id) {
    const cliente = clientesCache.find(c => c.id === id);
    if (!cliente) return;

    document.getElementById('editId').value = id;
    document.getElementById('editNome').value = cliente.nome || '';
    document.getElementById('editPrimeiroPedido').value = cliente.primeiro_pedido || '';
    document.getElementById('editUltimoPedido').value = cliente.ultimo_pedido || '';

    document.getElementById('editModal').style.display = 'flex';
  }

  function fecharModalEdit() {
    document.getElementById('editModal').style.display = 'none';
  }

  async function salvarEdicao(e) {
    e.preventDefault();

    const id = document.getElementById('editId').value;
    const dados = {
      nome: document.getElementById('editNome').value.trim(),
      primeiro_pedido: document.getElementById('editPrimeiroPedido').value || null,
      ultimo_pedido: document.getElementById('editUltimoPedido').value || null
    };

    if (!dados.nome) {
      mostrarToast('Nome do cliente é obrigatório', 'error');
      return;
    }

    try {
      const response = await fetch(`${db.baseURL}/clientes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao atualizar');
      }

      mostrarToast('Cliente atualizado com sucesso!', 'success');
      fecharModalEdit();
      await carregarClientes();

    } catch (error) {
      mostrarToast(error.message || 'Erro ao atualizar cliente', 'error');
    }
  }

  // Modal Delete

  function abrirModalDelete(id, nome) {
    clienteParaDeletar = id;
    exclusaoClienteEmAndamento = false;
    captchaDeleteCliente = gerarCaptchaExclusao();
    document.getElementById('deleteClienteNome').textContent = nome;
    const captchaLabel = document.getElementById('deleteCaptchaValueCliente');
    const captchaInput = document.getElementById('deleteCaptchaInputCliente');
    if (captchaLabel) captchaLabel.textContent = captchaDeleteCliente;
    if (captchaInput) captchaInput.value = '';
    atualizarEstadoConfirmarDeleteCliente();
    document.getElementById('deleteModal').style.display = 'flex';
    if (captchaInput) {
      setTimeout(() => captchaInput.focus(), 0);
    }
  }

  function fecharModalDelete() {
    if (exclusaoClienteEmAndamento) return;
    document.getElementById('deleteModal').style.display = 'none';
    clienteParaDeletar = null;
    captchaDeleteCliente = '';
    const captchaInput = document.getElementById('deleteCaptchaInputCliente');
    const captchaLabel = document.getElementById('deleteCaptchaValueCliente');
    if (captchaInput) captchaInput.value = '';
    if (captchaLabel) captchaLabel.textContent = '';
    atualizarEstadoConfirmarDeleteCliente();
  }

  async function confirmarDelete() {
    if (!clienteParaDeletar) return;
    if (exclusaoClienteEmAndamento) return;

    const captchaInput = document.getElementById('deleteCaptchaInputCliente');
    const captchaDigitado = String(captchaInput?.value || '').trim();
    if (!captchaDeleteCliente || captchaDigitado !== captchaDeleteCliente) {
      mostrarToast('Código de confirmação inválido para excluir o cliente', 'error');
      return;
    }

    try {
      exclusaoClienteEmAndamento = true;
      atualizarEstadoConfirmarDeleteCliente();

      const response = await fetch(`${db.baseURL}/clientes/${clienteParaDeletar}`, {
        method: 'DELETE'
      });

      const contentType = response.headers.get('content-type');

      if (!response.ok) {
        let errorMsg = 'Erro ao excluir cliente';
        if (contentType && contentType.includes('application/json')) {
          try {
            const error = await response.json();
            errorMsg = error.error || errorMsg;
          } catch (e) {}
        }
        throw new Error(errorMsg);
      }

      mostrarToast('Cliente excluído com sucesso!', 'success');
      exclusaoClienteEmAndamento = false;
      fecharModalDelete();
      await carregarClientes();

    } catch (error) {
      exclusaoClienteEmAndamento = false;
      atualizarEstadoConfirmarDeleteCliente();
      const msg = error.message || 'Erro ao excluir cliente';
      const msgLimpa = msg.includes('Unexpected token') ? 'Erro ao excluir cliente' : msg;
      mostrarToast(msgLimpa, 'error');
    }
  }

  function gerarCaptchaExclusao() {
    return String(Math.floor(1000 + Math.random() * 9000));
  }

  function atualizarEstadoConfirmarDeleteCliente() {
    const btnConfirmarDelete = document.getElementById('btnConfirmarDelete');
    const btnCancelarDelete = document.getElementById('btnCancelarDelete');
    const captchaInput = document.getElementById('deleteCaptchaInputCliente');
    const modal = document.getElementById('deleteModal');
    if (!btnConfirmarDelete) return;

    if (!btnConfirmarDelete.dataset.defaultHtml) {
      btnConfirmarDelete.dataset.defaultHtml = btnConfirmarDelete.innerHTML;
    }

    const captchaDigitado = String(captchaInput?.value || '').trim();
    const captchaCompleto = captchaDeleteCliente && captchaDigitado.length === String(captchaDeleteCliente).length;
    const captchaValido = Boolean(captchaDeleteCliente) && captchaDigitado === captchaDeleteCliente;
    btnConfirmarDelete.disabled = exclusaoClienteEmAndamento || !captchaValido;
    btnConfirmarDelete.setAttribute('aria-busy', exclusaoClienteEmAndamento ? 'true' : 'false');
    btnConfirmarDelete.innerHTML = exclusaoClienteEmAndamento
      ? '<i class="fas fa-spinner fa-spin"></i> Excluindo cliente...'
      : btnConfirmarDelete.dataset.defaultHtml;

    if (btnCancelarDelete) {
      btnCancelarDelete.disabled = exclusaoClienteEmAndamento;
    }

    if (captchaInput) {
      captchaInput.disabled = exclusaoClienteEmAndamento;
    }

    if (modal) {
      modal.classList.toggle('is-busy', exclusaoClienteEmAndamento);
    }

    if (!exclusaoClienteEmAndamento && captchaCompleto && !captchaValido) {
      notificarCaptchaInvalidoCliente();
    }
  }

  function notificarCaptchaInvalidoCliente() {
    const agora = Date.now();
    if (agora - ultimoToastCaptchaInvalidoCliente < 1200) return;
    ultimoToastCaptchaInvalidoCliente = agora;
    mostrarToast('Código de confirmação incorreto', 'error');
  }

  // Ver Fichas

  function verFichasCliente(nomeCliente) {
    window.location.href = `/dashboard?cliente=${encodeURIComponent(nomeCliente)}`;
  }

  // Utilitários

  function formatarData(dataISO) {
    if (window.appUtils && typeof window.appUtils.formatDateBrIso === 'function') {
      return window.appUtils.formatDateBrIso(dataISO, '-');
    }
    if (!dataISO) return '-';
    const [ano, mes, dia] = dataISO.split('-');
    return `${dia}/${mes}/${ano}`;
  }

  function escapeHtml(text) {
    if (window.appUtils && typeof window.appUtils.escapeHtml === 'function') {
      return window.appUtils.escapeHtml(text);
    }
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function debounce(func, wait) {
    if (window.appUtils && typeof window.appUtils.debounce === 'function') {
      return window.appUtils.debounce(func, wait);
    }
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
})();
