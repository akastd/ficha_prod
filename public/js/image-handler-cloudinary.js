/**
 * Image Handler com Cloudinary
 */

(function() {
  'use strict';

  let imagens = [];
  const MAX_IMAGENS = 4;

  let container, uploadArea, fileInput, counterEl;
  let draggedImageIndex = null;

  document.addEventListener('DOMContentLoaded', initImageHandler);

  function initImageHandler() {
    container = document.getElementById('imagesContainer');
    uploadArea = document.getElementById('imageUpload');
    fileInput = document.getElementById('fileInput');
    counterEl = document.getElementById('imagesCounter');

    if (!container || !uploadArea || !fileInput) return;

    uploadArea.addEventListener('click', () => fileInput.click());

    uploadArea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput.click();
      }
    });

    fileInput.addEventListener('change', handleFileSelect);

    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('drag-over');
    });

    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('drag-over');
    });

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('drag-over');
      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
      if (files.length > 0) processFiles(files);
    });

    document.addEventListener('paste', handlePaste);
  }

  function handleFileSelect(e) {
    const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) processFiles(files);
    e.target.value = '';
  }

  function handlePaste(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const items = Array.from(e.clipboardData?.items || []);
    const imageItems = items.filter(item => item.type.startsWith('image/'));

    if (imageItems.length > 0) {
      e.preventDefault();
      const files = imageItems.map(item => item.getAsFile()).filter(Boolean);
      processFiles(files);
    }
  }

  async function processFiles(files) {
    if (imagens.length >= MAX_IMAGENS) {
      toast('Máximo de ' + MAX_IMAGENS + ' imagens atingido', 'warning');
      return;
    }

    const espacoDisponivel = MAX_IMAGENS - imagens.length;
    const filesToProcess = files.slice(0, espacoDisponivel);

    mostrarLoading(filesToProcess.length);

    for (const file of filesToProcess) {
      try {
        if (window.CloudinaryUpload) {
          const result = await CloudinaryUpload.uploadFile(file);

          if (result.success) {
            imagens.push({
              src: result.url,
              publicId: result.publicId,
              descricao: ''
            });
          } else {
            throw new Error(result.error || 'Erro no upload');
          }
        } else {
          const base64 = await fileToBase64(file);
          imagens.push({ src: base64, descricao: '' });
        }
      } catch (error) {
        toast('Erro ao enviar imagem: ' + error.message, 'error');
      }
    }

    esconderLoading();
    renderizarImagens();
    atualizarContador();
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Renderização

  function renderizarImagens() {
    if (!container) return;

    container.innerHTML = '';
    container.classList.toggle('images-one', imagens.length === 1);
    container.classList.toggle('images-two', imagens.length === 2);
    container.classList.toggle('images-three', imagens.length === 3);
    container.classList.toggle('images-four', imagens.length === 4);
    container.classList.toggle('compact-four', imagens.length === MAX_IMAGENS);

    imagens.forEach((img, index) => {
      const card = document.createElement('div');
      card.className = 'image-card';
      card.draggable = true;
      card.dataset.index = index;

      const thumbUrl = img.src;

      const cloudBadge = img.publicId 
        ? '<span class="cloud-badge" title="Armazenada na nuvem"><i class="fas fa-cloud"></i></span>' 
        : '';

      card.innerHTML = `
        <div class="image-wrapper">
          <span class="image-number">${index + 1}</span>
          <img src="${thumbUrl}" alt="Imagem ${index + 1}" draggable="false">
          <button type="button" class="image-delete-btn" title="Remover imagem">
            <i class="fas fa-times"></i>
          </button>
          <div class="image-drag-handle">
            <i class="fas fa-grip-horizontal"></i>
            Arrastar
          </div>
          ${cloudBadge}
        </div>
        <div class="image-description">
          <input type="text" placeholder="Descrição da imagem (opcional)" value="${img.descricao || ''}" data-index="${index}">
        </div>
      `;

      container.appendChild(card);

      card.querySelector('.image-delete-btn').addEventListener('click', async () => {
        await removerImagem(index);
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

    if (uploadArea) {
      uploadArea.style.display = imagens.length >= MAX_IMAGENS ? 'none' : '';
    }
  }

  // Drag Handlers

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
      const [movedImage] = imagens.splice(draggedImageIndex, 1);
      imagens.splice(targetIndex, 0, movedImage);
      renderizarImagens();
    }
  }

  // Funções Auxiliares

  async function removerImagem(index) {
    const img = imagens[index];

    if (img.publicId && window.CloudinaryUpload) {
      try {
        const params = new URLSearchParams(window.location.search);
        const fichaIdAtual = params.get('editar');
        await CloudinaryUpload.deleteImage(img.publicId, {
          excludeFichaId: fichaIdAtual || null
        });
      } catch (error) {}
    }

    imagens.splice(index, 1);
    renderizarImagens();
    atualizarContador();
  }

  function atualizarContador() {
    if (counterEl) {
      counterEl.textContent = `(${imagens.length}/${MAX_IMAGENS})`;
    }
  }

  function mostrarLoading(count) {
    if (!container) return;

    for (let i = 0; i < count; i++) {
      const placeholder = document.createElement('div');
      placeholder.className = 'image-card loading-placeholder';
      placeholder.innerHTML = `
        <div class="image-wrapper" style="display: flex; align-items: center; justify-content: center; background: var(--color-light-3);">
          <div style="text-align: center; color: var(--color-dark-3);">
            <i class="fas fa-rotate fa-2x fa-spin"></i>
            <div style="margin-top: 8px; font-size: 12px;">Enviando Layout...</div>
          </div>
        </div>
      `;
      container.appendChild(placeholder);
    }
  }

  function esconderLoading() {
    if (!container) return;
    container.querySelectorAll('.loading-placeholder').forEach(el => el.remove());
  }

  function toast(mensagem, tipo = 'info') {
    if (typeof window.mostrarToast === 'function') {
      window.mostrarToast(mensagem, tipo);
    }
  }

  // API Pública

  window.getImagens = function() {
    return imagens.map(img => ({
      src: img.src,
      publicId: img.publicId || null,
      descricao: img.descricao || ''
    }));
  };

  window.setImagens = function(novasImagens) {
    imagens = [];

    if (Array.isArray(novasImagens)) {
      novasImagens.forEach((img) => {
        if (typeof img === 'string') {
          imagens.push({ src: img, descricao: '' });
        } else if (img && img.src) {
          imagens.push({
            src: img.src,
            publicId: img.publicId || null,
            descricao: img.descricao || ''
          });
        }
      });
    }

    renderizarImagens();
    atualizarContador();
  };

  window.limparImagens = function() {
    imagens = [];
    renderizarImagens();
    atualizarContador();
  };

  window.adicionarImagem = function(imgData) {
    if (imagens.length >= MAX_IMAGENS) {
      toast('Máximo de ' + MAX_IMAGENS + ' imagens atingido', 'warning');
      return false;
    }

    if (typeof imgData === 'string') {
      imagens.push({ src: imgData, descricao: '' });
    } else {
      imagens.push({
        src: imgData.src,
        publicId: imgData.publicId || null,
        descricao: imgData.descricao || ''
      });
    }

    renderizarImagens();
    atualizarContador();
    return true;
  };

})();

