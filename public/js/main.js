(function () {
  'use strict';

  const CATALOG_URL = 'data/catalogo.json';
  const MAX_IMAGES = 4;

  let catalog = {
    tamanhos: [],
    produtos: [],
    cores: [],
    fileteLocal: [],
    larguras: [],
    materiais: []
  };

  let imagens = [];

  // ==================== CLOUDINARY CONFIG ====================
  let cloudinaryConfig = null;

  async function loadCloudinaryConfig() {
    try {
      const response = await fetch('/api/cloudinary/config');
      if (response.ok) {
        cloudinaryConfig = await response.json();
        console.log('✅ Cloudinary configurado:', cloudinaryConfig.cloudName);
      }
    } catch (error) {
      console.warn('⚠️ Cloudinary não disponível, usando base64');
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
      console.log('✅ Imagem enviada ao Cloudinary:', result.public_id);

      return {
        success: true,
        url: result.secure_url,
        publicId: result.public_id,
        isBase64: false
      };
    } catch (error) {
      console.error('❌ Erro no upload Cloudinary:', error);
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
    initArtColorControls();
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

  function initCatalogInUI() {
    preencherProdutosList();
    preencherMateriaisDatalist();
    preencherTamanhosDatalist();
    preencherCoresDatalist();
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
    catalog.cores.forEach(tam => {
      const opt = document.createElement('option');
      opt.value = tam;
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
    const dataEntrega = document.getElementById('dataEntrega');

    const hojeStr = hoje.getFullYear() + '-' +
      String(hoje.getMonth() + 1).padStart(2, '0') + '-' +
      String(hoje.getDate()).padStart(2, '0');

    if (dataInicio && !dataInicio.value) {
      dataInicio.value = hojeStr;
    }

    if (dataEntrega && !dataEntrega.value) {
      const umaSemanaDepois = new Date(hoje);
      umaSemanaDepois.setDate(hoje.getDate() + 7);

      const entregaStr = umaSemanaDepois.getFullYear() + '-' +
        String(umaSemanaDepois.getMonth() + 1).padStart(2, '0') + '-' +
        String(umaSemanaDepois.getDate()).padStart(2, '0');

      dataEntrega.value = entregaStr;
    }
  }

  function initEventoAlert() {
    const eventoSelect = document.getElementById('evento');
    const alertDiv = document.getElementById('eventoAlert');
    if (!eventoSelect || !alertDiv) return;

    function atualizar() {
      alertDiv.style.display = eventoSelect.value === 'sim' ? 'flex' : 'none';
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
        prazoInfo.style.display = 'flex';
      } else if (diffDays === 0) {
        prazoTexto.textContent = 'Entrega no mesmo dia!';
        prazoInfo.className = 'prazo-info urgente';
        prazoInfo.style.display = 'flex';
      } else if (diffDays <= 3) {
        prazoTexto.textContent = `Prazo curto: ${diffDays} dia${diffDays > 1 ? 's' : ''} para produção`;
        prazoInfo.className = 'prazo-info urgente';
        prazoInfo.style.display = 'flex';
      } else {
        prazoTexto.textContent = `Prazo: ${diffDays} dia${diffDays > 1 ? 's' : ''} para produção`;
        prazoInfo.className = 'prazo-info';
        prazoInfo.style.display = 'flex';
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
      const inputDescricao = row.querySelector('.descricao');

      if (produto) {
        if (inputQuantidade) inputQuantidade.value = produto.quantidade || 1;
        if (inputDescricao) inputDescricao.value = produto.descricao || '';
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
        const descricao = row.querySelector('.descricao')?.value || '';
        adicionarLinhaProduto({ tamanho, quantidade, descricao });
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

  function atualizarTotalItens() {
    const quantities = document.querySelectorAll('#produtosTable .quantidade');
    let total = 0;
    quantities.forEach(input => {
      const n = parseInt(input.value, 10);
      if (!Number.isNaN(n) && n > 0) total += n;
    });
    const totalSpan = document.getElementById('totalItens');
    if (totalSpan) totalSpan.textContent = total;
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
    const aberturaLateralContainer = document.getElementById('aberturaLateralContainer');
    const aberturaLateral = document.getElementById('aberturaLateral');
    const corAberturaLateralContainer = document.getElementById('corAberturaLateralContainer');

    function atualizarCamposGola() {
      const gola = tipoGola?.value || '';
      const isPolo = gola === 'polo' || gola === 'v_polo';
      const temGola = gola !== '';

      if (corGolaContainer) {
        corGolaContainer.style.display = temGola ? 'block' : 'none';
      }

      if (acabamentoGolaContainer) {
        acabamentoGolaContainer.style.display = isPolo ? 'none' : 'block';
      }
      if (larguraGolaContainer) {
        const acabamento = acabamentoGola?.value || '';
        larguraGolaContainer.style.display = (!isPolo && acabamento) ? 'block' : 'none';
      }

      if (reforcoGolaContainer) {
        reforcoGolaContainer.style.display = temGola ? 'block' : 'none';
      }

      if (corPeitilhoInternoContainer) {
        corPeitilhoInternoContainer.style.display = isPolo ? 'block' : 'none';
      }
      if (corPeitilhoExternoContainer) {
        corPeitilhoExternoContainer.style.display = isPolo ? 'block' : 'none';
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
      const acabamento = acabamentoGola?.value || '';

      if (larguraGolaContainer) {
        larguraGolaContainer.style.display = (!isPolo && acabamento) ? 'block' : 'none';
      }
    }

    function atualizarCorReforco() {
      const reforcoMarcado = reforcoGola?.value === 'sim';
      if (corReforcoContainer) {
        corReforcoContainer.style.display = reforcoMarcado ? 'block' : 'none';
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

  function initArtColorControls() {
    const arteSelect = document.getElementById('arte');
    const corContainer = document.getElementById('corContainer');
    const corInput = document.getElementById('cor');
    const corPreview = document.getElementById('corPreview');
    if (!arteSelect || !corContainer || !corInput || !corPreview) return;

    function atualizarVisibilidade() {
      const v = arteSelect.value || '';
      const mostrar = v.includes('sublimacao');
      corContainer.style.display = mostrar ? 'flex' : 'none';
    }

    arteSelect.addEventListener('change', atualizarVisibilidade);
    atualizarVisibilidade();

    corInput.addEventListener('input', () => {
      corPreview.style.backgroundColor = corInput.value;
    });
    corPreview.style.backgroundColor = corInput.value;
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
            console.log('📋 Imagem colada, fazendo upload...');
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
    const produtos = [];
    document.querySelectorAll('#produtosTable tr').forEach(row => {
      const tamanho = row.querySelector('.tamanho')?.value || '';
      const quantidade = row.querySelector('.quantidade')?.value || '';
      const descricao = row.querySelector('.descricao')?.value || '';
      if (!tamanho && !descricao) return;
      produtos.push({ tamanho, quantidade, descricao });
    });

    const arteVal = document.getElementById('arte')?.value || '';
    const corSublimacao = arteVal.includes('sublimacao') ? document.getElementById('cor')?.value || null : null;

    const acabamentoMangaVal = document.getElementById('acabamentoManga')?.value || '';
    const temAcabamentoManga = isAcabamentoMangaComExtras(acabamentoMangaVal);
    const larguraManga = temAcabamentoManga ? (document.getElementById('larguraManga')?.value || '') : '';
    const corAcabamentoManga = temAcabamentoManga ? (document.getElementById('corAcabamentoManga')?.value || '') : '';

    const golaVal = document.getElementById('gola')?.value || '';
    const isPolo = golaVal === 'polo' || golaVal === 'v_polo';
    const temGola = golaVal !== '';

    const corGola = temGola ? (document.getElementById('corGola')?.value || '') : '';
    const acabamentoGolaVal = isPolo ? '' : (document.getElementById('acabamentoGola')?.value || '');
    const larguraGola = (!isPolo && acabamentoGolaVal) ? (document.getElementById('larguraGola')?.value || '') : '';

    const reforcoGolaVal = temGola ? (document.getElementById('reforcoGola')?.value || 'nao') : 'nao';
    const corReforco = reforcoGolaVal === 'sim' ? (document.getElementById('corReforco')?.value || '') : '';

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
      composicao: document.getElementById('composicao')?.value || '',
      corSublimacao,
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
        } catch (err) {
          alert('❌ Erro ao ler arquivo JSON.');
        }
      };
      reader.readAsText(file, 'UTF-8');
    };

    input.click();
  }

  window.carregarFichaDeArquivo = carregarFichaDeArquivo;

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

    document.getElementById('arte')?.dispatchEvent(new Event('change'));
    document.getElementById('material')?.dispatchEvent(new Event('input'));
    document.getElementById('acabamentoManga')?.dispatchEvent(new Event('change'));
    document.getElementById('acabamentoGola')?.dispatchEvent(new Event('change'));

    if (ficha.corSublimacao) {
      const corInput = document.getElementById('cor');
      const corPreview = document.getElementById('corPreview');
      if (corInput && corPreview) {
        corInput.value = ficha.corSublimacao;
        corPreview.style.backgroundColor = ficha.corSublimacao;
      }
    }

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

  function initPrint() {
    const btn = document.getElementById('btnImprimir');
    btn?.addEventListener('click', gerarVersaoImpressao);
  }

  function formatarDataBrasil(dataISO) {
    if (!dataISO) return '';
    const [ano, mes, dia] = dataISO.split('-');
    return `${dia}/${mes}/${ano}`;
  }

  function gerarVersaoImpressao(apenasPreview = false) {
    const paramsUrl = new URLSearchParams(window.location.search);
    const manterVersaoImpressao = paramsUrl.has('visualizar');
    const hoje = new Date();
    const dataEmissao = hoje.toLocaleDateString('pt-BR') + ' ' + hoje.toLocaleTimeString('pt-BR');
    const isEvento = document.getElementById('evento')?.value === 'sim';

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
          el.innerHTML = `<mark>${text}</mark>`;
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

    const getSelectText = id => {
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

    const getInputValue = id => {
      try {
        const el = document.getElementById(id);
        return el ? (el.value || '') : '';
      } catch (error) {
        console.error('Erro em getInputValue:', id, error);
        return '';
      }
    };

    setText('print-dataEmissao', dataEmissao);
    setText('print-numeroVenda', getInputValue('numeroVenda'), '-');
    setText('print-cliente', getInputValue('cliente'), '-');
    setText('print-vendedor', getInputValue('vendedor'), '-');

    setTextWithHighlight('print-dataInicio', formatarDataBrasil(getInputValue('dataInicio')), isEvento, '-');
    setTextWithHighlight('print-dataEntrega', formatarDataBrasil(getInputValue('dataEntrega')), isEvento, '-');

    const eventoEl = document.getElementById('print-evento');
    if (eventoEl) {
      if (isEvento) {
        eventoEl.innerHTML = '<span style="color: #dc2626; font-weight: bold;">★ Sim ★</span>';
      } else {
        eventoEl.textContent = 'Não';
      }
    }

    const dataEntregaVal = getInputValue('dataEntrega');
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

    const printBody = document.getElementById('print-produtosTable');
    if (printBody) {
      printBody.innerHTML = '';
      document.querySelectorAll('#produtosTable tr').forEach(row => {
        const tamanho = row.querySelector('.tamanho')?.value;
        const quantidade = row.querySelector('.quantidade')?.value;
        const descricao = row.querySelector('.descricao')?.value;
        if (!tamanho && !quantidade) return;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${tamanho || '-'}</td>
          <td>${quantidade || '-'}</td>
          <td>${descricao || '-'}</td>
        `;
        printBody.appendChild(tr);
      });
    }

    setText('print-totalItens', document.getElementById('totalItens')?.textContent || '0', '0');

    const materialVal = getInputValue('material');
    setText('print-material', materialVal, '-');

    const corMaterialVal = getInputValue('corMaterial');
    setText('print-corMaterial', corMaterialVal, '-');

    const mangaText = getSelectText('manga');
    setText('print-manga', mangaText, '-');

    const acabamentoMangaText = getSelectText('acabamentoManga');
    setText('print-acabamentoManga', acabamentoMangaText, '-');

    const acabamentoMangaVal = getInputValue('acabamentoManga');
    const temAcabamentoMangaExtra = isAcabamentoMangaComExtras(acabamentoMangaVal);

    const larguraMangaVal = getInputValue('larguraManga');
    setText('print-larguraManga', larguraMangaVal);
    showDiv('print-larguraMangaDiv', temAcabamentoMangaExtra && !!larguraMangaVal);

    const corAcabamentoMangaVal = getInputValue('corAcabamentoManga');
    setText('print-corAcabamentoManga', corAcabamentoMangaVal);
    showDiv('print-corAcabamentoMangaDiv', temAcabamentoMangaExtra && !!corAcabamentoMangaVal);

    const golaVal = getInputValue('gola');
    const golaText = getSelectText('gola');
    const isPolo = golaVal === 'polo' || golaVal === 'v_polo';
    const temGola = golaVal !== '';

    setText('print-gola', golaText, '-');

    const corGolaVal = getInputValue('corGola');
    setText('print-corGola', corGolaVal);
    showDiv('print-corGolaDiv', temGola && !!corGolaVal);

    const acabamentoGolaText = getSelectText('acabamentoGola');
    setText('print-acabamentoGola', acabamentoGolaText);
    showDiv('print-acabamentoGolaDiv', !isPolo && !!acabamentoGolaText);

    const larguraGolaVal = getInputValue('larguraGola');
    setText('print-larguraGola', larguraGolaVal);
    showDiv('print-larguraGolaDiv', !isPolo && !!larguraGolaVal);

    const reforcoGolaVal = document.getElementById('reforcoGola')?.value || 'nao';
    const temReforco = temGola && reforcoGolaVal === 'sim';
    setText('print-reforcoGola', temReforco ? 'Sim' : '');
    showDiv('print-reforcoGolaDiv', temReforco);

    const corReforcoVal = getInputValue('corReforco');
    setText('print-corReforco', corReforcoVal);
    showDiv('print-corReforcoDiv', temReforco && !!corReforcoVal);

    const corPeitilhoInternoVal = getInputValue('corPeitilhoInterno');
    setText('print-corPeitilhoInterno', corPeitilhoInternoVal);
    showDiv('print-corPeitilhoInternoDiv', isPolo && !!corPeitilhoInternoVal);

    const corPeitilhoExternoVal = getInputValue('corPeitilhoExterno');
    setText('print-corPeitilhoExterno', corPeitilhoExternoVal);
    showDiv('print-corPeitilhoExternoDiv', isPolo && !!corPeitilhoExternoVal);

    const aberturaLateralVal = document.getElementById('aberturaLateral')?.value || 'nao';
    const temAbertura = isPolo && aberturaLateralVal === 'sim';
    setText('print-aberturaLateral', temAbertura ? 'Sim' : '');
    showDiv('print-aberturaLateralDiv', temAbertura);

    const corAberturaLateralVal = getInputValue('corAberturaLateral');
    setText('print-corAberturaLateral', corAberturaLateralVal);
    showDiv('print-corAberturaLateralDiv', temAbertura && !!corAberturaLateralVal);

    const bolsoText = getSelectText('bolso');
    setText('print-bolso', bolsoText, '-');

    const fileteVal = document.getElementById('filete')?.value || 'nao';
    const temFilete = fileteVal === 'sim';
    setText('print-filete', temFilete ? 'Sim' : 'Não');

    const fileteLocalVal = getInputValue('fileteLocal');
    setText('print-fileteLocal', fileteLocalVal);
    showDiv('print-fileteLocalDiv', temFilete && !!fileteLocalVal);

    const fileteCorVal = getInputValue('fileteCor');
    setText('print-fileteCor', fileteCorVal);
    showDiv('print-fileteCorDiv', temFilete && !!fileteCorVal);

    const faixaVal = document.getElementById('faixa')?.value || 'nao';
    const temFaixa = faixaVal === 'sim';
    setText('print-faixa', temFaixa ? 'Sim' : 'Não');

    const faixaLocalVal = getInputValue('faixaLocal');
    setText('print-faixaLocal', faixaLocalVal);
    showDiv('print-faixaLocalDiv', temFaixa && !!faixaLocalVal);

    const faixaCorVal = getInputValue('faixaCor');
    setText('print-faixaCor', faixaCorVal);
    showDiv('print-faixaCorDiv', temFaixa && !!faixaCorVal);

    const arteText = getSelectText('arte');
    setText('print-arte', arteText, '-');

    const composicaoVal = getInputValue('composicao');
    setText('print-composicao', composicaoVal, '-');

    const printObservacoesEl = document.getElementById('print-observacoes');
    if (printObservacoesEl) {
      if (window.richTextEditor) {
        const htmlContent = window.richTextEditor.getContent();
        printObservacoesEl.innerHTML = htmlContent || 'Nenhuma';
      } else {
        const observacoesVal = getInputValue('observacoes');
        printObservacoesEl.innerHTML = observacoesVal || 'Nenhuma';
      }
    }

    const printImagesContainer = document.getElementById('print-imagesContainer');
    const printImagesSection = document.getElementById('print-imagesSection');
    const imgs = window.getImagens ? window.getImagens() : [];

    if (printImagesContainer) {
      printImagesContainer.innerHTML = '';
      printImagesContainer.classList.toggle('compact-four', imgs.length === MAX_IMAGES);

      if (imgs.length === 0) {
        if (printImagesSection) printImagesSection.style.display = 'none';
      } else {
        if (printImagesSection) printImagesSection.style.display = 'block';

        imgs.forEach((img, index) => {
          const div = document.createElement('div');
          div.className = imgs.length === 1 ? 'print-image-item single' : 'print-image-item';

          div.innerHTML = `
            <img src="${img.src}" alt="Imagem ${index + 1}">
            ${img.descricao ? `<div class="print-image-description">${img.descricao}</div>` : ''}
          `;

          printImagesContainer.appendChild(div);
        });
      }
    }

    const normal = document.getElementById('normal-version');
    const printV = document.getElementById('print-version');

    if (normal && printV) {
      normal.style.display = 'none';
      printV.style.display = 'block';

      if (apenasPreview) {
        document.body.classList.add('preview-impressao');
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
          document.body.classList.remove('preview-impressao');
        }, 100);
      }
    } else if (!apenasPreview) {
      window.print();
    }
  }

  function initObservacoesAutoFill() {
    let ultimoTextoAuto = '';

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
        const descInput = row.querySelector('.descricao');
        if (descInput) {
          const val = (descInput.value || '').trim().toUpperCase();
          if (val) return val;
        }
      }
      return '';
    }

    function atualizarObservacoes() {
      if (window.__preenchendoFicha) return;

      const observacoesInput = document.getElementById('observacoes');
      if (!observacoesInput) return;
      const textoAtual = (observacoesInput.value || '').trim();
      const podeSobrescrever = !textoAtual || textoAtual === ultimoTextoAuto;

      const produtoTabela = getProdutoDaTabela();

      const partes = [];

      const produtoCampo = getVal('produto');
      const produtoFinal = produtoTabela || produtoCampo;
      if (produtoFinal) partes.push(produtoFinal);

      const material = getVal('material');
      const corMaterial = getVal('corMaterial');

      if (material || corMaterial) {
        let bloco = 'TECIDO';

        if (material) bloco += ` ${material}`;

        const corLower = corMaterial.toLowerCase();
        if (corMaterial && corLower !== 'sublimação' && corLower !== 'sublimado') {
          bloco += ` ${corMaterial}`;
        }

        partes.push(bloco.trim());
      }

      const manga = getVal('manga');
      if (manga) {
        let bloco = `MANGA ${manga}`;

        const acabamentoMangaRaw = getRaw('acabamentoManga');
        const acabamentoMangaText = getVal('acabamentoManga');
        const larguraManga = getVal('larguraManga');
        const corAcabManga = getVal('corAcabamentoManga');

        if (isAcabamentoMangaComExtras(acabamentoMangaRaw)) {
          const tipo = getDescricaoAcabamentoManga(acabamentoMangaRaw, acabamentoMangaText);
          bloco += ` COM ${tipo}`;
          if (larguraManga) bloco += ` ${larguraManga}`;
          if (corAcabManga) bloco += ` ${corAcabManga}`;
        } else if (acabamentoMangaText) {
          bloco += ` EM ${acabamentoMangaText}`;
        }

        partes.push(bloco);
      }

      const golaRaw = getRaw('gola');
      const golaText = getVal('gola');

      if (golaRaw) {
        const isPolo = golaRaw === 'polo' || golaRaw === 'v_polo';

        if (!isPolo && golaText) {
          let bloco = golaText;

          const corGola = getVal('corGola');
          if (corGola) bloco += ` ${corGola}`;

          const acabamentoGolaRaw = getRaw('acabamentoGola');
          const acabamentoGolaText = getVal('acabamentoGola');
          const larguraGola = getVal('larguraGola');

          if (acabamentoGolaRaw) {
            bloco += ` EM ${acabamentoGolaText}`;
            if (larguraGola) bloco += ` ${larguraGola}`;
          }

          const reforcoGola = getRaw('reforcoGola');
          const corReforco = getVal('corReforco');
          if (reforcoGola === 'sim') {
            bloco += ` COM REFORÇO`;
            if (corReforco) bloco += ` ${corReforco}`;
          }

          partes.push(bloco);

        } else if (isPolo) {
          let bloco = golaText;

          const corGola = getVal('corGola');
          if (corGola) bloco += ` ${corGola}`;

          const corPeitilhoInterno = getVal('corPeitilhoInterno');
          const corPeitilhoExterno = getVal('corPeitilhoExterno');

          if (corPeitilhoInterno && corPeitilhoExterno) {
            bloco += ` PEITILHO INTERNO ${corPeitilhoInterno} E EXTERNO ${corPeitilhoExterno}`;
          } else if (corPeitilhoInterno) {
            bloco += ` PEITILHO INTERNO ${corPeitilhoInterno}`;
          } else if (corPeitilhoExterno) {
            bloco += ` PEITILHO EXTERNO ${corPeitilhoExterno}`;
          }

          const aberturaLateral = getRaw('aberturaLateral');
          const corAberturaLateral = getVal('corAberturaLateral');
          if (aberturaLateral === 'sim') {
            bloco += ` COM ABERTURA LATERAL`;
            if (corAberturaLateral) bloco += ` ${corAberturaLateral}`;
          }

          const reforcoGola = getRaw('reforcoGola');
          const corReforco = getVal('corReforco');
          if (reforcoGola === 'sim') {
            bloco += ` COM REFORÇO`;
            if (corReforco) bloco += ` ${corReforco}`;
          }

          partes.push(bloco);
        }
      }

      const bolsoRaw = getRaw('bolso');
      const bolsoText = getVal('bolso');
      if (bolsoRaw && bolsoRaw !== 'nenhum' && bolsoText) {
        partes.push(`COM ${bolsoText}`);
      }

      const fileteRaw = getRaw('filete');
      if (fileteRaw === 'sim') {
        let bloco = 'FILETE';
        const fileteLocal = getVal('fileteLocal');
        const fileteCor = getVal('fileteCor');
        if (fileteLocal) bloco += ` ${fileteLocal}`;
        if (fileteCor) bloco += ` ${fileteCor}`;
        partes.push(bloco);
      }

      const faixaRaw = getRaw('faixa');
      if (faixaRaw === 'sim') {
        let bloco = 'FAIXA';
        const faixaLocal = getVal('faixaLocal');
        const faixaCor = getVal('faixaCor');
        if (faixaLocal) bloco += ` ${faixaLocal}`;
        if (faixaCor) bloco += ` ${faixaCor}`;
        partes.push(bloco);
      }

      const arteRaw = getRaw('arte');
      const arteText = getVal('arte');
      if (arteRaw && arteText) {
        partes.push(`PERSONALIZADO EM ${arteText}`);
      }

      const textoFinal = partes.length > 0
        ? partes.join(' / ').toUpperCase()
        : '';

      if (!podeSobrescrever) return;
      observacoesInput.value = textoFinal;
      ultimoTextoAuto = textoFinal;

      if (window.richTextEditor) {
        window.richTextEditor.setContent(textoFinal);
      }
    }

    const idsParaMonitorar = [
      'produto', 'material', 'corMaterial',
      'manga', 'acabamentoManga', 'larguraManga', 'corAcabamentoManga',
      'gola', 'corGola', 'acabamentoGola', 'larguraGola',
      'reforcoGola', 'corReforco',
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
        tabelaBody.querySelectorAll('.descricao').forEach(input => {
          if (!input.dataset.obsLinked) {
            input.dataset.obsLinked = 'true';
            input.addEventListener('input', atualizarObservacoes);
            input.addEventListener('change', atualizarObservacoes);
          }
        });
        atualizarObservacoes();
      });

      observer.observe(tabelaBody, { childList: true, subtree: true });

      tabelaBody.querySelectorAll('.descricao').forEach(input => {
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


