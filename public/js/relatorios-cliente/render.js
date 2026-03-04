import { escapeHtml, formatDatePtBr, formatNumber } from './utils.js';

export function renderSidebar({ clients, loading, hasMore, selectedClientId }) {
  const listEl = document.getElementById('clienteList');
  const loadMoreEl = document.getElementById('btnLoadMoreClientes');
  if (!listEl || !loadMoreEl) return;

  if (loading && clients.length === 0) {
    listEl.innerHTML = `
      <div class="cliente-skeleton cliente-skeleton-sidebar">
        <div class="cliente-skeleton-line"></div>
        <div class="cliente-skeleton-line"></div>
        <div class="cliente-skeleton-line"></div>
        <div class="cliente-skeleton-line"></div>
        <div class="cliente-skeleton-line"></div>
      </div>
    `;
  } else if (!clients.length) {
    listEl.innerHTML = `
      <div class="empty-placeholder">
        <i class="fas fa-users-slash"></i>
        <p>Nenhum cliente encontrado.</p>
      </div>
    `;
  } else {
    listEl.innerHTML = clients.map((item, index) => {
      const isActive = Number(item.id) === Number(selectedClientId);
      return `
        <button
          type="button"
          class="cliente-list-item ${isActive ? 'is-active' : ''}"
          data-client-id="${item.id}"
          style="animation-delay:${Math.min(index * 32, 260)}ms"
          title="${escapeHtml(item.nome)}"
        >
          <span class="cliente-list-name">${escapeHtml(item.nome)}</span>
        </button>
      `;
    }).join('');
  }

  loadMoreEl.hidden = !hasMore || loading;
}

export function renderDetailLoading() {
  const el = document.getElementById('clienteDetailContent');
  if (!el) return;
  el.innerHTML = `
    <div class="cliente-skeleton cliente-skeleton-detail">
      <div class="cliente-skeleton-line" style="height: 28px; width: 48%"></div>
      <div class="cliente-skeleton-line" style="height: 34px; width: 100%"></div>
      <div class="cliente-skeleton-line" style="height: 180px; width: 100%"></div>
      <div class="cliente-skeleton-line" style="height: 140px; width: 100%"></div>
      <div class="cliente-skeleton-line" style="height: 180px; width: 100%"></div>
    </div>
  `;
}

export function renderDetailEmpty() {
  const el = document.getElementById('clienteDetailContent');
  if (!el) return;
  el.innerHTML = `
    <div class="empty-placeholder">
      <i class="fas fa-hand-pointer"></i>
      <p>Selecione um cliente para ver o relatório.</p>
    </div>
  `;
}

export function renderDetailError(message) {
  const el = document.getElementById('clienteDetailContent');
  if (!el) return;
  el.innerHTML = `
    <div class="empty-placeholder">
      <i class="fas fa-triangle-exclamation"></i>
      <p>${escapeHtml(message || 'Erro ao carregar relatório')}</p>
    </div>
  `;
}

function chip(icon, toneClass, label, value, missingTitle = 'Sem dados') {
  const hasValue = value !== null && value !== undefined && String(value).trim() !== '';
  const text = hasValue ? String(value) : '—';
  const title = hasValue ? '' : ` title="${escapeHtml(missingTitle)}"`;
  return `
    <div class="cliente-kpi-chip ${toneClass}"${title}>
      <i class="${escapeHtml(icon)}" aria-hidden="true"></i>
      <span class="cliente-kpi-label">${escapeHtml(label)}</span>
      <strong>${escapeHtml(text)}</strong>
    </div>
  `;
}

