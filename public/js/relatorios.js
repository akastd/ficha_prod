/**
 * Relatórios e Estatísticas
 */
(function () {
  'use strict';

  let periodoAtual = 'mes';
  let relatorioAtual = null;
  let dadosVendedores = [];
  let dadosMateriais = [];

  document.addEventListener('DOMContentLoaded', async () => {
    await initRelatorios();
  });

  async function initRelatorios() {
    try {
      if (typeof db !== 'undefined' && db.init) {
        await db.init();
      }

      initEventListeners();
      await carregarRelatorio();
    } catch (error) {
      mostrarErro('Erro ao conectar com o servidor');
    }
  }

  function initEventListeners() {
    document.querySelectorAll('.btn-periodo').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.btn-periodo').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        periodoAtual = btn.dataset.periodo;
        const customPeriod = document.getElementById('customPeriod');

        if (periodoAtual === 'customizado') {
          customPeriod.style.display = 'block';
        } else {
          customPeriod.style.display = 'none';
          carregarRelatorio();
        }
      });
    });

    document.getElementById('btnAplicarPeriodo')?.addEventListener('click', () => {
      carregarRelatorio();
    });

    document.getElementById('filtroVendedor')?.addEventListener('change', (e) => {
      const vendedor = e.target.value;
      if (vendedor) {
        filtrarPorVendedor(vendedor);
      } else {
        renderizarVendedores(dadosVendedores);
      }
    });

    document.getElementById('filtroMaterial')?.addEventListener('change', (e) => {
      const material = e.target.value;
      if (material) {
        filtrarPorMaterial(material);
      } else {
        renderizarMateriais(dadosMateriais);
      }
    });

    document.getElementById('btnExportarPDF')?.addEventListener('click', exportarPDF);
    document.getElementById('btnExportarExcel')?.addEventListener('click', exportarExcel);
    document.getElementById('btnImprimir')?.addEventListener('click', imprimirRelatorio);
  }

  function buildUrlParams() {
    let params = `periodo=${periodoAtual}`;
    if (periodoAtual === 'customizado') {
      const dataInicio = document.getElementById('relDataInicio')?.value;
      const dataFim = document.getElementById('relDataFim')?.value;
      if (dataInicio) params += `&dataInicio=${dataInicio}`;
      if (dataFim) params += `&dataFim=${dataFim}`;
    }
    return params;
  }

  async function carregarRelatorio() {
    try {
      if (periodoAtual === 'customizado') {
        const dataInicio = document.getElementById('relDataInicio')?.value;
        const dataFim = document.getElementById('relDataFim')?.value;

        if (!dataInicio || !dataFim) {
          mostrarErro('Por favor, selecione as datas inicial e final');
          return;
        }
      }

      const url = `${db.baseURL}/relatorio?${buildUrlParams()}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error('Erro ao buscar relatório');

      relatorioAtual = await response.json();

      atualizarEstatisticas(relatorioAtual);
      atualizarVendedorDestaque(relatorioAtual);
      atualizarTaxaEntrega(relatorioAtual);

      await Promise.all([
        carregarDadosVendedores(),
        carregarDadosMateriais(),
        carregarRankingProdutos(),
        carregarRankingClientes(),
        carregarDistribuicaoTamanhos(),
        carregarComparativo()
      ]);

    } catch (error) {
      mostrarErro('Erro ao carregar relatório');
    }
  }

  // Estatísticas Principais

  function atualizarEstatisticas(dados) {
    const statPedidosEntregues = document.getElementById('statPedidosEntregues');
    const statPedidosPendentes = document.getElementById('statPedidosPendentes');
    const statItensConfeccionados = document.getElementById('statItensConfeccionados');
    const statNovosClientes = document.getElementById('statNovosClientes');

    if (statPedidosEntregues) statPedidosEntregues.textContent = dados.fichasEntregues || 0;
    if (statPedidosPendentes) statPedidosPendentes.textContent = dados.fichasPendentes || 0;
    if (statItensConfeccionados) statItensConfeccionados.textContent = formatarNumero(dados.itensConfeccionados || 0);
    if (statNovosClientes) statNovosClientes.textContent = dados.novosClientes || 0;
  }

  function atualizarVendedorDestaque(dados) {
    const nomeEl = document.getElementById('topVendedorNome');
    const statsEl = document.getElementById('topVendedorStats');

    if (!nomeEl || !statsEl) return;

    if (dados.topVendedor) {
      nomeEl.textContent = dados.topVendedor;
      statsEl.textContent = `${dados.topVendedorTotal || 0} ${(dados.topVendedorTotal || 0) === 1 ? 'ficha' : 'fichas'}`;
    } else {
      nomeEl.textContent = 'Nenhum vendedor';
      statsEl.textContent = '0 fichas';
    }
  }

  function atualizarTaxaEntrega(dados) {
    const entregues = dados.fichasEntregues || 0;
    const pendentes = dados.fichasPendentes || 0;
    const total = entregues + pendentes;
    const taxa = total > 0 ? Math.min(100, Math.round((entregues / total) * 100)) : 0;

    const taxaValue = document.getElementById('taxaValue');
    const taxaEntregues = document.getElementById('taxaEntregues');
    const taxaTotal = document.getElementById('taxaTotal');
    const circle = document.getElementById('taxaProgress');

    if (taxaValue) taxaValue.textContent = `${taxa}%`;
    if (taxaEntregues) taxaEntregues.textContent = entregues;
    if (taxaTotal) taxaTotal.textContent = total;

    if (circle) {
      const circumference = 283;
      const offset = circumference - (taxa / 100) * circumference;
      circle.style.strokeDashoffset = offset;

      if (taxa >= 80) {
        circle.style.stroke = '#10b981';
      } else if (taxa >= 50) {
        circle.style.stroke = '#f59e0b';
      } else {
        circle.style.stroke = '#ef4444';
      }
    }
  }

  // Análise por Vendedor

  async function carregarDadosVendedores() {
    const container = document.getElementById('vendedoresContainer');
    const loading = document.getElementById('vendedoresLoading');
    const empty = document.getElementById('vendedoresEmpty');
    const select = document.getElementById('filtroVendedor');

    try {
      if (loading) loading.style.display = 'block';
      if (container) container.style.display = 'none';
      if (empty) empty.style.display = 'none';

      const url = `${db.baseURL}/relatorio/vendedores?${buildUrlParams()}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error('Erro ao buscar vendedores');

      const dados = await response.json();

      dadosVendedores = dados.map(v => ({
        vendedor: v.vendedor,
        totalPedidos: v.total_pedidos || v.totalPedidos || 0,
        totalItens: v.total_itens || v.totalItens || 0,
        entregues: v.entregues || 0,
        pendentes: Math.max(0, (v.total_pedidos || v.totalPedidos || 0) - (v.entregues || 0))
      }));

      dadosVendedores.sort((a, b) => b.totalPedidos - a.totalPedidos);

      if (select) {
        select.innerHTML = '<option value="">Todos os vendedores</option>';
        dadosVendedores.forEach(v => {
          select.innerHTML += `<option value="${escapeHtml(v.vendedor)}">${escapeHtml(v.vendedor)}</option>`;
        });
      }

      if (loading) loading.style.display = 'none';

      if (dadosVendedores.length === 0) {
        if (empty) empty.style.display = 'block';
      } else {
        if (container) container.style.display = 'block';
        renderizarVendedores(dadosVendedores);
      }

    } catch (error) {
      if (loading) loading.style.display = 'none';
      if (empty) empty.style.display = 'block';
    }
  }


  function renderizarVendedores(vendedores) {
    const container = document.getElementById('vendedoresContainer');
    if (!container) return;

    if (vendedores.length === 0) {
      container.innerHTML = '<div class="empty-placeholder"><i class="fas fa-user-slash"></i><p>Nenhum vendedor encontrado</p></div>';
      return;
    }

    const maxItens = Math.max(...vendedores.map(v => v.totalItens || 0), 1);

    container.innerHTML = vendedores.map((v, index) => {
      const porcentagemBarra = maxItens > 0 ? ((v.totalItens || 0) / maxItens * 100) : 0;
      const taxaEntrega = v.totalPedidos > 0 ? Math.min(100, Math.round((v.entregues / v.totalPedidos) * 100)) : 0;
      const taxaClass = taxaEntrega >= 80 ? 'taxa-alta' : taxaEntrega >= 50 ? 'taxa-media' : 'taxa-baixa';

      return `
        <div class="ranking-item ${index < 3 ? 'top-' + (index + 1) : ''}">
          <div class="ranking-position">${index + 1}º</div>
          <div class="ranking-info">
            <div class="ranking-header">
              <span class="ranking-name">${escapeHtml(v.vendedor)}</span>
              <span class="ranking-badge ${taxaClass}">${taxaEntrega}% entrega</span>
            </div>
            <div class="ranking-stats">
              <span><i class="fas fa-file-alt"></i> ${v.totalPedidos || 0} fichas</span>
              <span><i class="fas fa-tshirt"></i> ${formatarNumero(v.totalItens || 0)} itens</span>
              <span><i class="fas fa-check-circle"></i> ${Math.min(v.entregues || 0, v.totalPedidos || 0)} entregues</span>
              <span><i class="fas fa-clock"></i> ${v.pendentes || 0} pendentes</span>
            </div>
            <div class="ranking-bar">
              <div class="ranking-bar-fill" style="width: ${porcentagemBarra}%"></div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function filtrarPorVendedor(vendedor) {
    const filtrado = dadosVendedores.filter(v => v.vendedor === vendedor);
    renderizarVendedores(filtrado);
  }

  // Análise por Material

  async function carregarDadosMateriais() {
    const container = document.getElementById('materiaisContainer');
    const loading = document.getElementById('materiaisLoading');
    const empty = document.getElementById('materiaisEmpty');
    const select = document.getElementById('filtroMaterial');

    try {
      if (loading) loading.style.display = 'block';
      if (container) container.style.display = 'none';
      if (empty) empty.style.display = 'none';

      const url = `${db.baseURL}/relatorio/materiais?${buildUrlParams()}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error('Erro ao buscar materiais');

      const dados = await response.json();

      dadosMateriais = dados.map(m => ({
        material: m.material,
        totalPedidos: m.total_pedidos || m.totalPedidos || 0,
        totalItens: m.total_itens || m.totalItens || 0
      }));

      if (select) {
        select.innerHTML = '<option value="">Todos os materiais</option>';
        dadosMateriais.forEach(m => {
          select.innerHTML += `<option value="${escapeHtml(m.material)}">${escapeHtml(m.material)}</option>`;
        });
      }

      if (loading) loading.style.display = 'none';

      if (dadosMateriais.length === 0) {
        if (empty) empty.style.display = 'block';
      } else {
        if (container) container.style.display = 'block';
        renderizarMateriais(dadosMateriais);
      }

    } catch (error) {
      if (loading) loading.style.display = 'none';
      if (empty) empty.style.display = 'block';
    }
  }

  function renderizarMateriais(materiais) {
    const container = document.getElementById('materiaisContainer');
    if (!container) return;

    if (materiais.length === 0) {
      container.innerHTML = '<div class="empty-placeholder"><i class="fas fa-inbox"></i><p>Nenhum material encontrado</p></div>';
      return;
    }

    const totalItens = materiais.reduce((sum, m) => sum + (m.totalItens || 0), 0);

    container.innerHTML = materiais.map((m, index) => {
      const porcentagem = totalItens > 0 ? ((m.totalItens || 0) / totalItens * 100) : 0;
      const cores = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
      const cor = cores[index % cores.length];

      return `
        <div class="ranking-item material-item">
          <div class="ranking-position" style="background: ${cor}; color: white;">${index + 1}º</div>
          <div class="ranking-info">
            <div class="ranking-header">
              <span class="ranking-name">${escapeHtml(m.material)}</span>
              <span class="ranking-value">${formatarNumero(m.totalItens || 0)} itens</span>
            </div>
            <div class="ranking-stats">
              <span><i class="fas fa-file-alt"></i> ${m.totalPedidos || 0} fichas</span>
              <span><i class="fas fa-percentage"></i> ${porcentagem.toFixed(1)}% do total</span>
            </div>
            <div class="ranking-bar">
              <div class="ranking-bar-fill" style="width: ${porcentagem}%; background: ${cor};"></div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function filtrarPorMaterial(material) {
    const filtrado = dadosMateriais.filter(m => m.material === material);
    renderizarMateriais(filtrado);
  }

  // Rankings

  async function carregarRankingProdutos() {
    const container = document.getElementById('produtosRanking');
    if (!container) return;

    try {
      const url = `${db.baseURL}/relatorio/produtos?${buildUrlParams()}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error('Erro');

      const produtos = await response.json();

      if (produtos.length === 0) {
        container.innerHTML = '<div class="empty-placeholder"><i class="fas fa-tshirt"></i><p>Nenhum produto</p></div>';
        return;
      }

      container.innerHTML = produtos.slice(0, 5).map((p, i) => `
        <div class="mini-ranking-item">
          <span class="mini-pos">${i + 1}º</span>
          <span class="mini-name">${escapeHtml(p.produto || 'Não especificado')}</span>
          <span class="mini-value">${formatarNumero(p.quantidade || 0)}</span>
        </div>
      `).join('');

    } catch (error) {
      container.innerHTML = '<div class="empty-placeholder"><i class="fas fa-exclamation-circle"></i><p>Erro ao carregar</p></div>';
    }
  }

  async function carregarRankingClientes() {
    const container = document.getElementById('clientesRanking');
    if (!container) return;

    try {
      const url = `${db.baseURL}/relatorio/clientes-top?${buildUrlParams()}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error('Erro');

      let clientes = await response.json();

      clientes.sort((a, b) => {
        const totalA = a.total_pedidos || a.totalPedidos || 0;
        const totalB = b.total_pedidos || b.totalPedidos || 0;
        return totalB - totalA;
      });

      if (clientes.length === 0) {
        container.innerHTML = '<div class="empty-placeholder"><i class="fas fa-users"></i><p>Nenhum cliente</p></div>';
        return;
      }

      container.innerHTML = clientes.slice(0, 5).map((c, i) => `
        <div class="mini-ranking-item">
          <span class="mini-pos">${i + 1}º</span>
          <span class="mini-name">${escapeHtml(c.cliente)}</span>
          <span class="mini-value">${c.total_pedidos || c.totalPedidos || 0} fichas</span>
        </div>
      `).join('');

    } catch (error) {
      container.innerHTML = '<div class="empty-placeholder"><i class="fas fa-exclamation-circle"></i><p>Erro ao carregar</p></div>';
    }
  }


  // Distribuição por Tamanho

  async function carregarDistribuicaoTamanhos() {
    const container = document.getElementById('tamanhosContainer');
    if (!container) return;

    try {
      const url = `${db.baseURL}/relatorio/tamanhos?${buildUrlParams()}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error('Erro');

      const tamanhos = await response.json();

      if (tamanhos.length === 0) {
        container.innerHTML = '<div class="empty-placeholder"><i class="fas fa-ruler"></i><p>Nenhum dado de tamanho</p></div>';
        return;
      }

      const maxQtd = Math.max(...tamanhos.map(t => t.quantidade || 0), 1);
      const totalQtd = tamanhos.reduce((sum, t) => sum + (t.quantidade || 0), 0);

      container.innerHTML = `
        <div class="tamanhos-bars">
          ${tamanhos.map(t => {
        const altura = maxQtd > 0 ? ((t.quantidade || 0) / maxQtd * 100) : 0;
        const percent = totalQtd > 0 ? ((t.quantidade || 0) / totalQtd * 100).toFixed(1) : 0;
        return `
              <div class="tamanho-bar-container">
              <span class="tamanho-label">${t.tamanho}</span>
                <div class="tamanho-bar" style="height: ${Math.max(altura, 5)}%;" title="${t.tamanho}: ${formatarNumero(t.quantidade)} (${percent}%)">
                  <span class="tamanho-qtd">${formatarNumero(t.quantidade || 0)}</span>
                </div>
              </div>
            `;
      }).join('')}
        </div>
      `;

    } catch (error) {
      container.innerHTML = '<div class="empty-placeholder"><i class="fas fa-exclamation-circle"></i><p>Erro ao carregar</p></div>';
    }
  }

  // Comparativo

  async function carregarComparativo() {
    try {
      const url = `${db.baseURL}/relatorio/comparativo?${buildUrlParams()}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error('Erro');

      const comp = await response.json();

      const atual = comp.atual || {};
      const anterior = comp.anterior || {};

      atualizarComparativoItem('Pedidos', atual.pedidos, anterior.pedidos);
      atualizarComparativoItem('Itens', atual.itens, anterior.itens);
      atualizarComparativoItem('Clientes', atual.clientes, anterior.clientes);
      atualizarComparativoTaxa(atual.taxaEntrega, anterior.taxaEntrega);

    } catch (error) {
      atualizarComparativoItem('Pedidos', 0, 0);
      atualizarComparativoItem('Itens', 0, 0);
      atualizarComparativoItem('Clientes', 0, 0);
      atualizarComparativoTaxa(0, 0);
    }
  }

  function atualizarComparativoItem(tipo, atual, anterior) {
    const prefix = `comp${tipo}`;
    const atualEl = document.getElementById(`${prefix}Atual`);
    const anteriorEl = document.getElementById(`${prefix}Anterior`);
    const arrowEl = document.getElementById(`${prefix}Arrow`);
    const percentEl = document.getElementById(`${prefix}Percent`);

    if (!atualEl) return;

    const atualVal = atual || 0;
    const anteriorVal = anterior || 0;

    atualEl.textContent = formatarNumero(atualVal);
    if (anteriorEl) anteriorEl.textContent = formatarNumero(anteriorVal);

    const diff = atualVal - anteriorVal;
    const percent = anteriorVal > 0 ? Math.round((diff / anteriorVal) * 100) : (atualVal > 0 ? 100 : 0);

    if (arrowEl && percentEl) {
      if (diff > 0) {
        arrowEl.innerHTML = '<i class="fas fa-arrow-up"></i>';
        arrowEl.className = 'comp-arrow up';
        percentEl.className = 'comp-percent up';
        percentEl.textContent = `+${percent}%`;
      } else if (diff < 0) {
        arrowEl.innerHTML = '<i class="fas fa-arrow-down"></i>';
        arrowEl.className = 'comp-arrow down';
        percentEl.className = 'comp-percent down';
        percentEl.textContent = `${percent}%`;
      } else {
        arrowEl.innerHTML = '<i class="fas fa-minus"></i>';
        arrowEl.className = 'comp-arrow neutral';
        percentEl.className = 'comp-percent neutral';
        percentEl.textContent = '0%';
      }
    }
  }

  function atualizarComparativoTaxa(atual, anterior) {
    const atualEl = document.getElementById('compTaxaAtual');
    const anteriorEl = document.getElementById('compTaxaAnterior');
    const arrowEl = document.getElementById('compTaxaArrow');
    const percentEl = document.getElementById('compTaxaPercent');

    if (!atualEl) return;

    const atualVal = atual || 0;
    const anteriorVal = anterior || 0;

    atualEl.textContent = `${atualVal}%`;
    if (anteriorEl) anteriorEl.textContent = `${anteriorVal}%`;

    const diff = atualVal - anteriorVal;

    if (arrowEl && percentEl) {
      if (diff > 0) {
        arrowEl.innerHTML = '<i class="fas fa-arrow-up"></i>';
        arrowEl.className = 'comp-arrow up';
        percentEl.className = 'comp-percent up';
        percentEl.textContent = `+${diff}pp`;
      } else if (diff < 0) {
        arrowEl.innerHTML = '<i class="fas fa-arrow-down"></i>';
        arrowEl.className = 'comp-arrow down';
        percentEl.className = 'comp-percent down';
        percentEl.textContent = `${diff}pp`;
      } else {
        arrowEl.innerHTML = '<i class="fas fa-minus"></i>';
        arrowEl.className = 'comp-arrow neutral';
        percentEl.className = 'comp-percent neutral';
        percentEl.textContent = '0pp';
      }
    }
  }

  // Exportações

  function imprimirRelatorio() {
    if (!relatorioAtual) {
      mostrarErro('Nenhum relatório carregado');
      return;
    }

    const periodo = getPeriodoNome();
    const dataGeracao = new Date().toLocaleString('pt-BR');
    const entregues = relatorioAtual.fichasEntregues || 0;
    const pendentes = relatorioAtual.fichasPendentes || 0;
    const total = entregues + pendentes;
    const taxa = total > 0 ? Math.min(100, Math.round((entregues / total) * 100)) : 0;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>Relatório de Produção - ${periodo}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #1f2937; line-height: 1.6; }
        .header { text-align: center; border-bottom: 3px solid #3b82f6; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { font-size: 28px; color: #1e40af; margin-bottom: 8px; }
        .header .periodo { font-size: 18px; color: #6b7280; }
        .header .data-geracao { font-size: 12px; color: #9ca3af; margin-top: 8px; }
        .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 30px; }
        .stat-card { border: 2px solid #e5e7eb; border-radius: 12px; padding: 20px; text-align: center; }
        .stat-card.green { border-left: 5px solid #10b981; }
        .stat-card.orange { border-left: 5px solid #f59e0b; }
        .stat-card.blue { border-left: 5px solid #3b82f6; }
        .stat-card.purple { border-left: 5px solid #8b5cf6; }
        .stat-card .label { font-size: 14px; color: #6b7280; margin-bottom: 8px; }
        .stat-card .value { font-size: 36px; font-weight: 700; color: #1f2937; }
        .section { margin-bottom: 30px; }
        .section-title { font-size: 18px; font-weight: 600; color: #374151; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 15px; }
        .two-columns { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
        .info-box { background: #f9fafb; border-radius: 10px; padding: 20px; }
        .info-box .title { font-size: 14px; color: #6b7280; margin-bottom: 10px; }
        .info-box .content { font-size: 20px; font-weight: 600; color: #1f2937; }
        .info-box .subtitle { font-size: 14px; color: #9ca3af; }
        .taxa-box { text-align: center; }
        .taxa-valor { font-size: 48px; font-weight: 700; color: ${taxa >= 80 ? '#10b981' : taxa >= 50 ? '#f59e0b' : '#ef4444'}; }
        .taxa-legenda { color: #6b7280; font-size: 14px; }
        .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 20px; }
        @media print { body { padding: 20px; } .stat-card { break-inside: avoid; } }
    </style>
</head>
<body>
    <div class="header">
        <h1>📊 Relatório de Produção</h1>
        <div class="periodo">${periodo}</div>
        <div class="data-geracao">Gerado em: ${dataGeracao}</div>
    </div>
    <div class="stats-grid">
        <div class="stat-card green"><div class="label">Fichas Entregues</div><div class="value">${entregues}</div></div>
        <div class="stat-card orange"><div class="label">Fichas Pendentes</div><div class="value">${pendentes}</div></div>
        <div class="stat-card blue"><div class="label">Itens Confeccionados</div><div class="value">${formatarNumero(relatorioAtual.itensConfeccionados || 0)}</div></div>
        <div class="stat-card purple"><div class="label">Novos Clientes</div><div class="value">${relatorioAtual.novosClientes || 0}</div></div>
    </div>
    <div class="section">
        <div class="section-title">Detalhes</div>
        <div class="two-columns">
            <div class="info-box">
                <div class="title">🏆 Vendedor Destaque</div>
                <div class="content">${relatorioAtual.topVendedor || 'Nenhum'}</div>
                <div class="subtitle">${relatorioAtual.topVendedorTotal || 0} fichas no período</div>
            </div>
            <div class="info-box taxa-box">
                <div class="title">📈 Taxa de Entrega</div>
                <div class="taxa-valor">${taxa}%</div>
                <div class="taxa-legenda">${entregues} de ${total} fichas entregues</div>
            </div>
        </div>
    </div>
    <div class="footer">Sistema de Fichas Técnicas • Relatório gerado automaticamente</div>
    <script>window.onload = function() { window.print(); window.onafterprint = function() { window.close(); }; }<\/script>
</body>
</html>
    `);
    printWindow.document.close();
  }

  async function exportarPDF() {
    if (!relatorioAtual) {
      mostrarErro('Nenhum relatório carregado');
      return;
    }

    try {
      if (typeof window.jspdf === 'undefined') {
        await carregarScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        await carregarScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.15/jspdf.plugin.autotable.min.js');
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      if (typeof window.jspdf === 'undefined') {
        throw new Error('Biblioteca jsPDF não carregada');
      }

      const mesesPt = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
      const dataAtual = new Date();
      const periodo = `${mesesPt[dataAtual.getMonth()]} de ${dataAtual.getFullYear()}`;

      const doc = new window.jspdf.jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const dataGeracao = new Date().toLocaleString('pt-BR');
      const entregues = relatorioAtual.fichasEntregues || 0;
      const pendentes = relatorioAtual.fichasPendentes || 0;
      const total = entregues + pendentes;
      const taxa = total > 0 ? Math.min(100, Math.round((entregues / total) * 100)) : 0;

      const pageWidth = doc.internal.pageSize.getWidth();
      const centerX = pageWidth / 2;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.setTextColor(33, 97, 140);
      doc.text('Relatório de Produção | Priscila Confecções & Uniformes', centerX, 20, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(12);
      doc.setTextColor(100);
      doc.text(`Período: ${periodo}`, centerX, 30, { align: 'center' });
      doc.text(`Gerado em: ${dataGeracao}`, centerX, 37, { align: 'center' });

      const summaryData = [
        ['Métrica', 'Total'],
        ['Fichas Entregues', String(entregues)],
        ['Fichas Pendentes', String(pendentes)],
        ['Total de Fichas', String(total)],
        ['Taxa de Entrega', `${taxa}%`],
        ['Itens Confeccionados', String(relatorioAtual.itensConfeccionados || 0)],
        ['Novos Clientes', String(relatorioAtual.novosClientes || 0)]
      ];

      doc.autoTable({
        startY: 50,
        head: [summaryData[0]],
        body: summaryData.slice(1),
        theme: 'striped',
        headStyles: { fillColor: [33, 97, 140] },
        columnStyles: { 0: { fontStyle: 'bold' } }
      });

      const topVendedores = (dadosVendedores || [])
        .slice(0, 5)
        .map(v => [
          String(v.vendedor || 'N/A'),
          String(v.totalPedidos || 0),
          String(v.totalItens || 0),
          String(v.entregues || 0),
          `${v.totalPedidos > 0 ?
            Math.min(100, Math.round((v.entregues / v.totalPedidos) * 100)) : 0}%`
        ]);

      doc.autoTable({
        head: [['Vendedor', 'Fichas', 'Itens', 'Entregues', 'Taxa']],
        body: topVendedores,
        theme: 'striped',
        headStyles: { fillColor: [33, 97, 140] }
      });

      const topMateriais = (dadosMateriais || [])
        .slice(0, 5)
        .map(m => [
          String(m.material || 'N/A'),
          String(m.totalPedidos || 0),
          String(m.totalItens || 0)
        ]);

      doc.autoTable({
        head: [['Material', 'Fichas', 'Itens']],
        body: topMateriais,
        theme: 'striped',
        headStyles: { fillColor: [33, 97, 140] }
      });

      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Página 1 de 1`, centerX, 287, { align: 'center' });

      doc.save(`relatorio-${periodo.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.pdf`);

      mostrarToast('PDF exportado com sucesso!', 'success');
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      mostrarErro(error.message || 'Erro ao gerar PDF');
    }
  }


  function carregarScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function exportarExcel() {
    if (!relatorioAtual) {
      mostrarErro('Nenhum relatório carregado');
      return;
    }

    // Carregar biblioteca ExcelJS
    if (typeof ExcelJS === 'undefined') {
      await carregarScript('https://cdn.jsdelivr.net/npm/exceljs@4.3.0/dist/exceljs.min.js');
    }

    try {
      const workbook = new ExcelJS.Workbook();
      const mesesPt = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
      const dataAtual = new Date();
      const periodo = `${mesesPt[dataAtual.getMonth()]} de ${dataAtual.getFullYear()}`;
      const dataGeracao = new Date().toLocaleString('pt-BR');

      // Calcular métricas principais
      const entregues = relatorioAtual.fichasEntregues || 0;
      const pendentes = relatorioAtual.fichasPendentes || 0;
      const total = entregues + pendentes;
      const taxa = total > 0 ? Math.min(100, Math.round((entregues / total) * 100)) : 0;

      // Metadados do workbook
      workbook.creator = 'Sistema de Produção';
      workbook.created = new Date();

      // ==================== PLANILHA ÚNICA: DASHBOARD ====================
      criarDashboardCompleto(workbook, {
        periodo,
        dataGeracao,
        entregues,
        pendentes,
        total,
        taxa,
        itensConfeccionados: relatorioAtual.itensConfeccionados || 0,
        novosClientes: relatorioAtual.novosClientes || 0,
        topVendedor: relatorioAtual.topVendedor || '-',
        topVendedorTotal: relatorioAtual.topVendedorTotal || 0
      });

      // ==================== PLANILHA 2: DADOS DETALHADOS ====================
      if (relatorioAtual.detalhes && relatorioAtual.detalhes.length > 0) {
        criarPlanilhaDetalhada(workbook, relatorioAtual.detalhes);
      }

      // Gerar e baixar arquivo
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const nomeArquivo = `relatorio-producao-${periodo.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.xlsx`;

      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = nomeArquivo;
      link.click();

      mostrarToast('Relatório exportado com sucesso!', 'success');
    } catch (error) {
      console.error('Erro ao exportar Excel:', error);
      mostrarErro('Erro ao gerar relatório: ' + error.message);
    }
  }

  // ==================== FUNÇÃO DE DASHBOARD UNIFICADO ====================

  function criarDashboardCompleto(workbook, dados) {
    const worksheet = workbook.addWorksheet('Dashboard', {
      pageSetup: { paperSize: 9, orientation: 'landscape' }
    });

    // Configurar larguras das colunas para acomodar 3 tabelas lado a lado
    worksheet.columns = [
      // RESUMO (A-B)
      { width: 28 },
      { width: 22 },
      // Espaço (C)
      { width: 3 },
      // VENDEDORES (D-I)
      { width: 28 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
      { width: 15 },
      // Espaço (J)
      { width: 3 },
      // MATERIAIS (K-N)
      { width: 32 },
      { width: 15 },
      { width: 15 },
      { width: 15 }
    ];

    // ==================== TABELA 1: RESUMO EXECUTIVO (Colunas A-B) ====================

    // Título principal
    const tituloRow = worksheet.addRow(['RELATÓRIO DE PRODUÇÃO']);
    worksheet.mergeCells('A1:B1');
    tituloRow.getCell(1).style = {
      font: { bold: true, size: 16, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: getBordaCompleta()
    };
    tituloRow.height = 30;

    worksheet.addRow([]);

    // Informações do período
    addStyledRowRange(worksheet, 3, 'A', 'B', ['Período:', dados.periodo], { boldFirst: true });
    addStyledRowRange(worksheet, 4, 'A', 'B', ['Gerado em:', dados.dataGeracao], { boldFirst: true });
    worksheet.addRow([]);

    // Seção de métricas principais
    const headerMetricas = worksheet.getRow(6);
    headerMetricas.getCell(1).value = 'RESUMO DE DESEMPENHO';
    worksheet.mergeCells('A6:B6');
    headerMetricas.getCell(1).style = {
      font: { bold: true, size: 12, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: getBordaCompleta()
    };
    headerMetricas.height = 25;

    worksheet.addRow([]);

    // Cabeçalho da tabela
    const headerRow = worksheet.getRow(8);
    headerRow.getCell(1).value = 'Métrica';
    headerRow.getCell(2).value = 'Valor';
    headerRow.getCell(1).style = headerRow.getCell(2).style = {
      font: { bold: true, size: 11, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B9BD5' } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: getBordaCompleta()
    };
    headerRow.height = 20;

    // Dados das métricas
    const metricas = [
      ['Fichas Entregues', dados.entregues],
      ['Fichas Pendentes', dados.pendentes],
      ['Total de Fichas', dados.total],
      ['Taxa de Entrega', `${dados.taxa}%`],
      ['Itens Confeccionados', dados.itensConfeccionados],
      ['Novos Clientes', dados.novosClientes]
    ];

    metricas.forEach((metrica, index) => {
      const rowNum = 9 + index;
      const row = worksheet.getRow(rowNum);
      row.getCell(1).value = metrica[0];
      row.getCell(2).value = metrica[1];

      row.getCell(1).style = {
        font: { size: 10, bold: true },
        alignment: { horizontal: 'left', vertical: 'middle' },
        border: getBordaCompleta(),
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: index % 2 === 0 ? 'FFFFFFFF' : 'FFF2F2F2' } }
      };

      row.getCell(2).style = {
        font: { size: 10 },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: getBordaCompleta(),
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: index % 2 === 0 ? 'FFFFFFFF' : 'FFF2F2F2' } }
      };

      // Formatação especial para taxa de entrega
      if (metrica[0] === 'Taxa de Entrega') {
        row.getCell(2).style.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: getTaxaColor(dados.taxa) }
        };
        row.getCell(2).style.font = { bold: true, size: 11 };
      }
    });

    worksheet.addRow([]);

    // Vendedor destaque
    const headerVendedor = worksheet.getRow(16);
    headerVendedor.getCell(1).value = 'VENDEDOR DESTAQUE DO PERÍODO';
    worksheet.mergeCells('A16:B16');
    headerVendedor.getCell(1).style = {
      font: { bold: true, size: 12, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: getBordaCompleta()
    };
    headerVendedor.height = 25;

    worksheet.addRow([]);
    addStyledRowRange(worksheet, 18, 'A', 'B', ['Nome', dados.topVendedor], { boldFirst: true });
    addStyledRowRange(worksheet, 19, 'A', 'B', ['Total de Fichas', dados.topVendedorTotal], { boldFirst: true });

    // ==================== TABELA 2: VENDEDORES (Colunas D-I) ====================

    // Título
    const tituloVendedores = worksheet.getRow(1);
    tituloVendedores.getCell(4).value = 'ANÁLISE DE DESEMPENHO POR VENDEDOR';
    worksheet.mergeCells('D1:I1');
    tituloVendedores.getCell(4).style = {
      font: { bold: true, size: 14, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: getBordaCompleta()
    };
    tituloVendedores.height = 28;

    // Cabeçalho
    const headerVend = worksheet.getRow(3);
    const colsVend = ['Vendedor', 'Fichas', 'Itens', 'Entregues', 'Pendentes', 'Taxa Entrega'];
    colsVend.forEach((col, idx) => {
      headerVend.getCell(4 + idx).value = col;
      headerVend.getCell(4 + idx).style = {
        font: { bold: true, size: 11, color: { argb: 'FFFFFFFF' } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: getBordaCompleta()
      };
    });
    headerVend.height = 20;

    // Dados
    if (typeof dadosVendedores !== 'undefined' && dadosVendedores.length > 0) {
      dadosVendedores.forEach((v, index) => {
        const taxaV = v.totalPedidos > 0 ?
          Math.min(100, Math.round((v.entregues / v.totalPedidos) * 100)) : 0;

        const rowNum = 4 + index;
        const row = worksheet.getRow(rowNum);

        const valores = [v.vendedor, v.totalPedidos, v.totalItens, v.entregues, v.pendentes, taxaV / 100];
        valores.forEach((val, colIdx) => {
          row.getCell(4 + colIdx).value = val;
          row.getCell(4 + colIdx).style = {
            font: { size: 10 },
            alignment: {
              horizontal: colIdx === 0 ? 'left' : 'center',
              vertical: 'middle'
            },
            border: getBordaCompleta(),
            fill: {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: index % 2 === 0 ? 'FFFFFFFF' : 'FFF2F2F2' }
            }
          };

          if (colIdx === 5) {
            row.getCell(4 + colIdx).numFmt = '0%';
          }
        });
      });

      // Linha de total
      const totalRowNum = 4 + dadosVendedores.length + 1;
      const totais = calcularTotaisVendedores(dadosVendedores);
      const taxaTotal = totais.pedidos > 0 ?
        Math.min(100, Math.round((totais.entregues / totais.pedidos) * 100)) : 0;

      const totalRow = worksheet.getRow(totalRowNum);
      const valoresTotal = ['TOTAL GERAL', totais.pedidos, totais.itens, totais.entregues, totais.pendentes, taxaTotal / 100];

      valoresTotal.forEach((val, colIdx) => {
        totalRow.getCell(4 + colIdx).value = val;
        totalRow.getCell(4 + colIdx).style = {
          font: { bold: true, size: 11, color: { argb: 'FFFFFFFF' } },
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF70AD47' } },
          alignment: {
            horizontal: colIdx === 0 ? 'left' : 'center',
            vertical: 'middle'
          },
          border: getBordaCompleta()
        };

        if (colIdx === 5) {
          totalRow.getCell(4 + colIdx).numFmt = '0%';
        }
      });
    }

    // ==================== TABELA 3: MATERIAIS (Colunas K-N) ====================

    // Título
    const tituloMateriais = worksheet.getRow(1);
    tituloMateriais.getCell(11).value = 'ANÁLISE DE PRODUÇÃO POR MATERIAL';
    worksheet.mergeCells('K1:N1');
    tituloMateriais.getCell(11).style = {
      font: { bold: true, size: 14, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: getBordaCompleta()
    };

    // Cabeçalho
    const headerMat = worksheet.getRow(3);
    const colsMat = ['Material', 'Fichas', 'Itens', '% do Total'];
    colsMat.forEach((col, idx) => {
      headerMat.getCell(11 + idx).value = col;
      headerMat.getCell(11 + idx).style = {
        font: { bold: true, size: 11, color: { argb: 'FFFFFFFF' } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: getBordaCompleta()
      };
    });

    // Dados
    if (typeof dadosMateriais !== 'undefined' && dadosMateriais.length > 0) {
      const totalItens = dadosMateriais.reduce((sum, m) => sum + m.totalItens, 0);

      dadosMateriais.forEach((m, index) => {
        const percentual = totalItens > 0 ? (m.totalItens / totalItens) : 0;

        const rowNum = 4 + index;
        const row = worksheet.getRow(rowNum);

        const valores = [m.material, m.totalPedidos, m.totalItens, percentual];
        valores.forEach((val, colIdx) => {
          row.getCell(11 + colIdx).value = val;
          row.getCell(11 + colIdx).style = {
            font: { size: 10 },
            alignment: {
              horizontal: colIdx === 0 ? 'left' : 'center',
              vertical: 'middle'
            },
            border: getBordaCompleta(),
            fill: {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: index % 2 === 0 ? 'FFFFFFFF' : 'FFF2F2F2' }
            }
          };

          if (colIdx === 3) {
            row.getCell(11 + colIdx).numFmt = '0.0%';
          }
        });
      });

      // Total
      const totalRowNum = 4 + dadosMateriais.length + 1;
      const totais = calcularTotaisMateriais(dadosMateriais);
      const totalRow = worksheet.getRow(totalRowNum);

      const valoresTotal = ['TOTAL GERAL', totais.pedidos, totais.itens, 1];
      valoresTotal.forEach((val, colIdx) => {
        totalRow.getCell(11 + colIdx).value = val;
        totalRow.getCell(11 + colIdx).style = {
          font: { bold: true, size: 11, color: { argb: 'FFFFFFFF' } },
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF70AD47' } },
          alignment: {
            horizontal: colIdx === 0 ? 'left' : 'center',
            vertical: 'middle'
          },
          border: getBordaCompleta()
        };

        if (colIdx === 3) {
          totalRow.getCell(11 + colIdx).numFmt = '0%';
        }
      });
    }
  }

  function addStyledRowRange(worksheet, rowNum, startCol, endCol, values, options = {}) {
    const row = worksheet.getRow(rowNum);
    const startColNum = startCol.charCodeAt(0) - 64;

    values.forEach((val, idx) => {
      row.getCell(startColNum + idx).value = val;
      row.getCell(startColNum + idx).style = {
        font: {
          size: 10,
          bold: options.boldFirst && idx === 0
        },
        alignment: { horizontal: 'left', vertical: 'middle' }
      };
    });
  }

  // ==================== FUNÇÕES DE CRIAÇÃO DE PLANILHAS (ANTIGAS - REMOVIDAS) ====================

  function criarPlanilhaDetalhada(workbook, detalhes) {
    const worksheet = workbook.addWorksheet('Dados Detalhados');

    // Configurar larguras
    worksheet.columns = [
      { width: 12 },
      { width: 28 },
      { width: 22 },
      { width: 22 },
      { width: 12 },
      { width: 15 },
      { width: 15 }
    ];

    // Título
    const tituloRow = worksheet.addRow(['DADOS DETALHADOS DE PEDIDOS']);
    worksheet.mergeCells('A1:G1');
    tituloRow.getCell(1).style = {
      font: { bold: true, size: 14, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } },
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: getBordaCompleta()
    };
    tituloRow.height = 28;

    worksheet.addRow([]);

    // Cabeçalho
    const headerRow = worksheet.addRow(['ID Pedido', 'Cliente', 'Vendedor', 'Material', 'Quantidade', 'Status', 'Data']);
    headerRow.eachCell((cell) => {
      cell.style = {
        font: { bold: true, size: 10, color: { argb: 'FFFFFFFF' } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: getBordaCompleta()
      };
    });
    headerRow.height = 20;

    // Dados
    detalhes.forEach((item, index) => {
      const row = worksheet.addRow([
        item.id || '',
        item.cliente || '',
        item.vendedor || '',
        item.material || '',
        item.quantidade || 0,
        item.status || '',
        item.data || ''
      ]);

      row.eachCell((cell) => {
        cell.style = {
          font: { size: 9 },
          alignment: { horizontal: 'left', vertical: 'middle' },
          border: getBordaCompleta(),
          fill: {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: index % 2 === 0 ? 'FFFFFFFF' : 'FFF2F2F2' }
          }
        };
      });
    });
  }

  // ==================== FUNÇÕES AUXILIARES ====================

  function getBordaCompleta() {
    return {
      top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
      bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
      left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
      right: { style: 'thin', color: { argb: 'FFD3D3D3' } }
    };
  }

  function getTaxaColor(taxa) {
    if (taxa >= 90) return 'FFC6EFCE'; // Verde claro
    if (taxa >= 70) return 'FFFFEB9C'; // Amarelo claro
    return 'FFFFC7CE'; // Vermelho claro
  }

  function getIndicadorDesempenho(taxa) {
    if (taxa >= 90) return '✓ Excelente';
    if (taxa >= 70) return '○ Bom';
    if (taxa >= 50) return '△ Regular';
    return '✗ Crítico';
  }

  function classificarTaxa(taxa) {
    if (taxa >= 90) return 'Excelente';
    if (taxa >= 70) return 'Bom';
    if (taxa >= 50) return 'Regular';
    return 'Crítico';
  }

  function addStyledRow(worksheet, values, options = {}) {
    const row = worksheet.addRow(values);
    row.eachCell((cell, colNumber) => {
      cell.style = {
        font: {
          size: 10,
          bold: options.boldFirst && colNumber === 1
        },
        alignment: { horizontal: 'left', vertical: 'middle' }
      };
    });
    return row;
  }

  function calcularTotaisVendedores(dados) {
    return dados.reduce((acc, v) => ({
      pedidos: acc.pedidos + v.totalPedidos,
      itens: acc.itens + v.totalItens,
      entregues: acc.entregues + v.entregues,
      pendentes: acc.pendentes + v.pendentes
    }), { pedidos: 0, itens: 0, entregues: 0, pendentes: 0 });
  }

  function calcularTotaisMateriais(dados) {
    return dados.reduce((acc, m) => ({
      pedidos: acc.pedidos + m.totalPedidos,
      itens: acc.itens + m.totalItens
    }), { pedidos: 0, itens: 0 });
  }

  async function carregarScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // Utilitários

  function getPeriodoNome() {
    if (periodoAtual === 'mes') return 'Este Mês';
    if (periodoAtual === 'ano') return 'Este Ano';

    const inicio = document.getElementById('relDataInicio')?.value;
    const fim = document.getElementById('relDataFim')?.value;
    return `${formatarData(inicio)} a ${formatarData(fim)}`;
  }

  function formatarNumero(num) {
    return new Intl.NumberFormat('pt-BR').format(num);
  }

  function formatarData(dataStr) {
    if (!dataStr) return '-';
    try {
      const data = new Date(dataStr + 'T00:00:00');
      return data.toLocaleDateString('pt-BR');
    } catch {
      return dataStr;
    }
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function mostrarErro(mensagem) {
    mostrarToast(mensagem, 'error');
  }

  function mostrarToast(mensagem, tipo = 'info') {
    if (typeof window.mostrarToast === 'function') {
      window.mostrarToast(mensagem, tipo);
    }
  }
})();
