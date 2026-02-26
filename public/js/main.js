(function () {
  'use strict';

  const CATALOG_URL = 'data/catalogo.json';
  const MAX_IMAGES = 4;

  let catalog = {
    tamanhos: [],
    produtos: [],
    mangas: [],
    cores: [],
    coresBotao: [],
    fileteLocal: [],
    faixaLocal: [],
    faixaCor: [],
    larguras: [],
    materiais: []
  };

  let imagens = [];
  let alertaLimiteProdutosFechado = false;
  let fichaVisualizacaoDireta = null;

  function valorEhSim(valor) {
    if (valor === true || valor === 1) return true;
    const texto = String(valor || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
    return texto === 'sim' || texto === 'true' || texto === '1';
  }

  function obterValorFicha(ficha, chave, fallback = '') {
    if (!ficha || typeof ficha !== 'object') return fallback;

    if (ficha[chave] !== undefined && ficha[chave] !== null) return ficha[chave];

    const snakeCase = chave.replace(/[A-Z]/g, letra => `_${letra.toLowerCase()}`);
    if (ficha[snakeCase] !== undefined && ficha[snakeCase] !== null) return ficha[snakeCase];

    return fallback;
  }

  function parseArrayJson(valor) {
    if (Array.isArray(valor)) return valor;
    if (typeof valor !== 'string') return [];
    try {
      const parsed = JSON.parse(valor);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function normalizarProdutosFicha(ficha) {
    const produtosRaw = obterValorFicha(ficha, 'produtos', []);
    const lista = Array.isArray(produtosRaw) ? produtosRaw : parseArrayJson(produtosRaw);

    return lista
      .map(item => {
        const produto = String(item?.produto || item?.descricao || '').trim();
        return {
          tamanho: String(item?.tamanho || '').trim(),
          quantidade: String(item?.quantidade || '').trim(),
          produto,
          detalhesProduto: String(item?.detalhesProduto || item?.detalhes || '').trim(),
          descricao: produto
        };
      })
      .filter(item => item.tamanho || item.quantidade || item.produto || item.detalhesProduto);
  }

  function normalizarImagensFicha(ficha) {
    const imagensDiretas = obterValorFicha(ficha, 'imagens', []);
    const imagensDataRaw = obterValorFicha(ficha, 'imagensData', []);
    const imagemDataRaw = obterValorFicha(ficha, 'imagemData', '');

    const candidatas = [];

    if (Array.isArray(imagensDiretas) && imagensDiretas.length > 0) {
      candidatas.push(...imagensDiretas);
    } else {
      candidatas.push(...parseArrayJson(imagensDataRaw));
    }

    if (candidatas.length === 0 && typeof imagemDataRaw === 'string' && imagemDataRaw.trim()) {
      candidatas.push({ src: imagemDataRaw.trim(), descricao: '' });
    }

    return candidatas
      .map(item => {
        if (typeof item === 'string') {
          return { src: item, descricao: '' };
        }

        if (!item || typeof item !== 'object') return null;
        const src = String(item.src || item.url || '').trim();
        if (!src) return null;

        return {
          src,
          descricao: String(item.descricao || item.description || '').trim()
        };
      })
      .filter(Boolean);
  }

  function normalizarFichaVisualizacao(ficha) {
    if (!ficha || typeof ficha !== 'object') return null;

    const imagens = normalizarImagensFicha(ficha);
    const observacoesHtml = String(obterValorFicha(ficha, 'observacoesHtml', '') || '');
    const observacoesPlainText = String(obterValorFicha(ficha, 'observacoesPlainText', '') || '');
    const observacoes = String(obterValorFicha(ficha, 'observacoes', '') || observacoesHtml || observacoesPlainText || '');

    return {
      id: obterValorFicha(ficha, 'id', ''),
      cliente: String(obterValorFicha(ficha, 'cliente', '') || ''),
      vendedor: String(obterValorFicha(ficha, 'vendedor', '') || ''),
      dataInicio: String(obterValorFicha(ficha, 'dataInicio', '') || ''),
      numeroVenda: String(obterValorFicha(ficha, 'numeroVenda', '') || ''),
      dataEntrega: String(obterValorFicha(ficha, 'dataEntrega', '') || ''),
      evento: String(obterValorFicha(ficha, 'evento', 'nao') || 'nao'),
      produtos: normalizarProdutosFicha(ficha),
      material: String(obterValorFicha(ficha, 'material', '') || ''),
      composicao: String(obterValorFicha(ficha, 'composicao', '') || ''),
      corMaterial: String(obterValorFicha(ficha, 'corMaterial', '') || ''),
      manga: String(obterValorFicha(ficha, 'manga', '') || ''),
      acabamentoManga: String(obterValorFicha(ficha, 'acabamentoManga', '') || ''),
      larguraManga: String(obterValorFicha(ficha, 'larguraManga', '') || ''),
      corAcabamentoManga: String(obterValorFicha(ficha, 'corAcabamentoManga', '') || ''),
      gola: String(obterValorFicha(ficha, 'gola', '') || ''),
      corGola: String(obterValorFicha(ficha, 'corGola', '') || ''),
      acabamentoGola: String(obterValorFicha(ficha, 'acabamentoGola', '') || ''),
      larguraGola: String(obterValorFicha(ficha, 'larguraGola', '') || ''),
      corPeitilhoInterno: String(obterValorFicha(ficha, 'corPeitilhoInterno', '') || ''),
      corPeitilhoExterno: String(obterValorFicha(ficha, 'corPeitilhoExterno', '') || ''),
      corPeDeGolaInterno: String(obterValorFicha(ficha, 'corPeDeGolaInterno', '') || ''),
      corPeDeGolaExterno: String(obterValorFicha(ficha, 'corPeDeGolaExterno', '') || ''),
      corBotao: String(obterValorFicha(ficha, 'corBotao', '') || ''),
      aberturaLateral: String(obterValorFicha(ficha, 'aberturaLateral', 'nao') || 'nao'),
      corAberturaLateral: String(obterValorFicha(ficha, 'corAberturaLateral', '') || ''),
      reforcoGola: String(obterValorFicha(ficha, 'reforcoGola', 'nao') || 'nao'),
      corReforco: String(obterValorFicha(ficha, 'corReforco', '') || ''),
      bolso: String(obterValorFicha(ficha, 'bolso', 'nenhum') || 'nenhum'),
      filete: String(obterValorFicha(ficha, 'filete', 'nao') || 'nao'),
      fileteLocal: String(obterValorFicha(ficha, 'fileteLocal', '') || ''),
      fileteCor: String(obterValorFicha(ficha, 'fileteCor', '') || ''),
      faixa: String(obterValorFicha(ficha, 'faixa', 'nao') || 'nao'),
      faixaLocal: String(obterValorFicha(ficha, 'faixaLocal', '') || ''),
      faixaCor: String(obterValorFicha(ficha, 'faixaCor', '') || ''),
      arte: String(obterValorFicha(ficha, 'arte', '') || ''),
      comNomes: normalizarComNomesValor(obterValorFicha(ficha, 'comNomes', '0')),
      observacoes,
      observacoesHtml,
      imagens,
      imagensData: JSON.stringify(imagens),
      imagemData: imagens.length > 0 ? imagens[0].src : ''
    };
  }

  function setFichaVisualizacaoDireta(ficha) {
    fichaVisualizacaoDireta = normalizarFichaVisualizacao(ficha);
  }

  function getFichaVisualizacaoDireta() {
    if (!fichaVisualizacaoDireta) return null;

    return {
      ...fichaVisualizacaoDireta,
      produtos: Array.isArray(fichaVisualizacaoDireta.produtos)
        ? fichaVisualizacaoDireta.produtos.map(item => ({ ...item }))
        : [],
      imagens: Array.isArray(fichaVisualizacaoDireta.imagens)
        ? fichaVisualizacaoDireta.imagens.map(item => ({ ...item }))
        : []
    };
  }

  function obterTextoOpcaoSelect(selectId, valor) {
    const raw = String(valor ?? '').trim();
    if (!raw || raw === '-' || raw === 'nenhum') return '';

    const select = document.getElementById(selectId);
    if (!select || String(select.tagName || '').toLowerCase() !== 'select') {
      return capitalizeFirstLetter(raw.replace(/[_-]+/g, ' '));
    }

    const option = Array.from(select.options || []).find(opt => opt.value === raw);
    if (option) {
      if (!option.value || option.value === '-' || option.value === 'nenhum') return '';
      return option.text || '';
    }

    return capitalizeFirstLetter(raw.replace(/[_-]+/g, ' '));
  }

  // ==================== CLOUDINARY CONFIG ====================
  let cloudinaryConfig = null;

  async function loadCloudinaryConfig() {
    try {
      const response = await fetch('/api/cloudinary/config');
      if (response.ok) {
        cloudinaryConfig = await response.json();
        console.log('[cloudinary] Configurado:', cloudinaryConfig.cloudName);
      }
    } catch (error) {
      console.warn('[cloudinary] Não disponível, usando base64');
    }
  }

  async function uploadToCloudinary(base64Data) {
    if (!cloudinaryConfig) {
      console.warn('Cloudinary não configurado, mantendo base64');
      return { success: true, url: base64Data, isBase64: true };
    }

    try {
      const formData = new FormData();
      formData.append('file', base64Data);
      formData.append('upload_preset', cloudinaryConfig.uploadPreset);
      formData.append('folder', 'fichas');

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`,
        {
          method: 'POST',
          body: formData
        }
      );

      if (!response.ok) throw new Error('Upload falhou');

      const result = await response.json();
      console.log('[cloudinary] Imagem enviada:', result.public_id);

      return {
        success: true,
        url: result.secure_url,
        publicId: result.public_id,
        isBase64: false
      };
    } catch (error) {
      console.error('[cloudinary] Erro no upload:', error);
      return { success: true, url: base64Data, isBase64: true };
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    initApp();
  });

  async function initApp() {
    await loadCloudinaryConfig();
    await loadCatalog();
    initDefaultDates();
    initEventoAlert();
    initCatalogInUI();
    initProductTable();
    initTotals();
    initSpecsAutoFill();
    initGolaControls();
    initFileteFaixaControls();
    initIconPreview();
    initMultipleImages();
    initSaveLoad();
    initPrint();
    initPrazoCalculator();
    initObservacoesAutoFill();
  }

  async function loadCatalog() {
    try {
      const response = await fetch(CATALOG_URL);
      if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);
      catalog = await response.json();
    } catch (error) {
      catalog = {
        tamanhos: ['PP', 'P', 'M', 'G', 'GG', 'XG'],
        produtos: ['Camiseta Básica', 'Polo', 'Baby Look'],
        mangas: ['Curta', 'Longa', 'Curta e Longa', 'Raglan Curta', 'Raglan Longa', '3/4'],
        larguras: ['Largura 2.5', 'Largura 3.5', 'Largura 4.0', 'Largura 4.5'],
        materiais: [
          { id: 'malha_fria_pv', nome: 'Malha Fria (PV)', composicao: '65% Poliéster / 35% Viscose' },
          { id: 'dry_fit', nome: 'Dry Fit', composicao: '100% Poliéster' }
        ]
      };
    }
  }

  function isAcabamentoMangaComExtras(valor) {
    return [
      'punho',
      'vies',
      'punho_ribana',
      'punho_vies_sublimado',
      'vies_sublimado'
    ].includes(valor);
  }

  function getTipoAcabamentoManga(valor) {
    if (valor.startsWith('punho')) return 'PUNHO';
    if (valor.includes('vies')) return 'VIÉS';
    return '';
  }

  function getDescricaoAcabamentoManga(valor, textoSelecionado) {
    const map = {
      punho_ribana: 'PUNHO DE RIBANA',
      punho_vies_sublimado: 'PUNHO SUBLIMADO',
      vies_sublimado: 'VIÉS SUBLIMADO',
      punho: 'PUNHO',
      vies: 'VIÉS'
    };
    if (map[valor]) return map[valor];
    if (textoSelecionado) return textoSelecionado.toUpperCase();
    return getTipoAcabamentoManga(valor);
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

  const COM_NOMES_VALOR_NENHUM = '0';
  const COM_NOMES_MARCADORES = Object.freeze({
    '1': 'COM NOMES',
    '2': 'COM NOMES E NÚMEROS',
    '3': 'SOMENTE NÚMEROS'
  });

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

  function marcadorComNomesPorValor(valor) {
    const chave = normalizarComNomesValor(valor);
    return COM_NOMES_MARCADORES[chave] || '';
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

  function removerMarcadorComNomes(texto) {
    const semSomenteNumerosComBarra = String(texto || '').replace(/\s*\/\s*SOMENTE N[ÚU]MEROS\s*$/i, '');
    const semComNomesENumerosComBarra = semSomenteNumerosComBarra.replace(/\s*\/\s*COM NOMES E N[ÚU]MEROS\s*$/i, '');
    const semComNomesComBarra = semComNomesENumerosComBarra.replace(/\s*\/\s*COM NOMES\s*$/i, '');
    const semSomenteNumeros = semComNomesComBarra.replace(/\s*SOMENTE N[ÚU]MEROS\s*$/i, '');
    const semComNomesENumeros = semSomenteNumeros.replace(/\s*COM NOMES E N[ÚU]MEROS\s*$/i, '');
    const semComNomes = semComNomesENumeros.replace(/\s*COM NOMES\s*$/i, '');
    return semComNomes.replace(/[\/\s]+$/, '').trim();
  }

  function aplicarMarcadorComNomes(texto, valorComNomes) {
    const base = removerMarcadorComNomes(texto);
    const marcador = marcadorComNomesPorValor(valorComNomes);
    if (!marcador) return base;
    if (!base) return marcador;
    return `${base} / ${marcador}`;
  }

  function initCatalogInUI() {
    preencherProdutosList();
    preencherMangasSelect();
    preencherMateriaisDatalist();
    preencherTamanhosDatalist();
    preencherCoresDatalist();
    preencherCoresBotoesDatalist();
    preencherFileteLocalDatalist();
    preencherFaixaLocalDatalist();
    preencherFaixaCorDatalist();
    preencherLargurasDatalist();
  }

  function preencherProdutosList() {
    const datalist = document.getElementById('produtosList');
    if (!datalist) return;
    datalist.innerHTML = '';
    if (!catalog.produtos || catalog.produtos.length === 0) return;
    catalog.produtos.forEach(prod => {
      const opt = document.createElement('option');
      opt.value = prod;
      datalist.appendChild(opt);
    });
  }

  function preencherMangasSelect() {
    const select = document.getElementById('manga');
    if (!select) return;

    const valorAtual = select.value;
    const opcoesManga = Array.isArray(catalog.mangas) ? catalog.mangas : [];

    select.innerHTML = '<option value="">-</option>';

    opcoesManga.forEach(manga => {
      const opt = document.createElement('option');
      opt.value = manga;
      opt.textContent = manga;
      select.appendChild(opt);
    });

    if (valorAtual && opcoesManga.includes(valorAtual)) {
      select.value = valorAtual;
    }
  }

  function preencherMateriaisDatalist() {
    const datalist = document.getElementById('materiaisList');
    if (!datalist) return;
    datalist.innerHTML = '';
    if (!catalog.materiais || catalog.materiais.length === 0) return;
    catalog.materiais.forEach(mat => {
      const opt = document.createElement('option');
      opt.value = mat.nome;
      opt.dataset.composicao = mat.composicao || '';
      datalist.appendChild(opt);
    });
  }

  function preencherTamanhosDatalist() {
    let datalist = document.getElementById('tamanhosList');
    if (!datalist) {
      datalist = document.createElement('datalist');
      datalist.id = 'tamanhosList';
      document.body.appendChild(datalist);
    }
    datalist.innerHTML = '';
    if (!catalog.tamanhos || catalog.tamanhos.length === 0) return;
    catalog.tamanhos.forEach(tam => {
      const opt = document.createElement('option');
      opt.value = tam;
      datalist.appendChild(opt);
    });
  }

  function preencherCoresDatalist() {
    let datalist = document.getElementById('coresList');
    if (!datalist) {
      datalist = document.createElement('datalist');
      datalist.id = 'coresList';
      document.body.appendChild(datalist);
    }
    datalist.innerHTML = '';
    if (!catalog.cores || catalog.cores.length === 0) return;

    catalog.cores.forEach(cor => {
      const opt = document.createElement('option');
      opt.value = cor;
      datalist.appendChild(opt);
    });
  }

  function preencherCoresBotoesDatalist() {
    let datalist = document.getElementById('coresBotoesList');
    if (!datalist) {
      datalist = document.createElement('datalist');
      datalist.id = 'coresBotoesList';
      document.body.appendChild(datalist);
    }
    datalist.innerHTML = '';
    if (!catalog.coresBotao || catalog.coresBotao.length === 0) return;
    catalog.coresBotao.forEach(cor => {
      const opt = document.createElement('option');
      opt.value = cor;
      datalist.appendChild(opt);
    });
  }

  function preencherFileteLocalDatalist() {
    let datalist = document.getElementById('fileteLocalList');
    if (!datalist) {
      datalist = document.createElement('datalist');
      datalist.id = 'fileteLocalList';
      document.body.appendChild(datalist);
    }
    datalist.innerHTML = '';
    if (!catalog.fileteLocal || catalog.fileteLocal.length === 0) return;
    catalog.fileteLocal.forEach(local => {
      const opt = document.createElement('option');
      opt.value = local;
      datalist.appendChild(opt);
    });
  }

  function preencherFaixaLocalDatalist() {
    let datalist = document.getElementById('faixaLocalList');
    if (!datalist) {
      datalist = document.createElement('datalist');
      datalist.id = 'faixaLocalList';
      document.body.appendChild(datalist);
    }
    datalist.innerHTML = '';
    if (!catalog.faixaLocal || catalog.faixaLocal.length === 0) return;
    catalog.faixaLocal.forEach(local => {
      const opt = document.createElement('option');
      opt.value = local;
      datalist.appendChild(opt);
    });
  }

  function preencherFaixaCorDatalist() {
    let datalist = document.getElementById('faixaCorList');
    if (!datalist) {
      datalist = document.createElement('datalist');
      datalist.id = 'faixaCorList';
      document.body.appendChild(datalist);
    }
    datalist.innerHTML = '';
    if (!catalog.faixaCor || catalog.faixaCor.length === 0) return;
    catalog.faixaCor.forEach(cor => {
      const opt = document.createElement('option');
      opt.value = cor;
      datalist.appendChild(opt);
    });
  }

  function preencherLargurasDatalist() {
    let datalist = document.getElementById('largurasList');
    if (!datalist) {
      datalist = document.createElement('datalist');
      datalist.id = 'largurasList';
      document.body.appendChild(datalist);
    }
    datalist.innerHTML = '';
    if (!catalog.larguras || catalog.larguras.length === 0) return;
    catalog.larguras.forEach(largura => {
      const opt = document.createElement('option');
      opt.value = largura;
      datalist.appendChild(opt);
    });
  }

  function initDefaultDates() {
    const hoje = new Date();
    const dataInicio = document.getElementById('dataInicio');

    const hojeStr = hoje.getFullYear() + '-' +
      String(hoje.getMonth() + 1).padStart(2, '0') + '-' +
      String(hoje.getDate()).padStart(2, '0');

    if (dataInicio && !dataInicio.value) {
      dataInicio.value = hojeStr;
    }
  }

  function initEventoAlert() {
    const eventoSelect = document.getElementById('evento');
    const alertDiv = document.getElementById('eventoAlert');
    if (!eventoSelect || !alertDiv) return;

    function atualizar() {
      alertDiv.style.display = eventoSelect.value === 'sim' ? 'inline-flex' : 'none';
    }

    eventoSelect.addEventListener('change', atualizar);
    atualizar();
  }

  function initPrazoCalculator() {
    const dataInicio = document.getElementById('dataInicio');
    const dataEntrega = document.getElementById('dataEntrega');
    const prazoInfo = document.getElementById('prazoInfo');
    const prazoTexto = document.getElementById('prazoTexto');

    if (!dataInicio || !dataEntrega || !prazoInfo || !prazoTexto) return;

    function calcularPrazo() {
      const inicio = dataInicio.value;
      const entrega = dataEntrega.value;

      if (!inicio || !entrega) {
        prazoInfo.style.display = 'none';
        return;
      }

      const dateInicio = new Date(inicio);
      const dateEntrega = new Date(entrega);
      const diffTime = dateEntrega - dateInicio;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays < 0) {
        prazoTexto.textContent = 'A data de entrega é anterior à data de início!';
        prazoInfo.className = 'prazo-info urgente';
        prazoInfo.style.display = 'inline-flex';
      } else if (diffDays === 0) {
        prazoTexto.textContent = 'Entrega no mesmo dia!';
        prazoInfo.className = 'prazo-info urgente';
        prazoInfo.style.display = 'inline-flex';
      } else if (diffDays <= 3) {
        prazoTexto.textContent = `Prazo curto: ${diffDays} dia${diffDays > 1 ? 's' : ''} para produção`;
        prazoInfo.className = 'prazo-info urgente';
        prazoInfo.style.display = 'inline-flex';
      } else {
        prazoTexto.textContent = `Prazo: ${diffDays} dia${diffDays > 1 ? 's' : ''} para produção`;
        prazoInfo.className = 'prazo-info';
        prazoInfo.style.display = 'inline-flex';
      }
    }

    dataInicio.addEventListener('change', calcularPrazo);
    dataEntrega.addEventListener('change', calcularPrazo);
    calcularPrazo();
  }

  // Drag and Drop

  let draggedRow = null;
  let dropPosition = null;
  let isDragging = false;

  function initDragAndDrop(tabelaBody) {
    tabelaBody.addEventListener('mousedown', handleMouseDown);
    tabelaBody.addEventListener('dragstart', handleDragStart);
    tabelaBody.addEventListener('dragend', handleDragEnd);
    tabelaBody.addEventListener('dragover', handleDragOver);
    tabelaBody.addEventListener('dragleave', handleDragLeave);
    tabelaBody.addEventListener('drop', handleDrop);
  }

  function handleMouseDown(e) {
    const handle = e.target.closest('.drag-handle');
    const row = e.target.closest('tr');

    if (handle && row) {
      row.draggable = true;
      isDragging = true;
    } else if (row) {
      row.draggable = false;
      isDragging = false;
    }
  }

  function handleDragStart(e) {
    if (!isDragging) {
      e.preventDefault();
      return;
    }

    const row = e.target.closest('tr');
    if (!row) return;

    draggedRow = row;
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');

    setTimeout(() => {
      row.style.opacity = '0.5';
    }, 0);
  }

  function handleDragEnd(e) {
    const row = e.target.closest('tr');
    if (row) {
      row.classList.remove('dragging');
      row.style.opacity = '1';
      row.draggable = false;
    }

    document.querySelectorAll('#produtosTable tr').forEach(tr => {
      tr.classList.remove('drag-over-top', 'drag-over-bottom');
      tr.draggable = false;
    });

    draggedRow = null;
    dropPosition = null;
    isDragging = false;
  }

  function handleDragOver(e) {
    if (!isDragging || !draggedRow) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const targetRow = e.target.closest('tr');
    if (!targetRow || targetRow === draggedRow) return;

    const rect = targetRow.getBoundingClientRect();
    const midPoint = rect.top + rect.height / 2;
    const isAbove = e.clientY < midPoint;

    document.querySelectorAll('#produtosTable tr').forEach(tr => {
      if (tr !== targetRow) {
        tr.classList.remove('drag-over-top', 'drag-over-bottom');
      }
    });

    targetRow.classList.remove('drag-over-top', 'drag-over-bottom');
    if (isAbove) {
      targetRow.classList.add('drag-over-top');
      dropPosition = 'before';
    } else {
      targetRow.classList.add('drag-over-bottom');
      dropPosition = 'after';
    }
  }

  function handleDragLeave(e) {
    const targetRow = e.target.closest('tr');
    if (!targetRow) return;

    const relatedTarget = e.relatedTarget;
    if (relatedTarget && targetRow.contains(relatedTarget)) return;

    targetRow.classList.remove('drag-over-top', 'drag-over-bottom');
  }

  function handleDrop(e) {
    e.preventDefault();

    if (!isDragging || !draggedRow) return;

    const targetRow = e.target.closest('tr');
    if (!targetRow || targetRow === draggedRow) return;

    const tabelaBody = document.getElementById('produtosTable');

    if (dropPosition === 'before') {
      tabelaBody.insertBefore(draggedRow, targetRow);
    } else {
      tabelaBody.insertBefore(draggedRow, targetRow.nextSibling);
    }

    targetRow.classList.remove('drag-over-top', 'drag-over-bottom');

    draggedRow.classList.add('just-dropped');
    setTimeout(() => {
      draggedRow.classList.remove('just-dropped');
    }, 300);
  }

  // Ordenação

  function ordenarProdutosPorTamanho() {
    const tabelaBody = document.getElementById('produtosTable');
    if (!tabelaBody) return;

    const rows = Array.from(tabelaBody.querySelectorAll('tr'));
    if (rows.length <= 1) return;

    const ordemTamanhos = {};
    catalog.tamanhos.forEach((tam, index) => {
      ordemTamanhos[tam.toUpperCase()] = index;
    });

    function getOrdem(tamanho) {
      const tamUpper = (tamanho || '').toUpperCase().trim();

      if (ordemTamanhos.hasOwnProperty(tamUpper)) {
        return { tipo: 0, valor: ordemTamanhos[tamUpper] };
      }

      const numMatch = tamUpper.match(/^(\d+)$/);
      if (numMatch) {
        return { tipo: 1, valor: parseInt(numMatch[1]) };
      }

      const numPrefixMatch = tamUpper.match(/^(\d+)(.*)$/);
      if (numPrefixMatch) {
        return { tipo: 2, valor: parseInt(numPrefixMatch[1]), texto: numPrefixMatch[2] };
      }

      return { tipo: 3, valor: tamUpper };
    }

    function comparar(a, b) {
      const tamanhoA = a.querySelector('.tamanho')?.value || '';
      const tamanhoB = b.querySelector('.tamanho')?.value || '';

      const ordemA = getOrdem(tamanhoA);
      const ordemB = getOrdem(tamanhoB);

      if (ordemA.tipo !== ordemB.tipo) {
        return ordemA.tipo - ordemB.tipo;
      }

      if (ordemA.tipo === 0 || ordemA.tipo === 1) {
        return ordemA.valor - ordemB.valor;
      }

      if (ordemA.tipo === 2) {
        if (ordemA.valor !== ordemB.valor) {
          return ordemA.valor - ordemB.valor;
        }
        return (ordemA.texto || '').localeCompare(ordemB.texto || '');
      }

      return String(ordemA.valor).localeCompare(String(ordemB.valor));
    }

    rows.sort(comparar);
    rows.forEach(row => tabelaBody.appendChild(row));

    tabelaBody.classList.add('sorted-flash');
    setTimeout(() => {
      tabelaBody.classList.remove('sorted-flash');
    }, 500);
  }

  window.ordenarProdutosPorTamanho = ordenarProdutosPorTamanho;

  // Tabela de Produtos

  function initProductTable() {
    const tabelaBody = document.getElementById('produtosTable');
    const template = document.getElementById('productRowTemplate');
    const btnAdicionar = document.getElementById('adicionarProduto');

    if (!tabelaBody || !template || !btnAdicionar) return;

    initDragAndDrop(tabelaBody);
    adicionarBotaoOrdenar();

    function adicionarLinhaProduto(produto) {
      const row = template.content.firstElementChild.cloneNode(true);
      row.draggable = false;

      const firstTd = row.querySelector('td');
      if (firstTd) {
        const dragHandle = document.createElement('span');
        dragHandle.className = 'drag-handle';
        dragHandle.innerHTML = '<i class="fas fa-grip-vertical"></i>';
        dragHandle.title = 'Arraste para reordenar';
        firstTd.insertBefore(dragHandle, firstTd.firstChild);
      }

      const tamanhoElement = row.querySelector('.tamanho');

      if (tamanhoElement && tamanhoElement.tagName.toLowerCase() === 'select') {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'form-control tamanho';
        input.placeholder = 'Tam.';
        input.setAttribute('list', 'tamanhosList');
        input.autocomplete = 'off';

        tamanhoElement.parentNode.replaceChild(input, tamanhoElement);

        if (produto && produto.tamanho) {
          input.value = produto.tamanho;
        }
      } else if (tamanhoElement) {
        tamanhoElement.setAttribute('list', 'tamanhosList');
        tamanhoElement.placeholder = 'Tam.';
        tamanhoElement.autocomplete = 'off';

        if (produto && produto.tamanho) {
          tamanhoElement.value = produto.tamanho;
        }
      }

      const inputQuantidade = row.querySelector('.quantidade');
      const inputProduto = row.querySelector('.produto');
      const inputDetalhesProduto = row.querySelector('.detalhes-produto');

      if (produto) {
        const produtoPrincipal = produto.produto || produto.descricao || '';
        const detalhesProduto = produto.detalhesProduto || produto.detalhes || '';
        if (inputQuantidade) inputQuantidade.value = produto.quantidade || 1;
        if (inputProduto) inputProduto.value = produtoPrincipal;
        if (inputDetalhesProduto) inputDetalhesProduto.value = detalhesProduto;
      }

      tabelaBody.appendChild(row);
      atualizarTotalItens();
    }

    btnAdicionar.addEventListener('click', () => adicionarLinhaProduto());

    tabelaBody.addEventListener('click', e => {
      const btnDuplicar = e.target.closest('.duplicar-produto');
      const btnRemover = e.target.closest('.remover-produto');

      if (btnDuplicar) {
        const row = btnDuplicar.closest('tr');
        const tamanho = row.querySelector('.tamanho')?.value || '';
        const quantidade = row.querySelector('.quantidade')?.value || 1;
        const produto = row.querySelector('.produto')?.value || row.querySelector('.descricao')?.value || '';
        const detalhesProduto = row.querySelector('.detalhes-produto')?.value || '';
        adicionarLinhaProduto({ tamanho, quantidade, produto, detalhesProduto });
      }

      if (btnRemover) {
        const row = btnRemover.closest('tr');
        if (row) {
          row.remove();
          if (!tabelaBody.querySelector('tr')) {
            adicionarLinhaProduto();
          }
          atualizarTotalItens();
        }
      }
    });

    tabelaBody.addEventListener('input', e => {
      if (e.target.classList.contains('quantidade')) {
        atualizarTotalItens();
      }
      if (e.target.classList.contains('tamanho')) {
        const start = e.target.selectionStart;
        const end = e.target.selectionEnd;
        e.target.value = e.target.value.toUpperCase();
        e.target.setSelectionRange(start, end);
      }
    });

    tabelaBody.addEventListener('input', e => {
      if (e.target.classList.contains('quantidade')) {
        e.target.value = e.target.value.replace(/[^0-9+\-*/.\s]/g, '');
        atualizarTotalItens();
      }
      if (e.target.classList.contains('tamanho')) {
        const start = e.target.selectionStart;
        e.target.value = e.target.value.toUpperCase();
        e.target.setSelectionRange(start, start);
      }
    });

    tabelaBody.addEventListener('keydown', e => {
      if (e.target.classList.contains('quantidade') && e.key === 'Enter') {
        e.preventDefault();
        calcularExpressao(e.target);
      }
    });

    tabelaBody.addEventListener('blur', e => {
      if (e.target.classList.contains('quantidade')) {
        calcularExpressao(e.target);
      }
    }, true);

    adicionarLinhaProduto();

    window._addProductRowFromData = adicionarLinhaProduto;
    window.adicionarProduto = adicionarLinhaProduto;
  }

  function adicionarBotaoOrdenar() {
    const btnAdicionar = document.getElementById('adicionarProduto');
    if (!btnAdicionar) return;
    if (document.getElementById('ordenarProdutos')) return;

    const btnOrdenar = document.createElement('button');
    btnOrdenar.id = 'ordenarProdutos';
    btnOrdenar.type = 'button';
    btnOrdenar.className = 'btn btn-secondary';
    btnOrdenar.innerHTML = '<i class="fas fa-sort-amount-down"></i> <span>Ordenar</span>';
    btnOrdenar.title = 'Ordenar produtos por tamanho';
    btnOrdenar.addEventListener('click', ordenarProdutosPorTamanho);

    btnAdicionar.parentNode.insertBefore(btnOrdenar, btnAdicionar.nextSibling);
  }

  function initTotals() {
    atualizarTotalItens();
  }

  function exibirAlertaLimiteProdutos() {
    let toast = document.getElementById('toast-limite-produtos');
    if (toast) {
      toast.style.display = 'flex';
      return;
    }

    toast = document.createElement('div');
    toast.id = 'toast-limite-produtos';
    toast.className = 'toast-limite-produtos';
    toast.innerHTML = `
      <div class="toast-limite-produtos__content">
        <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
        <span>Considere dividir essa ficha em duas partes para evitar erros de impressão.</span>
      </div>
      <button type="button" class="toast-limite-produtos__close" aria-label="Fechar alerta">×</button>
    `;

    const btnFechar = toast.querySelector('.toast-limite-produtos__close');
    btnFechar?.addEventListener('click', () => {
      toast.style.display = 'none';
      alertaLimiteProdutosFechado = true;
    });

    document.body.appendChild(toast);
  }

  function atualizarAlertaLimiteProdutos() {
    const totalProdutos = document.querySelectorAll('#produtosTable tr').length;
    const passouLimite = totalProdutos > 20;
    const toast = document.getElementById('toast-limite-produtos');

    if (!passouLimite) {
      alertaLimiteProdutosFechado = false;
      if (toast) toast.style.display = 'none';
      return;
    }

    if (alertaLimiteProdutosFechado) return;
    exibirAlertaLimiteProdutos();
  }

  function atualizarTotalItens() {
    const quantities = document.querySelectorAll('#produtosTable .quantidade');
    let total = 0;
    quantities.forEach(input => {
      const n = parseInt(input.value, 10);
      if (!Number.isNaN(n) && n > 0) total += n;
    });
    const totalSpan = document.getElementById('totalItens');
    if (totalSpan) totalSpan.textContent = total;
    atualizarAlertaLimiteProdutos();
  }

  window.atualizarTotalItens = atualizarTotalItens;

  function calcularExpressao(input) {
    if (!input || !input.value) return;

    const expressao = input.value.trim();
    if (!/[\+\-\*\/]/.test(expressao)) return;

    try {
      if (!/^[\d\s\+\-\*\/\(\)\.]+$/.test(expressao)) return;

      const resultado = Function(`'use strict'; return (${expressao})`)();

      if (typeof resultado === 'number' && !isNaN(resultado) && isFinite(resultado)) {
        input.value = Math.round(resultado);
        atualizarTotalItens();
      }
    } catch (erro) { }
  }

  // Material e Manga

  function initSpecsAutoFill() {
    const inputMaterial = document.getElementById('material');
    const composicaoInput = document.getElementById('composicao');
    const datalist = document.getElementById('materiaisList');

    if (!inputMaterial || !composicaoInput || !datalist) return;

    inputMaterial.addEventListener('input', () => {
      const valorDigitado = inputMaterial.value;
      const options = datalist.querySelectorAll('option');
      for (let opt of options) {
        if (opt.value === valorDigitado) {
          composicaoInput.value = opt.dataset.composicao || '';
          break;
        }
      }
    });

    const acabamentoManga = document.getElementById('acabamentoManga');
    const larguraMangaContainer = document.getElementById('larguraMangaContainer');
    const corAcabamentoMangaContainer = document.getElementById('corAcabamentoMangaContainer');

    function atualizarCamposManga() {
      const valor = acabamentoManga?.value || '';
      const mostrarExtras = isAcabamentoMangaComExtras(valor);

      if (larguraMangaContainer) {
        larguraMangaContainer.style.display = mostrarExtras ? 'block' : 'none';
      }
      if (corAcabamentoMangaContainer) {
        corAcabamentoMangaContainer.style.display = mostrarExtras ? 'block' : 'none';
      }
    }

    if (acabamentoManga) {
      acabamentoManga.addEventListener('change', atualizarCamposManga);
      atualizarCamposManga();
    }
  }

  // Controles da Gola

  function initGolaControls() {
    const tipoGola = document.getElementById('gola');
    const corGolaContainer = document.getElementById('corGolaContainer');
    const acabamentoGolaContainer = document.getElementById('acabamentoGolaContainer');
    const acabamentoGola = document.getElementById('acabamentoGola');
    const larguraGolaContainer = document.getElementById('larguraGolaContainer');
    const reforcoGolaContainer = document.getElementById('reforcoGolaContainer');
    const reforcoGola = document.getElementById('reforcoGola');
    const corReforcoContainer = document.getElementById('corReforcoContainer');
    const corPeitilhoInternoContainer = document.getElementById('corPeitilhoInternoContainer');
    const corPeitilhoExternoContainer = document.getElementById('corPeitilhoExternoContainer');
    const corBotaoContainer = document.getElementById('corBotaoContainer');
    const corPeDeGolaInternoContainer = document.getElementById('corPeDeGolaInternoContainer');
    const corPeDeGolaExternoContainer = document.getElementById('corPeDeGolaExternoContainer');
    const aberturaLateralContainer = document.getElementById('aberturaLateralContainer');
    const aberturaLateral = document.getElementById('aberturaLateral');
    const corAberturaLateralContainer = document.getElementById('corAberturaLateralContainer');

    function atualizarCamposGola() {
      const gola = tipoGola?.value || '';
      const isPolo = gola === 'polo' || gola === 'v_polo';
      const isSocial = gola === 'social';
      const temGola = gola !== '';

      if (corGolaContainer) {
        corGolaContainer.style.display = (temGola && !isSocial) ? 'block' : 'none';
      }

      if (acabamentoGolaContainer) {
        acabamentoGolaContainer.style.display = (isPolo || isSocial) ? 'none' : 'block';
      }
      if (larguraGolaContainer) {
        const acabamento = acabamentoGola?.value || '';
        larguraGolaContainer.style.display = (!isPolo && !isSocial && acabamento) ? 'block' : 'none';
      }

      if (reforcoGolaContainer) {
        reforcoGolaContainer.style.display = (temGola && !isSocial) ? 'block' : 'none';
      }

      if (corPeitilhoInternoContainer) {
        corPeitilhoInternoContainer.style.display = isPolo ? 'block' : 'none';
      }
      if (corPeitilhoExternoContainer) {
        corPeitilhoExternoContainer.style.display = isPolo ? 'block' : 'none';
      }
      if (corBotaoContainer) {
        corBotaoContainer.style.display = (isPolo || isSocial) ? 'block' : 'none';
      }
      if (corPeDeGolaInternoContainer) {
        corPeDeGolaInternoContainer.style.display = isSocial ? 'block' : 'none';
      }
      if (corPeDeGolaExternoContainer) {
        corPeDeGolaExternoContainer.style.display = isSocial ? 'block' : 'none';
      }
      if (aberturaLateralContainer) {
        aberturaLateralContainer.style.display = isPolo ? 'block' : 'none';
      }

      if (!isPolo && corAberturaLateralContainer) {
        corAberturaLateralContainer.style.display = 'none';
      }

      atualizarCorReforco();
      atualizarCorAberturaLateral();
    }

    function atualizarLarguraGola() {
      const gola = tipoGola?.value || '';
      const isPolo = gola === 'polo' || gola === 'v_polo';
      const isSocial = gola === 'social';
      const acabamento = acabamentoGola?.value || '';

      if (larguraGolaContainer) {
        larguraGolaContainer.style.display = (!isPolo && !isSocial && acabamento) ? 'block' : 'none';
      }
    }

    function atualizarCorReforco() {
      const reforcoMarcado = reforcoGola?.value === 'sim';
      const gola = tipoGola?.value || '';
      const isSocial = gola === 'social';
      if (corReforcoContainer) {
        corReforcoContainer.style.display = (!isSocial && reforcoMarcado) ? 'block' : 'none';
      }
    }

    function atualizarCorAberturaLateral() {
      const aberturaAtiva = aberturaLateral?.value === 'sim';
      const gola = tipoGola?.value || '';
      const isPolo = gola === 'polo' || gola === 'v_polo';

      if (corAberturaLateralContainer) {
        corAberturaLateralContainer.style.display = (isPolo && aberturaAtiva) ? 'block' : 'none';
      }
    }

    if (tipoGola) tipoGola.addEventListener('change', atualizarCamposGola);
    if (acabamentoGola) acabamentoGola.addEventListener('change', atualizarLarguraGola);
    if (reforcoGola) reforcoGola.addEventListener('change', atualizarCorReforco);
    if (aberturaLateral) aberturaLateral.addEventListener('change', atualizarCorAberturaLateral);

    atualizarCamposGola();
  }

  // Filete e Faixa

  function initFileteFaixaControls() {
    const fileteSelect = document.getElementById('filete');
    const fileteLocalContainer = document.getElementById('fileteLocalContainer');
    const fileteCorContainer = document.getElementById('fileteCorContainer');

    function atualizarCamposFilete() {
      const temFilete = fileteSelect?.value === 'sim';
      if (fileteLocalContainer) fileteLocalContainer.style.display = temFilete ? 'block' : 'none';
      if (fileteCorContainer) fileteCorContainer.style.display = temFilete ? 'block' : 'none';
    }

    if (fileteSelect) {
      fileteSelect.addEventListener('change', atualizarCamposFilete);
      atualizarCamposFilete();
    }

    const faixaSelect = document.getElementById('faixa');
    const faixaLocalContainer = document.getElementById('faixaLocalContainer');
    const faixaCorContainer = document.getElementById('faixaCorContainer');

    function atualizarCamposFaixa() {
      const temFaixa = faixaSelect?.value === 'sim';
      if (faixaLocalContainer) faixaLocalContainer.style.display = temFaixa ? 'block' : 'none';
      if (faixaCorContainer) faixaCorContainer.style.display = temFaixa ? 'block' : 'none';
    }

    if (faixaSelect) {
      faixaSelect.addEventListener('change', atualizarCamposFaixa);
      atualizarCamposFaixa();
    }
  }

  function initIconPreview() {
    const inputMaterial = document.getElementById('material');

    ['manga', 'gola', 'arte'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', atualizarIconPreview);
    });

    if (inputMaterial) {
      inputMaterial.addEventListener('input', atualizarIconPreview);
    }

    atualizarIconPreview();
  }

  function atualizarIconPreview() {
    const map = [
      { id: 'material', spec: 'material', isInput: true },
      { id: 'manga', spec: 'manga', isInput: false },
      { id: 'gola', spec: 'gola', isInput: false },
      { id: 'arte', spec: 'arte', isInput: false }
    ];

    map.forEach(({ id, spec, isInput }) => {
      const el = document.getElementById(id);
      const label = document.querySelector(`.icon-item[data-spec="${spec}"] .icon-label`);
      if (!el || !label) return;

      let text = '';
      if (isInput) {
        text = el.value || '';
      } else if (el.tagName.toLowerCase() === 'select') {
        const opt = el.options[el.selectedIndex];
        text = opt ? opt.text : '';
      }

      if (text) label.textContent = text;
    });
  }

  // Múltiplas Imagens

  function initMultipleImages() {
    const dropArea = document.getElementById('imageUpload');
    const fileInput = document.getElementById('fileInput');
    const container = document.getElementById('imagesContainer');
    const counter = document.getElementById('imagesCounter');

    if (!dropArea || !fileInput || !container) return;

    function atualizarContador() {
      if (counter) counter.textContent = `(${imagens.length}/${MAX_IMAGES})`;

      const hide = imagens.length >= MAX_IMAGES;
      dropArea.classList.toggle('hidden', hide);
    }

    function renderizarImagens() {
      container.innerHTML = '';
      container.classList.toggle('images-one', imagens.length === 1);
      container.classList.toggle('images-two', imagens.length === 2);
      container.classList.toggle('images-three', imagens.length === 3);
      container.classList.toggle('images-four', imagens.length === 4);
      container.classList.toggle('compact-four', imagens.length === MAX_IMAGES);

      imagens.forEach((img, index) => {
        const card = document.createElement('div');
        card.className = 'image-card';
        card.draggable = true;
        card.dataset.index = index;

        card.innerHTML = `
          <div class="image-wrapper">
            <span class="image-number">${index + 1}</span>
            <img src="${img.src}" alt="Imagem ${index + 1}" draggable="false">
            <button type="button" class="image-delete-btn" title="Remover imagem">
              <i class="fas fa-times"></i>
            </button>
            <div class="image-drag-handle">
              <i class="fas fa-grip-horizontal"></i>
              Arrastar
            </div>
          </div>
          <div class="image-description">
            <input type="text" placeholder="Descrição da imagem (opcional)" value="${img.descricao || ''}" data-index="${index}">
          </div>
        `;

        container.appendChild(card);

        card.querySelector('.image-delete-btn').addEventListener('click', () => {
          imagens.splice(index, 1);
          renderizarImagens();
          atualizarContador();
        });

        card.querySelector('input').addEventListener('input', (e) => {
          imagens[index].descricao = e.target.value;
        });

        card.addEventListener('dragstart', handleImageDragStart);
        card.addEventListener('dragend', handleImageDragEnd);
        card.addEventListener('dragover', handleImageDragOver);
        card.addEventListener('drop', handleImageDrop);
        card.addEventListener('dragleave', handleImageDragLeave);
      });

      atualizarContador();
    }

    let draggedImageIndex = null;

    function handleImageDragStart(e) {
      draggedImageIndex = parseInt(e.currentTarget.dataset.index);
      e.currentTarget.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    }

    function handleImageDragEnd(e) {
      e.currentTarget.classList.remove('dragging');
      document.querySelectorAll('.image-card').forEach(card => {
        card.classList.remove('drag-over');
      });
      draggedImageIndex = null;
    }

    function handleImageDragOver(e) {
      e.preventDefault();
      const card = e.currentTarget;
      const targetIndex = parseInt(card.dataset.index);

      if (targetIndex !== draggedImageIndex) {
        card.classList.add('drag-over');
      }
    }

    function handleImageDragLeave(e) {
      e.currentTarget.classList.remove('drag-over');
    }

    function handleImageDrop(e) {
      e.preventDefault();
      const card = e.currentTarget;
      card.classList.remove('drag-over');

      const targetIndex = parseInt(card.dataset.index);

      if (draggedImageIndex !== null && targetIndex !== draggedImageIndex) {
        const [movedItem] = imagens.splice(draggedImageIndex, 1);
        imagens.splice(targetIndex, 0, movedItem);
        renderizarImagens();
      }
    }

    // CORREÇÃO: Adicionar imagem com upload para Cloudinary
    async function adicionarImagem(src, descricao = '') {
      if (imagens.length >= MAX_IMAGES) {
        alert(`Máximo de ${MAX_IMAGES} imagens permitido.`);
        return false;
      }

      // UPLOAD PARA CLOUDINARY
      console.log('📤 Fazendo upload para Cloudinary...');
      const uploadResult = await uploadToCloudinary(src);

      imagens.push({
        src: uploadResult.url,
        publicId: uploadResult.publicId || null,
        descricao,
        isBase64: uploadResult.isBase64 || false
      });

      renderizarImagens();
      return true;
    }

    async function processarArquivos(files) {
      if (!files || !files.length) return;

      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;

        if (imagens.length >= MAX_IMAGES) {
          alert(`Máximo de ${MAX_IMAGES} imagens atingido.`);
          return;
        }

        const reader = new FileReader();
        reader.onload = async e => {
          await adicionarImagem(e.target.result);
        };
        reader.readAsDataURL(file);
      }
    }

    dropArea.addEventListener('click', () => fileInput.click(), { once: true });

    fileInput.addEventListener('change', () => {
      processarArquivos(fileInput.files);
      fileInput.value = '';
    });

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(name => {
      dropArea.addEventListener(name, e => {
        e.preventDefault();
        e.stopPropagation();
      }, { once: true });
    });

    ['dragenter', 'dragover'].forEach(name => {
      dropArea.addEventListener(name, () => {
        dropArea.classList.add('image-upload--active');
      }, { once: true });
    });

    ['dragleave', 'drop'].forEach(name => {
      dropArea.addEventListener(name, () => {
        dropArea.classList.remove('image-upload--active');
      }, { once: true });
    });

    dropArea.addEventListener('drop', e => {
      processarArquivos(e.dataTransfer.files);
    });

    // CORREÇÃO: Adicionar upload para Cloudinary ao colar imagem
    document.addEventListener('paste', async e => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (!blob) continue;

          if (imagens.length >= MAX_IMAGES) {
            alert(`Máximo de ${MAX_IMAGES} imagens atingido.`);
            return;
          }

          const reader = new FileReader();
          reader.onload = async ev => {
            console.log('[imagens] Imagem colada, iniciando upload...');
            await adicionarImagem(ev.target.result);
          };
          reader.readAsDataURL(blob);
          break;
        }
      }
    });

    if (!window.getImagens) {
      window.getImagens = () => imagens;
    }
    if (!window.setImagens) {
      window.setImagens = (novasImagens) => {
        imagens = novasImagens || [];
        renderizarImagens();
      };
    }
    window.adicionarImagem = adicionarImagem;

    atualizarContador();
  }

  // Salvar e Carregar

  function initSaveLoad() {
    const btnSalvar = document.getElementById('btnSalvar');
    const btnCarregar = document.getElementById('btnCarregar');

    btnSalvar?.addEventListener('click', salvarFicha);
    btnCarregar?.addEventListener('click', carregarFichaDeArquivo);
  }

  function coletarFicha() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('visualizar') && fichaVisualizacaoDireta) {
      const fichaVisualizacao = getFichaVisualizacaoDireta();
      if (fichaVisualizacao) {
        const imagens = Array.isArray(fichaVisualizacao.imagens) ? fichaVisualizacao.imagens : [];
        return {
          ...fichaVisualizacao,
          comNomes: Number(normalizarComNomesValor(fichaVisualizacao.comNomes)),
          imagens,
          imagensData: JSON.stringify(imagens),
          imagemData: imagens.length > 0 ? imagens[0].src : ''
        };
      }
    }

    const produtos = [];
    document.querySelectorAll('#produtosTable tr').forEach(row => {
      const tamanho = row.querySelector('.tamanho')?.value || '';
      const quantidade = row.querySelector('.quantidade')?.value || '';
      const produto = row.querySelector('.produto')?.value || row.querySelector('.descricao')?.value || '';
      const detalhesProduto = row.querySelector('.detalhes-produto')?.value || '';
      if (!tamanho && !produto && !detalhesProduto) return;
      produtos.push({ tamanho, quantidade, produto, detalhesProduto, descricao: produto });
    });

    const arteVal = document.getElementById('arte')?.value || '';

    const acabamentoMangaVal = document.getElementById('acabamentoManga')?.value || '';
    const temAcabamentoManga = isAcabamentoMangaComExtras(acabamentoMangaVal);
    const larguraManga = temAcabamentoManga ? (document.getElementById('larguraManga')?.value || '') : '';
    const corAcabamentoManga = temAcabamentoManga ? (document.getElementById('corAcabamentoManga')?.value || '') : '';

    const golaVal = document.getElementById('gola')?.value || '';
    const isPolo = golaVal === 'polo' || golaVal === 'v_polo';
    const isSocial = golaVal === 'social';
    const temGola = golaVal !== '';

    const corGola = (temGola && !isSocial) ? (document.getElementById('corGola')?.value || '') : '';
    const acabamentoGolaVal = (isPolo || isSocial) ? '' : (document.getElementById('acabamentoGola')?.value || '');
    const larguraGola = (!isPolo && !isSocial && acabamentoGolaVal) ? (document.getElementById('larguraGola')?.value || '') : '';

    const reforcoGolaVal = (temGola && !isSocial) ? (document.getElementById('reforcoGola')?.value || 'nao') : 'nao';
    const corReforco = (reforcoGolaVal === 'sim' && !isSocial) ? (document.getElementById('corReforco')?.value || '') : '';
    const corBotao = (isPolo || isSocial) ? (document.getElementById('corBotao')?.value || '') : '';
    const corPeDeGolaInterno = isSocial ? (document.getElementById('corPeDeGolaInterno')?.value || '') : '';
    const corPeDeGolaExterno = isSocial ? (document.getElementById('corPeDeGolaExterno')?.value || '') : '';

    const aberturaLateralVal = isPolo ? (document.getElementById('aberturaLateral')?.value || 'nao') : 'nao';
    const corAberturaLateral = (isPolo && aberturaLateralVal === 'sim') ? (document.getElementById('corAberturaLateral')?.value || '') : '';

    const fileteVal = document.getElementById('filete')?.value || 'nao';
    const fileteLocal = fileteVal === 'sim' ? (document.getElementById('fileteLocal')?.value || '') : '';
    const fileteCor = fileteVal === 'sim' ? (document.getElementById('fileteCor')?.value || '') : '';

    const faixaVal = document.getElementById('faixa')?.value || 'nao';
    const faixaLocal = faixaVal === 'sim' ? (document.getElementById('faixaLocal')?.value || '') : '';
    const faixaCor = faixaVal === 'sim' ? (document.getElementById('faixaCor')?.value || '') : '';

    return {
      cliente: document.getElementById('cliente')?.value || '',
      vendedor: document.getElementById('vendedor')?.value || '',
      dataInicio: document.getElementById('dataInicio')?.value || '',
      numeroVenda: document.getElementById('numeroVenda')?.value || '',
      dataEntrega: document.getElementById('dataEntrega')?.value || '',
      evento: document.getElementById('evento')?.value || 'nao',
      produtos,
      material: document.getElementById('material')?.value || '',
      corMaterial: document.getElementById('corMaterial')?.value || '',
      manga: document.getElementById('manga')?.value || '',
      acabamentoManga: acabamentoMangaVal,
      larguraManga,
      corAcabamentoManga,
      gola: golaVal,
      corGola,
      acabamentoGola: acabamentoGolaVal,
      larguraGola,
      reforcoGola: reforcoGolaVal,
      corReforco,
      corBotao,
      corPeDeGolaInterno,
      corPeDeGolaExterno,
      corPeitilhoInterno: isPolo ? (document.getElementById('corPeitilhoInterno')?.value || '') : '',
      corPeitilhoExterno: isPolo ? (document.getElementById('corPeitilhoExterno')?.value || '') : '',
      aberturaLateral: aberturaLateralVal,
      corAberturaLateral,
      bolso: document.getElementById('bolso')?.value || 'nenhum',
      filete: fileteVal,
      fileteLocal,
      fileteCor,
      faixa: faixaVal,
      faixaLocal,
      faixaCor,
      arte: arteVal,
      comNomes: Number(normalizarComNomesValor(document.getElementById('comNomes')?.value || '0')),
      composicao: document.getElementById('composicao')?.value || '',
      observacoes: document.getElementById('observacoes')?.value || '',
      imagens: window.getImagens ? window.getImagens() : [],
      imagensData: JSON.stringify(window.getImagens ? window.getImagens() : [])
    };
  }

  function salvarFicha() {
    const ficha = coletarFicha();

    const dataStr = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(ficha, null, 2)
    )}`;

    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `ficha_${(ficha.cliente || 'sem_nome').toLowerCase()}${ficha.numeroVenda ? '_' + ficha.numeroVenda : ''}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  window.salvarFicha = salvarFicha;

  function carregarFichaDeArquivo() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = e => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const ficha = JSON.parse(ev.target.result);
          preencherFicha(ficha);
          if (typeof window.atualizarDataInicioDeTemplate === 'function') {
            window.atualizarDataInicioDeTemplate();
          }
        } catch (err) {
          alert('Erro ao ler arquivo JSON.');
        }
      };
      reader.readAsText(file, 'UTF-8');
    };

    input.click();
  }

  window.carregarFichaDeArquivo = carregarFichaDeArquivo;

  function atualizarDataInicioDeTemplate() {
    const dataInicioEl = document.getElementById('dataInicio');
    if (dataInicioEl) {
      const hoje = new Date();
      const ano = hoje.getFullYear();
      const mes = String(hoje.getMonth() + 1).padStart(2, '0');
      const dia = String(hoje.getDate()).padStart(2, '0');
      dataInicioEl.value = `${ano}-${mes}-${dia}`;
      dataInicioEl.dispatchEvent(new Event('change'));
    }
  }

  window.atualizarDataInicioDeTemplate = atualizarDataInicioDeTemplate;

  function preencherFicha(ficha) {
    if (!ficha) return;
    const setVal = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = v || '';
    };

    setVal('cliente', ficha.cliente);
    setVal('vendedor', ficha.vendedor);
    setVal('dataInicio', ficha.dataInicio);
    setVal('numeroVenda', ficha.numeroVenda);
    setVal('dataEntrega', ficha.dataEntrega);
    setVal('evento', ficha.evento || 'nao');

    document.getElementById('evento')?.dispatchEvent(new Event('change'));
    document.getElementById('dataInicio')?.dispatchEvent(new Event('change'));
    document.getElementById('dataEntrega')?.dispatchEvent(new Event('change'));

    const tabelaBody = document.getElementById('produtosTable');
    if (tabelaBody) {
      tabelaBody.innerHTML = '';
      const arr = Array.isArray(ficha.produtos) ? ficha.produtos : [];
      if (!arr.length && window._addProductRowFromData) {
        window._addProductRowFromData();
      } else if (window._addProductRowFromData) {
        arr.forEach(p => window._addProductRowFromData(p));
      }
      atualizarTotalItens();
    }

    setVal('material', ficha.material);
    setVal('corMaterial', ficha.corMaterial);
    setVal('manga', ficha.manga);
    setVal('acabamentoManga', ficha.acabamentoManga);
    setVal('larguraManga', ficha.larguraManga);
    setVal('corAcabamentoManga', ficha.corAcabamentoManga);

    setVal('gola', ficha.gola);
    document.getElementById('gola')?.dispatchEvent(new Event('change'));

    setVal('corGola', ficha.corGola);
    setVal('acabamentoGola', ficha.acabamentoGola);
    setVal('larguraGola', ficha.larguraGola);

    setVal('reforcoGola', ficha.reforcoGola || 'nao');
    document.getElementById('reforcoGola')?.dispatchEvent(new Event('change'));
    setVal('corReforco', ficha.corReforco);

    setVal('corPeitilhoInterno', ficha.corPeitilhoInterno);
    setVal('corPeitilhoExterno', ficha.corPeitilhoExterno);
    setVal('corBotao', ficha.corBotao);
    setVal('corPeDeGolaInterno', ficha.corPeDeGolaInterno);
    setVal('corPeDeGolaExterno', ficha.corPeDeGolaExterno);

    setVal('aberturaLateral', ficha.aberturaLateral || 'nao');
    document.getElementById('aberturaLateral')?.dispatchEvent(new Event('change'));
    setVal('corAberturaLateral', ficha.corAberturaLateral);

    setVal('bolso', ficha.bolso || 'nenhum');

    setVal('filete', ficha.filete || 'nao');
    setVal('fileteLocal', ficha.fileteLocal || '');
    setVal('fileteCor', ficha.fileteCor || '');
    document.getElementById('filete')?.dispatchEvent(new Event('change'));

    setVal('faixa', ficha.faixa || 'nao');
    setVal('faixaLocal', ficha.faixaLocal || '');
    setVal('faixaCor', ficha.faixaCor || '');
    document.getElementById('faixa')?.dispatchEvent(new Event('change'));

    setVal('arte', ficha.arte);
    setVal('composicao', ficha.composicao);
    setVal('observacoes', ficha.observacoes);
    const comNomesSelect = document.getElementById('comNomes');
    if (comNomesSelect) {
      const valorSalvo = normalizarComNomesValor(ficha.comNomes ?? ficha.com_nomes);
      const valorPorTexto = detectarComNomesPorTexto(ficha.observacoes || '');
      comNomesSelect.value = valorSalvo !== COM_NOMES_VALOR_NENHUM ? valorSalvo : valorPorTexto;
    }

    document.getElementById('arte')?.dispatchEvent(new Event('change'));
    document.getElementById('material')?.dispatchEvent(new Event('input'));
    document.getElementById('acabamentoManga')?.dispatchEvent(new Event('change'));
    document.getElementById('acabamentoGola')?.dispatchEvent(new Event('change'));

    if (window.setImagens) {
      let imagensCarregadas = [];

      const imagensData = ficha.imagensData || ficha.imagens_data;
      if (imagensData) {
        try {
          if (typeof imagensData === 'string') {
            imagensCarregadas = JSON.parse(imagensData);
          } else if (Array.isArray(imagensData)) {
            imagensCarregadas = imagensData;
          }
        } catch (e) { }
      }

      if (imagensCarregadas.length === 0 && ficha.imagens && Array.isArray(ficha.imagens)) {
        imagensCarregadas = ficha.imagens;
      }

      if (imagensCarregadas.length === 0) {
        const imagemData = ficha.imagemData || ficha.imagem_data || ficha.imagem;
        if (imagemData && typeof imagemData === 'string' && imagemData.startsWith('data:')) {
          imagensCarregadas = [{ src: imagemData, descricao: '' }];
        }
      }

      window.setImagens(imagensCarregadas);
    }

    atualizarIconPreview();
  }

  // Impressão
  function ocultarTodosToasts() {
    const seletores = ['.toast-global', '.toast-custom', '#toast-limite-produtos'];
    seletores.forEach(seletor => {
      document.querySelectorAll(seletor).forEach(el => {
        el.style.display = 'none';
      });
    });
  }

  function initPrint() {
    const btn = document.getElementById('btnImprimir');
    btn?.addEventListener('click', () => {
      ocultarTodosToasts();
      gerarVersaoImpressao();
    });
    window.addEventListener('beforeprint', ocultarTodosToasts);
    document.addEventListener('keydown', e => {
      const isPrintShortcut = (e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'p';
      if (!isPrintShortcut) return;
      e.preventDefault();
      ocultarTodosToasts();
      gerarVersaoImpressao(false);
    });
  }

  function formatarDataBrasil(dataISO) {
    if (!dataISO) return '';
    const [ano, mes, dia] = dataISO.split('-');
    return `${dia}/${mes}/${ano}`;
  }

  function mmToPx(mm) {
    return (mm * 96) / 25.4;
  }

  function aplicarModoCompactoSeNecessario() {
    const printV = document.getElementById('print-version');
    if (!printV) return;

    const alturaMaxA4Px = mmToPx(297 - (6 * 2)) - 1;

    printV.classList.remove('print-compact');
    if (printV.scrollHeight <= alturaMaxA4Px) return;

    printV.classList.add('print-compact');
  }

  async function aguardarImagensDaImpressao(timeoutMs = 1500) {
    const printV = document.getElementById('print-version');
    if (!printV) return;

    const imagensPrint = Array.from(printV.querySelectorAll('img'));
    if (imagensPrint.length === 0) return;

    const promessas = imagensPrint.map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(resolve => {
        const finalizar = () => resolve();
        img.addEventListener('load', finalizar, { once: true });
        img.addEventListener('error', finalizar, { once: true });
      });
    });

    await Promise.race([
      Promise.all(promessas),
      new Promise(resolve => setTimeout(resolve, timeoutMs))
    ]);
  }

  function ocultarCamposSemValorNaImpressao() {
    const printV = document.getElementById('print-version');
    if (!printV) return;

    const linhas = printV.querySelectorAll('.print-grid-single > div');

    linhas.forEach(linha => {
      if (linha.classList.contains('print-group-separator')) return;

      const valorEl = linha.querySelector('[id^="print-"]');
      if (!valorEl) return;

      const textoValor = (valorEl.textContent || '').trim().toLowerCase();
      const ocultar = !textoValor || textoValor === '-' || textoValor === 'não' || textoValor === 'nao';

      if (ocultar) {
        linha.style.display = 'none';
        linha.dataset.autoHidden = '1';
      } else if (linha.dataset.autoHidden === '1') {
        linha.style.display = '';
        delete linha.dataset.autoHidden;
      }
    });

    const isElementoVisivel = el => {
      if (!el) return false;
      if (el.classList.contains('print-group-separator')) return false;
      return el.style.display !== 'none';
    };

    const encontrarVisivelAnterior = el => {
      let atual = el.previousElementSibling;
      while (atual && !isElementoVisivel(atual)) {
        atual = atual.previousElementSibling;
      }
      return atual;
    };

    const encontrarVisivelProximo = el => {
      let atual = el.nextElementSibling;
      while (atual && !isElementoVisivel(atual)) {
        atual = atual.nextElementSibling;
      }
      return atual;
    };

    const separadores = printV.querySelectorAll('.print-grid-single .print-group-separator');
    separadores.forEach(separador => {
      const prev = encontrarVisivelAnterior(separador);
      const next = encontrarVisivelProximo(separador);
      const prevVisivel = !!prev;
      const nextVisivel = !!next;

      separador.style.display = (prevVisivel && nextVisivel) ? '' : 'none';
    });
  }

  async function gerarVersaoImpressao(apenasPreview = false, fichaOrigem = null) {
    ocultarTodosToasts();
    const paramsUrl = new URLSearchParams(window.location.search);
    const manterVersaoImpressao = paramsUrl.has('visualizar');
    const fichaDireta = fichaOrigem
      ? normalizarFichaVisualizacao(fichaOrigem)
      : (manterVersaoImpressao ? getFichaVisualizacaoDireta() : null);

    if (fichaDireta) {
      fichaVisualizacaoDireta = fichaDireta;
    }

    const usarFichaDireta = !!fichaDireta;
    const hoje = new Date();
    const dataEmissao = hoje.toLocaleDateString('pt-BR') + ' ' + hoje.toLocaleTimeString('pt-BR');

    const setText = (id, val, fallback = '') => {
      try {
        const el = document.getElementById(id);
        if (el) el.textContent = val || fallback;
      } catch (error) {
        console.error('Erro em setText:', id, error);
      }
    };

    const setTextWithHighlight = (id, val, shouldHighlight, fallback = '') => {
      const el = document.getElementById(id);
      if (el) {
        const text = val || fallback;
        if (shouldHighlight && text) {
          el.innerHTML = `${text}`;
        } else {
          el.textContent = text;
        }
      }
    };

    const showDiv = (divId, show) => {
      try {
        const div = document.getElementById(divId);
        if (div) div.style.display = show ? 'block' : 'none';
      } catch (error) {
        console.error('Erro em showDiv:', divId, error);
      }
    };

    const getSelectTextDom = id => {
      try {
        const sel = document.getElementById(id);
        if (!sel) return '';

        if (sel.tagName && sel.tagName.toLowerCase() !== 'select') {
          return sel.value || '';
        }

        if (!sel.options || sel.selectedIndex < 0) return '';

        const opt = sel.options[sel.selectedIndex];

        if (!opt || opt.value === '' || opt.value === 'nenhum' || opt.value === '-') {
          return '';
        }

        return opt.text || '';
      } catch (error) {
        console.error('Erro em getSelectText:', id, error);
        return '';
      }
    };

    const getInputValueDom = id => {
      try {
        const el = document.getElementById(id);
        return el ? (el.value || '') : '';
      } catch (error) {
        console.error('Erro em getInputValue:', id, error);
        return '';
      }
    };

    const getValorCampo = id => {
      if (!usarFichaDireta) return getInputValueDom(id);
      const valor = fichaDireta[id];
      if (valor === undefined || valor === null) return '';
      return String(valor);
    };

    const getSelectText = id => {
      if (!usarFichaDireta) return getSelectTextDom(id);
      return obterTextoOpcaoSelect(id, getValorCampo(id));
    };

    const isEvento = valorEhSim(getValorCampo('evento'));

    setText('print-dataEmissao', dataEmissao);
    setText('print-numeroVenda', getValorCampo('numeroVenda'), '-');
    setText('print-cliente', capitalizeFirstLetter(getValorCampo('cliente')), '-');
    setText('print-vendedor', capitalizeFirstLetter(getValorCampo('vendedor')), '-');

    setTextWithHighlight('print-dataInicio', formatarDataBrasil(getValorCampo('dataInicio')), isEvento, '-');
    setTextWithHighlight('print-dataEntrega', formatarDataBrasil(getValorCampo('dataEntrega')), isEvento, '-');

    const eventoEl = document.getElementById('print-evento');
    if (eventoEl) {
      if (isEvento) {
        eventoEl.innerHTML = '<span style="color: var(--color-danger-dark); font-weight: 700;">EVENTO</span>';
      } else {
        eventoEl.textContent = 'Não';
      }
    }

    const dataEntregaVal = getValorCampo('dataEntrega');
    const prazoEl = document.getElementById('print-prazo');
    if (prazoEl && dataEntregaVal) {
      const hojeDate = new Date();
      hojeDate.setHours(0, 0, 0, 0);
      const entrega = new Date(dataEntregaVal + 'T00:00:00');
      const diffTime = entrega - hojeDate;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let prazoTexto = '';

      if (diffDays < 0) {
        prazoTexto = `ATRASADO (${Math.abs(diffDays)} dia${Math.abs(diffDays) > 1 ? 's' : ''})`;
      } else if (diffDays === 0) {
        prazoTexto = 'ENTREGA HOJE!';
      } else if (diffDays <= 3) {
        prazoTexto = `${diffDays} dia${diffDays > 1 ? 's' : ''} restante${diffDays > 1 ? 's' : ''}`;
      } else if (diffDays <= 7) {
        prazoTexto = `${diffDays} dias restantes`;
      } else {
        prazoTexto = `${diffDays} dias restantes`;
      }

      prazoEl.innerHTML = `<span>${prazoTexto}</span>`;
    } else if (prazoEl) {
      prazoEl.textContent = '-';
    }

    const produtosFonte = usarFichaDireta
      ? (Array.isArray(fichaDireta.produtos) ? fichaDireta.produtos : [])
      : [];

    const printBody = document.getElementById('print-produtosTable');
    if (printBody) {
      printBody.innerHTML = '';

      if (usarFichaDireta) {
        produtosFonte.forEach(item => {
          const tamanho = String(item?.tamanho || '').trim();
          const quantidade = String(item?.quantidade || '').trim();
          const produto = String(item?.produto || item?.descricao || '').trim();
          const detalhesProduto = String(item?.detalhesProduto || item?.detalhes || '').trim();

          const produtoFormatado = capitalizeFirstLetter(produto);
          const detalhesFormatado = capitalizeFirstLetter(detalhesProduto);
          if (!tamanho && !quantidade && !produtoFormatado && !detalhesFormatado) return;

          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${tamanho || '-'}</td>
            <td>${quantidade || '-'}</td>
            <td>${produtoFormatado || '-'}</td>
            <td>${detalhesFormatado || '-'}</td>
          `;
          printBody.appendChild(tr);
        });
      } else {
        document.querySelectorAll('#produtosTable tr').forEach(row => {
          const tamanho = row.querySelector('.tamanho')?.value;
          const quantidade = row.querySelector('.quantidade')?.value;
          const produto = row.querySelector('.produto')?.value || row.querySelector('.descricao')?.value;
          const detalhesProduto = row.querySelector('.detalhes-produto')?.value;
          const produtoFormatado = capitalizeFirstLetter(produto);
          const detalhesFormatado = capitalizeFirstLetter(detalhesProduto);
          if (!tamanho && !quantidade && !produtoFormatado && !detalhesFormatado) return;
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${tamanho || '-'}</td>
            <td>${quantidade || '-'}</td>
            <td>${produtoFormatado || '-'}</td>
            <td>${detalhesFormatado || '-'}</td>
          `;
          printBody.appendChild(tr);
        });
      }
    }

    const totalItensDireto = usarFichaDireta
      ? produtosFonte.reduce((total, item) => total + (parseInt(String(item?.quantidade || ''), 10) || 0), 0)
      : null;
    setText(
      'print-totalItens',
      usarFichaDireta ? String(totalItensDireto) : (document.getElementById('totalItens')?.textContent || '0'),
      '0'
    );

    const materialVal = getValorCampo('material');
    setText('print-material', materialVal, '-');

    const corMaterialVal = getValorCampo('corMaterial');
    setText('print-corMaterial', corMaterialVal, '-');

    const mangaText = getSelectText('manga');
    setText('print-manga', mangaText, '-');

    const acabamentoMangaText = getSelectText('acabamentoManga');
    setText('print-acabamentoManga', acabamentoMangaText, '-');

    const acabamentoMangaVal = getValorCampo('acabamentoManga');
    const temAcabamentoMangaExtra = isAcabamentoMangaComExtras(acabamentoMangaVal);

    const larguraMangaVal = getValorCampo('larguraManga');
    setText('print-larguraManga', larguraMangaVal);
    showDiv('print-larguraMangaDiv', temAcabamentoMangaExtra && !!larguraMangaVal);

    const corAcabamentoMangaVal = getValorCampo('corAcabamentoManga');
    setText('print-corAcabamentoManga', corAcabamentoMangaVal);
    showDiv('print-corAcabamentoMangaDiv', temAcabamentoMangaExtra && !!corAcabamentoMangaVal);

    const golaVal = getValorCampo('gola');
    const golaText = getSelectText('gola');
    const isPolo = golaVal === 'polo' || golaVal === 'v_polo';
    const isSocial = golaVal === 'social';
    const temGola = golaVal !== '';

    setText('print-gola', golaText, '-');

    const corGolaVal = getValorCampo('corGola');
    setText('print-corGola', corGolaVal);
    showDiv('print-corGolaDiv', temGola && !isSocial && !!corGolaVal);

    const acabamentoGolaText = getSelectText('acabamentoGola');
    setText('print-acabamentoGola', acabamentoGolaText);
    showDiv('print-acabamentoGolaDiv', !isPolo && !isSocial && !!acabamentoGolaText);

    const larguraGolaVal = getValorCampo('larguraGola');
    setText('print-larguraGola', larguraGolaVal);
    showDiv('print-larguraGolaDiv', !isPolo && !isSocial && !!larguraGolaVal);

    const reforcoGolaVal = getValorCampo('reforcoGola') || 'nao';
    const temReforco = temGola && !isSocial && reforcoGolaVal === 'sim';
    setText('print-reforcoGola', temReforco ? 'Sim' : '');
    showDiv('print-reforcoGolaDiv', temReforco);

    const corReforcoVal = getValorCampo('corReforco');
    setText('print-corReforco', corReforcoVal);
    showDiv('print-corReforcoDiv', temReforco && !!corReforcoVal);

    const corPeitilhoInternoVal = getValorCampo('corPeitilhoInterno');
    setText('print-corPeitilhoInterno', corPeitilhoInternoVal);
    showDiv('print-corPeitilhoInternoDiv', isPolo && !!corPeitilhoInternoVal);

    const corPeitilhoExternoVal = getValorCampo('corPeitilhoExterno');
    setText('print-corPeitilhoExterno', corPeitilhoExternoVal);
    showDiv('print-corPeitilhoExternoDiv', isPolo && !!corPeitilhoExternoVal);

    const corBotaoVal = getValorCampo('corBotao');
    setText('print-corBotao', corBotaoVal);
    showDiv('print-corBotaoDiv', (isPolo || isSocial) && !!corBotaoVal);

    const corPeDeGolaInternoVal = getValorCampo('corPeDeGolaInterno');
    setText('print-corPeDeGolaInterno', corPeDeGolaInternoVal);
    showDiv('print-corPeDeGolaInternoDiv', isSocial && !!corPeDeGolaInternoVal);

    const corPeDeGolaExternoVal = getValorCampo('corPeDeGolaExterno');
    setText('print-corPeDeGolaExterno', corPeDeGolaExternoVal);
    showDiv('print-corPeDeGolaExternoDiv', isSocial && !!corPeDeGolaExternoVal);

    const aberturaLateralVal = getValorCampo('aberturaLateral') || 'nao';
    const temAbertura = isPolo && aberturaLateralVal === 'sim';
    setText('print-aberturaLateral', temAbertura ? 'Sim' : '');
    showDiv('print-aberturaLateralDiv', temAbertura);

    const corAberturaLateralVal = getValorCampo('corAberturaLateral');
    setText('print-corAberturaLateral', corAberturaLateralVal);
    showDiv('print-corAberturaLateralDiv', temAbertura && !!corAberturaLateralVal);

    const bolsoText = getSelectText('bolso');
    setText('print-bolso', bolsoText, '-');

    const fileteVal = getValorCampo('filete') || 'nao';
    const temFilete = fileteVal === 'sim';
    setText('print-filete', temFilete ? 'Sim' : 'Não');

    const fileteLocalVal = getValorCampo('fileteLocal');
    setText('print-fileteLocal', fileteLocalVal);
    showDiv('print-fileteLocalDiv', temFilete && !!fileteLocalVal);

    const fileteCorVal = getValorCampo('fileteCor');
    setText('print-fileteCor', fileteCorVal);
    showDiv('print-fileteCorDiv', temFilete && !!fileteCorVal);

    const faixaVal = getValorCampo('faixa') || 'nao';
    const temFaixa = faixaVal === 'sim';
    setText('print-faixa', temFaixa ? 'Sim' : 'Não');

    const faixaLocalVal = getValorCampo('faixaLocal');
    setText('print-faixaLocal', faixaLocalVal);
    showDiv('print-faixaLocalDiv', temFaixa && !!faixaLocalVal);

    const faixaCorVal = getValorCampo('faixaCor');
    setText('print-faixaCor', faixaCorVal);
    showDiv('print-faixaCorDiv', temFaixa && !!faixaCorVal);

    const arteText = getSelectText('arte');
    setText('print-arte', arteText, '-');

    const comNomesVal = normalizarComNomesValor(getValorCampo('comNomes'));
    const comNomesText = marcadorComNomesPorValor(comNomesVal);
    setText('print-comNomes', capitalizeFirstLetter(comNomesText), '-');

    const composicaoVal = getValorCampo('composicao');
    setText('print-composicao', composicaoVal, '-');

    const printObservacoesEl = document.getElementById('print-observacoes');
    if (printObservacoesEl) {
      if (usarFichaDireta) {
        const observacoesHtml = String(fichaDireta.observacoesHtml || '').trim();
        const observacoesTexto = String(fichaDireta.observacoes || '').trim();
        printObservacoesEl.innerHTML = observacoesHtml || observacoesTexto || 'Nenhuma';
      } else if (window.richTextEditor) {
        const htmlContent = window.richTextEditor.getContent();
        printObservacoesEl.innerHTML = htmlContent || 'Nenhuma';
      } else {
        const observacoesVal = getValorCampo('observacoes');
        printObservacoesEl.innerHTML = observacoesVal || 'Nenhuma';
      }
    }

    const printImagesContainer = document.getElementById('print-imagesContainer');
    const printImagesSection = document.getElementById('print-imagesSection');
    const imgs = usarFichaDireta
      ? (Array.isArray(fichaDireta.imagens) ? fichaDireta.imagens : [])
      : (window.getImagens ? window.getImagens() : []);

    const imagensNormalizadas = Array.isArray(imgs)
      ? imgs
        .map(item => {
          if (typeof item === 'string') return { src: item, descricao: '' };
          if (!item || typeof item !== 'object') return null;
          const src = String(item.src || item.url || '').trim();
          if (!src) return null;
          return {
            src,
            descricao: String(item.descricao || item.description || '').trim()
          };
        })
        .filter(Boolean)
      : [];

    if (printImagesContainer) {
      printImagesContainer.innerHTML = '';
      printImagesContainer.classList.toggle('compact-four', imagensNormalizadas.length === MAX_IMAGES);
      printImagesContainer.classList.toggle('images-one', imagensNormalizadas.length === 1);
      printImagesContainer.classList.toggle('images-two', imagensNormalizadas.length === 2);
      printImagesContainer.classList.toggle('images-three', imagensNormalizadas.length === 3);

      if (imagensNormalizadas.length === 0) {
        if (printImagesSection) printImagesSection.style.display = 'none';
      } else {
        if (printImagesSection) printImagesSection.style.display = 'block';

        imagensNormalizadas.forEach((img, index) => {
          const div = document.createElement('div');
          div.className = imagensNormalizadas.length === 1 ? 'print-image-item single' : 'print-image-item';

          div.innerHTML = `
            <img src="${img.src}" alt="Imagem ${index + 1}">
            ${img.descricao ? `<div class="print-image-description">${img.descricao}</div>` : ''}
          `;

          printImagesContainer.appendChild(div);
        });
      }
    }

    ocultarCamposSemValorNaImpressao();

    const normal = document.getElementById('normal-version');
    const printV = document.getElementById('print-version');

    if (normal && printV) {
      normal.style.display = 'none';
      printV.style.display = 'block';
      await aguardarImagensDaImpressao();
      aplicarModoCompactoSeNecessario();

      if (apenasPreview) {
        document.body.classList.add('preview-impressao');
        aplicarModoCompactoSeNecessario();
        if (window.parent && window.parent !== window) {
          const params = new URLSearchParams(window.location.search);
          const visualizarId = params.get('visualizar') || null;
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              window.parent.postMessage({
                type: 'ficha-preview-ready',
                fichaId: visualizarId
              }, window.location.origin);
            });
          });
        }
        return;
      }

      document.body.classList.remove('preview-impressao');
      window.print();
      if (manterVersaoImpressao) {
        document.body.classList.add('preview-impressao');
      }
      if (!manterVersaoImpressao) {
        setTimeout(() => {
          normal.style.display = 'block';
          printV.style.display = 'none';
          printV.classList.remove('print-compact');
          document.body.classList.remove('preview-impressao');
        }, 100);
      }
    } else if (!apenasPreview) {
      window.print();
    }
  }

  function initObservacoesAutoFill() {
    let ultimoTextoAuto = '';
    const modoEdicaoPorId = new URLSearchParams(window.location.search).has('editar');
    let bloqueioAutoPreenchimento = false;
    let aplicandoAutoPreenchimento = false;

    function abrirModalConfirmacaoAutopreencher() {
      return new Promise(resolve => {
        const modalExistente = document.getElementById('confirmAutopreencherModal');
        if (modalExistente) modalExistente.remove();

        const modal = document.createElement('div');
        modal.id = 'confirmAutopreencherModal';
        modal.className = 'confirm-modal';
        modal.innerHTML = `
          <div class="confirm-modal-backdrop" data-role="cancelar"></div>
          <div class="confirm-modal-content" role="dialog" aria-modal="true" aria-labelledby="confirmAutopreencherTitle">
            <h3 id="confirmAutopreencherTitle"><i class="fas fa-triangle-exclamation" aria-hidden="true"></i> Confirmar auto-preenchimento</h3>
            <p>As observações atuais serão substituídas. <strong>Você perderá tudo o que já estava escrito.</strong> Deseja continuar?</p>
            <div class="confirm-modal-actions">
              <button type="button" class="btn btn-secondary" data-role="cancelar">Não</button>
              <button type="button" class="btn btn-primary" data-role="confirmar">Sim, substituir</button>
            </div>
          </div>
        `;

        const fechar = confirmado => {
          modal.remove();
          document.removeEventListener('keydown', onEsc);
          resolve(confirmado);
        };

        const onEsc = e => {
          if (e.key === 'Escape') fechar(false);
        };

        modal.addEventListener('click', e => {
          const role = e.target?.dataset?.role;
          if (role === 'cancelar') fechar(false);
          if (role === 'confirmar') fechar(true);
        });

        document.addEventListener('keydown', onEsc);
        document.body.appendChild(modal);
      });
    }

    function htmlParaTexto(html) {
      const temp = document.createElement('div');
      temp.innerHTML = String(html || '');
      return (temp.textContent || temp.innerText || '').trim();
    }

    function getEstadoObservacoesAtual() {
      if (window.richTextEditor && typeof window.richTextEditor.getContent === 'function') {
        const html = (window.richTextEditor.getContent() || '').trim();
        return {
          texto: htmlParaTexto(html)
        };
      }

      const observacoesInput = document.getElementById('observacoes');
      const raw = observacoesInput ? (observacoesInput.value || '') : '';
      return {
        texto: raw.replace(/<[^>]*>/g, '').trim()
      };
    }

    function observacoesTemConteudo() {
      return !!getEstadoObservacoesAtual().texto;
    }

    function normalizarTextoComparacao(valor) {
      return String(valor || '').replace(/\s+/g, ' ').trim();
    }

    function getVal(id) {
      const el = document.getElementById(id);
      if (!el) return '';
      if (el.tagName.toLowerCase() === 'select') {
        const opt = el.options[el.selectedIndex];
        if (!opt || opt.value === '' || opt.value === 'nenhum' || opt.value === 'nao' || opt.value === '-') return '';
        return opt.text.trim();
      }
      return (el.value || '').trim();
    }

    function getRaw(id) {
      const el = document.getElementById(id);
      if (!el) return '';
      return (el.value || '').trim();
    }

    function getProdutoDaTabela() {
      const rows = document.querySelectorAll('#produtosTable tr');
      if (!rows || rows.length === 0) return '';

      for (const row of rows) {
        const produtoInput = row.querySelector('.produto') || row.querySelector('.descricao');
        if (produtoInput) {
          const val = (produtoInput.value || '').trim().toUpperCase();
          if (val) return val;
        }
      }
      return '';
    }

    function atualizarObservacoes(forcar = false) {
      if (window.__preenchendoFicha) return;

      const observacoesInput = document.getElementById('observacoes');
      if (!observacoesInput) return;
      const estadoAtual = getEstadoObservacoesAtual();
      if (!forcar && bloqueioAutoPreenchimento) return;

      const produtoTabela = getProdutoDaTabela();
      const partes = [];

      const produtoCampo = getVal('produto');
      const produtoFinal = produtoTabela || produtoCampo;
      if (produtoFinal) partes.push(produtoFinal);

      const material = getVal('material');
      const corMaterial = getVal('corMaterial');
      if (material || corMaterial) {
        const detalhes = [];
        if (material) detalhes.push(material);

        const corLower = corMaterial.toLowerCase();
        if (corMaterial && corLower !== 'sublimação' && corLower !== 'sublimado') {
          detalhes.push(corMaterial);
        }

        partes.push(['TECIDO', ...detalhes].join(' ').trim());
      }

      const manga = getVal('manga');
      if (manga) {
        const detalhes = [manga];

        const acabamentoMangaRaw = getRaw('acabamentoManga');
        const acabamentoMangaText = getVal('acabamentoManga');
        const larguraManga = getVal('larguraManga');
        const corAcabManga = getVal('corAcabamentoManga');

        if (isAcabamentoMangaComExtras(acabamentoMangaRaw)) {
          const tipo = getDescricaoAcabamentoManga(acabamentoMangaRaw, acabamentoMangaText);
          let desc = `COM ${tipo}`;
          if (larguraManga) desc += ` ${larguraManga}`;
          if (corAcabManga) desc += ` ${corAcabManga}`;
          detalhes.push(desc);
        } else if (acabamentoMangaText) {
          detalhes.push(`EM ${acabamentoMangaText}`);
        }

        partes.push(`MANGA ${detalhes.join(', ')}`);
      }

      const golaRaw = getRaw('gola');
      const golaText = getVal('gola');

      if (golaRaw) {
        const isPolo = golaRaw === 'polo' || golaRaw === 'v_polo';
        const isSocial = golaRaw === 'social';

        if (!isPolo && !isSocial && golaText) {
          const detalhes = [golaText];

          const acabamentoGolaRaw = getRaw('acabamentoGola');
          const acabamentoGolaText = getVal('acabamentoGola');
          const larguraGola = getVal('larguraGola');

          if (acabamentoGolaRaw) {
            let desc = `EM ${acabamentoGolaText}`;
            if (larguraGola) desc += ` ${larguraGola}`;
            detalhes.push(desc);
          }

          const corGola = getVal('corGola');
          if (corGola) detalhes.push(corGola);

          const reforcoGola = getRaw('reforcoGola');
          const corReforco = getVal('corReforco');
          if (reforcoGola === 'sim') {
            let desc = 'COM REFORÇO';
            if (corReforco) desc += ` ${corReforco}`;
            detalhes.push(desc);
          }

          partes.push(detalhes.join(', '));

        } else if (isPolo) {
          const detalhes = [golaText];

          const corGola = getVal('corGola');
          if (corGola) detalhes.push(corGola);

          const corPeitilhoInterno = getVal('corPeitilhoInterno');
          const corPeitilhoExterno = getVal('corPeitilhoExterno');
          const corBotao = getVal('corBotao');

          if (corPeitilhoInterno && corPeitilhoExterno) {
            detalhes.push(`PEITILHO INTERNO ${corPeitilhoInterno} E EXTERNO ${corPeitilhoExterno}`);
          } else if (corPeitilhoInterno) {
            detalhes.push(`PEITILHO INTERNO ${corPeitilhoInterno}`);
          } else if (corPeitilhoExterno) {
            detalhes.push(`PEITILHO EXTERNO ${corPeitilhoExterno}`);
          }

          if (corBotao) {
            detalhes.push(`BOTÃO ${corBotao}`);
          }

          const aberturaLateral = getRaw('aberturaLateral');
          const corAberturaLateral = getVal('corAberturaLateral');
          if (aberturaLateral === 'sim') {
            let desc = 'COM ABERTURA LATERAL';
            if (corAberturaLateral) desc += ` ${corAberturaLateral}`;
            detalhes.push(desc);
          }

          const reforcoGola = getRaw('reforcoGola');
          const corReforco = getVal('corReforco');
          if (reforcoGola === 'sim') {
            let desc = 'COM REFORÇO';
            if (corReforco) desc += ` ${corReforco}`;
            detalhes.push(desc);
          }

          partes.push(detalhes.join(', '));
        } else if (isSocial && golaText) {
          const detalhes = [golaText];
          const corBotao = getVal('corBotao');

          const corPeDeGolaInterno = getVal('corPeDeGolaInterno');
          const corPeDeGolaExterno = getVal('corPeDeGolaExterno');

          if (corPeDeGolaInterno && corPeDeGolaExterno) {
            detalhes.push(`PÉ DE GOLA INTERNO ${corPeDeGolaInterno} E EXTERNO ${corPeDeGolaExterno}`);
          } else if (corPeDeGolaInterno) {
            detalhes.push(`PÉ DE GOLA INTERNO ${corPeDeGolaInterno}`);
          } else if (corPeDeGolaExterno) {
            detalhes.push(`PÉ DE GOLA EXTERNO ${corPeDeGolaExterno}`);
          }

          if (corBotao) {
            detalhes.push(`BOTÃO ${corBotao}`);
          }

          partes.push(detalhes.join(', '));
        }
      }

      const bolsoRaw = getRaw('bolso');
      const bolsoText = getVal('bolso');
      if (bolsoRaw && bolsoRaw !== 'nenhum' && bolsoText) {
        partes.push(`COM ${bolsoText}`);
      }

      const fileteRaw = getRaw('filete');
      if (fileteRaw === 'sim') {
        const detalhes = [];
        const fileteLocal = getVal('fileteLocal');
        const fileteCor = getVal('fileteCor');
        if (fileteLocal) detalhes.push(fileteLocal);
        if (fileteCor) detalhes.push(fileteCor);
        partes.push(['FILETE', ...detalhes].join(', '));
      }

      const faixaRaw = getRaw('faixa');
      if (faixaRaw === 'sim') {
        const detalhes = [];
        const faixaLocal = getVal('faixaLocal');
        const faixaCor = getVal('faixaCor');
        if (faixaLocal) detalhes.push(faixaLocal);
        if (faixaCor) detalhes.push(faixaCor);
        partes.push(['FAIXA REFLETIVA', ...detalhes].join(', '));
      }

      const arteRaw = getRaw('arte');
      const arteText = getVal('arte');
      if (arteRaw && arteText) {
        if (arteRaw === 'sem_personalizacao') {
          partes.push('SEM PERSONALIZAÇÃO');
        } else {
          partes.push(`PERSONALIZADO EM ${arteText}`);
        }
      }

      const valorComNomes = normalizarComNomesValor(getRaw('comNomes'));
      const marcadorComNomes = marcadorComNomesPorValor(valorComNomes);
      if (marcadorComNomes) {
        partes.push(marcadorComNomes);
      }

      const textoFinal = partes.length > 0
        ? partes.join(' / ').toUpperCase()
        : '';

      const textoAtualNorm = normalizarTextoComparacao(estadoAtual.texto);
      const textoGeradoNorm = normalizarTextoComparacao(textoFinal);
      const ultimoAutoNorm = normalizarTextoComparacao(ultimoTextoAuto);
      const editadoManualmente = !!textoAtualNorm
        && textoAtualNorm !== ultimoAutoNorm
        && textoAtualNorm !== textoGeradoNorm;

      if (!forcar && editadoManualmente) {
        bloqueioAutoPreenchimento = true;
        return;
      }
      if (!forcar && textoAtualNorm === textoGeradoNorm) {
        ultimoTextoAuto = textoFinal;
        return;
      }

      if (forcar) {
        bloqueioAutoPreenchimento = false;
      }

      aplicandoAutoPreenchimento = true;
      try {
        observacoesInput.value = textoFinal;
        ultimoTextoAuto = textoFinal;

        if (window.richTextEditor) {
          if (forcar && typeof window.richTextEditor.setContentWithSafeUndo === 'function') {
            window.richTextEditor.setContentWithSafeUndo(textoFinal);
          } else {
            window.richTextEditor.setContent(textoFinal);
          }
        }
      } finally {
        aplicandoAutoPreenchimento = false;
      }
    }
    const btnAutopreencherObs = document.getElementById('btnAutopreencherObservacoes');
    if (btnAutopreencherObs) {
      btnAutopreencherObs.addEventListener('click', async () => {
        if (!observacoesTemConteudo()) {
          atualizarObservacoes(true);
          return;
        }

        const confirmou = await abrirModalConfirmacaoAutopreencher();
        if (!confirmou) return;
        atualizarObservacoes(true);
      });
    }

    const comNomesSelect = document.getElementById('comNomes');
    if (comNomesSelect) {
      const valorAtualSelect = normalizarComNomesValor(comNomesSelect.value);
      const valorDetectadoPorTexto = detectarComNomesPorTexto(getEstadoObservacoesAtual().texto);
      comNomesSelect.value = valorAtualSelect !== COM_NOMES_VALOR_NENHUM
        ? valorAtualSelect
        : valorDetectadoPorTexto;

      comNomesSelect.addEventListener('change', () => {
        const observacoesInput = document.getElementById('observacoes');
        if (!observacoesInput) return;

        const estadoAtual = getEstadoObservacoesAtual();
        const textoAtual = estadoAtual.texto || '';
        const textoFinal = aplicarMarcadorComNomes(textoAtual, comNomesSelect.value);

        if (normalizarTextoComparacao(textoFinal) === normalizarTextoComparacao(textoAtual)) return;

        aplicandoAutoPreenchimento = true;
        try {
          observacoesInput.value = textoFinal;
          if (window.richTextEditor) {
            if (typeof window.richTextEditor.setContentWithSafeUndo === 'function') {
              window.richTextEditor.setContentWithSafeUndo(textoFinal);
            } else {
              window.richTextEditor.setContent(textoFinal);
            }
          }
          if (!bloqueioAutoPreenchimento) {
            ultimoTextoAuto = textoFinal;
          }
        } finally {
          aplicandoAutoPreenchimento = false;
        }
      });
    }

    // Em modo editar por ID, desabilitamos totalmente auto-preenchimento por listeners.
    // Mantemos apenas o botão "Auto-preencher" para ação explícita do usuário.
    if (modoEdicaoPorId) {
      return;
    }

    const marcarBloqueioManual = () => {
      if (aplicandoAutoPreenchimento) return;
      if (!observacoesTemConteudo()) return;
      bloqueioAutoPreenchimento = true;
    };

    const observacoesInput = document.getElementById('observacoes');
    if (observacoesInput) {
      observacoesInput.addEventListener('input', marcarBloqueioManual);
      observacoesInput.addEventListener('change', marcarBloqueioManual);
    }

    const editorEl = document.getElementById('richTextEditor');
    if (editorEl) {
      editorEl.addEventListener('input', marcarBloqueioManual);
      editorEl.addEventListener('change', marcarBloqueioManual);
    }

    const idsParaMonitorar = [
      'produto', 'material', 'corMaterial',
      'manga', 'acabamentoManga', 'larguraManga', 'corAcabamentoManga',
      'gola', 'corGola', 'acabamentoGola', 'larguraGola',
      'reforcoGola', 'corReforco', 'corBotao',
      'corPeDeGolaInterno', 'corPeDeGolaExterno',
      'corPeitilhoInterno', 'corPeitilhoExterno',
      'aberturaLateral', 'corAberturaLateral',
      'bolso',
      'filete', 'fileteLocal', 'fileteCor',
      'faixa', 'faixaLocal', 'faixaCor',
      'arte'
    ];

    idsParaMonitorar.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', atualizarObservacoes);
        el.addEventListener('change', atualizarObservacoes);
      }
    });

    const tabelaBody = document.getElementById('produtosTable');
    if (tabelaBody) {
      const observer = new MutationObserver(() => {
        tabelaBody.querySelectorAll('.produto, .descricao').forEach(input => {
          if (!input.dataset.obsLinked) {
            input.dataset.obsLinked = 'true';
            input.addEventListener('input', atualizarObservacoes);
            input.addEventListener('change', atualizarObservacoes);
          }
        });
        atualizarObservacoes();
      });

      observer.observe(tabelaBody, { childList: true, subtree: true });

      tabelaBody.querySelectorAll('.produto, .descricao').forEach(input => {
        input.dataset.obsLinked = 'true';
        input.addEventListener('input', atualizarObservacoes);
        input.addEventListener('change', atualizarObservacoes);
      });
    }
  }


  window.gerarVersaoImpressao = gerarVersaoImpressao;
  window.salvarFicha = salvarFicha;
  window.carregarFichaDeArquivo = carregarFichaDeArquivo;
  window.coletarFicha = coletarFicha;
  window.preencherFicha = preencherFicha;
  window.setFichaVisualizacaoData = setFichaVisualizacaoDireta;
  window.getFichaVisualizacaoData = getFichaVisualizacaoDireta;

  // Prevenção de Reloads
  (function () {
    let dadosNaoSalvos = false;
    const params = new URLSearchParams(window.location.search);
    const modoSomenteLeitura = params.has('visualizar') || params.get('preview') === 'impressao';

    function marcarDadosNaoSalvos() {
      dadosNaoSalvos = true;
    }

    function limparDadosNaoSalvos() {
      dadosNaoSalvos = false;
    }

    window.onbeforeunload = function (evento) {
      if (modoSomenteLeitura) return undefined;
      if (dadosNaoSalvos) {
        const mensagem = "Você tem alterações não salvas. Se sair agora, perderá todas as modificações.";
        evento.returnValue = mensagem;
        return mensagem;
      }
    };

    function monitorarCampos() {
      if (modoSomenteLeitura) return;
      document.querySelectorAll('input:not([type="submit"]):not([type="button"]), textarea, select, [contenteditable="true"]')
        .forEach(campo => {
          campo.addEventListener('input', marcarDadosNaoSalvos);
          campo.addEventListener('change', marcarDadosNaoSalvos);
        });
    }

    function inicializar() {
      monitorarCampos();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', inicializar);
    } else {
      inicializar();
    }

    window.prevenirSaidaSemSalvar = {
      marcarDadosNaoSalvos,
      limparDadosNaoSalvos
    };
  })();

})();
