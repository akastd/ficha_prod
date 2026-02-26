/**
 * Integração do formulário com o banco de dados
 */

(function () {
  'use strict';

  let fichaAtualId = null;
  let modoVisualizacao = false;
  let fichaVisualizacaoAtual = null;
  const DUPLICACAO_DRAFT_STORAGE_KEY = 'ficha_duplicada_draft_v1';
  const CAMPOS_OBRIGATORIOS = Object.freeze([
    { key: 'cliente', id: 'cliente', label: 'o nome do cliente' },
    { key: 'vendedor', id: 'vendedor', label: 'o vendedor' },
    { key: 'dataEntrega', id: 'dataEntrega', label: 'a data de entrega' },
    { key: 'material', id: 'material', label: 'o tecido/material' },
    { key: 'arte', id: 'arte', label: 'o tipo de personalização' }
  ]);

  const camposBancoParaForm = {
    'id': 'id',
    'cliente': 'cliente',
    'vendedor': 'vendedor',
    'data_inicio': 'dataInicio',
    'numero_venda': 'numeroVenda',
    'data_entrega': 'dataEntrega',
    'evento': 'evento',
    'status': 'status',
    'material': 'material',
    'composicao': 'composicao',
    'cor_material': 'corMaterial',
    'manga': 'manga',
    'acabamento_manga': 'acabamentoManga',
    'largura_manga': 'larguraManga',
    'cor_acabamento_manga': 'corAcabamentoManga',
    'gola': 'gola',
    'cor_gola': 'corGola',
    'acabamento_gola': 'acabamentoGola',
    'largura_gola': 'larguraGola',
    'cor_peitilho_interno': 'corPeitilhoInterno',
    'cor_peitilho_externo': 'corPeitilhoExterno',
    'cor_pe_de_gola_interno': 'corPeDeGolaInterno',
    'cor_pe_de_gola_externo': 'corPeDeGolaExterno',
    'abertura_lateral': 'aberturaLateral',
    'cor_abertura_lateral': 'corAberturaLateral',
    'reforco_gola': 'reforcoGola',
    'cor_reforco': 'corReforco',
    'cor_botao': 'corBotao',
    'bolso': 'bolso',
    'filete': 'filete',
    'filete_local': 'fileteLocal',
    'filete_cor': 'fileteCor',
    'faixa': 'faixa',
    'faixa_local': 'faixaLocal',
    'faixa_cor': 'faixaCor',
    'arte': 'arte',
    'com_nomes': 'comNomes',
    'observacoes': 'observacoes',
    'observacoes_html': 'observacoesHtml',
    'observacoes_plain_text': 'observacoesPlainText',
    'imagens_data': 'imagensData',
    'imagem_data': 'imagemData',
    'produtos': 'produtos'
  };

  const COM_NOMES_VALOR_NENHUM = '0';
  const TEMPLATE_FILES = Object.freeze([
    'camiseta_mc_gr.json',
    'camiseta_ml_gr.json',
    'camiseta_mc_gv.json',
    'camiseta_ml_gv.json',
    'baby_mc_gr.json',
    'baby_ml_gr.json',
    'baby_mc_gv.json',
    'baby_ml_gv.json',
    'camiseta_mc_gp.json',
    'camiseta_ml_gp.json',
    'camisa_masc_mc.json',
    'camisa_masc_ml.json',
    'baby_mc_gp.json',
    'baby_ml_gp.json',
    'camisa_fem_mc.json',
    'camisa_fem_ml.json'
  ]);
  const TEMPLATE_LABELS_GOLA = Object.freeze({
    polo: 'Gola Polo',
    social: 'Gola Social',
    redonda: 'Gola Redonda',
    v: 'Gola V',
    v_polo: 'Gola V Polo'
  });
  let templateLoaderState = null;

  function normalizarComNomesValor(valor) {
    if (valor === true) return '1';
    if (valor === false || valor === null || valor === undefined) return COM_NOMES_VALOR_NENHUM;

    const numero = Number.parseInt(String(valor).trim(), 10);
    if (Number.isInteger(numero) && numero >= 1 && numero <= 3) return String(numero);

    const texto = String(valor).trim();
    if (!texto) return COM_NOMES_VALOR_NENHUM;

    if (/somente n[úu]meros/i.test(texto)) return '3';
    if (/com nomes e n[úu]meros/i.test(texto)) return '2';
    if (/com nomes/i.test(texto) || /^true$/i.test(texto)) return '1';

    return COM_NOMES_VALOR_NENHUM;
  }

  function detectarComNomesPorTexto(texto) {
    const valorTexto = String(texto || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!valorTexto) return COM_NOMES_VALOR_NENHUM;

    if (/(?:^|\/\s*)SOMENTE N[ÚU]MEROS\s*$/i.test(valorTexto)) return '3';
    if (/(?:^|\/\s*)COM NOMES E N[ÚU]MEROS\s*$/i.test(valorTexto)) return '2';
    if (/(?:^|\/\s*)COM NOMES\s*$/i.test(valorTexto)) return '1';

    return COM_NOMES_VALOR_NENHUM;
  }

  function converterBancoParaForm(fichaBanco) {
    const fichaForm = {};
    for (const [chaveBanco, valor] of Object.entries(fichaBanco)) {
      const chaveForm = camposBancoParaForm[chaveBanco] || chaveBanco;
      fichaForm[chaveForm] = valor;
    }
    return fichaForm;
  }

  function atualizarTituloEdicao(id, clienteNome) {
    const header = document.querySelector('header h1');
    if (!header) return;

    const nomeBase = (clienteNome || document.getElementById('cliente')?.value || '').trim();
    const nomeExibicao = nomeBase ? nomeBase.toUpperCase() : 'SEM_CLIENTE';

    header.innerHTML = '';

    const icon = document.createElement('i');
    icon.className = 'fas fa-edit';

    const texto = document.createTextNode(` Editando Ficha de ${nomeExibicao} `);

    const idSpan = document.createElement('span');
    idSpan.className = 'header-edit-id';
    idSpan.textContent = `[#${id}]`;

    header.appendChild(icon);
    header.appendChild(texto);
    header.appendChild(idSpan);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await initDatabaseIntegration();
  });

  async function initDatabaseIntegration() {
    try {
      await db.init();
      await initClienteAutocomplete();
      await verificarParametrosURL();
      if (!modoVisualizacao) {
        configurarBotoesAcao();
      }
    } catch (error) { }
  }

  async function initClienteAutocomplete() {
    const inputCliente = document.getElementById('cliente');
    if (!inputCliente) return;

    let datalist = document.getElementById('clientesList');
    if (!datalist) {
      datalist = document.createElement('datalist');
      datalist.id = 'clientesList';
      inputCliente.parentNode.appendChild(datalist);
      inputCliente.setAttribute('list', 'clientesList');
    }

    const clientes = await db.buscarClientes();

    datalist.innerHTML = '';
    clientes.forEach(cliente => {
      const option = document.createElement('option');
      option.value = typeof cliente === 'object' ? cliente.nome : cliente;
      datalist.appendChild(option);
    });

    inputCliente.addEventListener('input', async (e) => {
      const termo = e.target.value;
      if (termo.length < 2) return;

      const clientesFiltrados = await db.buscarClientes(termo);

      datalist.innerHTML = '';
      clientesFiltrados.forEach(cliente => {
        const option = document.createElement('option');
        option.value = typeof cliente === 'object' ? cliente.nome : cliente;
        datalist.appendChild(option);
      });
    });
  }

  function configurarBotoesAcao() {
    const containerPrincipal = document.getElementById('acoesContainer');
    const containerTopo = document.getElementById('acoesContainerTopo');
    const containers = [containerPrincipal, containerTopo].filter(Boolean);
    if (containers.length === 0) return;

    containers.forEach(container => {
      container.innerHTML = '';
    });

    const acaoImprimir = () => {
      if (typeof gerarVersaoImpressao === 'function') {
        gerarVersaoImpressao();
      } else {
        window.print();
      }
    };

    const botoes = [];

    if (modoVisualizacao) {
      botoes.push({ id: 'btnImprimir', classe: 'btn-primary', icone: 'fa-print', texto: 'Imprimir', onClick: acaoImprimir });
      botoes.push({ id: 'btnDuplicar', classe: 'btn-success', icone: 'fa-copy', texto: 'Duplicar Ficha', onClick: duplicarFicha });
      botoes.push({
        id: 'btnEditar',
        classe: 'btn-warning',
        icone: 'fa-edit',
        texto: 'Editar',
        onClick: () => {
          window.location.href = `index.html?editar=${fichaAtualId}`;
        }
      });
      botoes.push({
        id: 'btnDashboard',
        classe: 'btn-secondary',
        icone: 'fa-chart-line',
        texto: 'Painel de Controle',
        onClick: () => {
          window.location.href = 'dashboard.html';
        },
        alinharDireita: true
      });
    } else if (fichaAtualId) {
      botoes.push({
        id: 'btnSalvarDB',
        classe: 'btn-success',
        icone: 'fa-save',
        texto: `Atualizar Ficha #${fichaAtualId}`,
        onClick: salvarNoBanco
      });
      botoes.push({ id: 'btnImprimir', classe: 'btn-warning', icone: 'fa-print', texto: 'Imprimir', onClick: acaoImprimir });
      botoes.push({
        id: 'btnBaixar',
        classe: 'btn-secondary',
        icone: 'fa-download',
        texto: 'Baixar Ficha',
        onClick: () => {
          if (typeof salvarFicha === 'function') salvarFicha();
        }
      });
      botoes.push({
        id: 'btnCarregar',
        classe: 'btn-secondary',
        icone: 'fa-upload',
        texto: 'Carregar Ficha',
        onClick: () => {
          if (typeof carregarFichaDeArquivo === 'function') carregarFichaDeArquivo();
        }
      });
      botoes.push({
        id: 'btnDashboard',
        classe: 'btn-primary',
        icone: 'fa-chart-line',
        texto: 'Painel de Controle',
        onClick: () => {
          window.location.href = 'dashboard.html';
        },
        alinharDireita: true
      });
      botoes.push({
        id: 'btnNovaFicha',
        classe: 'btn-success',
        icone: 'fa-plus',
        texto: 'Nova Ficha',
        onClick: () => {
          window.location.href = 'index.html';
        }
      });
    } else {
      botoes.push({ id: 'btnSalvarDB', classe: 'btn-success', icone: 'fa-save', texto: 'Salvar Ficha', onClick: salvarNoBanco });
      botoes.push({ id: 'btnImprimir', classe: 'btn-warning', icone: 'fa-print', texto: 'Imprimir', onClick: acaoImprimir });
      botoes.push({
        id: 'btnBaixar',
        classe: 'btn-secondary',
        icone: 'fa-download',
        texto: 'Baixar Ficha',
        onClick: () => {
          if (typeof salvarFicha === 'function') salvarFicha();
        }
      });
      botoes.push({
        id: 'btnCarregar',
        classe: 'btn-secondary',
        icone: 'fa-upload',
        texto: 'Carregar Ficha',
        onClick: () => {
          if (typeof carregarFichaDeArquivo === 'function') carregarFichaDeArquivo();
        }
      });
      botoes.push({
        id: 'btnDashboard',
        classe: 'btn-primary',
        icone: 'fa-chart-line',
        texto: 'Painel de Controle',
        onClick: () => {
          window.location.href = 'dashboard.html';
        },
        alinharDireita: true
      });
    }

    containers.forEach(container => {
      const usarIds = container === containerPrincipal;
      botoes.forEach(botaoDef => {
        const btn = criarBotao(usarIds ? botaoDef.id : '', botaoDef.classe, botaoDef.icone, botaoDef.texto, botaoDef.onClick);
        if (botaoDef.alinharDireita) btn.style.marginLeft = 'auto';
        container.appendChild(btn);
      });

      if (container === containerTopo && !modoVisualizacao) {
        const btnTemplate = criarBotaoCarregarTemplate();
        container.appendChild(btnTemplate);
      }
    });
  }

  function criarBotao(id, classe, icone, texto, onClick) {
    const btn = document.createElement('button');
    if (id) btn.id = id;
    btn.type = 'button';
    btn.className = `btn ${classe}`;
    btn.innerHTML = `<i class="fas ${icone}"></i><span>${texto}</span>`;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function obterLabelGola(valorGola) {
    const valor = String(valorGola || '').trim().toLowerCase();
    if (!valor) return 'Gola não definida';
    return TEMPLATE_LABELS_GOLA[valor] || `Gola ${valor}`;
  }

  function obterTituloTemplate(templateData, fileName) {
    const produto =
      templateData?.produtos?.[0]?.produto ||
      templateData?.produtos?.[0]?.descricao ||
      fileName.replace('.json', '').replace(/_/g, ' ');
    return `${produto} | ${obterLabelGola(templateData?.gola)}`;
  }

  function gerarImagemTemplateHtml(fileName) {
    const imageName = fileName.replace('.json', '.svg');
    const imagePath = `img/template/${imageName}`;
    return `<img src="${imagePath}" class="template-card-img" alt="Template" onerror="this.onerror=null; this.outerHTML='<i class=\\\'fas fa-tshirt template-fallback-icon\\\'></i>';">`;
  }

  function normalizarTemplateParaFormulario(templateData) {
    const dados = JSON.parse(JSON.stringify(templateData || {}));
    if (dados.imagens && !dados.imagensData) {
      dados.imagensData = JSON.stringify(dados.imagens);
    }
    if (!dados.imagensData) {
      dados.imagensData = '[]';
    }
    return dados;
  }

  async function carregarTemplatesDisponiveis() {
    const templates = [];

    for (const fileName of TEMPLATE_FILES) {
      const response = await fetch(`data/templates/${fileName}`, { cache: 'no-cache' });
      if (!response.ok) continue;

      const data = await response.json();
      templates.push({
        fileName,
        data,
        title: obterTituloTemplate(data, fileName),
        golaLabel: obterLabelGola(data?.gola),
        svg: gerarImagemTemplateHtml(fileName)
      });
    }

    return templates;
  }

  function fecharTooltipTemplate() {
    if (!templateLoaderState) return;
    templateLoaderState.tooltip.classList.remove('is-open');
    templateLoaderState.button.setAttribute('aria-expanded', 'false');
  }

  function abrirTooltipTemplate() {
    if (!templateLoaderState) return;
    templateLoaderState.tooltip.classList.add('is-open');
    templateLoaderState.button.setAttribute('aria-expanded', 'true');
  }

  function criarBotaoCarregarTemplate() {
    const wrapper = document.createElement('div');
    wrapper.className = 'template-loader';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-secondary';
    button.id = 'btnCarregarTemplate';
    button.innerHTML = '<i class="fas fa-layer-group"></i><span>Carregar template</span>';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-haspopup', 'dialog');

    const tooltip = document.createElement('div');
    tooltip.className = 'template-tooltip';
    tooltip.innerHTML = `
      <div class="template-tooltip-header">
        <strong>Templates prontos</strong>
        <span>Escolha para preencher o formulário</span>
      </div>
      <div class="template-tooltip-content"></div>
    `;

    wrapper.appendChild(button);
    wrapper.appendChild(tooltip);

    templateLoaderState = {
      wrapper,
      button,
      tooltip,
      carregado: false
    };

    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      const aberto = tooltip.classList.contains('is-open');
      if (aberto) {
        fecharTooltipTemplate();
        return;
      }

      abrirTooltipTemplate();

      if (templateLoaderState.carregado) return;

      const content = tooltip.querySelector('.template-tooltip-content');
      if (!content) return;

      content.innerHTML = `<div class="template-loader-status">
          <i class="fas fa-spinner fa-spin"></i>
          Carregando templates...
        </div>`;

      try {
        const templates = await carregarTemplatesDisponiveis();
        content.innerHTML = '';

        if (!templates.length) {
          content.innerHTML = '<div class="template-loader-status">Nenhum template encontrado.</div>';
          templateLoaderState.carregado = true;
          return;
        }

        templates.forEach(template => {
          const card = document.createElement('button');
          card.type = 'button';
          card.className = 'template-card';
          card.innerHTML = `
            <div class="template-card-preview">${template.svg}</div>
            <div class="template-card-title">${template.title}</div>
          `;

          card.addEventListener('click', () => {
            const dados = normalizarTemplateParaFormulario(template.data);
            preencherFormulario(dados);
            if (typeof window.atualizarDataInicioDeTemplate === 'function') {
              window.atualizarDataInicioDeTemplate();
            }
            fecharTooltipTemplate();
            mostrarToast(`Template "${template.title}" carregado.`, 'success');
          });

          content.appendChild(card);
        });

        templateLoaderState.carregado = true;
      } catch (error) {
        content.innerHTML = '<div class="template-loader-status">Erro ao carregar templates.</div>';
      }
    });

    if (!window.__templateTooltipClickHandler) {
      window.__templateTooltipClickHandler = true;

      document.addEventListener('click', (event) => {
        if (!templateLoaderState) return;
        if (templateLoaderState.wrapper.contains(event.target)) return;
        fecharTooltipTemplate();
      });

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') fecharTooltipTemplate();
      });
    }

    return wrapper;
  }

  function textoSemHtml(valor) {
    return String(valor || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function obterObservacoesPreferencial(dados) {
    if (!dados || typeof dados !== 'object') return '';

    const observacoesHtml = String(dados.observacoesHtml || dados.observacoes_html || '').trim();
    const observacoes = String(dados.observacoes || '').trim();
    const observacoesPlain = String(dados.observacoesPlainText || dados.observacoes_plain_text || '').trim();

    return observacoesHtml || observacoes || observacoesPlain;
  }

  function normalizarObservacoesDuplicacao(payload) {
    if (!payload || typeof payload !== 'object') return payload;

    const observacoesOrigem = obterObservacoesPreferencial(payload);
    if (!observacoesOrigem) return payload;

    if (!String(payload.observacoes || '').trim()) {
      payload.observacoes = observacoesOrigem;
    }

    if (!String(payload.observacoesHtml || '').trim()) {
      payload.observacoesHtml = String(payload.observacoes || observacoesOrigem);
    }

    if (!String(payload.observacoesPlainText || '').trim()) {
      payload.observacoesPlainText = textoSemHtml(payload.observacoesHtml || payload.observacoes || observacoesOrigem);
    }

    return payload;
  }

  function prepararDadosParaDuplicacao(dados) {
    if (!dados || typeof dados !== 'object') return null;

    const payload = { ...dados };
    delete payload.id;
    delete payload.status;
    delete payload.dataCriacao;
    delete payload.dataAtualizacao;
    delete payload.data_criacao;
    delete payload.data_atualizacao;

    return normalizarObservacoesDuplicacao(payload);
  }

  function salvarRascunhoDuplicacao(payload) {
    if (!payload || typeof payload !== 'object') return false;

    try {
      sessionStorage.setItem(DUPLICACAO_DRAFT_STORAGE_KEY, JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  function carregarRascunhoDuplicacao() {
    try {
      const raw = sessionStorage.getItem(DUPLICACAO_DRAFT_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return normalizarObservacoesDuplicacao(parsed);
    } catch {
      return null;
    }
  }

  function limparRascunhoDuplicacao() {
    try {
      sessionStorage.removeItem(DUPLICACAO_DRAFT_STORAGE_KEY);
    } catch { }
  }

  function navegarParaDuplicacao(payload) {
    const dados = prepararDadosParaDuplicacao(payload);
    if (!dados) return false;

    const salvo = salvarRascunhoDuplicacao(dados);
    if (!salvo) return false;

    window.location.href = 'index.html?duplicar=1';
    return true;
  }

  async function duplicarFicha() {
    try {
      let dados = (modoVisualizacao && fichaVisualizacaoAtual)
        ? { ...fichaVisualizacaoAtual }
        : coletarDadosFormulario();

      const temObservacoes = !!obterObservacoesPreferencial(dados);
      if (modoVisualizacao && !temObservacoes) {
        const fichaId = Number.parseInt(String(fichaAtualId || ''), 10);
        if (Number.isInteger(fichaId) && fichaId > 0) {
          const fichaBanco = await db.buscarFicha(fichaId);
          const dadosBanco = fichaBanco ? converterBancoParaForm(fichaBanco) : null;

          if (!dados || typeof dados !== 'object') {
            dados = dadosBanco || dados;
          } else if (dadosBanco && obterObservacoesPreferencial(dadosBanco)) {
            if (!String(dados.observacoes || '').trim()) {
              dados.observacoes = dadosBanco.observacoes || dadosBanco.observacoesHtml || '';
            }
            if (!String(dados.observacoesHtml || '').trim()) {
              dados.observacoesHtml = dadosBanco.observacoesHtml || dadosBanco.observacoes || '';
            }
            if (!String(dados.observacoesPlainText || '').trim() && String(dadosBanco.observacoesPlainText || '').trim()) {
              dados.observacoesPlainText = dadosBanco.observacoesPlainText;
            }
          }
        }
      }

      const iniciouDuplicacao = navegarParaDuplicacao(dados);
      if (!iniciouDuplicacao) {
        throw new Error('Falha ao preparar duplicação');
      }

    } catch (error) {
      mostrarToast('Erro ao duplicar ficha', 'error');
    }
  }

  async function salvarNoBanco() {
    try {
      const dados = coletarDadosFormulario();

      if (!validarCamposObrigatorios(dados)) {
        return;
      }

      if (fichaAtualId) {
        dados.id = fichaAtualId;
      }

      const id = await db.salvarFicha(dados);

      if (!fichaAtualId) {
        fichaAtualId = id;

        const novaUrl = new URL(window.location.href);
        novaUrl.searchParams.set('editar', id);
        window.history.replaceState({}, '', novaUrl);

        atualizarTituloEdicao(fichaAtualId, dados.cliente);

        configurarBotoesAcao();
      }

      const acao = dados.id && dados.id === fichaAtualId ? 'atualizada' : 'salva';
      mostrarToast(`Ficha ${acao} com sucesso!`, 'success');

      await initClienteAutocomplete();

    } catch (error) {
      mostrarToast('Erro ao salvar ficha no banco de dados', 'error');
    }
  }

  function validarCamposObrigatorios(dados) {
    for (const campo of CAMPOS_OBRIGATORIOS) {
      const valor = String(dados?.[campo.key] || '').trim();
      if (valor && !(campo.key === 'arte' && valor === '-')) continue;

      mostrarToast(`Por favor, informe ${campo.label}`, 'error');
      const input = document.getElementById(campo.id);
      if (input) input.focus();
      return false;
    }

    return true;
  }

  function coletarObservacoesFormulario() {
    const observacoesTextarea = document.getElementById('observacoes');
    const valorTextarea = observacoesTextarea?.value || '';

    if (!window.richTextEditor || typeof window.richTextEditor.getContent !== 'function') {
      return valorTextarea;
    }

    const valorEditor = String(window.richTextEditor.getContent() || '');
    if (valorEditor.trim()) return valorEditor;
    return valorTextarea;
  }

  function coletarDadosFormulario() {
    let imagensData = [];
    if (typeof window.getImagens === 'function') {
      imagensData = window.getImagens();
    }

    const gola = document.getElementById('gola')?.value || '';
    const isPolo = gola === 'polo' || gola === 'v_polo';
    const isSocial = gola === 'social';
    const temGola = gola !== '';
    const reforcoGola = (temGola && !isSocial) ? (document.getElementById('reforcoGola')?.value || 'nao') : 'nao';
    const aberturaLateral = isPolo ? (document.getElementById('aberturaLateral')?.value || 'nao') : 'nao';
    const observacoes = coletarObservacoesFormulario();

    const dados = {
      cliente: document.getElementById('cliente')?.value || '',
      vendedor: document.getElementById('vendedor')?.value || '',
      dataInicio: document.getElementById('dataInicio')?.value || '',
      numeroVenda: document.getElementById('numeroVenda')?.value || '',
      dataEntrega: document.getElementById('dataEntrega')?.value || '',
      evento: document.getElementById('evento')?.value || 'nao',
      produtos: coletarProdutos(),
      material: document.getElementById('material')?.value || '',
      composicao: document.getElementById('composicao')?.value || '',
      corMaterial: document.getElementById('corMaterial')?.value || '',
      manga: document.getElementById('manga')?.value || '',
      acabamentoManga: document.getElementById('acabamentoManga')?.value || '',
      larguraManga: document.getElementById('larguraManga')?.value || '',
      corAcabamentoManga: document.getElementById('corAcabamentoManga')?.value || '',
      gola,
      corGola: (temGola && !isSocial) ? (document.getElementById('corGola')?.value || '') : '',
      acabamentoGola: (isPolo || isSocial) ? '' : (document.getElementById('acabamentoGola')?.value || ''),
      larguraGola: (isPolo || isSocial) ? '' : (document.getElementById('larguraGola')?.value || ''),
      corPeitilhoInterno: isPolo ? (document.getElementById('corPeitilhoInterno')?.value || '') : '',
      corPeitilhoExterno: isPolo ? (document.getElementById('corPeitilhoExterno')?.value || '') : '',
      corPeDeGolaInterno: isSocial ? (document.getElementById('corPeDeGolaInterno')?.value || '') : '',
      corPeDeGolaExterno: isSocial ? (document.getElementById('corPeDeGolaExterno')?.value || '') : '',
      corBotao: (isPolo || isSocial) ? (document.getElementById('corBotao')?.value || '') : '',
      aberturaLateral,
      corAberturaLateral: (isPolo && aberturaLateral === 'sim') ? (document.getElementById('corAberturaLateral')?.value || '') : '',
      reforcoGola,
      corReforco: reforcoGola === 'sim' ? (document.getElementById('corReforco')?.value || '') : '',
      bolso: document.getElementById('bolso')?.value || '',
      filete: document.getElementById('filete')?.value || '',
      fileteLocal: document.getElementById('fileteLocal')?.value || '',
      fileteCor: document.getElementById('fileteCor')?.value || '',
      faixa: document.getElementById('faixa')?.value || '',
      faixaLocal: document.getElementById('faixaLocal')?.value || '',
      faixaCor: document.getElementById('faixaCor')?.value || '',
      arte: document.getElementById('arte')?.value || '',
      comNomes: Number(normalizarComNomesValor(document.getElementById('comNomes')?.value || '0')),
      observacoes,
      imagensData: JSON.stringify(imagensData),
      imagemData: imagensData.length > 0 ? imagensData[0].src : ''
    };

    return dados;
  }

  function coletarProdutos() {
    const produtos = [];
    const rows = document.querySelectorAll('#produtosTable tr');

    rows.forEach(row => {
      const tamanho = row.querySelector('.tamanho')?.value || '';
      const quantidade = row.querySelector('.quantidade')?.value || '';
      const produto = row.querySelector('.produto')?.value || row.querySelector('.descricao')?.value || '';
      const detalhesProduto = row.querySelector('.detalhes-produto')?.value || '';

      if (tamanho || quantidade || produto || detalhesProduto) {
        produtos.push({ tamanho, quantidade, produto, detalhesProduto, descricao: produto });
      }
    });

    return produtos;
  }

  async function verificarParametrosURL() {
    const params = new URLSearchParams(window.location.search);

    const editarId = params.get('editar');
    const visualizarId = params.get('visualizar');
    const duplicar = params.get('duplicar');

    if (editarId) {
      modoVisualizacao = false;
      fichaVisualizacaoAtual = null;
      if (typeof window.setFichaVisualizacaoData === 'function') {
        window.setFichaVisualizacaoData(null);
      }
      await carregarFichaParaEdicao(parseInt(editarId));
    } else if (visualizarId) {
      modoVisualizacao = true;
      await carregarFichaParaVisualizacao(parseInt(visualizarId));
    } else if (duplicar) {
      modoVisualizacao = false;
      fichaVisualizacaoAtual = null;
      if (typeof window.setFichaVisualizacaoData === 'function') {
        window.setFichaVisualizacaoData(null);
      }

      const rascunho = carregarRascunhoDuplicacao();
      limparRascunhoDuplicacao();

      if (rascunho) {
        setTimeout(() => {
          preencherFormulario(rascunho);
          configurarBotoesAcao();
          mostrarToast('Cópia carregada. Clique em salvar para persistir a nova ficha.', 'success');
        }, 100);
      } else {
        mostrarToast('Não foi possível carregar os dados para duplicação.', 'error');
      }

      const novaUrl = new URL(window.location.href);
      novaUrl.searchParams.delete('duplicar');
      window.history.replaceState({}, '', novaUrl.toString());
    } else {
      modoVisualizacao = false;
      fichaVisualizacaoAtual = null;
      if (typeof window.setFichaVisualizacaoData === 'function') {
        window.setFichaVisualizacaoData(null);
      }
    }
  }

  async function carregarFichaParaEdicao(id) {
    try {
      const fichaBanco = await db.buscarFicha(id);

      if (!fichaBanco) {
        mostrarToast('Ficha não encontrada', 'error');
        window.location.href = 'dashboard.html';
        return;
      }

      fichaAtualId = id;

      const ficha = converterBancoParaForm(fichaBanco);

      setTimeout(() => {
        preencherFormulario(ficha);
        configurarBotoesAcao();
      }, 100);

      atualizarTituloEdicao(id, ficha.cliente);

    } catch (error) {
      mostrarToast('Erro ao carregar ficha para edição', 'error');
    }
  }

  async function carregarFichaParaVisualizacao(id) {
    try {
      const fichaBanco = await db.buscarFicha(id);

      if (!fichaBanco) {
        mostrarToast('Ficha não encontrada', 'error');
        window.location.href = 'dashboard.html';
        return;
      }

      fichaAtualId = id;

      const ficha = converterBancoParaForm(fichaBanco);

      fichaVisualizacaoAtual = { ...ficha };

      if (typeof window.setFichaVisualizacaoData === 'function') {
        window.setFichaVisualizacaoData(fichaVisualizacaoAtual);
      }

      if (typeof window.gerarVersaoImpressao === 'function') {
        setTimeout(() => {
          window.gerarVersaoImpressao(true, fichaVisualizacaoAtual);
        }, 120);
      }

    } catch (error) {
      mostrarToast('Erro ao carregar ficha para visualização', 'error');
    }
  }

  // Parser de imagens

  function parsearImagensData(imagensData) {
    if (!imagensData) return [];

    if (Array.isArray(imagensData)) return imagensData;

    if (typeof imagensData === 'string') {
      if (imagensData.trim() === '' || imagensData.trim() === '[]') return [];

      try {
        const parsed = JSON.parse(imagensData);
        if (Array.isArray(parsed)) return parsed;
        return [];
      } catch (e) {
        return [];
      }
    }

    return [];
  }

  function preencherFormulario(ficha) {
    window.__preenchendoFicha = true;
    const observacoesSalvas = ficha.observacoesHtml || ficha.observacoes || '';

    const camposTexto = [
      'cliente', 'vendedor', 'dataInicio', 'numeroVenda',
      'dataEntrega', 'evento', 'material', 'composicao',
      'corMaterial', 'manga', 'acabamentoManga', 'larguraManga', 'corAcabamentoManga',
      'gola', 'corGola', 'acabamentoGola', 'larguraGola',
      'corPeitilhoInterno', 'corPeitilhoExterno', 'corBotao',
      'corPeDeGolaInterno', 'corPeDeGolaExterno',
      'aberturaLateral', 'corAberturaLateral',
      'reforcoGola', 'corReforco',
      'bolso', 'filete', 'fileteLocal', 'fileteCor',
      'faixa', 'faixaLocal', 'faixaCor', 'arte'
    ];

    camposTexto.forEach(campo => {
      const elemento = document.getElementById(campo);
      const valor = ficha[campo];

      if (elemento && valor !== undefined && valor !== null) {
        elemento.value = valor;
        elemento.dispatchEvent(new Event('change', { bubbles: true }));
        elemento.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    // Produtos
    const produtos = ficha.produtos;
    if (produtos) {
      const produtosArray = typeof produtos === 'string' ? JSON.parse(produtos) : produtos;

      if (Array.isArray(produtosArray) && produtosArray.length > 0) {
        const tbody = document.getElementById('produtosTable');
        if (tbody) {
          tbody.innerHTML = '';

          produtosArray.forEach(produto => {
            if (typeof window.adicionarProduto === 'function') {
              window.adicionarProduto();

              const rows = tbody.querySelectorAll('tr');
              const ultimaLinha = rows[rows.length - 1];

              if (ultimaLinha) {
                const selectTamanho = ultimaLinha.querySelector('.tamanho');
                const inputQuantidade = ultimaLinha.querySelector('.quantidade');
                const inputProduto = ultimaLinha.querySelector('.produto') || ultimaLinha.querySelector('.descricao');
                const inputDetalhesProduto = ultimaLinha.querySelector('.detalhes-produto');
                const produtoPrincipal = produto.produto || produto.descricao || '';
                const detalhesProduto = produto.detalhesProduto || produto.detalhes || '';

                if (selectTamanho) selectTamanho.value = produto.tamanho || '';
                if (inputQuantidade) inputQuantidade.value = produto.quantidade || '';
                if (inputProduto) inputProduto.value = produtoPrincipal;
                if (inputDetalhesProduto) inputDetalhesProduto.value = detalhesProduto;
              }
            }
          });

          if (typeof window.atualizarTotalItens === 'function') {
            window.atualizarTotalItens();
          }
        }
      }
    }

    // Imagens
    if (typeof window.setImagens === 'function') {
      let imagensCarregadas = [];

      const imagensDataRaw = ficha.imagensData || ficha.imagens_data;
      imagensCarregadas = parsearImagensData(imagensDataRaw);

      if (imagensCarregadas.length === 0) {
        const imagemData = ficha.imagemData || ficha.imagem_data;

        if (imagemData && typeof imagemData === 'string' && imagemData.length > 0) {
          if (imagemData.startsWith('data:image') || imagemData.startsWith('http')) {
            imagensCarregadas = [{ src: imagemData, descricao: '' }];
          }
        }
      }

      window.setImagens(imagensCarregadas);
    }

    // Preencher observacoes cedo para evitar corrida com o preview/impressao.
    const observacoesInput = document.getElementById('observacoes');
    if (observacoesInput) {
      observacoesInput.value = observacoesSalvas;
    }

    if (window.richTextEditor) {
      window.richTextEditor.setContent(observacoesSalvas);
    }

    if (observacoesSalvas) {
      setTimeout(() => {
        const observacoesAtualInput = (document.getElementById('observacoes')?.value || '').trim();
        const observacoesAtualEditor = (window.richTextEditor && typeof window.richTextEditor.getContent === 'function')
          ? String(window.richTextEditor.getContent() || '').trim()
          : '';

        if (!observacoesAtualInput && !observacoesAtualEditor) {
          const input = document.getElementById('observacoes');
          if (input) input.value = observacoesSalvas;
          if (window.richTextEditor) window.richTextEditor.setContent(observacoesSalvas);
        }
      }, 380);
    }

    const selectComNomes = document.getElementById('comNomes');
    if (selectComNomes) {
      const valorSalvo = normalizarComNomesValor(ficha.comNomes ?? ficha.com_nomes);
      const valorPorTexto = detectarComNomesPorTexto(observacoesSalvas);
      selectComNomes.value = valorSalvo !== COM_NOMES_VALOR_NENHUM ? valorSalvo : valorPorTexto;
    }

    // Mostrar campos condicionais
    setTimeout(() => {
      const acabamentoMangaVal = ficha.acabamentoManga;
      if (acabamentoMangaVal === 'vies' || acabamentoMangaVal === 'punho') {
        const larguraMangaContainer = document.getElementById('larguraMangaContainer');
        const corAcabamentoMangaContainer = document.getElementById('corAcabamentoMangaContainer');
        if (larguraMangaContainer) larguraMangaContainer.style.display = 'block';
        if (corAcabamentoMangaContainer) corAcabamentoMangaContainer.style.display = 'block';
      }

      const golaVal = ficha.gola;
      const isPolo = golaVal === 'polo' || golaVal === 'v_polo';
      const isSocial = golaVal === 'social';
      const temGola = golaVal && golaVal !== '';

      if (temGola && !isSocial) {
        const corGolaContainer = document.getElementById('corGolaContainer');
        if (corGolaContainer) corGolaContainer.style.display = 'block';
      }

      if (temGola && !isPolo && !isSocial) {
        const acabamentoGolaContainer = document.getElementById('acabamentoGolaContainer');
        if (acabamentoGolaContainer) acabamentoGolaContainer.style.display = 'block';

        if (ficha.acabamentoGola) {
          const larguraGolaContainer = document.getElementById('larguraGolaContainer');
          if (larguraGolaContainer) larguraGolaContainer.style.display = 'block';
        }
      }

      if (temGola && !isSocial) {
        const reforcoGolaContainer = document.getElementById('reforcoGolaContainer');
        if (reforcoGolaContainer) reforcoGolaContainer.style.display = 'block';

        if (ficha.reforcoGola === 'sim') {
          const corReforcoContainer = document.getElementById('corReforcoContainer');
          if (corReforcoContainer) corReforcoContainer.style.display = 'block';
        }
      }

      if (isPolo) {
        const corPeitilhoInternoContainer = document.getElementById('corPeitilhoInternoContainer');
        const corPeitilhoExternoContainer = document.getElementById('corPeitilhoExternoContainer');
        const corBotaoContainer = document.getElementById('corBotaoContainer');
        const aberturaLateralContainer = document.getElementById('aberturaLateralContainer');

        if (corPeitilhoInternoContainer) corPeitilhoInternoContainer.style.display = 'block';
        if (corPeitilhoExternoContainer) corPeitilhoExternoContainer.style.display = 'block';
        if (corBotaoContainer) corBotaoContainer.style.display = 'block';
        if (aberturaLateralContainer) aberturaLateralContainer.style.display = 'block';

        if (ficha.aberturaLateral === 'sim') {
          const corAberturaLateralContainer = document.getElementById('corAberturaLateralContainer');
          if (corAberturaLateralContainer) corAberturaLateralContainer.style.display = 'block';
        }
      }

      if (isSocial) {
        const corPeDeGolaInternoContainer = document.getElementById('corPeDeGolaInternoContainer');
        const corPeDeGolaExternoContainer = document.getElementById('corPeDeGolaExternoContainer');
        const corBotaoContainer = document.getElementById('corBotaoContainer');
        if (corPeDeGolaInternoContainer) corPeDeGolaInternoContainer.style.display = 'block';
        if (corPeDeGolaExternoContainer) corPeDeGolaExternoContainer.style.display = 'block';
        if (corBotaoContainer) corBotaoContainer.style.display = 'block';
      }

      if (ficha.filete === 'sim') {
        const fileteLocalContainer = document.getElementById('fileteLocalContainer');
        const fileteCorContainer = document.getElementById('fileteCorContainer');
        if (fileteLocalContainer) fileteLocalContainer.style.display = 'block';
        if (fileteCorContainer) fileteCorContainer.style.display = 'block';
      }

      if (ficha.faixa === 'sim') {
        const faixaLocalContainer = document.getElementById('faixaLocalContainer');
        const faixaCorContainer = document.getElementById('faixaCorContainer');
        if (faixaLocalContainer) faixaLocalContainer.style.display = 'block';
        if (faixaCorContainer) faixaCorContainer.style.display = 'block';
      }

      window.__preenchendoFicha = false;
    }, 150);
  }

  // Toast

  function mostrarToast(mensagem, tipo = 'success') {
    const existente = document.querySelector('.toast-custom');
    if (existente) existente.remove();

    const icons = {
      success: 'fa-check-circle',
      error: 'fa-exclamation-circle',
      warning: 'fa-exclamation-triangle'
    };

    const cores = {
      success: 'var(--toast-bg-success)',
      error: 'var(--toast-bg-error)',
      warning: 'var(--toast-bg-warning)'
    };

    const toast = document.createElement('div');
    toast.className = 'toast-custom';
    toast.innerHTML = `<i class="fas ${icons[tipo]}"></i><span>${mensagem}</span>`;
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      padding: 16px 24px;
      border-radius: var(--radius-xl);
      color: var(--toast-text-color);
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 12px;
      z-index: 10001;
      box-shadow: var(--shadow-lg);
      background: ${cores[tipo]};
      animation: toastIn 0.4s ease;
    `;

    if (!document.getElementById('toastStyles')) {
      const style = document.createElement('style');
      style.id = 'toastStyles';
      style.textContent = `
        @keyframes toastIn {
          from { transform: translateX(-50%) translateY(100%); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
        @keyframes toastOut {
          from { transform: translateX(-50%) translateY(0); opacity: 1; }
          to { transform: translateX(-50%) translateY(100%); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'toastOut 0.4s ease forwards';
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  }

  window.mostrarToast = mostrarToast;

  window.dbIntegration = {
    salvarNoBanco,
    coletarDadosFormulario,
    converterBancoParaForm,
    getFichaAtualId: () => fichaAtualId,
    isModoVisualizacao: () => modoVisualizacao
  };

})();

