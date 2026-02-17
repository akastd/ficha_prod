/**
 * Cloudinary Upload Module
 * Gerencia upload de imagens para o Cloudinary
 * Usa toast.js global para notificações
 */

(function () {
  'use strict';

  let cloudinaryConfig = null;

  // ═══════════════════════════════════════════════════════════════════
  // CLOUDINARY INIT
  // ═══════════════════════════════════════════════════════════════════

  async function initCloudinary() {
    try {
      const response = await fetch('/api/cloudinary/config');

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      cloudinaryConfig = await response.json();

      if (!cloudinaryConfig.cloudName || cloudinaryConfig.cloudName === 'SEU_CLOUD_NAME') {
        return false;
      }

      if (!cloudinaryConfig.apiKey || cloudinaryConfig.apiKey === 'SUA_API_KEY') {
        return false;
      }

      return true;

    } catch (error) {
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // UPLOAD FILE
  // ═══════════════════════════════════════════════════════════════════

  async function uploadFile(file, options = {}) {
    const { silent = false } = options;

    if (!cloudinaryConfig) {
      const initResult = await initCloudinary();
      if (!initResult) {
        if (!silent) mostrarErro('Cloudinary não configurado');
        return { success: false, error: 'Cloudinary não configurado' };
      }
    }

    try {
      const sigResponse = await fetch('/api/cloudinary/signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (!sigResponse.ok) {
        const errorText = await sigResponse.text();
        throw new Error('Erro ao obter assinatura: ' + errorText);
      }

      const sigData = await sigResponse.json();

      const formData = new FormData();
      formData.append('file', file);
      formData.append('timestamp', sigData.timestamp);
      formData.append('folder', sigData.folder);
      formData.append('signature', sigData.signature);
      formData.append('api_key', sigData.apiKey);

      if (sigData.transformation) {
        formData.append('transformation', sigData.transformation);
      }

      const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`;

      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        body: formData
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`Upload falhou: ${errorText}`);
      }

      const result = await uploadResponse.json();

      if (!silent) mostrarSucesso('Layout adicionado com sucesso!');

      return {
        success: true,
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes
      };

    } catch (error) {
      if (!silent) mostrarErro(`Falha no envio: ${error.message}`);

      return {
        success: false,
        error: error.message
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // UPLOAD BASE64
  // ═══════════════════════════════════════════════════════════════════

  async function uploadBase64(base64Data, options = {}) {
    const { silent = false } = options;

    if (!cloudinaryConfig) {
      const initResult = await initCloudinary();
      if (!initResult) {
        if (!silent) mostrarErro('Cloudinary não configurado');
        return { success: false, error: 'Cloudinary não configurado' };
      }
    }

    try {
      const sigResponse = await fetch('/api/cloudinary/signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (!sigResponse.ok) {
        throw new Error('Erro ao obter assinatura');
      }

      const sigData = await sigResponse.json();

      const formData = new URLSearchParams();
      formData.append('file', base64Data);
      formData.append('timestamp', sigData.timestamp);
      formData.append('folder', sigData.folder);
      formData.append('signature', sigData.signature);
      formData.append('api_key', sigData.apiKey);

      if (sigData.transformation) {
        formData.append('transformation', sigData.transformation);
      }

      const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`;

      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`Upload falhou: ${errorText}`);
      }

      const result = await uploadResponse.json();

      if (!silent) mostrarSucesso('Layout adicionado com sucesso!');

      return {
        success: true,
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height
      };

    } catch (error) {
      if (!silent) mostrarErro(`Falha no envio: ${error.message}`);

      return {
        success: false,
        error: error.message
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // UPLOAD MULTIPLE
  // ═══════════════════════════════════════════════════════════════════

  async function uploadMultiple(files, onProgress = null) {
    const results = [];
    let completed = 0;
    let successCount = 0;
    let failCount = 0;

    mostrarInfo(`Enviando ${files.length} ${files.length === 1 ? 'imagem' : 'imagens'}...`);

    for (const file of files) {
      // Upload silencioso individual — toast só no final
      const result = await uploadFile(file, { silent: true });
      results.push(result);
      completed++;

      if (result.success) {
        successCount++;
      } else {
        failCount++;
      }

      if (onProgress) {
        onProgress({
          completed,
          total: files.length,
          percent: Math.round((completed / files.length) * 100),
          current: result
        });
      }
    }

    // Toast final com resumo
    if (failCount === 0) {
      mostrarSucesso(
        `${successCount} ${successCount === 1 ? 'imagem enviada' : 'imagens enviadas'} com sucesso!`
      );
    } else if (successCount === 0) {
      mostrarErro(
        `Falha ao enviar ${failCount} ${failCount === 1 ? 'imagem' : 'imagens'}`
      );
    } else {
      mostrarAviso(
        `${successCount} enviada${successCount > 1 ? 's' : ''}, ${failCount} com falha`
      );
    }

    return results;
  }

  // ═══════════════════════════════════════════════════════════════════
  // DELETE IMAGE
  // ═══════════════════════════════════════════════════════════════════

  async function deleteImage(publicId, options = {}) {
    try {
      const { excludeFichaId = null } = options;
      const safePublicId = publicId.replace(/\//g, '_SLASH_');
      const query = excludeFichaId ? `?excludeFichaId=${encodeURIComponent(excludeFichaId)}` : '';

      const response = await fetch(`/api/cloudinary/image/${safePublicId}${query}`, {
        method: 'DELETE'
      });

      const responseData = await response.json().catch(() => ({}));

      if (response.ok) {
        if (responseData.shared) {
          mostrarAviso('Imagem compartilhada: removida apenas desta ficha. A ficha original não foi alterada.');
          return { success: true, shared: true };
        }

        if (responseData.notFound) {
          mostrarAviso('Imagem removida desta ficha. O arquivo já não existia na nuvem.');
          return { success: true, notFound: true };
        }

        mostrarSucesso('Imagem removida com sucesso!');
        return { success: true };
      }

      if (response.status === 409 || responseData.shared) {
          mostrarAviso('Imagem compartilhada: removida apenas desta ficha. A ficha original não foi alterada.');
          return { success: true, shared: true };
      }

      throw new Error(responseData.error || 'Erro ao deletar imagem');

    } catch (error) {
      mostrarErro(`Erro ao remover: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // URL HELPERS
  // ═══════════════════════════════════════════════════════════════════

  function getOptimizedUrl(publicIdOrUrl, options = {}) {
    if (!cloudinaryConfig) {
      return publicIdOrUrl;
    }

    let publicId = publicIdOrUrl;
    if (publicIdOrUrl.includes('cloudinary.com')) {
      const match = publicIdOrUrl.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-z]+)?$/i);
      if (match) {
        publicId = match[1];
      } else {
        return publicIdOrUrl;
      }
    }

    const {
      width = 800,
      height = 800,
      crop = 'limit',
      quality = 'auto',
      format = 'auto'
    } = options;

    const transformations = `c_${crop},w_${width},h_${height},q_${quality},f_${format}`;

    return `https://res.cloudinary.com/${cloudinaryConfig.cloudName}/image/upload/${transformations}/${publicId}`;
  }

  function getThumbnailUrl(publicIdOrUrl, size = 150) {
    return getOptimizedUrl(publicIdOrUrl, {
      width: size,
      height: size,
      crop: 'fill',
      quality: 'auto',
      format: 'auto'
    });
  }

  function isCloudinaryUrl(url) {
    return url && (
      url.includes('cloudinary.com') ||
      url.includes('res.cloudinary.com')
    );
  }

  function isBase64(str) {
    return str && str.startsWith('data:');
  }

  // ═══════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════

  window.CloudinaryUpload = {
    init: initCloudinary,
    uploadFile,
    uploadBase64,
    uploadMultiple,
    deleteImage,
    getOptimizedUrl,
    getThumbnailUrl,
    isCloudinaryUrl,
    isBase64,
    getConfig: () => cloudinaryConfig
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCloudinary);
  } else {
    initCloudinary();
  }

})();
