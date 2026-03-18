/**
 * API Client - Comunicação com o Backend
 */

class APIClient {
  constructor() {
    this.baseURL = this.detectBaseURL();
    this.initialized = false;
  }

  detectBaseURL() {
    const hostname = window.location.hostname;

    if (hostname.includes('render.com') || 
        hostname.includes('railway.app') ||
        hostname.includes('onrender.com')) {
      return window.location.origin + '/api';
    }

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:3000/api';
    }

    return window.location.origin + '/api';
  }

  async init() {
    if (this.initialized) return true;

    try {
      const response = await fetch(`${this.baseURL}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        this.initialized = true;
        return true;
      }
    } catch (error) {}

    if (window.location.hostname === 'localhost') {
      const altURL = 'http://localhost:3000/api';
      try {
        const response = await fetch(`${altURL}/health`);
        if (response.ok) {
          this.baseURL = altURL;
          this.initialized = true;
          return true;
        }
      } catch (e) {}
    }

    return false;
  }

  // Fichas

  async listarFichas(options = {}) {
    const params = new URLSearchParams();
    if (options.resumido === true) {
      params.set('resumido', '1');
    }
    if (options.status) {
      params.set('status', String(options.status));
    }

    const query = params.toString();
    const url = query ? `${this.baseURL}/fichas?${query}` : `${this.baseURL}/fichas`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Erro ao listar fichas');
    return response.json();
  }

  async listarFichasPaginado(options = {}) {
    const params = new URLSearchParams();
    params.set('paged', '1');

    const page = Number(options.page) > 0 ? Number(options.page) : 1;
    const pageSize = Number(options.pageSize) > 0 ? Number(options.pageSize) : 10;
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    params.set('resumido', options.resumido === false ? '0' : '1');

    if (options.status) params.set('status', String(options.status));
    if (options.termo) params.set('termo', String(options.termo));
    if (options.dataInicio) params.set('dataInicio', String(options.dataInicio));
    if (options.dataFim) params.set('dataFim', String(options.dataFim));
    if (options.evento) params.set('evento', String(options.evento));
    if (options.atrasado === true) params.set('atrasado', '1');

    const response = await fetch(`${this.baseURL}/fichas?${params.toString()}`);
    if (!response.ok) throw new Error('Erro ao listar fichas');

    const data = await response.json();
    return {
      items: Array.isArray(data?.items) ? data.items : [],
      total: Number(data?.total) || 0,
      page: Number(data?.page) || page,
      pageSize: Number(data?.pageSize) || pageSize,
      totalPages: Number(data?.totalPages) || 1,
      hasNext: Boolean(data?.hasNext)
    };
  }

  async buscarFicha(id) {
    const response = await fetch(`${this.baseURL}/fichas/${id}`);
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error('Erro ao buscar ficha');
    }
    return response.json();
  }

  async salvarFicha(dados) {
    const url = dados.id 
      ? `${this.baseURL}/fichas/${dados.id}`
      : `${this.baseURL}/fichas`;

    const method = dados.id ? 'PUT' : 'POST';
    const idempotencyKey = method === 'POST'
      ? String(dados.__idempotencyKey || '').trim()
      : '';

    const comNomesNumero = (() => {
      if (dados.comNomes === true) return 1;
      const numero = Number.parseInt(String(dados.comNomes ?? '').trim(), 10);
      return Number.isInteger(numero) && numero >= 1 && numero <= 3 ? numero : 0;
    })();

    const dadosEnvio = {
      cliente: dados.cliente || '',
      vendedor: dados.vendedor || '',
      dataInicio: dados.dataInicio || '',
      numeroVenda: dados.numeroVenda || '',
      dataEntrega: dados.dataEntrega || '',
      evento: dados.evento || 'nao',
      status: dados.status || 'pendente',
      produtos: dados.produtos || [],
      material: dados.material || '',
      composicao: dados.composicao || '',
      corMaterial: dados.corMaterial || '',
      manga: dados.manga || '',
      acabamentoManga: dados.acabamentoManga || '',
      larguraManga: dados.larguraManga || '',
      corAcabamentoManga: dados.corAcabamentoManga || '',
      gola: dados.gola || '',
      corGola: dados.corGola || '',
      acabamentoGola: dados.acabamentoGola || '',
      larguraGola: dados.larguraGola || '',
      corPeitilhoInterno: dados.corPeitilhoInterno || '',
      corPeitilhoExterno: dados.corPeitilhoExterno || '',
      aberturaLateral: dados.aberturaLateral || 'nao',
      corAberturaLateral: dados.corAberturaLateral || '',
      reforcoGola: dados.reforcoGola || 'nao',
      corReforco: dados.corReforco || '',
      corBotao: dados.corBotao || '',
      corPeDeGolaInterno: dados.corPeDeGolaInterno || '',
      corPeDeGolaExterno: dados.corPeDeGolaExterno || '',
      bolso: dados.bolso || '',
      filete: dados.filete || 'nao',
      fileteLocal: dados.fileteLocal || '',
      fileteCor: dados.fileteCor || '',
      faixa: dados.faixa || 'nao',
      faixaLocal: dados.faixaLocal || '',
      faixaCor: dados.faixaCor || '',
      arte: dados.arte || '',
      comNomes: comNomesNumero,
      observacoes: dados.observacoes || '',
      imagemData: dados.imagemData || '',
      imagensData: dados.imagensData || '[]'
    };

    const headers = { 'Content-Type': 'application/json' };
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(dadosEnvio)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      const err = new Error(error.error || 'Erro ao salvar ficha');
      err.details = Array.isArray(error.details) ? error.details : [];
      err.status = response.status;
      throw err;
    }

    const result = await response.json();
    return result.id;
  }

  async deletarFicha(id) {
    const response = await fetch(`${this.baseURL}/fichas/${id}`, {
      method: 'DELETE'
    });

    if (!response.ok) throw new Error('Erro ao deletar ficha');
    return true;
  }

  async marcarComoEntregue(id) {
    const response = await fetch(`${this.baseURL}/fichas/${id}/entregar`, {
      method: 'PATCH'
    });

    if (!response.ok) throw new Error('Erro ao marcar como entregue');
    return true;
  }

  async marcarComoPendente(id) {
    const response = await fetch(`${this.baseURL}/fichas/${id}/pendente`, {
      method: 'PATCH'
    });

    if (!response.ok) throw new Error('Erro ao marcar como pendente');
    return true;
  }

  async atualizarKanbanStatus(id, kanbanStatus) {
    const response = await fetch(`${this.baseURL}/fichas/${id}/kanban-status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: kanbanStatus })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Erro ao atualizar status do kanban');
    }

    return response.json();
  }

  async atualizarKanbanOrdem(status, orderedIds) {
    const response = await fetch(`${this.baseURL}/kanban/order`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        orderedIds: Array.isArray(orderedIds) ? orderedIds : []
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Erro ao atualizar ordem do kanban');
    }

    return response.json();
  }

  // Clientes

  async buscarClientes(termo = '') {
    const url = termo 
      ? `${this.baseURL}/clientes?termo=${encodeURIComponent(termo)}`
      : `${this.baseURL}/clientes`;

    const response = await fetch(url);
    if (!response.ok) throw new Error('Erro ao buscar clientes');
    return response.json();
  }

  // Estatísticas e Relatórios

  async buscarEstatisticas() {
    const response = await fetch(`${this.baseURL}/estatisticas`);
    if (!response.ok) throw new Error('Erro ao buscar estatísticas');
    return response.json();
  }

  async buscarRelatorio(periodo = 'mes', dataInicio = null, dataFim = null) {
    let url = `${this.baseURL}/relatorios?periodo=${periodo}`;

    if (dataInicio) url += `&dataInicio=${dataInicio}`;
    if (dataFim) url += `&dataFim=${dataFim}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error('Erro ao buscar relatório');
    return response.json();
  }

  // Backup

  async exportarBackup() {
    const fichas = await this.listarFichas();
    const clientes = await this.buscarClientes();

    return {
      fichas,
      clientes,
      dataExportacao: new Date().toISOString(),
      versao: 2.0
    };
  }

  async importarBackup(dados) {
    if (!dados.fichas || !Array.isArray(dados.fichas)) {
      throw new Error('Formato de backup inválido');
    }

    for (const ficha of dados.fichas) {
      delete ficha.id;
      await this.salvarFicha(ficha);
    }
  }
}

const db = new APIClient();
window.db = db;