export function renderDetailReport({
  detail,
  dataInicio,
  dataFim,
  selectedQuickRange,
  showAllProducts
}) {
  const el = document.getElementById('clienteDetailContent');
  if (!el || !detail) return;

  const cliente = detail.cliente || {};
  const kpis = detail.kpis || {};
  const topProdutos = Array.isArray(detail.topProdutos) ? detail.topProdutos : [];
  const produtosExibidos = showAllProducts ? topProdutos : topProdutos.slice(0, 10);
  const historico = detail.historico || { items: [] };
  const insights = detail.insights || {};
  const totais = detail.totais || {};

  const quickButtons = [
    { id: '7d', label: '7 dias' },
    { id: '30d', label: '30 dias' },
    { id: '90d', label: '90 dias' },
    { id: 'mes', label: 'Este mês' },
    { id: 'ano', label: 'Ano atual' }
  ];

  el.innerHTML = `
    <div class="cliente-detail-header report-fade-in">
      <div>
        <h2 class="cliente-detail-title">
          <i class="fas fa-id-badge"></i>
          ${escapeHtml(cliente.nome || 'Cliente')}
        </h2>
        <div class="cliente-kpis">
          ${chip('fas fa-hashtag', 'chip-tone-info', 'Pedidos', formatNumber(kpis.quantidadePedidos || 0))}
          ${chip('fas fa-calendar-plus', 'chip-tone-success', 'Primeiro pedido', formatDatePtBr(kpis.primeiroPedido))}
          ${chip('fas fa-calendar-check', 'chip-tone-accent', 'Último pedido', formatDatePtBr(kpis.ultimoPedido))}
        </div>
      </div>
      <div class="cliente-export-actions">
        <button id="btnExportPdfCliente" type="button" class="btn btn-danger">
          <i class="fas fa-file-pdf"></i><span>Exportar PDF</span>
        </button>
        <button id="btnExportExcelCliente" type="button" class="btn btn-success">
          <i class="fas fa-file-excel"></i><span>Exportar Excel</span>
        </button>
      </div>
    </div>

    <div class="cliente-period-panel report-fade-in report-fade-in-delay-1">
      <div class="cliente-period-quick">
        ${quickButtons.map(btn => `
          <button type="button" class="cliente-period-quick-btn ${selectedQuickRange === btn.id ? 'is-active' : ''}" data-quick-range="${btn.id}">
            ${escapeHtml(btn.label)}
          </button>
        `).join('')}
      </div>
      <div class="form-grid">
        <div class="form-group">
          <label for="periodoDataInicio"><i class="fas fa-calendar-day"></i> Data inicial</label>
          <input id="periodoDataInicio" type="date" class="form-control" value="${escapeHtml(dataInicio || '')}">
        </div>
        <div class="form-group">
          <label for="periodoDataFim"><i class="fas fa-calendar-day"></i> Data final</label>
          <input id="periodoDataFim" type="date" class="form-control" value="${escapeHtml(dataFim || '')}">
        </div>
      </div>
      <div class="cliente-period-actions">
        <button id="btnAplicarPeriodoCliente" type="button" class="btn btn-primary">
          <i class="fas fa-filter"></i><span>Aplicar filtro</span>
        </button>
      </div>
    </div>

    <div class="cliente-section report-fade-in report-fade-in-delay-2">
      <h3><i class="fas fa-shirt"></i> Produtos mais comprados</h3>
      <div class="cliente-produto-list">
        ${produtosExibidos.length ? produtosExibidos.map(item => `
          <div class="cliente-produto-item">
            <span>${escapeHtml(item.produto)}</span>
            <span class="tag-metric tag-metric--blue">${formatNumber(item.quantidade)} itens</span>
            <span class="tag-metric tag-metric--teal">${formatNumber(item.pedidos)} pedidos</span>
          </div>
        `).join('') : '<p>Sem produtos no período.</p>'}
      </div>
      ${topProdutos.length > 10 ? `
        <div class="cliente-section-actions">
          <button id="btnToggleProdutos" type="button" class="btn btn-secondary">
            <i class="fas fa-list"></i><span>${showAllProducts ? 'Ver menos' : 'Ver mais'}</span>
          </button>
        </div>
      ` : ''}
    </div>

    <div class="cliente-section report-fade-in report-fade-in-delay-3">
      <h3><i class="fas fa-layer-group"></i> Quantidade total de itens comprados</h3>
      <div class="cliente-totais-grid">
        <div class="cliente-total-card">
          <div class="label"><i class="fas fa-box-open"></i> Total de itens</div>
          <div class="value">${formatNumber(totais.itens || 0)}</div>
        </div>
        <div class="cliente-total-card">
          <div class="label"><i class="fas fa-receipt"></i> Total de pedidos</div>
          <div class="value">${formatNumber(totais.pedidos || 0)}</div>
        </div>
        <div class="cliente-total-card">
          <div class="label"><i class="fas fa-sack-dollar"></i> Total gasto</div>
          <div class="value">—</div>
        </div>
      </div>
    </div>

    <div class="cliente-section report-fade-in report-fade-in-delay-4">
      <h3><i class="fas fa-clock-rotate-left"></i> Fichas anteriores relacionadas</h3>
      <table class="cliente-historico-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Referência</th>
            <th>Status</th>
            <th>Resumo</th>
            <th>Ação</th>
          </tr>
        </thead>
        <tbody>
          ${(historico.items || []).length ? historico.items.map(item => `
            <tr>
              <td>${escapeHtml(formatDatePtBr(item.dataInicio))}</td>
              <td>${escapeHtml(item.numeroVenda || `#${item.id}`)}</td>
              <td>
                <span class="historico-status ${String(item.status || '').toLowerCase() === 'entregue' ? 'is-done' : 'is-pending'}">
                  ${escapeHtml(item.status || '—')}
                </span>
              </td>
              <td>${escapeHtml(item.resumo || '—')}</td>
              <td>
                <button type="button" class="btn btn-secondary btn-historico-open" data-open-preview="${item.id}">
                  <i class="fas fa-eye"></i>
                  <span>Abrir</span>
                </button>
              </td>
            </tr>
          `).join('') : '<tr><td colspan="5">Sem histórico no período.</td></tr>'}
        </tbody>
      </table>
      <div class="cliente-historico-pagination">
        <button id="btnHistoricoPrev" type="button" class="btn btn-secondary" ${(historico.offset || 0) <= 0 ? 'disabled' : ''}>
          <i class="fas fa-chevron-left"></i><span>Anterior</span>
        </button>
        <button id="btnHistoricoNext" type="button" class="btn btn-secondary" ${historico.hasMore ? '' : 'disabled'}>
          <span>Próxima</span><i class="fas fa-chevron-right"></i>
        </button>
      </div>
    </div>

    <div class="cliente-section report-fade-in report-fade-in-delay-5">
      <h3><i class="fas fa-lightbulb"></i> Informações relevantes</h3>
      <div class="cliente-insight-list">
        <div class="cliente-insight-item">
          <span><i class="fas fa-tags"></i> Categorias preferidas</span>
          <span>${escapeHtml((insights.categoriasPreferidas || []).join(', ') || '—')}</span>
          <span></span>
        </div>
        <div class="cliente-insight-item">
          <span><i class="fas fa-gauge-high"></i> Frequência de compra</span>
          <span>${escapeHtml(insights.frequenciaCompra?.pedidosPorMes != null ? `${insights.frequenciaCompra.pedidosPorMes} pedidos/mês` : '—')}</span>
          <span>${escapeHtml(insights.frequenciaCompra?.mediaDiasEntreCompras != null ? `${insights.frequenciaCompra.mediaDiasEntreCompras} dias entre compras` : '')}</span>
        </div>
        <div class="cliente-insight-item">
          <span><i class="fas fa-arrows-rotate"></i> Produtos recorrentes</span>
          <span>${escapeHtml((insights.produtosRecorrentes || []).map(p => p.produto).join(', ') || '—')}</span>
          <span></span>
        </div>
        <div class="cliente-insight-item">
          <span><i class="fas fa-bell"></i> Alertas</span>
          <span>${escapeHtml((insights.alertas || []).join(' | ') || 'Nenhum alerta')}</span>
          <span></span>
        </div>
      </div>
    </div>
  `;
}
