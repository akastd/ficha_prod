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

  async listarFichas() {
    const response = await fetch(`${this.baseURL}/fichas`);
    if (!response.ok) throw new Error('Erro ao listar fichas');
    return response.json();
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
      observacoes: dados.observacoes || '',
      imagemData: dados.imagemData || '',
      imagensData: dados.imagensData || '[]'
    };

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dadosEnvio)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Erro ao salvar ficha');
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
