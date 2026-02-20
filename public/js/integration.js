/**
 * Integração do formulário com o banco de dados
 */

(function () {
  'use strict';

  let fichaAtualId = null;
  let modoVisualizacao = false;
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
    'observacoes': 'observacoes',
    'imagens_data': 'imagensData',
    'imagem_data': 'imagemData',
    'produtos': 'produtos'
  };

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
      configurarBotoesAcao();
    } catch (error) {}
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

  async function duplicarFicha() {
    try {
      habilitarCampos();

      const dados = coletarDadosFormulario();
      delete dados.id;

      if (dados.numeroVenda) {
        dados.numeroVenda = dados.numeroVenda + '-COPIA';
      }

      const novoId = await db.salvarFicha(dados);

      mostrarToast('Ficha duplicada com sucesso!', 'success');

      setTimeout(() => {
        window.location.href = `index.html?editar=${novoId}`;
      }, 1000);

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
      observacoes: document.getElementById('observacoes')?.value || '',
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

    if (editarId) {
      modoVisualizacao = false;
      await carregarFichaParaEdicao(parseInt(editarId));
    } else if (visualizarId) {
      modoVisualizacao = true;
      await carregarFichaParaVisualizacao(parseInt(visualizarId));
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

      setTimeout(() => {
        preencherFormulario(ficha);
        desabilitarCampos();
        configurarBotoesAcao();

        if (typeof window.gerarVersaoImpressao === 'function') {
          setTimeout(() => window.gerarVersaoImpressao(true), 120);
        }
      }, 100);

      const header = document.querySelector('header h1');
      if (header) {
        header.innerHTML = `<i class="fas fa-eye"></i> Visualizando Ficha #${id}`;
      }

      document.body.classList.add('modo-visualizacao');

    } catch (error) {
      mostrarToast('Erro ao carregar ficha para visualização', 'error');
    }
  }

  function desabilitarCampos() {
    const campos = document.querySelectorAll('input, select, textarea');
    campos.forEach(campo => {
      campo.disabled = true;
      campo.style.opacity = '0.8';
      campo.style.cursor = 'not-allowed';
    });

    const botoesOcultar = document.querySelectorAll('#adicionarProduto, #ordenarProdutos, .remover-produto, .duplicar-produto, #imageUpload, .btn-add-produto, .image-delete-btn, .image-drag-handle, .drag-handle');
    botoesOcultar.forEach(btn => {
      btn.style.display = 'none';
    });

    const richEditor = document.getElementById('richTextEditor');
    if (richEditor) {
      richEditor.setAttribute('contenteditable', 'false');
      richEditor.style.pointerEvents = 'none';
      richEditor.style.opacity = '0.9';
      richEditor.style.backgroundColor = '#f8f9fa';
      richEditor.style.cursor = 'not-allowed';
    }

    const richToolbar = document.querySelector('.rich-text-toolbar');
    if (richToolbar) {
      richToolbar.style.pointerEvents = 'none';
      richToolbar.style.opacity = '0.55';
    }

    const style = document.createElement('style');
    style.id = 'estiloVisualizacao';
    style.textContent = `
      .modo-visualizacao .card {
        position: relative;
      }
      .modo-visualizacao input:disabled,
      .modo-visualizacao select:disabled,
      .modo-visualizacao textarea:disabled {
        background-color: #f8f9fa !important;
        border-color: #e9ecef !important;
      }
      .modo-visualizacao .image-card {
        pointer-events: none;
      }
      .modo-visualizacao .image-delete-btn,
      .modo-visualizacao .image-drag-handle {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  function habilitarCampos() {
    const campos = document.querySelectorAll('input, select, textarea');
    campos.forEach(campo => {
      campo.disabled = false;
      campo.style.opacity = '1';
      campo.style.cursor = '';
    });

    const botoesOcultar = document.querySelectorAll('#adicionarProduto, #ordenarProdutos, .remover-produto, .duplicar-produto, #imageUpload, .btn-add-produto');
    botoesOcultar.forEach(btn => {
      btn.style.display = '';
    });

    const richEditor = document.getElementById('richTextEditor');
    if (richEditor) {
      richEditor.setAttribute('contenteditable', 'true');
      richEditor.style.pointerEvents = '';
      richEditor.style.opacity = '';
      richEditor.style.backgroundColor = '';
      richEditor.style.cursor = '';
    }

    const richToolbar = document.querySelector('.rich-text-toolbar');
    if (richToolbar) {
      richToolbar.style.pointerEvents = '';
      richToolbar.style.opacity = '';
    }

    const estilo = document.getElementById('estiloVisualizacao');
    if (estilo) estilo.remove();

    document.body.classList.remove('modo-visualizacao');
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
      success: 'linear-gradient(135deg, #10b981, #059669)',
      error: 'linear-gradient(135deg, #ef4444, #dc2626)',
      warning: 'linear-gradient(135deg, #f59e0b, #d97706)'
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
      border-radius: 12px;
      color: white;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 12px;
      z-index: 10001;
      box-shadow: 0 8px 24px rgba(0,0,0,0.2);
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

