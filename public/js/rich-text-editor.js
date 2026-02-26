(function () {
  'use strict';

  let editor = null;
  let currentColor = '';
  let safeUndoHtml = null;
  let lastSafeAutoFillHtml = null;
  let pendingSafeUndo = false;
  const RTE_SWATCHES = [
    { token: '--color-dark-1', title: 'Preto' },
    { token: '--color-danger', title: 'Vermelho' },
    { token: '--color-warning', title: 'Laranja' },
    { token: '--color-warning', title: 'Amarelo Escuro' },
    { token: '--color-success', title: 'Verde' },
    { token: '--color-primary-main', title: 'Ciano' },
    { token: '--color-primary-main', title: 'Azul' },
    { token: '--color-primary-darker', title: 'Roxo' },
    { token: '--color-danger', title: 'Magenta' },
    { token: '--color-danger', title: 'Rosa' },
    { token: '--color-dark-3', title: 'Cinza' },
    { token: '--color-white', title: 'Branco', borderToken: '--color-light-1' }
  ];

  function getCssVar(token, fallback = '') {
    const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    return value || fallback;
  }

  function initRichTextEditor() {
    const observacoesContainer = document.querySelector('.form-group:has(#observacoes)');
    if (!observacoesContainer) return;

    const oldTextarea = document.getElementById('observacoes');
    if (!oldTextarea) return;

    // Salvar conteúdo antigo se existir
    const oldContent = oldTextarea.value;

    // Criar estrutura do editor
    currentColor = getCssVar('--color-dark-1', getCssVar('--color-dark-1', 'black'));
    const wrapper = document.createElement('div');
    wrapper.className = 'rich-text-wrapper';
    wrapper.innerHTML = `
      <div class="rich-text-toolbar">
        <div class="rich-text-toolbar-group">
          <button type="button" class="toolbar-btn" data-command="bold" title="Negrito (Ctrl+B)">
            <i class="fas fa-bold"></i>
          </button>
          <button type="button" class="toolbar-btn" data-command="italic" title="Itálico (Ctrl+I)">
            <i class="fas fa-italic"></i>
          </button>
          <button type="button" class="toolbar-btn" data-command="underline" title="Sublinhado (Ctrl+U)">
            <i class="fas fa-underline"></i>
          </button>
          <button type="button" class="toolbar-btn" data-command="strikeThrough" title="Tachado">
            <i class="fas fa-strikethrough"></i>
          </button>
        </div>
        
        <div class="rich-text-toolbar-group">
          <div class="color-picker-wrapper">
            <button type="button" class="toolbar-btn color-btn" id="colorPickerBtn" title="Cor do texto">
              <i class="fas fa-palette"></i>
              <span class="color-indicator" id="colorIndicator"></span>
            </button>
            <div class="color-palette-dropdown" id="colorPaletteDropdown">
              <div class="color-palette-header">
                <span>Cores Rápidas</span>
                <button type="button" class="color-palette-close" title="Fechar">
                  <i class="fas fa-times"></i>
                </button>
              </div>
              <div class="color-palette-grid" id="colorPaletteGrid"></div>
              <div class="color-palette-divider"></div>
              <div class="color-palette-custom">
                <label for="textColorPicker" class="custom-color-label">
                  <i class="fas fa-eye-dropper"></i>
                  Cor personalizada
                </label>
                <input type="color" class="color-picker-input" id="textColorPicker" value="${currentColor}">
              </div>
            </div>
          </div>
          <button type="button" class="toolbar-btn" data-command="removeFormat" title="Limpar formatação">
            <i class="fas fa-remove-format"></i>
          </button>
        </div>
        
        <div class="rich-text-toolbar-group">
          <button type="button" class="toolbar-btn" data-command="insertUnorderedList" title="Lista com marcadores">
            <i class="fas fa-list-ul"></i>
          </button>
          <button type="button" class="toolbar-btn" data-command="insertOrderedList" title="Lista numerada">
            <i class="fas fa-list-ol"></i>
          </button>
        </div>
        
        <div class="rich-text-toolbar-group">
          <button type="button" class="toolbar-btn" data-command="undo" title="Desfazer (Ctrl+Z)">
            <i class="fas fa-undo"></i>
          </button>
          <button type="button" class="toolbar-btn" data-command="redo" title="Refazer (Ctrl+Y)">
            <i class="fas fa-redo"></i>
          </button>
        </div>
      </div>
      
      <div class="rich-text-editor" 
           contenteditable="true" 
           id="richTextEditor"
           data-placeholder="Ex: Algumas camisetas com manga longa, outras com manga curta..."
           spellcheck="true">
      </div>
    `;

    // Substituir textarea pelo editor
    oldTextarea.style.display = 'none';
    observacoesContainer.appendChild(wrapper);

    editor = document.getElementById('richTextEditor');
    const colorPicker = document.getElementById('textColorPicker');
    const colorIndicator = document.getElementById('colorIndicator');
    const colorPickerBtn = document.getElementById('colorPickerBtn');
    const colorPaletteDropdown = document.getElementById('colorPaletteDropdown');
    const colorPaletteGrid = document.getElementById('colorPaletteGrid');
    colorIndicator.style.backgroundColor = currentColor;
    colorPicker.value = currentColor;

    if (colorPaletteGrid) {
      colorPaletteGrid.innerHTML = '';
      RTE_SWATCHES.forEach((swatchDef) => {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = 'color-swatch';
        swatch.title = swatchDef.title;
        swatch.dataset.token = swatchDef.token;
        const resolvedColor = getCssVar(swatchDef.token, getCssVar('--color-dark-1', 'black'));
        swatch.dataset.color = resolvedColor;
        swatch.style.background = `var(${swatchDef.token})`;
        if (swatchDef.borderToken) {
          swatch.style.borderColor = `var(${swatchDef.borderToken})`;
        }
        colorPaletteGrid.appendChild(swatch);
      });
    }

    // Se havia conteúdo antigo em texto puro, converter
    if (oldContent) {
      // Tentar detectar se é HTML ou texto puro
      if (oldContent.includes('<') && oldContent.includes('>')) {
        editor.innerHTML = oldContent;
      } else {
        editor.innerHTML = oldContent.replace(/\n/g, '<br>');
      }
    }

    // Event listeners para os botões
    wrapper.querySelectorAll('.toolbar-btn[data-command]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const command = btn.dataset.command;
        executeCommand(command);
        updateToolbarState();
      });
    });

    // Toggle paleta de cores
    let isPaletteOpen = false;
    
    colorPickerBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      isPaletteOpen = !isPaletteOpen;
      colorPaletteDropdown.classList.toggle('show', isPaletteOpen);
    });

    // Fechar paleta ao clicar no X
    const closeBtn = colorPaletteDropdown.querySelector('.color-palette-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        isPaletteOpen = false;
        colorPaletteDropdown.classList.remove('show');
      });
    }

    // Fechar paleta ao clicar fora
    document.addEventListener('click', (e) => {
      if (isPaletteOpen && !colorPaletteDropdown.contains(e.target) && e.target !== colorPickerBtn) {
        isPaletteOpen = false;
        colorPaletteDropdown.classList.remove('show');
      }
    });

    // Color swatches - cores predefinidas
    colorPaletteDropdown.querySelectorAll('.color-swatch').forEach(swatch => {
      swatch.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const token = swatch.dataset.token;
        const color = token ? getCssVar(token, swatch.dataset.color || getCssVar('--color-dark-1', 'black')) : swatch.dataset.color;
        currentColor = color;
        colorIndicator.style.backgroundColor = color;
        colorPicker.value = color;
        executeCommand('foreColor', color);
        
        // Fechar paleta após selecionar
        isPaletteOpen = false;
        colorPaletteDropdown.classList.remove('show');
      });
    });

    // Color picker customizado
    colorPicker.addEventListener('input', (e) => {
      currentColor = e.target.value;
      colorIndicator.style.backgroundColor = currentColor;
      executeCommand('foreColor', currentColor);
    });

    // Também aplicar ao mudar (quando fechar o picker)
    colorPicker.addEventListener('change', (e) => {
      isPaletteOpen = false;
      colorPaletteDropdown.classList.remove('show');
    });

    // Atualizar estado da toolbar ao selecionar texto
    editor.addEventListener('mouseup', updateToolbarState);
    editor.addEventListener('keyup', updateToolbarState);
    editor.addEventListener('focus', updateToolbarState);

    // Sincronizar com textarea oculto
    editor.addEventListener('input', () => {
      oldTextarea.value = editor.innerHTML;
    });

    // Atalhos de teclado
    editor.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'b':
            e.preventDefault();
            executeCommand('bold');
            break;
          case 'i':
            e.preventDefault();
            executeCommand('italic');
            break;
          case 'u':
            e.preventDefault();
            executeCommand('underline');
            break;
          case 'z':
            if (e.shiftKey) {
              e.preventDefault();
              executeCommand('redo');
            } else {
              e.preventDefault();
              executeCommand('undo');
            }
            break;
          case 'y':
            e.preventDefault();
            executeCommand('redo');
            break;
        }
        updateToolbarState();
      }
    });

    // Prevenir que cole conteúdo com formatação externa excessiva
    editor.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      document.execCommand('insertHTML', false, text.replace(/\n/g, '<br>'));
    });

    // Manter referência global para acesso externo
    window.richTextEditor = {
      getContent: () => editor.innerHTML,
      setContent: (html) => {
        pendingSafeUndo = false;
        safeUndoHtml = null;
        lastSafeAutoFillHtml = null;
        editor.innerHTML = html;
        oldTextarea.value = html;
      },
      setContentWithSafeUndo: (html) => {
        safeUndoHtml = editor.innerHTML;
        lastSafeAutoFillHtml = html;
        pendingSafeUndo = true;
        editor.innerHTML = html;
        oldTextarea.value = html;
      },
      getPlainText: () => editor.innerText
    };
  }

  function tryApplySafeUndo() {
    if (!pendingSafeUndo) return false;

    const current = (editor?.innerHTML || '').trim();
    const autoFill = (lastSafeAutoFillHtml || '').trim();
    if (current !== autoFill) return false;

    editor.innerHTML = safeUndoHtml || '';

    const oldTextarea = document.getElementById('observacoes');
    if (oldTextarea) oldTextarea.value = editor.innerHTML;

    pendingSafeUndo = false;
    safeUndoHtml = null;
    lastSafeAutoFillHtml = null;

    editor.classList.add('format-applied');
    setTimeout(() => editor.classList.remove('format-applied'), 300);
    return true;
  }

  function executeCommand(command, value = null) {
    editor.focus();
    if (command === 'undo' && tryApplySafeUndo()) return;
    document.execCommand(command, false, value);
    editor.classList.add('format-applied');
    setTimeout(() => editor.classList.remove('format-applied'), 300);
  }

  function updateToolbarState() {
    const buttons = document.querySelectorAll('.toolbar-btn[data-command]');
    
    buttons.forEach(btn => {
      const command = btn.dataset.command;
      
      // Comandos que podem estar "ativos"
      if (['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList'].includes(command)) {
        if (document.queryCommandState(command)) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      }
    });

    // Atualizar cor atual
    try {
      const color = document.queryCommandValue('foreColor');
      if (color && color !== 'rgb(0, 0, 0)') {
        const colorIndicator = document.getElementById('colorIndicator');
        if (colorIndicator) {
          // Converter rgb para hex se necessário
          if (color.startsWith('rgb')) {
            const rgb = color.match(/\d+/g);
            if (rgb && rgb.length >= 3) {
              const hex = '#' + rgb.slice(0, 3).map(x => {
                const hex = parseInt(x).toString(16);
                return hex.length === 1 ? '0' + hex : hex;
              }).join('');
              colorIndicator.style.backgroundColor = hex;
              currentColor = hex;
            }
          } else {
            colorIndicator.style.backgroundColor = color;
            currentColor = color;
          }
        }
      }
    } catch (e) {
      // Ignorar erros ao pegar cor
    }
  }

  // Integrar com o sistema de salvar/carregar existente
  function integrarComSistema() {
    // Aguardar um pouco para garantir que as funções originais foram carregadas
    setTimeout(() => {
      // Sobrescrever a função coletarFicha original
      const originalColetarFicha = window.coletarFicha;
      if (originalColetarFicha) {
        window.coletarFicha = function() {
          const ficha = originalColetarFicha.call(this);
          
          // Substituir observações por conteúdo HTML
          if (window.richTextEditor) {
            ficha.observacoes = window.richTextEditor.getContent();
            ficha.observacoesHtml = window.richTextEditor.getContent();
            ficha.observacoesPlainText = window.richTextEditor.getPlainText();
          }
          
          return ficha;
        };
      }

      // Sobrescrever a função preencherFicha original
      const originalPreencherFicha = window.preencherFicha;
      if (originalPreencherFicha) {
        window.preencherFicha = function(ficha) {
          originalPreencherFicha.call(this, ficha);
          
          // Preencher editor rico
          if (window.richTextEditor && ficha) {
            const conteudo = ficha.observacoesHtml || ficha.observacoes || '';
            window.richTextEditor.setContent(conteudo);
          }
        };
      }

      // Sobrescrever a função de impressão
      const originalGerarVersaoImpressao = window.gerarVersaoImpressao;
      if (originalGerarVersaoImpressao) {
        window.gerarVersaoImpressao = function(...args) {
          // Atualizar observações antes de imprimir
          if (window.richTextEditor) {
            const printObservacoesEl = document.getElementById('print-observacoes');
            if (printObservacoesEl) {
              const conteudo = window.richTextEditor.getContent();
              if (conteudo && conteudo.trim()) {
                printObservacoesEl.innerHTML = conteudo;
              } else {
                printObservacoesEl.innerHTML = 'Nenhuma';
              }
            }
          }
          
          // Chamar função original
          originalGerarVersaoImpressao.apply(this, args);
        };
      }
    }, 100);
  }

  // Inicializar quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initRichTextEditor();
      integrarComSistema();
    });
  } else {
    initRichTextEditor();
    integrarComSistema();
  }

})();

