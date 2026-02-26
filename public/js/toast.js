/**
 * Toast Global - Sistema de notificações
 */

(function() {
  'use strict';

  const CONFIG = {
    duracao: 3000,
    posicao: 'bottom',
    animacao: 'slide-up'
  };

  const ICONS = {
    success: 'fa-check-circle',
    error: 'fa-exclamation-circle',
    warning: 'fa-exclamation-triangle',
    info: 'fa-info-circle'
  };

  const CORES = {
    success: 'var(--toast-bg-success)',
    error: 'var(--toast-bg-error)',
    warning: 'var(--toast-bg-warning)',
    info: 'var(--toast-bg-info)'
  };

  function injetarEstilos() {
    if (document.getElementById('toast-global-styles')) return;

    const style = document.createElement('style');
    style.id = 'toast-global-styles';
    style.textContent = `
      .toast-global {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%) translateY(100%);
        padding: 14px 28px;
        border-radius: var(--radius-xl);
        color: var(--toast-text-color);
        font-weight: 500;
        font-size: 14px;
        display: flex;
        align-items: center;
        gap: 12px;
        z-index: 99999;
        box-shadow: var(--shadow-xl);
        opacity: 0;
        pointer-events: none;
        transition: none;
        max-width: 90vw;
        text-align: center;
      }

      .toast-global.show {
        animation: toastSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        pointer-events: auto;
      }

      .toast-global.hide {
        animation: toastSlideDown 0.3s cubic-bezier(0.5, 0, 0.75, 0) forwards;
      }

      .toast-global i {
        font-size: 18px;
        flex-shrink: 0;
      }

      .toast-global span {
        line-height: 1.4;
      }

      @keyframes toastSlideUp {
        from {
          transform: translateX(-50%) translateY(100%);
          opacity: 0;
        }
        to {
          transform: translateX(-50%) translateY(0);
          opacity: 1;
        }
      }

      @keyframes toastSlideDown {
        from {
          transform: translateX(-50%) translateY(0);
          opacity: 1;
        }
        to {
          transform: translateX(-50%) translateY(100%);
          opacity: 0;
        }
      }

      @media (max-width: 480px) {
        .toast-global {
          left: 16px;
          right: 16px;
          transform: translateX(0) translateY(100%);
          max-width: none;
        }

        .toast-global.show {
          animation: toastSlideUpMobile 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .toast-global.hide {
          animation: toastSlideDownMobile 0.3s cubic-bezier(0.5, 0, 0.75, 0) forwards;
        }

        @keyframes toastSlideUpMobile {
          from {
            transform: translateX(0) translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0) translateY(0);
            opacity: 1;
          }
        }

        @keyframes toastSlideDownMobile {
          from {
            transform: translateX(0) translateY(0);
            opacity: 1;
          }
          to {
            transform: translateX(0) translateY(100%);
            opacity: 0;
          }
        }
      }
    `;

    document.head.appendChild(style);
  }

  function mostrarToast(mensagem, tipo = 'success') {
    injetarEstilos();

    const existente = document.querySelector('.toast-global');
    if (existente) {
      existente.remove();
    }

    const toast = document.createElement('div');
    toast.className = 'toast-global';
    toast.style.background = CORES[tipo] || CORES.info;
    toast.innerHTML = `
      <i class="fas ${ICONS[tipo] || ICONS.info}"></i>
      <span>${mensagem}</span>
    `;

    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toast.classList.add('show');
      });
    });

    setTimeout(() => {
      toast.classList.remove('show');
      toast.classList.add('hide');

      setTimeout(() => {
        if (toast.parentNode) {
          toast.remove();
        }
      }, 300);
    }, CONFIG.duracao);

    return toast;
  }

  function mostrarSucesso(mensagem) {
    return mostrarToast(mensagem, 'success');
  }

  function mostrarErro(mensagem) {
    return mostrarToast(mensagem, 'error');
  }

  function mostrarAviso(mensagem) {
    return mostrarToast(mensagem, 'warning');
  }

  function mostrarInfo(mensagem) {
    return mostrarToast(mensagem, 'info');
  }

  window.mostrarToast = mostrarToast;
  window.mostrarSucesso = mostrarSucesso;
  window.mostrarErro = mostrarErro;
  window.mostrarAviso = mostrarAviso;
  window.mostrarInfo = mostrarInfo;
})();
